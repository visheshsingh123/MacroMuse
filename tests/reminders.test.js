import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createReminderHandler } from '../api/reminders.js';
import { createReminderCronHandler } from '../api/reminder-cron.js';
import { authorizedCron, indiaDay, reminderBody, validEndpoint, validSubscription } from '../lib/reminders.js';

process.env.CRON_SECRET = 'test-only-cron-secret';
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-device',
  keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') },
};
function response() {
  return { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function fakeServices(initial = {}) {
  const records = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  const reference = path => ({
    path, collection: name => collection(`${path}/${name}`),
    get: async () => snapshot(path),
    set: async (data, options) => records.set(path, options?.merge ? { ...records.get(path), ...data } : data),
    delete: async () => records.delete(path),
  });
  const snapshot = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path), ref: reference(path) });
  function collection(path, filters = [], max = Infinity) {
    return {
      doc: id => reference(`${path}/${id}`),
      where: (key, op, value) => collection(path, [...filters, [key, op, value]], max),
      orderBy: () => collection(path, filters, max),
      limit: n => collection(path, filters, n),
      startAfter: () => collection(path, filters, max),
      get: async () => {
        const docs = [...records.keys()].filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'))
          .filter(key => filters.every(([field, op, value]) => op === '==' ? records.get(key)[field] === value : op === '>=' ? records.get(key)[field] >= value : records.get(key)[field] <= value))
          .slice(0, max).map(snapshot);
        return { docs, empty: !docs.length, size: docs.length };
      },
    };
  }
  const sent = [];
  const services = {
    auth: { verifyIdToken: async token => { if (token !== 'valid-token') throw new Error('invalid'); return { uid: 'user-1' }; } },
    db: { collection, runTransaction: fn => {
      const result = queue.then(() => fn({ get: ref => ref.get(), delete: ref => records.delete(ref.path), set: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data }), update: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data }) }));
      queue = result.catch(() => {});
      return result;
    } },
    webpush: { sendNotification: async (sub, payload, options) => {
      if (sub.endpoint.includes('expired')) throw { statusCode: 410 };
      if (sub.endpoint.includes('failed')) throw { statusCode: 503 };
      sent.push({ sub, payload: JSON.parse(payload), options });
    } },
  };
  return { services, records, sent };
}
const post = body => ({ method: 'POST', headers: { authorization: 'Bearer valid-token' }, body });
const cronRequest = slot => ({ method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: { slot } });

