(() => {
  const ownerKey = 'nutriglance_session_uid';
  const protectedPage = /^\/(dashboard|nutriglance|meals|progress|aichef|settings)(\.html)?\/?$/.test(location.pathname);
  let currentUid = null;
  const bootOwner = localStorage.getItem(ownerKey);
  function hideAccount() {
    if (!protectedPage) return;
    document.documentElement.classList.add('session-pending');
    document.documentElement.dataset.sessionStatus = 'Loading your account…';
  }
  function clearAccount() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('nutriglance_') && !['nutriglance_darkmode', 'nutriglance_reminder_owner'].includes(key)) localStorage.removeItem(key);
    }
    currentUid = null;
  }
  if (!bootOwner) clearAccount(); // Retire legacy shared caches with unknown ownership.
  hideAccount();

  function bindSession(user) {
    if (!user) { clearAccount(); hideAccount(); return false; }
    const owner = localStorage.getItem(ownerKey);
    if (owner !== user.uid) {
      clearAccount();
      localStorage.setItem(ownerKey, user.uid);
      // Rebuild in-memory state too; old-account DOM must not survive a switch.
      if (protectedPage && bootOwner) { location.reload(); return false; }
    }
    currentUid = user.uid;
    document.documentElement.classList.remove('session-pending');
    return true;
  }

  function number(value, maximum = 100000) {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : 0;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  }
  function normalizeMeal(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid nutrition result. Please try again.');
    if (raw.notFood === true) return { notFood: true, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : 'Please describe or photograph a meal.' };
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 160) throw new Error('Invalid meal name. Please try again.');
    const meal = { name: raw.name.trim() };
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key] < 0 || raw[key] > 20000) throw new Error('Invalid nutrition result. Please try again.');
      meal[key] = Math.round(raw[key]);
    }
    for (const [key, limit] of [['description', 1000], ['portionSize', 200]]) {
      if (typeof raw[key] === 'string') meal[key] = raw[key].slice(0, limit);
    }
    return meal;
  }
  function readMeals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(meal => meal && typeof meal === 'object').map(meal => ({ ...meal,
      name: typeof meal.name === 'string' ? meal.name.slice(0, 160) : 'Untitled meal',
      description: typeof meal.description === 'string' ? meal.description.slice(0, 1000) : '',
      ...Object.fromEntries(['kcal','protein','carbs','fat','fibre'].map(key => [key, number(meal[key])])),
    }));
  }
  async function apiFetch(url, options) {
    const auth = window.nutriGlanceReminderAuth;
    if (!auth?.currentUser || currentUid !== auth.currentUser.uid) throw new Error('Please sign in to continue.');
    const uid = currentUid;
    const token = await auth.currentUser.getIdToken();
    if (uid !== currentUid || uid !== auth.currentUser?.uid || uid !== localStorage.getItem(ownerKey)) throw new Error('Your account changed. Please try again.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (uid !== currentUid || uid !== auth.currentUser?.uid || uid !== localStorage.getItem(ownerKey)) throw new Error('Your account changed. Please try again.');
    return response;
  }
  window.NutriSecurity = { bindSession, clearAccount, number, escapeHtml, normalizeMeal, readMeals, apiFetch,
    isCurrent: uid => Boolean(uid && uid === currentUid && uid === localStorage.getItem(ownerKey) && uid === window.nutriGlanceReminderAuth?.currentUser?.uid),
  };
  window.addEventListener('storage', event => {
    if (event.key === ownerKey && currentUid && event.newValue !== currentUid || event.key === null) {
      hideAccount();
      if (protectedPage) location.replace('/login');
    }
  });
  window.addEventListener('pagehide', hideAccount);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
})();
