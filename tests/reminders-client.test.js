import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/reminders.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ workerPending = false, supported = true, preference = '0', permission = 'default', requestedPermission = 'granted', available = false, pushPending = false, existingSubscription = false, oldKey = false, brave = false, rememberedOwner } = {}) {
  const timers = new Map(), storage = new Map(), events = {};
  if (preference !== null) storage.set('nutriglance_notifications', preference);
  const elements = Object.fromEntries(['notif-toggle', 'notif-thumb', 'notif-status', 'notif-retry', 'notif-test'].map(id => [id, {
    disabled: false, textContent: '', attrs: {}, classes: new Set(),
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(name, fn) { this[name] = fn; },
    classList: { toggle() {} },
  }]));
  const state = { available, permissions: 0, posts: 0, unsubscribed: 0, subscribed: existingSubscription, subscribeCalls: 0, requests: [], tokenPending: false, postError: false, notificationError: false, notifications: [] };
  if (rememberedOwner || existingSubscription) storage.set('nutriglance_reminder_owner', rememberedOwner || 'alice');
  const sub = { options: { applicationServerKey: Uint8Array.from({ length: 65 }, () => oldKey ? 9 : 4).buffer }, endpoint: 'https://fcm.googleapis.com/fcm/send/test', toJSON() { return { endpoint: this.endpoint }; }, async unsubscribe() { state.unsubscribed++; state.subscribed = false; return true; } };
  const reg = { getNotifications: async () => [], showNotification: async (title, options) => {
    if (state.notificationError) throw new Error('Browser could not display notification');
    state.notifications.push({ title, options, posts: state.posts, checked: elements['notif-toggle'].attrs['aria-checked'] });
  }, pushManager: {
    getSubscription: async () => state.subscribed ? sub : null,
    subscribe: async () => {
      state.subscribeCalls++;
      if (state.subscribeError) throw state.subscribeError;
      if (pushPending) return new Promise(resolve => { state.completePush = () => { state.subscribed = true;resolve(sub); }; });
      state.subscribed = true; return sub;
    },
  } };
  const notification = { permission, async requestPermission() { state.permissions++; this.permission = requestedPermission; return requestedPermission; } };
  const context = {
    document: { getElementById: id => elements[id] },
    navigator: { userAgent: 'Desktop test browser', ...(brave ? { brave: {} } : {}), serviceWorker: { register: async () => reg, ready: workerPending ? new Promise(() => {}) : Promise.resolve(reg), getRegistration: async () => reg } },
    Notification: notification, Uint8Array, AbortSignal, atob,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => {
      if (state.fetchError) throw state.fetchError;
      if (options.method === 'POST') { state.posts++;state.requests.push(JSON.parse(options.body)); }
      const ok = state.available && !(options.method === 'POST' && state.postError);
      return { ok, status: ok ? 200 : 503, json: async () => ok ? { publicKey: Buffer.alloc(65, 4).toString('base64url') } : { error: 'Reminders are temporarily unavailable. Please try again later.' } };
    },
    window: {
      isSecureContext: supported, Notification: notification, PushManager: class {},
      addEventListener: (name, fn) => events[name] = fn,
      nutriGlanceReminderAuth: { onAuthStateChanged: fn => fn({ uid: 'alice', getIdToken: () => state.tokenPending ? new Promise(() => {}) : Promise.resolve('fixture-token') }) },
    },
  };
  vm.runInNewContext(script, context);
  return { state, elements, storage, timers, events, click: () => elements['notif-toggle'].click(), allow: () => elements['notif-retry'].click(), testNotification: () => elements['notif-test'].click(), expire: () => [...timers.values()].forEach(fn => fn()) };
}

test('a pending default preference stays visibly off until permission and registration succeed', async () => {
  const f = fixture({ preference: null, available: true }); await flush();
  assert.equal(f.storage.get('nutriglance_notifications'), '1');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.match(f.elements['notif-status'].textContent, /Allow browser notifications/);
  assert.equal(f.elements['notif-retry'].textContent, 'Allow notifications');
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 0);
  await f.allow();
  assert.equal(f.state.permissions, 1);
  assert.equal(f.state.posts, 1);
  assert.equal(f.state.notifications.length, 2);
  assert.match(f.elements['notif-status'].textContent, /1 PM and 7 PM IST/);
});

test('new users with existing browser permission subscribe automatically', async () => {
  const f = fixture({ preference: null, permission: 'granted', available: true }); await flush();
  assert.equal(f.state.permissions, 0);
  assert.equal(f.state.posts, 1);
  assert.equal(f.state.subscribed, true);
  assert.equal(f.state.notifications.length, 0);
  assert.equal(f.storage.get('nutriglance_reminder_owner'), 'alice');
  assert.match(f.elements['notif-status'].textContent, /1 PM and 7 PM IST/);
});

