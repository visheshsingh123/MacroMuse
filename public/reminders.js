// Web Push subscriptions persist after the tab or installed app is closed.
(() => {
  const preferenceKey = 'nutriglance_notifications';
  const ownerKey = 'nutriglance_reminder_owner';
  const toggle = document.getElementById('notif-toggle');
  const thumb = document.getElementById('notif-thumb');
  const status = document.getElementById('notif-status');
  const retry = document.getElementById('notif-retry');
  const testButton = document.getElementById('notif-test');
  const supported = window.isSecureContext && 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;
  let user = null;
  let subscription = null;
  let publicKey = null;
  let busy = false;
  let serviceAvailable = false;
  let errorMessage = '';
  let generation = 0;
  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ReminderError('Reminder setup timed out. Please try again.')), 15000);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  const registration = () => withTimeout(navigator.serviceWorker.register('/service-worker.js').then(() => navigator.serviceWorker.ready));
  const preferred = () => Boolean(user && localStorage.getItem(preferenceKey) === '1');
  const enabled = () => supported && Notification.permission === 'granted' && subscription &&
    localStorage.getItem(preferenceKey) === '1' && localStorage.getItem(ownerKey) === user?.uid;

  function render(message = errorMessage) {
    if (!toggle) return;
    const on = Boolean(enabled());
    const wanted = preferred();
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = busy;
    toggle.setAttribute('aria-busy', String(busy));
    status.classList.toggle('inline-loading', busy);
    toggle.classList.toggle('bg-brand', on);
    toggle.classList.toggle('bg-slate-200', !on);
    thumb.classList.toggle('translate-x-5', on);
    thumb.classList.toggle('translate-x-0.5', !on);
    if (retry) {
      const needsPermission = supported && wanted && Notification.permission === 'default' && serviceAvailable;
      retry.textContent = needsPermission ? 'Allow notifications' : 'Retry reminders';
      retry.classList.toggle('hidden', !supported || !user || (!message && serviceAvailable && !needsPermission));
      retry.disabled = busy;
    }
    if (testButton) {
      testButton.classList.toggle('hidden', !on || !serviceAvailable);
      testButton.disabled = busy;
    }
    status.textContent = busy ? 'Checking reminders…' : message || (!supported
      ? 'Reminders aren’t supported in this browser. On iPhone, add MacroMuse to your Home Screen first.'
      : !user ? 'Sign in to manage reminders.'
        : Notification.permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser’s site settings to enable reminders.'
          : !serviceAvailable ? 'Reminders aren’t available yet. Please try again later.'
            : wanted && Notification.permission === 'default' ? 'Not active · Allow browser notifications to receive reminders.'
              : enabled() ? 'On · 1 PM and 7 PM IST, even when the app is closed.'
                : wanted ? 'Not active · Connecting reminders. Please retry if this persists.'
              : 'Off · Water and meal reminders at 1 PM and 7 PM IST.');
  }

  class ReminderError extends Error {}
  async function responseError(response) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    return new ReminderError(typeof message === 'string' && message.length <= 240 ? message :
      response.status === 401 ? 'Your session has expired. Please sign in again.' :
        response.status === 429 ? 'Too many reminder requests. Wait a minute and try again.' :
          'Reminders are temporarily unavailable. Please try again later.');
  }
  async function save(enabled, sub, action) {
    const owner = user;
    if (!owner) throw new ReminderError('Please sign in to manage reminders.');
    const token = await withTimeout(owner.getIdToken());
    if (user?.uid !== owner.uid) throw new ReminderError('Your account changed. Please try again.');
    const response = await fetch('/api/reminders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(action === 'test' ? { action, endpoint: sub.endpoint } : enabled ? { enabled, subscription: sub.toJSON() } : { enabled, endpoint: sub.endpoint }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw await responseError(response);
  }

  async function dismiss(reg) {
    const notifications = await reg.getNotifications();
    notifications.filter(n => n.tag.startsWith('nutriglance-reminder-')).forEach(n => n.close());
  }

  async function disable() {
    generation++;
    const reg = supported ? await withTimeout(navigator.serviceWorker.getRegistration()) : null;
    const sub = subscription || (reg ? await withTimeout(reg.pushManager.getSubscription()) : null);
    let removed = !sub;
    if (sub) {
      // Unsubscribe locally even if the backend is temporarily unreachable.
      try { if (user) await save(false, sub); } catch { /* Unsubscribe still stops delivery. */ }
      removed = await withTimeout(sub.unsubscribe());
    }
    if (!removed) throw new Error('Couldn’t turn off reminders. Please try again.');
    subscription = null;
    localStorage.setItem(preferenceKey, '0');
    localStorage.removeItem(ownerKey);
    if (reg) await withTimeout(dismiss(reg)).catch(() => {});
  }
  window.nutriGlanceDisableReminders = disable;

  async function subscribe(reg) {
    const requestGeneration = generation;
    const requestUser = user;
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    let sub = await withTimeout(reg.pushManager.getSubscription());
    const savedKey = sub?.options?.applicationServerKey;
    if (savedKey && (new Uint8Array(savedKey).length !== bytes.length || new Uint8Array(savedKey).some((value, index) => value !== bytes[index]))) {
      if (!await withTimeout(sub.unsubscribe())) throw new ReminderError('Couldn’t refresh this device’s notification subscription. Please try again.');
      sub = null;
    }
    if (!sub) {
      const pending = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      try { sub = await withTimeout(pending); }
      catch (error) {
        // A late browser result must not silently enable a timed-out setup.
        pending.then(late => late.unsubscribe()).catch(() => {});
        throw error;
      }
    }
    if (generation !== requestGeneration || user?.uid !== requestUser.uid) {
      await withTimeout(sub.unsubscribe());
      throw new ReminderError('The account or notification preference changed.');
    }
    try { await save(true, sub); } catch (error) { await withTimeout(sub.unsubscribe()).catch(() => {}); subscription = null; throw error; }
    if (generation !== requestGeneration || user?.uid !== requestUser.uid) {
      await withTimeout(sub.unsubscribe());
      throw new Error('The account or notification preference changed.');
    }
    subscription = sub;
    localStorage.setItem(ownerKey, user.uid);
    localStorage.setItem(preferenceKey, '1');
  }

  async function updateReminders(turnOn) {
    if (busy) return;
    if (!user || !supported) { render(); return; }
    if (turnOn && !serviceAvailable) {
      await refresh();
      if (serviceAvailable) {
        errorMessage = 'Reminders are ready. Tap the switch again to allow notifications.';
        render();
      }
      return;
    }
    busy = true;
    errorMessage = '';
    render();
    try {
      if (!turnOn) {
        await disable();
      } else {
        // Ask only after an explicit click, never automatically on page load.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          localStorage.setItem(preferenceKey, '0');
          if (permission === 'default') errorMessage = 'Permission wasn’t granted. Reminders are off.';
        } else {
          const reg = await registration();
          let confirmationFailed = false;
          try {
            await reg.showNotification('MacroMuse notifications allowed', {
              body: 'Notifications can appear on this device. Check Settings for reminder setup status.',
              tag: 'nutriglance-reminder-enabled', renotify: true,
              icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/dashboard' },
            });
          } catch { confirmationFailed = true; }
          await subscribe(reg);
          if (confirmationFailed) {
            errorMessage = 'Reminders are on, but the confirmation could not be shown. Check notification settings for this app and browser on your device.';
          }
        }
      }
    } catch (error) {
      errorMessage = error.name === 'NotAllowedError'
        ? 'Notifications weren’t allowed. Check your browser’s site settings.'
        : error instanceof ReminderError ? error.message :
          ['TimeoutError', 'AbortError'].includes(error.name) ? 'The reminder request timed out. Please try again.' :
            'Couldn’t update reminders. Please try again.';
    } finally { busy = false; render(); }
  }
  toggle?.addEventListener('click', () => updateReminders(!enabled()));

  async function refresh() {
    if (!supported || !user || busy) { render(); return; }
    busy = true;
    render();
    try {
      const reg = await registration();
      subscription = await withTimeout(reg.pushManager.getSubscription());
      // A browser subscription must never follow another user's saved preference.
      if (subscription && localStorage.getItem(ownerKey) !== user.uid) {
        if (!await withTimeout(subscription.unsubscribe())) throw new Error('Could not remove previous subscription');
        subscription = null;
      }
      if (subscription && (localStorage.getItem(preferenceKey) !== '1' || Notification.permission === 'denied')) await disable();
      const response = await fetch('/api/reminders', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      serviceAvailable = response.ok;
      if (!response.ok) { publicKey = null; throw await responseError(response); }
      publicKey = (await response.json()).publicKey;
      if (typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(publicKey) || atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')).length !== 65) {
        throw new ReminderError('Reminders are temporarily unavailable. Please try again later.');
      }
      // Restore the default preference without prompting if browser permission already exists.
      if (preferred() && Notification.permission === 'granted') await subscribe(reg);
      errorMessage = '';
    } catch (error) {
      serviceAvailable = false;
      publicKey = null;
      errorMessage = error instanceof ReminderError ? error.message : 'Couldn’t load reminders. Check your connection and try again.';
    }
    finally { busy = false; render(); }
  }


  testButton?.addEventListener('click', async () => {
    if (busy || !enabled()) return;
    busy = true;errorMessage = '';render();
    try {
      await save(true, subscription, 'test');
      errorMessage = 'Test notification sent. If it doesn’t appear, check notification settings for this app and browser on your device.';
    } catch (error) {
      errorMessage = error instanceof ReminderError ? error.message : 'Couldn’t send a test notification. Check your connection and try again.';
    } finally { busy = false;render(); }
  });

  let attachedAuth;
  function attachAuth() {
    const auth = window.nutriGlanceReminderAuth;
    if (!auth || auth === attachedAuth) return;
    attachedAuth = auth;
    auth.onAuthStateChanged(async currentUser => {
      user = currentUser;
      if (user && localStorage.getItem(preferenceKey) === null) localStorage.setItem(preferenceKey, '1');
      if (!user && supported) {
        try { await disable(); } catch { /* Retry when the app next opens. */ }
      }
      await refresh();
    });
  }
  window.addEventListener('nutriglance-auth-ready', attachAuth);
  window.addEventListener('focus', refresh);
  retry?.addEventListener('click', () => preferred() && serviceAvailable && Notification.permission === 'default'
    ? updateReminders(true) : refresh());
  window.addEventListener('storage', event => {
    if ([preferenceKey, ownerKey, null].includes(event.key)) refresh();
  });
  render();
  attachAuth();
})();
