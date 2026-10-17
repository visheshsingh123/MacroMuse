import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createGroqHandler } from '../api/groq.js';
import { consumeQuota, HttpError } from '../lib/api-security.js';
import { validatePayload } from '../lib/ai-payload.js';

function response() {
  return { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function store() {
  const data = new Map();
  let queue = Promise.resolve();
  return { data, collection: name => ({ doc: id => ({ id: `${name}/${id}` }) }), runTransaction(fn) {
    const result = queue.then(() => fn({
      get: async ref => ({ data: () => data.get(ref.id) }),
      set: (ref, value) => data.set(ref.id, value),
    }));
    queue = result.catch(() => {});
    return result;
  } };
}
const payload = { model: 'openai/gpt-oss-120b', max_tokens: 500, messages: [{ role: 'user', content: 'Rice and vegetables' }] };
const request = (body = payload, token = 'valid') => ({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body });

test('AI endpoint rejects unauthenticated, invalid, revoked and anonymous sessions before forwarding', async () => {
  let forwards = 0;
  const handler = createGroqHandler({ getServices: () => ({ auth: { verifyIdToken: async (token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (token === 'anonymous') return { uid: 'anon', firebase: { sign_in_provider: 'anonymous' } };
    throw new Error('revoked or invalid');
  } }, db: store() }), request: async () => { forwards++; } });
  for (const token of [null, 'invalid', 'revoked', 'anonymous']) {
    const res = response(); await handler(request(payload, token), res); assert.equal(res.code, 401);
  }
  assert.equal(forwards, 0);
});

test('AI fails closed with missing server credentials and hides private provider errors', async () => {
  let handler = createGroqHandler({ getServices: () => { throw new Error('private service key'); } });
  let res = response(); await handler(request(), res); assert.equal(res.code, 503); assert(!JSON.stringify(res.body).includes('private service key'));
  process.env.GROQ_API_KEY = 'test-only-private-provider-key';
  handler = createGroqHandler({ getServices: () => ({ auth: { verifyIdToken: async () => ({ uid: 'alice' }) }, db: store() }), quota: async () => {},
    request: async () => ({ ok: false, status: 400, json: async () => ({ error: 'test-only-private-provider-key' }) }) });
  res = response(); await handler(request(), res); assert.equal(res.code, 502); assert(!JSON.stringify(res.body).includes('private-provider-key'));
});

test('AI accepts verified requests, uses actual uid for quota, strips arbitrary provider options', async () => {
  process.env.GROQ_API_KEY = 'test-only-provider-key';
  let forwarded;
  const handler = createGroqHandler({ getServices: () => ({ auth: { verifyIdToken: async () => ({ uid: 'alice' }) }, db: store() }),
    quota: async (db, uid, purpose) => { assert.equal(uid, 'alice'); assert.equal(purpose, 'ai'); },
    request: async (url, options) => { forwarded = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [] }) }; } });
  const res = response(); await handler(request({ ...payload, userId: 'victim', tools: [{ function: 'untrusted' }], stream: true }), res);
  assert.equal(res.code, 200); assert.deepEqual(forwarded, payload); assert.equal(res.headers['Cache-Control'], 'no-store');
  const health = response(); await handler({ ...request(), method: 'GET' }, health); assert.deepEqual(health.body, { status: 'configured' });
  assert(!Object.keys(res.headers).some(key => key.includes('key-index')));
});

test('request validation limits models, image types, remote images, context, output tokens and size', () => {
  for (const bad of [null, [], '{', { ...payload, model: 'unapproved-model' }, { ...payload, max_tokens: 100000 },
    { ...payload, messages: Array(26).fill(payload.messages[0]) },
    { ...payload, messages: [{ role: 'user', content: 'x'.repeat(24001) }] },
    { ...payload, messages: [{ role: 'tool', content: 'bad role' }] },
    { ...payload, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://127.0.0.1/private' } }] }] },
    { ...payload, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zz4=' } }] }] },
    { ...payload, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,YmFk' } }] }] },
  ]) assert.throws(() => validatePayload(bad), HttpError);
  assert.throws(() => validatePayload({ ...payload, extra: 'x'.repeat(2500001) }), error => error.status === 413);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  assert.equal(validatePayload({ ...payload, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: png } }, { type: 'text', text: 'Meal photo' }] }] }).messages[0].content[0].image_url.url, png);
});

test('shared quotas survive new handlers and serialize concurrent requests', async () => {
  const db = store(), now = Date.UTC(2026, 9, 18, 6, 0);
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => consumeQuota(db, 'alice', 'ai', now)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 10);
  assert(results.filter(result => result.status === 'rejected').every(result => result.reason.status === 429));
  await consumeQuota(db, 'bob', 'ai', now);
  await consumeQuota(db, 'alice', 'ai', now + 60000);
  for (let i = 1; i <= 100; i++) await consumeQuota(db, 'daily-user', 'ai', now + i * 61000);
  await assert.rejects(consumeQuota(db, 'daily-user', 'ai', now + 101 * 61000 + 1), error => error.status === 429);
  await consumeQuota(db, 'daily-user', 'ai', now + 86400000);
  const global = store();
  await Promise.all(Array.from({ length: 100 }, (_, index) => consumeQuota(global, `account-${index}`, 'ai', now)));
  await assert.rejects(consumeQuota(global, 'another-account', 'ai', now), error => error.status === 429);
});