test('explicitly enabling confirms permission immediately, without repeating on refresh or disable', async () => {
  const f = fixture({ available: true, permission: 'granted' }); await flush();
  assert.equal(f.state.notifications.length, 0);
  await f.click();
  assert.equal(f.state.notifications.length, 2);
  const notice = f.state.notifications[0];
  assert.equal(notice.posts, 0);
  assert.equal(notice.title, 'MacroMuse notifications allowed');
  assert.match(notice.options.body, /Check Settings/);
  assert.equal(notice.options.tag, 'nutriglance-reminder-enabled');
  assert.equal(notice.options.data.url, '/dashboard');
  const enabledNotice = f.state.notifications[1];
  assert.equal(enabledNotice.title, 'MacroMuse reminders are on');
  assert.equal(enabledNotice.checked, 'true');
  assert.equal(enabledNotice.posts, 1);
  assert.equal(enabledNotice.options.tag, notice.options.tag);
  assert.equal(enabledNotice.options.renotify, false);
  assert.equal(f.storage.get('nutriglance_notifications'), '1');
  await f.events.focus();
  assert.equal(f.state.notifications.length, 2);
  await f.click();
  assert.equal(f.state.notifications.length, 2);
  assert.equal(f.state.subscribed, false);
  await f.click();
  assert.equal(f.state.notifications.length, 4);
});

test('declined permission never notifies; a save failure does not claim reminders are enabled', async () => {
  for (const permission of ['default', 'denied']) {
    const f = fixture({ available: true, requestedPermission: permission }); await flush();
    await f.click();
    assert.equal(f.state.notifications.length, 0);
    assert.equal(f.state.posts, 0);
    assert.equal(f.storage.get('nutriglance_notifications'), '0');
  }
  const f = fixture({ available: true, permission: 'granted' }); await flush();
  f.state.postError = true;
  await f.click();
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.notifications[0].title, 'MacroMuse notifications allowed');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.state.subscribed, false);
  assert.equal(f.storage.get('nutriglance_notifications'), '0');
});

test('a confirmation display failure preserves enabled reminders and explains the failure', async () => {
  const f = fixture({ available: true, permission: 'granted' }); await flush();
  f.state.notificationError = true;
  await f.click();
  assert.equal(f.state.subscribed, true);
  assert.equal(f.state.unsubscribed, 0);
  assert.equal(f.storage.get('nutriglance_notifications'), '1');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.match(f.elements['notif-status'].textContent, /Reminders are on.*confirmation could not be shown/);
  assert.equal(f.elements['notif-toggle'].disabled, false);
});

test('existing opt-outs stay off even with granted permission and repeated refreshes', async () => {
  const f = fixture({ permission: 'granted', available: true }); await flush();
  await f.events.focus();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.state.subscribed, false);
  assert.equal(f.state.posts, 0);
});

