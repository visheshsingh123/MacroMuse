// Daily usage is server-owned; local caches and browser Pro flags never grant access.
(() => {
  let uid = null, usage = null, promptOpen = false, checkedAt = 0, loading = null;
  const current = () => uid && window.NutriSecurity.isCurrent(uid);
  function render(error) {
    document.querySelectorAll('[data-usage-feature]').forEach(section => {
      const feature = section.dataset.usageFeature, item = usage?.[feature];
      const label = feature === 'meals' ? 'meal logs' : 'AI Chef replies';
      const exhausted = item && item.remaining === 0;
      section.classList.toggle('daily-usage-exhausted', Boolean(exhausted));
      section.querySelector('[data-usage-status]').textContent = error || (!item
        ? 'Checking your daily allowance…'
        : exhausted ? `Daily quota used up · ${item.used}/${item.limit} ${label}`
          : `${item.used}/${item.limit} ${label} used · ${item.remaining} left today`);
      section.querySelector('[data-usage-note]').textContent = exhausted
        ? 'Free allowance resets at 00:00 UTC. Pro will include unlimited usage; upgrades are coming soon.'
        : 'Free plan · Resets at 00:00 UTC. Pro will include unlimited usage.';
    });
  }
  function update(next) {
    if (!current() || !next) return;
    // A reply that began before midnight must not replace today's usage.
    if (Date.parse(next.resetAt) <= Date.now()) { void refresh();return; }
    usage = next;checkedAt = Date.now();render();
  }
  async function showLimit(feature) {
    render();
    if (promptOpen) return;
    promptOpen = true;
    const owner = uid;
    try {
      const label = feature === 'meals' ? '3 meal logs' : '5 AI Chef replies';
      const message = `You’ve used your Free allowance of ${label} today. It resets at 00:00 UTC. NutriGlance Pro will include unlimited meal logs and AI Chef replies. Paid upgrades are coming soon.`;
      const view = await window.NutriDialog.confirm(message, { title: 'Daily Free quota used up', confirmLabel: 'View Pro plans', cancelLabel: 'Wait for reset' });
      if (view && uid === owner && current()) window.location.href = '/premium';
    } finally { promptOpen = false; }
  }
  async function request(path, options = {}) {
    if (!current()) throw new Error('Please sign in to continue.');
    const owner = uid;
    const response = await window.NutriSecurity.apiFetch(path, options);
    const data = await response.json();
    if (!current() || uid !== owner) throw new Error('Your account changed. Please try again.');
    update(data.usage || data.error?.usage);
    if (!response.ok) {
      const error = new Error(data.error?.message || 'Couldn’t check your daily allowance. Please try again.');
      error.code = data.error?.code;
      if (error.code === 'FREE_QUOTA_EXCEEDED') await showLimit(data.error.feature);
      throw error;
    }
    return data;
  }
  async function refresh() {
    if (!current()) return;
    if (loading) return loading;
    const owner = uid;
    const pending = request('/api/usage').catch(() => {
      if (uid === owner && current()) render('Couldn’t check your allowance. Reconnect and try again.');
    });
    loading = pending;
    try { await pending; } finally { if (loading === pending) loading = null; }
  }
  function connect(owner) {
    if (owner === uid) return;
    uid = owner;usage = null;loading = null;checkedAt = 0;render();
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
  window.NutriUsage = { connect, refresh, request, requireAvailable, saveMeal };
  window.addEventListener('focus', () => { if (current() && Date.now() - checkedAt > 10_000) void refresh(); });
  setInterval(() => { if (current() && usage && Date.now() >= Date.parse(usage.resetAt)) void refresh(); }, 30_000);
})();
