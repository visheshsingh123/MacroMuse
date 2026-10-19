// Daily usage is server-owned; local caches and browser Pro flags never grant access.
(() => {
  let uid = null, usage = null, promptOpen = false, checkedAt = 0, loading = null;
  const current = () => uid && window.NutriSecurity.isCurrent(uid);
  function restore() {
    const state = window.NutriPlan.read(uid || window.NutriSecurity.resumeOwner());
    usage = state ? { plan: state.plan, expiresAt: state.expiresAt, access: state.access, ...state.usage } : null;
    checkedAt = state?.updatedAt || 0;render();
  }
  function render(error) {
    const owner = uid || window.NutriSecurity.resumeOwner();
    const plan = owner && owner === window.NutriSecurity.resumeOwner() && usage ? usage.plan : 'unknown';
    document.documentElement.dataset.usagePlan = plan;
    document.querySelectorAll('[data-pro-profile], [data-pro-only]').forEach(badge => {
      badge.hidden = plan !== 'pro';
    });
    document.querySelectorAll('[data-pro-access-status]').forEach(status => {
      status.textContent = plan !== 'pro' ? '' : usage.access === 'lifetime' ? 'Lifetime Pro · No expiry. No recurring payments.'
        : `Pro expires on ${new Date(usage.expiresAt).toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })}.`;
    });
    document.querySelectorAll('[data-usage-feature]').forEach(section => {
      // Restore this account's display immediately, then verify in the background.
      section.hidden = plan !== 'free';
      const feature = section.dataset.usageFeature, item = usage?.[feature];
      const label = feature === 'meals' ? 'meal logs' : 'AI Chef replies';
      const pro = usage?.plan === 'pro';
      const exhausted = !pro && item && item.remaining === 0;
      const title = section.querySelector('.daily-usage-title');
      if (title) title.textContent = pro ? 'NutriGlance Pro' : feature === 'meals' ? 'Free meal logs' : 'Free AI Chef';
      section.classList.toggle('daily-usage-exhausted', Boolean(exhausted));
      section.querySelector('[data-usage-status]').textContent = error || (!item
        ? 'Checking your daily allowance…'
        : pro ? `Pro · Unlimited ${label}`
        : exhausted ? `Daily quota used up · ${Math.min(item.used, item.limit)}/${item.limit} ${label}`
          : `${item.used}/${item.limit} ${label} used · ${item.remaining} left today`);
      section.querySelector('[data-usage-note]').textContent = pro
        ? usage.access === 'lifetime' ? 'Lifetime Pro · No expiry.' : `Pro active until ${new Date(usage.expiresAt).toLocaleString()}.`
        : exhausted ? 'Free allowance resets at 00:00 UTC. Activate Pro with a code for unlimited usage.'
        : 'Free plan · Resets at 00:00 UTC. Pro includes unlimited usage.';
    });
  }
  function update(next) {
    if (!current() || !next) return;
    // A reply that began before midnight must not replace today's usage.
    if (Date.parse(next.resetAt) <= Date.now()) { void refresh();return; }
    window.NutriPlan.remember(uid, next);
  }
  async function showLimit(feature) {
    render();
    if (promptOpen) return;
    promptOpen = true;
    const owner = uid;
    try {
      const label = feature === 'meals' ? '3 meal logs' : '5 AI Chef replies';
      const message = `You’ve used your Free allowance of ${label} today. It resets at 00:00 UTC. Activate NutriGlance Pro with a code for unlimited meal logs and AI Chef replies.`;
      const view = await window.NutriDialog.confirm(message, { title: 'Daily Free quota used up', confirmLabel: 'View Pro plans', cancelLabel: 'Wait for reset' });
      if (view && uid === owner && current()) window.location.href = '/premium';
    } finally { promptOpen = false; }
  }
  async function showProRequired(owner) {
    const view = await window.NutriDialog.confirm('PDF exports are included with NutriGlance Pro. Activate Pro with a code to download your progress report.', { title: 'Pro required', confirmLabel: 'Activate Pro', cancelLabel: 'Keep Free' });
    if (view && current() && owner === uid) window.location.href = '/premium';
  }
  async function request(path, options = {}) {
    if (!current()) throw new Error('Please sign in to continue.');
    const owner = uid;
    const revision = window.NutriPlan.revision();
    const before = window.NutriPlan.read(owner);
    const response = await window.NutriSecurity.apiFetch(path, options);
    const data = await response.json();
    if (!current() || uid !== owner) throw new Error('Your account changed. Please try again.');
    // A background read started before a cancellation/activation must not undo it.
    const next = data.usage || data.error?.usage, after = window.NutriPlan.read(owner);
    const changedPlan = before && after && (before.plan !== after.plan || before.expiresAt !== after.expiresAt);
    const outdated = changedPlan && next && (next.plan !== after.plan || next.expiresAt !== after.expiresAt);
    if (path === '/api/pro' || !outdated && ((options.method || 'GET') !== 'GET'
      || revision === window.NutriPlan.revision())) update(next);
    if (!response.ok) {
      const error = new Error(data.error?.message || 'Couldn’t check your daily allowance. Please try again.');
      error.code = data.error?.code;
      if (error.code === 'FREE_QUOTA_EXCEEDED') await showLimit(data.error.feature);
      if (error.code === 'PRO_REQUIRED') await showProRequired(owner);
      throw error;
    }
    return data;
  }
  async function requirePdfExport() {
    const owner = uid;
    const plan = await request('/api/pro?feature=pdf');
    const active = plan.plan === 'pro' && (plan.access === 'lifetime' && plan.expiresAt === null
      || Date.parse(plan.expiresAt) > Date.now());
    if (!active) {
      if (plan.plan === 'free') window.NutriPlan.remember(owner, plan);
      await showProRequired(owner);
      const error = new Error('PDF exports require NutriGlance Pro.');
      error.code = 'PRO_REQUIRED';throw error;
    }
    window.NutriPlan.remember(owner, plan);
    return plan;
  }
  async function refresh() {
    if (!current()) return;
    if (loading) return loading;
    const owner = uid;
    const pending = request('/api/usage').catch(() => {
      if (uid === owner && current()) render(usage?.resetAt ? undefined : 'Couldn’t check your allowance. Reconnect and try again.');
    });
    loading = pending;
    try { await pending; } finally { if (loading === pending) loading = null; }
  }
  function connect(owner) {
    if (owner === uid) return;
    uid = owner;loading = null;restore();
    if (current()) void refresh();
  }
  async function requireAvailable(feature) {
    if (!current()) throw new Error('Please sign in to continue.');
    const data = await request('/api/usage');
    if (data.usage[feature].remaining === 0) {
      await showLimit(feature);
      const error = new Error(`Your daily Free ${feature === 'meals' ? 'meal' : 'AI Chef'} quota is used up. Explore Pro or wait for the daily reset.`);
      error.code = 'FREE_QUOTA_EXCEEDED';throw error;
    }
  }
  async function saveMeal(meal) {
    const data = await request('/api/meals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meal }) });
    return data.meal;
  }
  window.NutriUsage = { connect, refresh, request, requireAvailable, requirePdfExport, saveMeal };
  window.addEventListener('nutriglance:plan', restore);
  document.addEventListener('DOMContentLoaded', restore);
  const resume = () => { window.NutriPlan.sync();if (current() && Date.now() - checkedAt > 10_000) void refresh(); };
  window.addEventListener('focus', resume);
  window.addEventListener('online', () => { if (current()) void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  setInterval(() => {
    const previous = usage;
    window.NutriPlan.sync();
    if (current() && (!usage || !usage.resetAt || Date.now() - checkedAt >= window.NutriPlan.maxAge
      || previous && (Date.now() >= Date.parse(previous.resetAt)
        || previous.plan === 'pro' && Date.now() >= Date.parse(previous.expiresAt)))) void refresh();
  }, 30_000);
  restore();
})();
