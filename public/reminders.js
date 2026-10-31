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
  let subscriptionChecked = false;
  let refreshing = false;
  let publicKey = null;
  let busy = false;
  let busyMessage = 'Checking reminders…';
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

  // The owner flag is written only after a successful subscription save.
  // It paints the last confirmed state, never authorizes a push request.
  const cachedOn = () => Boolean(user && supported && Notification.permission === 'granted' &&
    localStorage.getItem(preferenceKey) === '1' && localStorage.getItem(ownerKey) === user.uid);

  const displayedOn = () => Boolean(enabled() || !subscriptionChecked && cachedOn());

  function render(message = errorMessage) {
    if (!toggle) return;
    const on = displayedOn();
    const wanted = preferred();
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = busy;
    toggle.setAttribute('aria-busy', String(busy && !refreshing));
    status.classList.toggle('inline-loading', busy && !refreshing);
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
    status.textContent = busy && !refreshing ? busyMessage : message || (!supported
      ? 'Reminders aren’t supported in this browser. On iPhone, add MacroMuse to your Home Screen first.'
      : !user ? 'Sign in to manage reminders.'
        : Notification.permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser’s site settings to enable reminders.'
          : on ? 'On · 1 PM and 7 PM IST, even when the app is closed.'
            : refreshing ? wanted && Notification.permission === 'granted' ? 'Off · Restoring reminders in the background.' : 'Off · Water and meal reminders at 1 PM and 7 PM IST.'
            : !serviceAvailable ? 'Reminders aren’t available yet. Please try again later.'
            : wanted && Notification.permission === 'default' ? 'Not active · Allow browser notifications to receive reminders.'
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
    subscription = null;subscriptionChecked = true;
    localStorage.setItem(preferenceKey, '0');
    localStorage.removeItem(ownerKey);
    if (reg) await withTimeout(dismiss(reg)).catch(() => {});
  }
  window.nutriGlanceDisableReminders = disable;

  function pushRegistrationError(error) {
    const desktopBrave = Boolean(navigator.brave) && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const timedOut = error instanceof ReminderError && error.message.includes('timed out');
    if (desktopBrave && (timedOut || ['AbortError', 'NetworkError', 'NotSupportedError'].includes(error.name))) {
      return new ReminderError(`${timedOut ? 'Push registration timed out. ' : ''}In Brave Settings → Privacy and security, enable “Use Google services for push messaging”, then retry reminders.`);
    }
    if (['AbortError', 'NetworkError'].includes(error.name)) {
      return new ReminderError('This browser couldn’t connect to its push service. Check browser notification settings and your connection, then retry reminders.');
    }
    return error;
  }

  async function subscribe(reg, existing) {
    const requestGeneration = generation;
    const requestUser = user;
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    let sub = existing;
    try { if (existing === undefined) sub = await withTimeout(reg.pushManager.getSubscription()); }
    catch (error) { throw pushRegistrationError(error); }
    let previouslySaved = Boolean(sub && cachedOn());
    const savedKey = sub?.options?.applicationServerKey;
    if (savedKey && (new Uint8Array(savedKey).length !== bytes.length || new Uint8Array(savedKey).some((value, index) => value !== bytes[index]))) {
      if (!await withTimeout(sub.unsubscribe())) throw new ReminderError('Couldn’t refresh this device’s notification subscription. Please try again.');
      sub = null;previouslySaved = false;
      localStorage.removeItem(ownerKey);
    }
    if (!sub) {
      busyMessage = 'Registering this browser for reminders…';render();
      const pending = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      try { sub = await withTimeout(pending); }
      catch (error) {
        // A late browser result must not silently enable a timed-out setup.
        pending.then(late => late.unsubscribe()).catch(() => {});
        throw pushRegistrationError(error);
      }
    }
    if (generation !== requestGeneration || user?.uid !== requestUser.uid) {
      await withTimeout(sub.unsubscribe());
      throw new ReminderError('The account or notification preference changed.');
    }
    busyMessage = 'Saving reminder subscription…';render();
    try { await save(true, sub); } catch (error) {
      if (previouslySaved && generation === requestGeneration && user?.uid === requestUser.uid) {
        // A temporary server outage must not destroy a working saved subscription.
        subscription = sub;subscriptionChecked = true;
      } else {
        await withTimeout(sub.unsubscribe()).catch(() => {});
        if (generation === requestGeneration && user?.uid === requestUser.uid) {
          subscription = null;subscriptionChecked = true;localStorage.removeItem(ownerKey);
        }
      }
      throw error;
    }
    if (generation !== requestGeneration || user?.uid !== requestUser.uid) {
      await withTimeout(sub.unsubscribe());
      throw new Error('The account or notification preference changed.');
    }
    subscription = sub;subscriptionChecked = true;
    localStorage.setItem(ownerKey, user.uid);
    localStorage.setItem(preferenceKey, '1');
  }

  async function confirmEnabled(reg) {
    render();
    try {
      await withTimeout(reg.showNotification('MacroMuse reminders are on', {
        body: 'Meal and water reminders are enabled for 1 PM and 7 PM IST.',
        tag: 'nutriglance-reminder-enabled', renotify: false,
        icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/dashboard' },
      }));
    } catch {
      errorMessage = 'Reminders are on, but the confirmation could not be shown. Check notification settings for this app and browser on your device.';
    }
  }

  async function updateReminders(turnOn) {
    if (busy) return;
    if (!user || !supported) { render(); return; }
    if (turnOn && !serviceAvailable) {
      await refresh();
      if (enabled()) {
        busy = true;busyMessage = 'Finishing reminder setup…';render();
        try { await confirmEnabled(await registration()); }
        catch { errorMessage = 'Reminders are on. Use Send test notification to check delivery.'; }
        finally { busy = false;render(); }
      } else if (serviceAvailable && Notification.permission === 'granted') {
        await updateReminders(true);
      } else if (serviceAvailable) {
        errorMessage = 'Reminders are ready. Tap the switch again to allow notifications.';
        render();
      }
      return;
    }
    busy = true;
    busyMessage = turnOn ? 'Waiting for notification permission…' : 'Turning reminders off…';
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
          try {
            await reg.showNotification('MacroMuse notifications allowed', {
              body: 'Notifications can appear on this device. Check Settings for reminder setup status.',
              tag: 'nutriglance-reminder-enabled', renotify: true,
              icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/dashboard' },
            });
          } catch { /* Still try the enabled confirmation after setup. */ }
          await subscribe(reg);
          await confirmEnabled(reg);
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
  toggle?.addEventListener('click', () => updateReminders(!displayedOn()));

  async function refresh() {
    if (!supported || !user || busy) { render(); return; }
    busy = true;refreshing = true;
    const owner = user.uid;
    let revision = generation;
    const current = () => user?.uid === owner && generation === revision;
    busyMessage = 'Checking reminders…';
    render();
    let serverReady = false;
    try {
      const reg = await registration();
      if (!current()) return;
      let found;
      try { found = await withTimeout(reg.pushManager.getSubscription()); }
      catch (error) { throw pushRegistrationError(error); }
      if (!current()) return;
      subscription = found;subscriptionChecked = true;
      if (!subscription && localStorage.getItem(ownerKey) === owner) localStorage.removeItem(ownerKey);
      render();
      // A browser subscription must never follow another user's saved preference.
      if (subscription && localStorage.getItem(ownerKey) !== user.uid) {
        if (!await withTimeout(subscription.unsubscribe())) throw new Error('Could not remove previous subscription');
        subscription = null;
      }
      if (subscription && (localStorage.getItem(preferenceKey) !== '1' || Notification.permission === 'denied')) {
        await disable();revision = generation;
      }
      if (!current()) return;
      busyMessage = 'Connecting to the reminder server…';render();
      let response;
      try { response = await fetch('/api/reminders', { cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
      catch (error) {
        throw new ReminderError(['TimeoutError', 'AbortError'].includes(error.name)
          ? 'The reminder server request timed out. Please retry.'
          : 'Couldn’t reach the reminder server. Check your connection and retry.');
      }
      if (!current()) return;
      if (!response.ok) { publicKey = null; throw await responseError(response); }
      try {
        const config = await response.json();
        if (!current()) return;
        publicKey = config.publicKey;
        if (typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(publicKey) || atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')).length !== 65) throw new Error('Invalid key');
      } catch { throw new ReminderError('The reminder server returned an invalid setup response. Reload Settings and retry.'); }
      serviceAvailable = true;serverReady = true;
      // Restore the default preference without prompting if browser permission already exists.
      if (preferred() && Notification.permission === 'granted') await subscribe(reg, subscription);
      errorMessage = '';
    } catch (error) {
      if (!current()) return;
      if (!serverReady) { serviceAvailable = false;publicKey = null; }
      errorMessage = error instanceof ReminderError ? error.message : 'Couldn’t initialize notifications in this browser. Reload Settings and retry.';
    }
    finally {
      busy = false;refreshing = false;render();
      if (user && user.uid !== owner) refresh();
    }
  }


  testButton?.addEventListener('click', async () => {
    if (busy || !enabled()) return;
    busy = true;busyMessage = 'Sending test notification…';errorMessage = '';render();
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
      if (user?.uid !== currentUser?.uid) {
        generation++;subscription = null;subscriptionChecked = false;errorMessage = '';
      }
      user = currentUser;
      render();
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
