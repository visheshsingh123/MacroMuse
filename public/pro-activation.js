// Codes are submitted over the authenticated API and never stored in the browser.
(() => {
  const button = document.getElementById('pro-activate-btn');
  const dialog = document.getElementById('pro-activation-dialog');
  const form = document.getElementById('pro-activation-form');
  const input = document.getElementById('pro-activation-code');
  const feedback = document.getElementById('pro-activation-feedback');
  const signIn = document.getElementById('pro-activation-signin');
  const submit = document.getElementById('pro-activation-submit');
  let authPromise, plan = null, version = 0;
  const expiry = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  async function auth() {
    if (!authPromise) authPromise = (async () => {
      const [firebase, identity] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
      ]);
      const app = firebase.getApps().find(app => app.name === '[DEFAULT]') || firebase.initializeApp({
        apiKey: 'AIzaSyDKwXd1HXx0oNriqUOfiP4FOHmNc9L1jbA', authDomain: 'nutriglance.firebaseapp.com', projectId: 'nutriglance',
        storageBucket: 'nutriglance.firebasestorage.app', messagingSenderId: '878128108474',
        appId: '1:878128108474:web:76ff47c291dd19593a4383', measurementId: 'G-C0B269SQFP',
      });
      const instance = identity.getAuth(app);
      window.nutriGlanceReminderAuth = instance;
      await instance.authStateReady();
      return instance;
    })().catch(error => { authPromise = null;throw error; });
    const instance = await authPromise;
    window.NutriSecurity.bindSession(instance.currentUser);
    return instance;
  }
  function setPlan(next) {
    plan = next;
    const active = next?.plan === 'pro';
    button.textContent = active ? 'Pro active' : 'Activate Pro';
    document.getElementById('pro-launch-note').textContent = active
      ? `Your Pro access ends ${expiry(next.expiresAt)}.`
      : 'Have an activation code? Unlock one month of Pro. No payment is taken.';
    const status = document.getElementById('pro-account-status');
    status.hidden = !active;
    status.textContent = active ? `NutriGlance Pro is active until ${expiry(next.expiresAt)}.` : '';
    form.hidden = active;
    document.getElementById('pro-active-message').hidden = !active;
    document.getElementById('pro-active-message').textContent = active ? `You have full Pro access until ${expiry(next.expiresAt)}. You can continue from your dashboard.` : '';
  }
  async function loadStatus() {
    const generation = ++version;
    try {
      const identity = await auth();
      if (generation !== version) return;
      if (!identity.currentUser) { setPlan(null);return; }
      const response = await window.NutriSecurity.apiFetch('/api/pro', { method: 'GET' });
      const data = await response.json();
      if (generation !== version) return;
      if (!response.ok) throw new Error(data.error?.message || 'Couldn’t load your plan.');
      setPlan(data);
    } catch {
      if (generation === version) document.getElementById('pro-launch-note').textContent = 'Couldn’t check your plan. You can retry when activating Pro.';
    }
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    feedback.textContent = '';signIn.hidden = true;
    setPlan(plan);
    dialog.showModal();
    if (!form.hidden) input.focus();
    void loadStatus();
  });
  document.getElementById('pro-activation-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { input.value = '';button.focus(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !input.value.trim()) return;
    const code = input.value.trim();
    submit.disabled = true;submit.textContent = 'Activating…';feedback.textContent = '';signIn.hidden = true;
    const generation = ++version;
    try {
      const identity = await auth();
      if (!identity.currentUser) { signIn.hidden = false;throw new Error('Sign in to the account you want to upgrade, then return to activate Pro.'); }
      const response = await window.NutriSecurity.apiFetch('/api/pro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await response.json();
      if (generation !== version) return;
      if (!response.ok) throw new Error(data.error?.message || 'Couldn’t activate Pro. Please try again.');
      setPlan(data);
    } catch (error) { if (generation === version) feedback.textContent = error.message || 'Couldn’t activate Pro. Please try again.'; }
    finally { input.value = '';submit.disabled = false;submit.textContent = 'Activate for one month'; }
  });
  window.addEventListener('focus', () => { if (!submit.disabled) void loadStatus(); });
  void loadStatus();
})();
