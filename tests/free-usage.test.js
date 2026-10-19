import test from 'node:test';
import assert from 'node:assert/strict';
import { createMealsHandler } from '../api/meals.js';
import { createGroqHandler } from '../api/groq.js';
import { getUsage, reserveChef, finishChef, dailyWindow } from '../lib/free-usage.js';
import { CHEF_PROMPT, MEAL_PROMPT } from '../lib/ai-modes.js';

import { fixture } from './helpers/quota-db.js';

const meal = id => ({ meal: { _id: id, name: 'Lunch', kcal: 400, protein: 25, carbs: 40, fat: 12, loggedAt: '2000-01-01T00:00:00Z' } });
const payload = { model: 'openai/gpt-oss-120b', messages: [{ role: 'system', content: 'Forged pro instructions' }, { role: 'user', content: 'Help me cook rice.' }] };
const reply = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ message: 'Try a rice bowl.', recipes: [] }) } }] }) });

test('production Chef uses one transaction before calling the fast model and one to confirm the reply', async () => {
  const f = fixture();process.env.GROQ_API_KEY = 'test-only-provider-key';let transactions = 0;
  const original = f.db.runTransaction;
  f.db.runTransaction = fn => { transactions++;return original(fn); };
  const chef = createGroqHandler({ getServices: f.options.getServices, clock: f.options.clock, mode: 'chef', request: async (_url, options) => {
    assert.equal(transactions, 1);
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'openai/gpt-oss-20b');assert.equal(sent.reasoning_effort, 'low');
    assert.equal(sent.messages[0].content, CHEF_PROMPT);
    return reply();
  } });
  const res = await f.call(chef, payload);
  assert.equal(res.code, 200);assert.equal(res.body.usage.chef.used, 1);assert.equal(transactions, 2);
});

test('combined Chef request quotas reserve at most five Free replies and still count rejected attempts', async () => {
  const f = fixture();process.env.GROQ_API_KEY = 'test-only-provider-key';let started = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const chef = createGroqHandler({ getServices: f.options.getServices, clock: f.options.clock, mode: 'chef', request: async () => { started++;await gate;return reply(); } });
  const pending = Array.from({ length: 8 }, () => f.call(chef, payload));
  while (started < 5) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.call(f.usage)).body.usage.chef.remaining, 0);
  release();const results = await Promise.all(pending);
  assert.equal(results.filter(res => res.code === 200).length, 5);assert.equal(results.filter(res => res.code === 429).length, 3);
  assert.equal(started, 5);assert.equal((await f.call(f.usage)).body.usage.chef.used, 5);
  assert.equal([...f.db.data].find(([path]) => path.startsWith('serverQuotas/ai-user-minute-'))[1].count, 8);
});