test('push destinations reject internal URLs and malformed keys', () => {
  assert(validSubscription(subscription));
  for (const endpoint of ['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8888/a']) assert(!validEndpoint(endpoint));
  assert(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/a'));
  assert(validEndpoint('https://web.push.apple.com/a'));
  assert(!validSubscription({ ...subscription, keys: { p256dh: 'invalid', auth: 'invalid' } }));
});

test('reminder policy uses IST day and combines only the needed nudges', () => {
  assert.equal(indiaDay(new Date('2026-10-16T20:00:00Z')), '2026-10-17');
  assert.equal(reminderBody(true, 8, 'evening'), '');
  assert.equal(reminderBody(true, 1, 'afternoon'), 'Time for a glass of water.');
  assert.match(reminderBody(false, 8, 'evening'), /this afternoon/);
  assert.match(reminderBody(false, 0, 'afternoon'), /water.*log your meal/);
  assert(!authorizedCron('Bearer wrong'));
});

test('subscription API handles unavailable config, auth, validation and ownership', async () => {
  let res = response();
  await createReminderHandler({ isConfigured: () => false })({ method: 'GET' }, res);
  assert.equal(res.code, 503);
  const fixture = fakeServices();
  const handler = createReminderHandler({ isConfigured: () => true, getServices: () => fixture.services, quota: async () => {} });
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  res = response(); await handler({ method: 'GET' }, res);
  assert.deepEqual(res.body, { publicKey: 'test-public-key' });
  res = response(); await handler({ method: 'DELETE' }, res); assert.equal(res.code, 405);
  res = response(); await handler({ method: 'POST', headers: {} }, res); assert.equal(res.code, 401);
  res = response(); await handler({ ...post({ enabled: true, subscription }), headers: { authorization: 'Bearer invalid' } }, res); assert.equal(res.code, 401);
  res = response(); await handler(post({ enabled: true, subscription: { ...subscription, endpoint: 'https://localhost/private' } }), res); assert.equal(res.code, 400);
  res = response(); await handler(post({ enabled: true, subscription }), res); assert.equal(res.code, 200);
  assert.equal([...fixture.records.values()][0].uid, 'user-1');
  // Re-registering preserves delivery history, so revisiting settings cannot cause another send.
  const key = [...fixture.records.keys()][0];
  fixture.records.get(key).lastDelivery = 'already-sent';
  await handler(post({ enabled: true, subscription }), response());
  assert.equal(fixture.records.get(key).lastDelivery, 'already-sent');
  fixture.records.get(key).uid = 'other-user';
  res = response(); await handler(post({ enabled: true, subscription }), res); assert.equal(res.code, 403);
  await handler(post({ enabled: false, endpoint: subscription.endpoint }), response());
  assert(fixture.records.has(key));
  fixture.records.get(key).uid = 'user-1';
  await handler(post({ enabled: false, endpoint: subscription.endpoint }), response());
  assert.equal(fixture.records.size, 0);
});

test('cron gates timing, sends twice at most, checks meals/water and cleans expired endpoints', async () => {
  const fixture = fakeServices({
    'reminderSubscriptions/device-1': { uid: 'user-1', enabled: true, subscription },
    'reminderSubscriptions/device-2': { uid: 'complete', enabled: true, subscription },
    'reminderSubscriptions/device-3': { uid: 'disabled', enabled: false, subscription },
    'reminderSubscriptions/device-4': { uid: 'user-1', enabled: true, subscription: { ...subscription, endpoint: subscription.endpoint + '-expired' } },
    'users/complete/meals/lunch': { loggedAt: '2026-10-17T07:00:00.000Z' },
    'users/complete/progress/2026-10-17': { water: 8 },
  });
  let date = '2026-10-17T07:30:00Z';
  const handler = createReminderCronHandler({ isConfigured: () => true, getServices: () => fixture.services, clock: () => new Date(date) });
  let res = response(); await handler({ ...cronRequest('afternoon'), headers: {} }, res); assert.equal(res.code, 401);
  res = response(); await handler(cronRequest('unknown'), res); assert.equal(res.code, 400);
  date = '2026-10-17T01:00:00Z';
  res = response(); await handler(cronRequest('afternoon'), res); assert(res.body.skipped);
  date = '2026-10-17T07:30:00Z';
  // Duplicate concurrent invocations still send only once to the active device.
  await Promise.all([handler(cronRequest('afternoon'), response()), handler(cronRequest('afternoon'), response())]);
  assert.equal(fixture.sent.length, 1);
  assert.match(fixture.sent[0].payload.body, /water.*log your meal/);
  assert.equal(fixture.sent[0].options.TTL, 1800);
  assert(!fixture.records.has('reminderSubscriptions/device-4'));
  fixture.records.set('users/user-1/meals/dinner', { loggedAt: '2026-10-17T13:00:00.000Z' });
  fixture.records.set('users/complete/meals/dinner', { loggedAt: '2026-10-17T13:00:00.000Z' });
  date = '2026-10-17T13:30:00Z';
  await handler(cronRequest('evening'), response());
  assert.equal(fixture.sent.length, 2);
  assert.equal(fixture.sent[1].payload.body, 'Time for a glass of water.');
  await handler(cronRequest('evening'), response());
  assert.equal(fixture.sent.length, 2);
  date = '2026-10-17T20:00:00Z';
  res = response(); await handler(cronRequest('evening'), res); assert(res.body.skipped);
});

test('service worker displays push payload and opens/focuses the dashboard', async () => {
  const events = {}, displayed = [], opened = [];
  let waited, focused = 0;
  let windows = [];
  const self = {
    addEventListener: (name, fn) => events[name] = fn,
    location: { origin: 'https://example.com' },
    registration: { showNotification: async (...args) => displayed.push(args) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
  };
  vm.runInNewContext(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), { self, URL });
  events.push({ data: { json: () => ({ body: 'Drink water', tag: 'nutriglance-reminder-test' }) }, waitUntil: promise => waited = promise });
  await waited;
  assert.equal(displayed[0][1].body, 'Drink water');
  assert.equal(displayed[0][1].data.url, '/dashboard');
  const click = () => events.notificationclick({ notification: { tag: 'nutriglance-reminder-test', close() {} }, waitUntil: promise => waited = promise });
  click(); await waited; assert.equal(opened[0], 'https://example.com/dashboard');
  windows = [{ url: 'https://example.com/dashboard', focus: async () => focused++ }];
  click(); await waited; assert.equal(focused, 1); assert.equal(opened.length, 1);
});