test('clicking the pending off switch actually requests permission and enables delivery', async () => {
  const f = fixture({ preference: null, available: true }); await flush();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  await f.click();
  assert.equal(f.state.permissions, 1);
  assert.equal(f.state.posts, 1);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  await f.click();
  assert.equal(f.storage.get('nutriglance_notifications'), '0');
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
  assert.match(f.elements['notif-status'].textContent, /^Off/);
  assert.equal(f.elements['notif-toggle'].attrs['aria-busy'], 'false');
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

test('a stalled push subscription still confirms permission, times out, and disposes a late result', async () => {
  const f = fixture({ available: true, pushPending: true });await flush();
  const pending = f.click();await flush();
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.posts, 0);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  f.expire();await pending;
  assert.equal(f.elements['notif-toggle'].disabled, false);
  assert.match(f.elements['notif-status'].textContent, /timed out/);
  f.state.completePush();await flush();
  assert.equal(f.state.subscribed, false);
  assert.equal(f.state.unsubscribed, 1);
  assert.equal(f.state.posts, 0);
});

test('a rotated push key replaces an existing browser subscription before re-registering', async () => {
  const f = fixture({ available: true, preference: '1', permission: 'granted', existingSubscription: true, oldKey: true });await flush();
  assert.equal(f.state.unsubscribed, 1);
  assert.equal(f.state.subscribeCalls, 1);
  assert.equal(f.state.posts, 1);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
});

test('test notifications use the saved endpoint and surface delivery failures', async () => {
  const f = fixture({ available: true, permission: 'granted' });await flush();await f.click();
  await f.testNotification();
  assert.equal(f.state.requests.at(-1).action, 'test');
  assert.equal(f.state.requests.at(-1).endpoint, 'https://fcm.googleapis.com/fcm/send/test');
  assert.match(f.elements['notif-status'].textContent, /Test notification sent/);
  f.state.postError = true;
  await f.testNotification();
  assert.match(f.elements['notif-status'].textContent, /unavailable/);
  assert.equal(f.elements['notif-toggle'].disabled, false);
});

test('desktop Brave push failures explain its messaging setting instead of claiming a request timeout', async () => {
  const f = fixture({ available: true, brave: true });await flush();
  f.state.subscribeError = Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' });
  await f.click();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.match(f.elements['notif-status'].textContent, /Use Google services for push messaging/);
  assert.doesNotMatch(f.elements['notif-status'].textContent, /request timed out/);
  assert.equal(f.state.posts, 0);
  assert.equal(f.state.notifications.length, 1);
  f.state.subscribeError = null;
  await f.click();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.equal(f.state.posts, 1);
});

test('other browsers get a push-service connection error rather than Brave-specific settings', async () => {
  const f = fixture({ available: true });await flush();
  f.state.subscribeError = Object.assign(new Error('Push unavailable'), { name: 'AbortError' });
  await f.click();
  assert.match(f.elements['notif-status'].textContent, /couldn’t connect to its push service/);
  assert.doesNotMatch(f.elements['notif-status'].textContent, /Brave|timed out/);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
});

test('a PC push failure during automatic reconnect keeps valid server setup retryable', async () => {
  const f = fixture({ preference: '1', permission: 'granted', available: true, brave: true });
  f.state.subscribeError = Object.assign(new Error('Push registration failed'), { name: 'AbortError' });
  await flush();
  assert.match(f.elements['notif-status'].textContent, /Use Google services for push messaging/);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  f.state.subscribeError = null;
  await f.click();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.equal(f.state.notifications.at(-1).title, 'MacroMuse reminders are on');
});

test('a permitted PC reconnects in one click after the server recovers', async () => {
  const f = fixture({ preference: '1', permission: 'granted', available: false });await flush();
  f.state.available = true;
  await f.click();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.doesNotMatch(f.elements['notif-status'].textContent, /Tap the switch again/);
  assert.equal(f.state.notifications.at(-1).title, 'MacroMuse reminders are on');
});

test('server network failures are distinguished from browser push failures', async () => {
  const f = fixture({ available: true });await flush();
  f.state.fetchError = new TypeError('Failed to fetch');
  await f.events.focus();
  assert.match(f.elements['notif-status'].textContent, /reach the reminder server/);
  assert.doesNotMatch(f.elements['notif-status'].textContent, /Google services|push service/);
});

test('a saved same-account On state paints synchronously before a stalled worker or server check', async () => {
  const f = fixture({ preference: '1', permission: 'granted', existingSubscription: true, workerPending: true });
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.equal(f.elements['notif-toggle'].attrs['aria-busy'], 'false');
  assert.match(f.elements['notif-status'].textContent, /^On/);
  assert.equal(f.state.posts, 0);
  await flush();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  f.expire();await flush();
  assert.match(f.elements['notif-status'].textContent, /timed out/);
});

test('cached Off, denied permission and a different owner never paint a cached On state', async () => {
  for (const options of [
    { preference: '0', permission: 'granted', rememberedOwner: 'alice' },
    { preference: '1', permission: 'denied', rememberedOwner: 'alice' },
    { preference: '1', permission: 'granted', rememberedOwner: 'someone-else' },
  ]) {
    const f = fixture({ ...options, workerPending: true });
    assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
    assert.equal(f.elements['notif-toggle'].attrs['aria-busy'], 'false');
    f.expire();await flush();
  }
});

test('background verification corrects a missing native subscription without replaying notifications', async () => {
  const f = fixture({ preference: '1', permission: 'granted', rememberedOwner: 'alice', available: true, pushPending: true });
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  await flush();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.storage.get('nutriglance_reminder_owner'), undefined);
  assert.equal(f.state.notifications.length, 0);
  f.state.completePush();await flush();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.equal(f.storage.get('nutriglance_reminder_owner'), 'alice');
  assert.equal(f.state.notifications.length, 0);
});

test('temporary revalidation write failures keep an already confirmed native subscription active', async () => {
  const f = fixture({ preference: '1', permission: 'granted', existingSubscription: true, available: true });
  f.state.postError = true;
  await flush();
  assert.equal(f.state.unsubscribed, 0);
  assert.equal(f.state.subscribed, true);
  assert.equal(f.storage.get('nutriglance_reminder_owner'), 'alice');
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  assert.match(f.elements['notif-status'].textContent, /unavailable/);
});

test('an On state painted from cache can be explicitly disabled after verification times out', async () => {
  const f = fixture({ preference: '1', permission: 'granted', existingSubscription: true, workerPending: true, available: true });
  await flush();f.expire();await flush();
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'true');
  await f.click();
  assert.equal(f.state.unsubscribed, 1);
  assert.equal(f.elements['notif-toggle'].attrs['aria-checked'], 'false');
  assert.equal(f.storage.get('nutriglance_notifications'), '0');
  assert.equal(f.state.requests.at(-1).enabled, false);
});