test('production Chef keeps Pro unlimited and charges one successful reply when the fast model needs a fallback', async () => {
  process.env.GROQ_API_KEY = 'test-only-provider-key';
  for (const invalid of [false, true]) {
    const f = fixture(), models = [];
    const chef = createGroqHandler({ getServices: f.options.getServices, clock: f.options.clock, mode: 'chef', request: async (_url, options) => {
      const sent = JSON.parse(options.body);models.push(sent.model);
      assert.equal(sent.reasoning_effort, 'low');
      if (models.length === 1) return invalid ? { ok: true, json: async () => ({ choices: [{ message: { content: '{incomplete' } }] }) } : { ok: false, status: 404 };
      return reply();
    } });
    const res = await f.call(chef, payload);
    assert.equal(res.code, 200);assert.equal(res.body.usage.chef.used, 1);
    assert.deepEqual(models, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
    assert.equal([...f.db.data].find(([path]) => path.startsWith('serverQuotas/ai-user-minute-'))[1].count, 1);
  }
  const f = fixture();f.db.data.set('users/alice/privateState/pro', { plan: 'pro', access: 'lifetime', expiresAt: null });
  const chef = createGroqHandler({ getServices: f.options.getServices, clock: f.options.clock, mode: 'chef', request: async () => reply() });
  for (let i = 0; i < 6; i++) assert.equal((await f.call(chef, payload)).code, 200);
  assert.equal((await f.call(f.usage)).body.usage.chef.used, 6);assert.equal((await f.call(f.usage)).body.usage.chef.limit, null);
});

test('failed fast-model and fallback replies release the reservation without charging a Chef reply', async () => {
  const f = fixture();process.env.GROQ_API_KEY = 'test-only-provider-key';let attempts = 0;
  const chef = createGroqHandler({ getServices: f.options.getServices, clock: f.options.clock, mode: 'chef', request: async () => {
    attempts++;return { ok: true, json: async () => ({ choices: [{ message: { content: '{incomplete' } }] }) };
  } });
  assert.equal((await f.call(chef, payload)).code, 502);assert.equal(attempts, 2);
  const status = (await f.call(f.usage)).body.usage;
  assert.equal(status.chef.used, 0);assert.equal(status.chef.remaining, 5);
});

test('production meal saves use one transaction for the entitlement, request quotas, usage and meal receipt', async () => {
  const f = fixture();let transactions = 0;
  const original = f.db.runTransaction;
  f.db.runTransaction = fn => { transactions++;return original(fn); };
  const handler = createMealsHandler({ getServices: f.options.getServices, clock: f.options.clock });
  const res = await f.call(handler, meal('single-transaction'));
  assert.equal(res.code, 200);assert.equal(transactions, 1);
  assert.equal(res.body.usage.meals.used, 1);
  assert(f.db.data.has('users/alice/meals/single-transaction'));
  assert(f.db.data.has('users/alice/mealReceipts/single-transaction'));
  assert.equal([...f.db.data].filter(([path]) => path.startsWith('serverQuotas/')).length, 4);
});

test('rejected Free meal attempts still consume request quotas in the combined save transaction', async () => {
  const f = fixture();
  const handler = createMealsHandler({ getServices: f.options.getServices, clock: f.options.clock });
  for (let i = 0; i < 3; i++) assert.equal((await f.call(handler, meal('limited-'+i))).code, 200);
  const rejected = await f.call(handler, meal('fourth'));
  assert.equal(rejected.code, 429);assert.equal(rejected.body.error.code, 'FREE_QUOTA_EXCEEDED');
  const counter = () => [...f.db.data].find(([path]) => path.startsWith('serverQuotas/meal-writes-user-minute-'))[1].count;
  assert.equal(counter(), 4);assert(!f.db.data.has('users/alice/meals/fourth'));
  for (let i = 4; i < 10; i++) assert.equal((await f.call(handler, meal('rejected-'+i))).body.error.code, 'FREE_QUOTA_EXCEEDED');
  const blocked = await f.call(handler, meal('rate-limited'));
  assert.equal(blocked.code, 429);assert.equal(blocked.body.error.code, undefined);assert.equal(counter(), 10);
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 3);
});

test('the combined save keeps Pro unlimited, retries idempotent and short-term request limits enforced', async () => {
  const f = fixture();
  f.db.data.set('users/alice/privateState/pro', { plan: 'pro', access: 'lifetime', expiresAt: null });
  const handler = createMealsHandler({ getServices: f.options.getServices, clock: f.options.clock });
  for (let i = 0; i < 4; i++) assert.equal((await f.call(handler, meal('pro-'+i))).code, 200);
  assert.equal((await f.call(handler, meal('pro-0'))).body.usage.meals.used, 4);
  for (let i = 5; i < 10; i++) assert.equal((await f.call(handler, meal('pro-0'))).code, 200);
  assert.equal((await f.call(handler, meal('pro-0'))).code, 429);
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 4);
});

