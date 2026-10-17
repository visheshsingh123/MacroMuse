// Web Push subscriptions persist after the tab or installed app is closed.
(() => {
  const preferenceKey = 'nutriglance_notifications';
  const ownerKey = 'nutriglance_reminder_owner';
  const toggle = document.getElementById('notif-toggle');
  const thumb = document.getElementById('notif-thumb');
  const status = document.getElementById('notif-status');
  const supported = window.isSecureContext && 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;
  let user = null;
  let subscription = null;
  let publicKey = null;
  let busy = false;
  let serviceAvailable = false;
  let errorMessage = '';
  let generation = 0;
  const registration = () => navigator.serviceWorker.register('/service-worker.js').then(() => navigator.serviceWorker.ready);
  const enabled = () => supported && Notification.permission === 'granted' && subscription &&
    localStorage.getItem(preferenceKey) === '1' && localStorage.getItem(ownerKey) === user?.uid;

  function render(message = errorMessage) {
    if (!toggle) return;
    const on = Boolean(enabled());
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = busy || !supported || !user || (!serviceAvailable && !on);
    toggle.classList.toggle('bg-brand', on);
    toggle.classList.toggle('bg-slate-200', !on);
    thumb.classList.toggle('translate-x-5', on);
    thumb.classList.toggle('translate-x-0.5', !on);
    status.textContent = message || (!supported
      ? 'Reminders aren’t supported in this browser. On iPhone, add NutriGlance to your Home Screen first.'
      : !user ? 'Sign in to manage reminders.'
        : Notification.permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser’s site settings to enable reminders.'
          : !serviceAvailable && !on ? 'Reminders aren’t available yet. Please try again later.'
            : on ? 'On · 1 PM and 7 PM IST, even when the app is closed.'
              : 'Off · Water and meal reminders at 1 PM and 7 PM IST.');
  }

  async function save(enabled, sub) {
    const token = await user.getIdToken();
    const response = await fetch('/api/reminders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(enabled ? { enabled, subscription: sub.toJSON() } : { enabled, endpoint: sub.endpoint }),
    });
    if (!response.ok) throw new Error('Couldn’t save reminders. Please try again.');
  }

  async function dismiss(reg) {
    const notifications = await reg.getNotifications();
    notifications.filter(n => n.tag.startsWith('nutriglance-reminder-')).forEach(n => n.close());
  }

  async function disable() {
    generation++;
    const reg = supported ? await navigator.serviceWorker.getRegistration() : null;
    const sub = subscription || (reg ? await reg.pushManager.getSubscription() : null);
    let removed = !sub;
    if (sub) {
      // Unsubscribe locally even if the backend is temporarily unreachable.
      try { if (user) await save(false, sub); } catch { /* Unsubscribe still stops delivery. */ }
      removed = await sub.unsubscribe();
    }
    if (!removed) throw new Error('Couldn’t turn off reminders. Please try again.');
    subscription = null;
    localStorage.setItem(preferenceKey, '0');
    localStorage.removeItem(ownerKey);
    if (reg) await dismiss(reg).catch(() => {});
  }
  window.nutriGlanceDisableReminders = disable;

  toggle?.addEventListener('click', async () => {
    if (busy || !user || !supported) return;
    busy = true;
    const requestGeneration = generation;
    const requestUser = user;
    errorMessage = '';
    render();
    try {
      if (enabled()) {
        await disable();
      } else {
        // Ask only after an explicit click, never automatically on page load.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          localStorage.setItem(preferenceKey, '0');
          if (permission === 'default') errorMessage = 'Permission wasn’t granted. Reminders are off.';
        } else {
          const reg = await registration();
          const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
          const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
          try { await save(true, sub); } catch (error) { await sub.unsubscribe(); throw error; }
          if (generation !== requestGeneration || user?.uid !== requestUser.uid) {
            await sub.unsubscribe();
            throw new Error('The account or notification preference changed.');
          }
          subscription = sub;
          localStorage.setItem(ownerKey, user.uid);
          localStorage.setItem(preferenceKey, '1');
        }
      }
    } catch (error) {
      errorMessage = error.name === 'NotAllowedError'
        ? 'Notifications weren’t allowed. Check your browser’s site settings.'
        : 'Couldn’t update reminders. Please try again.';
    } finally { busy = false; render(); }
  });

  async function refresh() {
    if (!supported || !user || busy) { render(); return; }
    busy = true;
    try {
      const reg = await registration();
      subscription = await reg.pushManager.getSubscription();
      // A browser subscription must never follow another user's saved preference.
      if (subscription && localStorage.getItem(ownerKey) !== user.uid) {
        if (!await subscription.unsubscribe()) throw new Error('Could not remove previous subscription');
        subscription = null;
        localStorage.setItem(preferenceKey, '0');
      }
      if (!subscription) localStorage.setItem(preferenceKey, '0');
      if (subscription && localStorage.getItem(preferenceKey) !== '1') await disable();
      const response = await fetch('/api/reminders', { cache: 'no-store' });
      serviceAvailable = response.ok;
      publicKey = response.ok ? (await response.json()).publicKey : null;
      if (subscription && enabled() && serviceAvailable) await save(true, subscription);
      errorMessage = '';
    } catch { errorMessage = 'Couldn’t load reminders. Please try again.'; }
    finally { busy = false; render(); }
  }

  let attachedAuth;
  function attachAuth() {
    const auth = window.nutriGlanceReminderAuth;
    if (!auth || auth === attachedAuth) return;
    attachedAuth = auth;
    auth.onAuthStateChanged(async currentUser => {
      user = currentUser;
      if (!user && supported) {
        try { await disable(); } catch { /* Retry when the app next opens. */ }
      }
      await refresh();
    });
  }
  window.addEventListener('nutriglance-auth-ready', attachAuth);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => {
    if ([preferenceKey, ownerKey, null].includes(event.key)) refresh();
  });
  render();
  attachAuth();
})();
