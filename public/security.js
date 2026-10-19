(() => {
  const ownerKey = 'nutriglance_session_uid';
  const hintKey = 'nutriglance_recent_session';
  const tabStorage = window.sessionStorage;
  const resumeWindow = 5 * 60 * 1000;
  const protectedPage = /^\/(dashboard|nutriglance|meals|progress|aichef|settings)(\.html)?\/?$/.test(location.pathname);
  let currentUid = null;
  const bootOwner = localStorage.getItem(ownerKey);
  function mountLoader() {
    if (!document.body || !document.documentElement.classList.contains('session-pending')) return;
    if (!document.getElementById('session-loader')) {
      const loader = document.createElement('div');
      loader.id = 'session-loader';
      loader.setAttribute('role', 'status');
      const dashboard = /^\/(dashboard|nutriglance)(\.html)?\/?$/.test(location.pathname);
      loader.setAttribute('aria-label', dashboard ? 'Loading dashboard' : 'Loading page');
      const line = '<span class="loading-placeholder loading-line"></span>';
      const card = `<div class="loading-card">${line}${line}</div>`;
      loader.innerHTML = dashboard ? `
        <div class="loading-dashboard" aria-hidden="true">
          <div class="loading-navbar"><div><span class="loading-brand">NutriGlance</span><span class="loading-nav-links">${line}${line}${line}${line}</span><span class="loading-avatar loading-placeholder"></span></div></div>
          <div class="loading-dashboard-content">
            <div class="loading-greeting loading-placeholder"></div>
            <div class="loading-dashboard-grid">
              <div class="loading-card loading-nutrition">${line}<div class="loading-calorie-ring loading-placeholder"></div><div class="loading-macros">${line}${line}${line}${line}${line}${line}</div><div class="loading-input loading-placeholder"></div></div>
              <div class="loading-meal-column"><div class="loading-card loading-upload"><span class="loading-upload-icon loading-placeholder"></span>${line}${line}</div><div class="loading-card loading-recent">${line}<div class="loading-meal-row">${line}${line}</div><div class="loading-meal-row">${line}${line}</div><div class="loading-meal-row">${line}${line}</div></div></div>
              <div class="loading-actions">${card}${card}${card}<div class="loading-card loading-water">${line}<div>${Array(8).fill('<span class="loading-placeholder"></span>').join('')}</div></div></div>
            </div>
          </div>
        </div>` : '<div class="session-loading-center"><span class="circular-loader" aria-hidden="true"></span></div>';
      document.body.appendChild(loader);
    }
    document.documentElement.classList.add('session-loader-mounted');
  }
  // Paint before deferred Firebase modules finish downloading.
  document.addEventListener?.('readystatechange', mountLoader);
  window.addEventListener('DOMContentLoaded', mountLoader);
  function canResume(owner) {
    try {
      const hint = JSON.parse(tabStorage?.getItem(hintKey) || 'null');
      const age = Date.now() - hint?.verifiedAt;
      return Boolean(owner && hint?.uid === owner && Number.isFinite(age) && age >= 0 && age < resumeWindow);
    } catch { return false; }
  }
  function hideAccount() {
    if (!protectedPage) return;
    document.documentElement.classList.add('session-pending');
    mountLoader();
  }
  function clearAccount() {
    tabStorage?.removeItem(hintKey);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('nutriglance_') && !['nutriglance_darkmode', 'nutriglance_reminder_owner'].includes(key)) localStorage.removeItem(key);
    }
    currentUid = null;
    window.NutriAvatar?.connect(null);
  }
  if (!bootOwner) clearAccount(); // Retire legacy shared caches with unknown ownership.
  // A recent Firebase-verified identity can paint its own cache during navigation.
  // This hint never authorizes API calls or Firestore access.
  if (!canResume(bootOwner)) hideAccount();

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
    window.NutriAvatar?.connect(user.uid);
    tabStorage?.setItem(hintKey, JSON.stringify({ uid: user.uid, verifiedAt: Date.now() }));
    document.documentElement.classList.remove('session-pending');
    document.documentElement.classList.remove('session-loader-mounted');
    document.getElementById?.('session-loader')?.remove();
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
  const cacheKeys = new Set(['profile', 'saved_recipes']);
  function readCache(owner, key, maxAge = 5 * 60 * 1000) {
    if (!cacheKeys.has(key) || !window.NutriSecurity.isCurrent(owner)) return null;
    try {
      const item = JSON.parse(localStorage.getItem(`nutriglance_cache_${key}`) || 'null');
      const age = Date.now() - item?.updatedAt;
      return item?.uid === owner && Number.isFinite(age) && age >= 0 && age < maxAge ? item.data : null;
    } catch { return null; }
  }
  function writeCache(owner, key, data) {
    if (!cacheKeys.has(key) || !window.NutriSecurity.isCurrent(owner)) return false;
    try {
      localStorage.setItem(`nutriglance_cache_${key}`, JSON.stringify({ uid: owner, updatedAt: Date.now(), data }));
      return true;
    } catch { return false; }
  }
  window.NutriSecurity = { bindSession, clearAccount, number, escapeHtml, normalizeMeal, readMeals, apiFetch,
    readCache, writeCache,
    resumeOwner: () => window.NutriSecurity.isCurrent(currentUid) ? currentUid : localStorage.getItem(ownerKey) === bootOwner && canResume(bootOwner) ? bootOwner : null,
    isCurrent: uid => Boolean(uid && uid === currentUid && uid === localStorage.getItem(ownerKey) && uid === window.nutriGlanceReminderAuth?.currentUser?.uid),
  };
  window.addEventListener('storage', event => {
    if (event.key === ownerKey && event.newValue !== (currentUid || bootOwner) || event.key === null) {
      tabStorage?.removeItem(hintKey);
      hideAccount();
      if (protectedPage) location.replace('/login');
    }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      if (!canResume(localStorage.getItem(ownerKey))) hideAccount();
      location.reload();
    }
  });
})();
