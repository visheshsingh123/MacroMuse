// Presentation cache only. Protected actions always use the authenticated APIs.
(() => {
  const key = 'nutriglance_cache_plan', maxAge = 5 * 60_000;
  let fallback = null, storageFailed = false;
  function raw() { if (storageFailed) return fallback;try { return localStorage.getItem(key); } catch { return fallback; } }
  function dailyUsage(value, plan, expiresAt, access) {
    const midnight = new Date();midnight.setUTCHours(24, 0, 0, 0);
    if (!value || Date.parse(value.resetAt) !== midnight.getTime()) return null;
    const result = { plan, expiresAt, ...(access ? { access } : {}), resetAt: value.resetAt, timezone: 'UTC', upgradeAvailable: true };
    for (const [feature, limit] of [['meals', 3], ['chef', 5]]) {
      const item = value[feature];
      if (!Number.isSafeInteger(item?.used) || item.used < 0) return null;
      const remaining = Math.max(0, limit - item.used);
      result[feature] = { used: item.used, limit: plan === 'pro' ? null : limit,
        remaining: plan === 'pro' ? null : value.plan === plan && Number.isInteger(item.remaining)
          ? Math.max(0, Math.min(remaining, item.remaining)) : remaining };
    }
    return result;
  }
  function read(owner = window.NutriSecurity.resumeOwner()) {
    if (!owner || owner !== window.NutriSecurity.resumeOwner()) return null;
    try {
      const record = JSON.parse(raw() || 'null'), age = Date.now() - record?.updatedAt;
      if (record?.version !== 1 || record.uid !== owner || !Number.isFinite(age) || age < 0 || age >= maxAge
        || !['free', 'pro'].includes(record.plan)) return null;
      const expires = Date.parse(record.expiresAt);
      const lifetime = record.plan === 'pro' && record.access === 'lifetime' && record.expiresAt === null;
      if (record.plan === 'pro' && !lifetime && !Number.isFinite(expires)) return null;
      const plan = record.plan === 'pro' && (lifetime || expires > Date.now()) ? 'pro' : 'free';
      const expiresAt = plan === 'pro' ? record.expiresAt : null;
      const access = lifetime ? 'lifetime' : undefined;
      return { plan, expiresAt, ...(access ? { access } : {}), updatedAt: record.updatedAt, usage: dailyUsage(record.usage, plan, expiresAt, access) };
    } catch { return null; }
  }
  function sync() {
    const state = read();
    document.documentElement.dataset.usagePlan = state?.plan || 'unknown';
    window.dispatchEvent(new CustomEvent('nutriglance:plan', { detail: state }));
    return state;
  }
  function remember(owner, next) {
    if (!window.NutriSecurity.isCurrent(owner) || !['free', 'pro'].includes(next?.plan)) return;
    const previous = read(owner), expires = Date.parse(next.expiresAt);
    const lifetime = next.plan === 'pro' && next.access === 'lifetime' && next.expiresAt === null;
    if (next.plan === 'pro' && !lifetime && !Number.isFinite(expires)) return;
    const plan = next.plan === 'pro' && (lifetime || expires > Date.now()) ? 'pro' : 'free';
    const expiresAt = plan === 'pro' ? next.expiresAt : null;
    const access = lifetime ? 'lifetime' : undefined;
    const usage = dailyUsage(next.usage || (next.resetAt ? next : previous?.usage), plan, expiresAt, access);
    const record = JSON.stringify({ version: 1, uid: owner, updatedAt: Date.now(), plan, expiresAt, ...(access ? { access } : {}), usage });
    fallback = record;
    try { localStorage.setItem(key, record);storageFailed = false; } catch { storageFailed = true; }
    sync();
  }
  function clear() {
    fallback = null;
    try { localStorage.removeItem(key);storageFailed = false; } catch { storageFailed = true; }
    sync();
  }
  window.NutriPlan = { read, remember, clear, sync, revision: raw, maxAge };
  window.addEventListener('storage', event => {
    if ([key, 'nutriglance_session_uid', null].includes(event.key)) { storageFailed = false;sync(); }
  });
  sync();
})();