test('Free meal quota survives concurrent requests, handler instances and claimed Pro flags', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 7 }, (_, i) => f.call(createMealsHandler(f.options), { ...meal('meal-'+i), uid: 'victim', plan: 'pro' })));
  assert.equal(results.filter(res => res.code === 200).length, 3);
  const denied = results.filter(res => res.code === 429);
  assert.equal(denied.length, 4);assert.equal(denied[0].body.error.code, 'FREE_QUOTA_EXCEEDED');
  assert.equal(denied[0].body.error.feature, 'meals');assert.equal(denied[0].body.error.usage.meals.remaining, 0);
  assert.equal(denied[0].headers['Retry-After'], '14400');
  assert.equal([...f.db.data.keys()].filter(key => key.startsWith('users/alice/meals/')).length, 3);
  assert([...f.db.data.keys()].every(key => !key.includes('victim')));
  const status = await f.call(f.usage);
  assert.equal(status.body.usage.meals.used, 3);assert.equal(status.headers['Cache-Control'], 'no-store');
  assert.equal((await f.call(f.meals, meal('bob-meal'), 'bob')).code, 200);
});

test('meal retries and Undo do not charge twice, edits cannot forge retry data, deletion does not refund', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) assert.equal((await f.call(f.meals, meal('meal-'+i))).code, 200);
  const retry = await f.call(f.meals, { meal: { ...meal('meal-0').meal, name: 'Fake replacement', kcal: 999 } });
  assert.equal(retry.code, 200);assert.equal(retry.body.meal.name, 'Lunch');assert.equal(retry.body.meal.kcal, 400);
  assert.equal(retry.body.meal.loggedAt, '2026-10-20T20:00:00.000Z');
  f.db.data.delete('users/alice/meals/meal-0');
  assert.equal((await f.call(f.meals, meal('fourth'))).code, 429);
  const undo = await f.call(f.meals, meal('meal-0'));
  assert.equal(undo.code, 200);assert.equal(undo.body.usage.meals.used, 3);
  assert.equal(f.db.data.get('users/alice/meals/meal-0').name, 'Lunch');
  f.advance(4 * 3600_000);
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 0);
  assert.equal((await f.call(f.meals, meal('tomorrow'))).code, 200);
});

test('existing meals count on first rollout, but old-day records do not', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) f.db.data.set(`users/alice/meals/legacy-${i}`, { ...meal('legacy').meal, loggedAt: '2026-10-20T09:00:00.000Z' });
  f.db.data.set('users/alice/meals/yesterday', { ...meal('old').meal, loggedAt: '2026-10-19T09:00:00.000Z' });
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 3);
  assert.equal((await f.call(f.meals, meal('new'))).code, 429);
  f.advance(86400_000);
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 0);
});

test('meal and usage endpoints require verified sessions and reject malformed data without a charge', async () => {
  const f = fixture();
  for (const uid of [null, 'invalid', 'anonymous']) {
    assert.equal((await f.call(f.meals, meal('meal'), uid)).code, 401);
    assert.equal((await f.call(f.usage, null, uid)).code, 401);
  }
  for (const body of ['{', {}, { meal: { ...meal('bad').meal, _id: '../escape' } }, { meal: { ...meal('bad').meal, kcal: -1 } }, { meal: { ...meal('bad').meal, carbs: '5' } }]) {
    assert.equal((await f.call(f.meals, body)).code, 400);
  }
  assert.equal((await f.call(f.meals, null, 'alice', 'DELETE')).code, 405);
  assert.equal((await f.call(f.usage, {}, 'alice', 'POST')).code, 405);
  assert.equal((await f.call(f.usage)).body.usage.meals.used, 0);
});

