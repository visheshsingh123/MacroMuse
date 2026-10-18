import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/reminders.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ workerPending = false, supported = true, preference = '0', permission = 'default', available = false } = {}) {
  const timers = new Map(), storage = new Map(), events = {};
  if (preference !== null) storage.set('nutriglance_notifications', preference);
  const elements = Object.fromEntries(['notif-toggle', 'notif-thumb', 'notif-status', 'notif-retry'].map(id => [id, {
    disabled: false, textContent: '', attrs: {}, classes: new Set(),
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(name, fn) { this[name] = fn; },
    classList: { toggle() {} },
  }]));
  const state = { available, permissions: 0, posts: 0, unsubscribed: 0, subscribed: false, tokenPending: false };
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', toJSON() { return { endpoint: this.endpoint }; }, async unsubscribe() { state.unsubscribed++; state.subscribed = false; return true; } };
  const reg = { getNotifications: async () => [], pushManager: {
    getSubscription: async () => state.subscribed ? sub : null,
    subscribe: async () => { state.subscribed = true; return sub; },
  } };
  const notification = { permission, async requestPermission() { state.permissions++; this.permission = 'granted'; return 'granted'; } };
  const context = {
    document: { getElementById: id => elements[id] },
    navigator: { serviceWorker: { register: async () => reg, ready: workerPending ? new Promise(() => {}) : Promise.resolve(reg), getRegistration: async () => reg } },
    Notification: notification, Uint8Array, AbortSignal, atob,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => {
      if (options.method === 'POST') state.posts++;
      return { ok: state.available, status: state.available ? 200 : 503, json: async () => state.available ? { publicKey: Buffer.alloc(65, 4).toString('base64url') } : { error: 'Reminders are temporarily unavailable. Please try again later.' } };
    },
    window: {
      isSecureContext: supported, Notification: notification, PushManager: class {},
      addEventListener: (name, fn) => events[name] = fn,
      nutriGlanceReminderAuth: { onAuthStateChanged: fn => fn({ uid: 'alice', getIdToken: () => state.tokenPending ? new Promise(() => {}) : Promise.resolve('fixture-token') }) },
    },
  };
  vm.runInNewContext(script, context);
  return { state, elements, storage, timers, events, click: () => elements['notif-toggle'].click(), allow: () => elements['notif-retry'].click(), expire: () => [...timers.values()].forEach(fn => fn()) };
}

test('new users default to on and approve browser permission through an explicit action', async () => {
  const f = fixture({ preference: null, available: true }); await flush();
  assert.equal(f.storage.get('nutriglance_notifications'), '1');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.match(f.elements['notif-status'].textContent, /Allow browser notifications/);
  assert.equal(f.elements['notif-retry'].textContent, 'Allow notifications');
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 0);
  await f.allow();
  assert.equal(f.state.permissions, 1);
  assert.equal(f.state.posts, 1);
  assert.match(f.elements['notif-status'].textContent, /1 PM and 7 PM IST/);
});

test('new users with existing browser permission subscribe automatically', async () => {
  const f = fixture({ preference: null, permission: 'granted', available: true }); await flush();
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 1);
  assert.equal(f.state.subscribed, true);
  assert.equal(f.storage.get('nutriglance_reminder_owner'), 'alice');
  assert.match(f.elements['notif-status'].textContent, /1 PM and 7 PM IST/);
});

test('existing opt-outs stay off even with granted permission and repeated refreshes', async () => {
  const f = fixture({ permission: 'granted', available: true }); await flush();
  await f.events.focus();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.state.subscribed, false);
  assert.equal(f.state.posts, 0);
});

test('a default-on preference can be turned off before allowing notifications', async () => {
  const f = fixture({ preference: null, available: true }); await flush();
  await f.click();
  await f.events.focus();
  assert.equal(f.storage.get('nutriglance_notifications'), '0');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 0);
});

test('blocked notification permission is explained without prompting or creating a subscription', async () => {
  const f = fixture({ preference: null, available: true, permission: 'denied' }); await flush();
  assert.match(f.elements['notif-status'].textContent, /Notifications are blocked/);
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 0);
});

test('an unavailable reminder switch remains clickable and retries without prompting for permission', async () => {
  const f = fixture(); await flush();
  assert.equal(f.elements['notif-toggle'].disabled, false);
  assert.match(f.elements['notif-status'].textContent, /temporarily unavailable/);
  await f.click();
  assert.equal(f.state.permissions, 0);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  f.state.available = true;
  await f.click();
  assert.match(f.elements['notif-status'].textContent, /Reminders are ready/);
  assert.equal(f.state.permissions, 0);
  await f.click();
  assert.equal(f.state.permissions, 1);
  assert.equal(f.state.posts, 1);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
});

test('a stalled service worker times out and releases the reminder controls', async () => {
  const f = fixture({ workerPending: true }); await flush();
  assert.equal(f.elements['notif-toggle'].disabled, true);
  assert.match(f.elements['notif-status'].textContent, /Checking reminders/);
  f.expire(); await flush();
  assert.equal(f.elements['notif-toggle'].disabled, false);
  assert.match(f.elements['notif-status'].textContent, /timed out/);
  assert.equal(f.timers.size, 0);
});

test('an unsupported browser explains why reminders cannot be enabled when clicked', async () => {
  const f = fixture({ supported: false }); await flush(); await f.click();
  assert.equal(f.elements['notif-toggle'].disabled, false);
  assert.match(f.elements['notif-status'].textContent, /aren’t supported/);
  assert.equal(f.state.permissions, 0);
});

test('a stalled sign-in token cannot leave the switch busy indefinitely', async () => {
  const f = fixture(); f.state.available = true; await flush();
  f.state.tokenPending = true;
  const pending = f.click(); await flush();
  f.expire(); await pending;
  assert.equal(f.elements['notif-toggle'].disabled, false);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.match(f.elements['notif-status'].textContent, /timed out/);
  assert.equal(f.state.unsubscribed, 1);
  assert.equal(f.state.posts, 0);
});
