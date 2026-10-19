(() => {
  const darkToggle = document.getElementById('dark-toggle');
  const applyTheme = dark => {
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
    document.getElementById('icon-moon')?.classList.toggle('hidden', dark);
    document.getElementById('icon-sun')?.classList.toggle('hidden', !dark);
    darkToggle?.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    darkToggle?.setAttribute('aria-pressed', String(dark));
  };
  applyTheme(document.documentElement.classList.contains('dark'));
  darkToggle?.addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    applyTheme(dark);
    try { localStorage.setItem('nutriglance_darkmode', dark ? '1' : '0'); } catch {}
  });

  const billing = document.querySelector('.premium-billing');
  const buttons = [...document.querySelectorAll('[data-billing]')];
  const setBilling = period => {
    const annual = period === 'annual';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.billing === period)));
    document.getElementById('pro-price').textContent = annual ? '₹1,500' : '₹200';
    document.getElementById('pro-period').textContent = annual ? ' / year' : ' / month';
    document.getElementById('pro-billing-note').textContent = annual
      ? '₹125/month equivalent, billed yearly. Or choose ₹200/month.'
      : 'Or ₹1,500/year — save ₹900 (37.5%) compared with monthly.';
  };
  buttons.forEach(button => button.addEventListener('click', () => setBilling(button.dataset.billing)));
  setBilling('monthly');
  if (billing) billing.hidden = false;

  const launchButton = document.getElementById('pro-launch-details');
  if (launchButton && window.NutriDialog) {
    launchButton.hidden = false;
    launchButton.addEventListener('click', async () => {
      await window.NutriDialog.alert(
        'Pro will include 10 meal logs a day, unlimited AI Chef replies, unlimited saved recipes, and PDF exports. Pricing is ₹200/month or ₹1,500/year. Paid upgrades are not available yet.',
        { title: 'NutriGlance Pro is coming soon' }
      );
    });
  }
})();
