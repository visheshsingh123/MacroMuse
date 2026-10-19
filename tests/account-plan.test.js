import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const key = 'nutriglance_cache_plan';
const source = name => readFileSync(new URL(`../public/${name}.js`, import.meta.url), 'utf8');
function client({ owner = 'alice', verified = true, now = Date.parse('2026-10-20T20:00:00Z'), record } = {}) {
  let account = owner, authenticated = verified, time = now, blocked = false;
  const data = new Map(record ? [[key, JSON.stringify(record)]] : []), events = new Map();
  const on = (type, handler) => events.set(type, [...(events.get(type) || []), handler]);
  const dispatch = event => { for (const handler of events.get(event.type) || []) handler(event); };
  const context = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } },
    localStorage: { getItem: name => data.get(name) || null, setItem(name, value) { if (blocked) throw Error('storage full');data.set(name, value); }, removeItem: name => data.delete(name) },
    document: { documentElement: { dataset: {} }, querySelectorAll: () => [], addEventListener: on },
    CustomEvent: class { constructor(type, options) { this.type = type;this.detail = options.detail; } },
    setInterval: () => 0,
    window: { addEventListener: on, dispatchEvent: dispatch, NutriDialog: { confirm: async () => false }, NutriSecurity: {
      resumeOwner: () => account, isCurrent: uid => Boolean(uid && authenticated && uid === account),
      apiFetch: async () => { throw Error('offline'); },
    } },
  };
  vm.createContext(context);vm.runInContext(source('account-plan'), context);
  const plain = value => JSON.parse(JSON.stringify(value));
  return { data, context, plan: context.window.NutriPlan, read: () => plain(context.window.NutriPlan.read()),
    advance: ms => { time += ms; }, now: () => time,
    owner: value => { account = value; }, verify: value => { authenticated = value; }, block: () => { blocked = true; },
    storage(value) { data.set(key, JSON.stringify(value));dispatch({ type: 'storage', key }); },
    usage() { vm.runInContext(source('free-usage'), context);return context.window.NutriUsage; },
  };
}
function usage(now, plan = 'free', used = 2, expiresAt = null) {
  const reset = new Date(now);reset.setUTCHours(24, 0, 0, 0);
  return { plan, expiresAt, resetAt: reset.toISOString(), meals: { used, limit: plan === 'pro' ? null : 3, remaining: plan === 'pro' ? null : Math.max(0, 3 - used) },
    chef: { used, limit: plan === 'pro' ? null : 5, remaining: plan === 'pro' ? null : Math.max(0, 5 - used) } };
}
const record = (now, daily, uid = 'alice') => ({ version: 1, uid, updatedAt: now, plan: daily.plan, expiresAt: daily.expiresAt, usage: daily });