function client(initial = {}, path = '/dashboard') {
  const data = { ...initial }, events = {}, classes = new Set();
  let reloads = 0;
  const storage = new Proxy({ getItem: key => data[key] ?? null, setItem: (key, value) => data[key] = String(value), removeItem: key => delete data[key] }, {
    ownKeys: () => Object.keys(data), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
  const context = { localStorage: storage, location: { pathname: path, reload: () => reloads++, replace: () => {} },
    document: { documentElement: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) }, dataset: {} } },
    Headers, AbortSignal, fetch: async () => ({ status: 200 }),
    window: { addEventListener: (event, fn) => events[event] = fn },
  };
  vm.runInNewContext(readFileSync(new URL('../public/security.js', import.meta.url), 'utf8'), context);
  return { security: context.window.NutriSecurity, data, events, classes, context, reloads: () => reloads };
}

test('nutrition parsing rejects injected HTML, nonfinite/negative numbers and invalid shapes', () => {
  const { security } = client();
  const meal = { name: 'Rice', kcal: 400, protein: 10, carbs: 60, fat: 12 };
  assert.equal(security.normalizeMeal(meal).kcal, 400);
  for (const value of ['<img src=x onerror=alert(1)>', '400', NaN, Infinity, -1, 20001]) assert.throws(() => security.normalizeMeal({ ...meal, kcal: value }));
  assert.equal(security.readMeals([{ ...meal, kcal: '<img onerror=alert(1)>' }])[0].kcal, 0);
  assert.equal(security.escapeHtml('<img src=x onerror="1">'), '&lt;img src=x onerror=&quot;1&quot;&gt;');
});

test('session caches stay hidden until verified and are purged on logout/account change', () => {
  const legacy = client({ nutriglance_profile: 'secret', nutriglance_darkmode: '1' });
  assert.equal(legacy.data.nutriglance_profile, undefined);
  assert.equal(legacy.data.nutriglance_darkmode, '1');
  const alice = client({ nutriglance_session_uid: 'alice', nutriglance_profile: 'alice-private-profile', nutriglance_meals: 'private-meals', nutriglance_darkmode: '1' });
  assert(alice.classes.has('session-pending'));
  assert.equal(alice.security.bindSession({ uid: 'alice' }), true); assert(!alice.classes.has('session-pending'));
  assert.equal(alice.security.bindSession({ uid: 'bob' }), false); assert.equal(alice.reloads(), 1);
  assert.equal(alice.data.nutriglance_profile, undefined); assert.equal(alice.data.nutriglance_meals, undefined);
  assert.equal(alice.data.nutriglance_session_uid, 'bob');
  alice.security.bindSession(null); assert.equal(alice.data.nutriglance_session_uid, undefined);
  assert.equal(alice.data.nutriglance_darkmode, '1');
});

test('a delayed AI response cannot write back after logout', async () => {
  const fixture = client({ nutriglance_session_uid: 'alice' });
  fixture.security.bindSession({ uid: 'alice' });
  fixture.context.window.nutriGlanceReminderAuth = { currentUser: { uid: 'alice', getIdToken: async () => 'token' } };
  let resolve, markStarted;
  const started = new Promise(done => { markStarted = done; });
  fixture.context.fetch = () => new Promise(done => { resolve = done; markStarted(); });
  const pending = fixture.security.apiFetch('/api/groq', { headers: {} });
  await started;
  fixture.security.bindSession(null);
  resolve({ status: 200 });
  await assert.rejects(pending, /account changed/);
});

test('service worker never caches API responses, Firebase traffic or authenticated requests', async () => {
  const events = {}, cached = [];
  let responseHeader = '';
  const context = {
    URL,
    self: { location: { origin: 'https://example.com' }, addEventListener: (name, fn) => events[name] = fn },
    fetch: async () => ({ ok: true, headers: { get: () => responseHeader }, clone: () => ({}) }),
    caches: { open: async () => ({ put: async request => cached.push(request.url) }), match: async () => null },
  };
  vm.runInNewContext(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), context);
  for (const [url, headers] of [['https://example.com/api/reminders', {}], ['https://firestore.googleapis.com/data', {}], ['https://example.com/private', { Authorization: 'Bearer token' }]]) {
    let intercepted = false;
    events.fetch({ request: new Request(url, { headers }), respondWith: () => intercepted = true });
    assert.equal(intercepted, false);
  }
  for (const policy of ['no-store', 'private', 'public']) {
    responseHeader = policy;
    const pending = [];
    events.fetch({ request: new Request('https://example.com/app.css'), respondWith: promise => pending.push(promise), waitUntil: promise => pending.push(promise) });
    await Promise.all(pending);
  }
  assert.deepEqual(cached, ['https://example.com/app.css']);
});