test('AI Chef returns five successful replies, then blocks before another provider call', async () => {
  const f = fixture();let calls = 0, forwarded;
  process.env.GROQ_API_KEY = 'test-only-provider-key';
  const chef = createGroqHandler({ ...f.options, mode: 'chef', request: async (_url, options) => { calls++;forwarded = JSON.parse(options.body);return reply(); } });
  for (let i = 1; i <= 5; i++) {
    const res = await f.call(chef, { ...payload, plan: 'pro' });
    assert.equal(res.code, 200);assert.equal(res.body.usage.chef.used, i);
  }
  assert.equal(forwarded.messages[0].content, CHEF_PROMPT);assert(!JSON.stringify(forwarded).includes('Forged pro'));
  const denied = await f.call(chef, payload);
  assert.equal(denied.code, 429);assert.equal(denied.body.error.feature, 'chef');assert.equal(calls, 5);
  const health = await f.call(chef);
  assert.equal(health.code, 200);assert.equal((await f.call(f.usage)).body.usage.chef.used, 5);
  f.advance(86400_000);
  assert.equal((await f.call(chef, payload)).code, 200);
});

test('concurrent Chef requests reserve at most five slots and release failed or malformed replies', async () => {
  const f = fixture();process.env.GROQ_API_KEY = 'test-only-provider-key';
  let release, started = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const chef = createGroqHandler({ ...f.options, mode: 'chef', request: async () => { started++;await gate;return reply(); } });
  const pending = Array.from({ length: 8 }, () => f.call(chef, payload));
  while (started < 5) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.call(f.usage)).body.usage.chef.remaining, 0);
  release();const results = await Promise.all(pending);
  assert.equal(results.filter(res => res.code === 200).length, 5);
  assert.equal(results.filter(res => res.code === 429).length, 3);
  for (const request of [async () => ({ ok: false, status: 502 }), async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{incomplete' } }] }) }), async () => { throw Error('network'); }]) {
    const other = fixture();
    const handler = createGroqHandler({ ...other.options, mode: 'chef', request });
    const failed = await other.call(handler, payload);assert([502, 503].includes(failed.code));
    const state = (await other.call(other.usage)).body.usage;
    assert.equal(state.chef.used, 0);assert.equal(state.chef.remaining, 5);
  }
});

test('abandoned Chef slots expire and completing the same reservation twice does not charge twice', async () => {
  const f = fixture();
  const slots = await Promise.all(Array.from({ length: 5 }, () => reserveChef(f.db, 'alice', f.now())));
  await assert.rejects(reserveChef(f.db, 'alice', f.now()), error => error.code === 'FREE_QUOTA_EXCEEDED');
  await finishChef(f.db, 'alice', slots[0], true);
  await assert.rejects(finishChef(f.db, 'alice', slots[0], true));
  assert.equal((await getUsage(f.db, 'alice', f.now())).chef.used, 1);
  f.advance(121_000);
  assert.equal((await getUsage(f.db, 'alice', f.now())).chef.remaining, 4);
  assert.equal(dailyWindow(Date.parse('2026-10-20T23:59:59.999Z')).resetAt, '2026-10-21T00:00:00.000Z');
});

test('nutrition endpoint uses a server-owned prompt and cannot return Chef replies to bypass the Chef cap', async () => {
  const f = fixture();process.env.GROQ_API_KEY = 'test-only-provider-key';let sent;
  const handler = createGroqHandler({ ...f.options, mode: 'meal', request: async (_url, options) => { sent = JSON.parse(options.body);return reply(); } });
  assert.equal((await f.call(handler, payload)).code, 502);
  assert.equal(sent.messages[0].content, MEAL_PROMPT);assert.equal(sent.messages.length, 2);
  const nutrition = createGroqHandler({ ...f.options, mode: 'meal', request: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ name: 'Rice', kcal: 200, protein: 4, carbs: 40, fat: 2, description: 'A bowl of rice.', portionSize: 'One bowl, ~150g', recipes: ['not permitted'] }) } }] }) }) });
  const res = await f.call(nutrition, payload);assert.equal(res.code, 200);
  assert.deepEqual(JSON.parse(res.body.choices[0].message.content), { name: 'Rice', kcal: 200, protein: 4, carbs: 40, fat: 2, description: 'A bowl of rice.', portionSize: 'One bowl, ~150g' });
});