test('recent account state paints before authentication completes but cannot call protected APIs', async () => {
  const now = Date.parse('2026-10-20T20:00:00Z');
  const c = client({ now, verified: false, record: record(now, usage(now, 'free', 3)) });
  assert.equal(c.context.document.documentElement.dataset.usagePlan, 'free');
  assert.equal(c.read().usage.meals.remaining, 0);
  c.plan.remember('alice', { plan: 'pro', expiresAt: '2026-11-20T20:00:00Z' });
  assert.equal(c.read().plan, 'free');
  await assert.rejects(c.usage().requireAvailable('meals'), /sign in/);
});
test('cache is isolated by account, rejects expired/future/invalid records and clears on sign-out', () => {
  const now = Date.parse('2026-10-20T20:00:00Z'), saved = record(now, usage(now));
  assert.equal(client({ owner: 'bob', now, record: saved }).read(), null);
  for (const changed of [{ updatedAt: now - 300_000 }, { updatedAt: now + 1 }, { version: 2 }, { plan: 'admin' }, { plan: 'pro', expiresAt: 'bad' }]) {
    assert.equal(client({ now, record: { ...saved, ...changed } }).read(), null);
  }
  const c = client({ now, record: saved });
  c.owner(null);c.plan.clear();assert.equal(c.read(), null);assert(!c.data.has(key));
  assert.equal(c.context.document.documentElement.dataset.usagePlan, 'unknown');
});
test('activation and cancellation persist immediately across navigation and preserve daily usage', () => {
  const c = client(), expiresAt = '2026-11-20T20:00:00Z';
  c.plan.remember('alice', usage(c.now(), 'free', 3));
  c.plan.remember('alice', { plan: 'pro', expiresAt });
  assert.equal(c.read().usage.meals.used, 3);assert.equal(c.read().usage.meals.limit, null);
  const next = client({ now: c.now(), record: JSON.parse(c.data.get(key)) });
  assert.equal(next.read().plan, 'pro');
  next.plan.remember('alice', { plan: 'free', expiresAt: null, usage: usage(c.now(), 'free', 4) });
  const reload = client({ now: c.now(), record: JSON.parse(next.data.get(key)) });
  assert.equal(reload.read().plan, 'free');assert.equal(reload.read().usage.meals.remaining, 0);
});
test('Pro expiry restores Free limits locally and UTC rollover discards old quota counts', () => {
  const c = client(), expiresAt = new Date(c.now() + 60_000).toISOString();
  c.plan.remember('alice', usage(c.now(), 'pro', 4, expiresAt));c.advance(60_000);
  assert.equal(c.read().plan, 'free');assert.equal(c.read().usage.meals.limit, 3);assert.equal(c.read().usage.meals.remaining, 0);
  const midnight = client({ now: Date.parse('2026-10-20T23:59:30Z') });
  midnight.plan.remember('alice', usage(midnight.now(), 'free', 3));midnight.advance(60_000);
  assert.equal(midnight.read().plan, 'free');assert.equal(midnight.read().usage, null);
});
test('lifetime status and counters survive cached navigation; missing expiry alone never grants the Pro display', () => {
  const c = client();
  c.plan.remember('alice', { ...usage(c.now(), 'pro', 4), access: 'lifetime' });
  assert.equal(c.read().plan, 'pro');assert.equal(c.read().access, 'lifetime');assert.equal(c.read().usage.access, 'lifetime');
  const next = client({ now: c.now(), record: JSON.parse(c.data.get(key)) });
  assert.equal(next.read().access, 'lifetime');assert.equal(next.read().expiresAt, null);
  next.plan.remember('alice', usage(c.now(), 'free', 4));
  assert.equal(next.read().plan, 'free');assert.equal(next.read().access, undefined);
  const invalid = record(c.now(), usage(c.now(), 'pro', 0));
  assert.equal(client({ now: c.now(), record: invalid }).read(), null);
});
test('corrupt quota data never renders counters, and storage failures keep an in-memory display', () => {
  const c = client();
  c.plan.remember('alice', { ...usage(c.now()), meals: { used: '<script>' } });
  assert.equal(c.read().usage, null);
  c.block();c.plan.remember('alice', usage(c.now(), 'pro', 4, '2026-11-20T20:00:00Z'));
  assert.equal(c.read().plan, 'pro');assert.equal(c.read().usage.meals.used, 4);
});
test('other tabs update the tier immediately without granting an authenticated session', () => {
  const c = client({ verified: false });
  c.storage(record(c.now(), usage(c.now(), 'pro', 0, '2026-11-20T20:00:00Z')));
  assert.equal(c.context.document.documentElement.dataset.usagePlan, 'pro');
  c.storage(record(c.now(), usage(c.now(), 'free', 3)));
  assert.equal(c.context.document.documentElement.dataset.usagePlan, 'free');
  assert.equal(c.context.window.NutriSecurity.isCurrent('alice'), false);
});
test('a delayed background read or Chef response cannot restore Pro after cancellation', async () => {
  for (const method of ['GET', 'POST']) {
    const c = client(), pro = usage(c.now(), 'pro', 4, '2026-11-20T20:00:00Z');
    c.plan.remember('alice', pro);
    let resolve;
    c.context.window.NutriSecurity.apiFetch = () => new Promise(done => { resolve = done; });
    const ui = c.usage();
    ui.connect('alice');
    // connect starts a background GET; resolve it first for the POST scenario.
    if (method === 'POST') { resolve({ ok: true, json: async () => ({ usage: pro }) });await ui.refresh(); }
    const pending = method === 'GET' ? ui.refresh() : ui.request('/api/chef', { method: 'POST' });
    c.plan.remember('alice', usage(c.now(), 'free', 4));
    resolve({ ok: true, json: async () => ({ usage: pro }) });await pending;
    assert.equal(c.read().plan, 'free');assert.equal(c.read().usage.meals.limit, 3);
  }
});
test('failed revalidation retains cached counters; a delayed response after sign-out cannot repopulate them', async () => {
  const c = client();c.plan.remember('alice', usage(c.now(), 'free', 3));
  const ui = c.usage();ui.connect('alice');await ui.refresh();
  assert.equal(c.read().usage.meals.remaining, 0);
  let resolve;c.context.window.NutriSecurity.apiFetch = () => new Promise(done => { resolve = done; });
  const pending = ui.refresh();c.owner(null);c.plan.clear();ui.connect(null);
  resolve({ ok: true, json: async () => ({ usage: usage(c.now(), 'pro', 0, '2026-11-20T20:00:00Z') }) });await pending;
  assert.equal(c.read(), null);assert(!c.data.has(key));
});
