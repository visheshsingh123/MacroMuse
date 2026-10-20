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

  const currency = document.querySelector('.premium-currency');
  const buttons = [...document.querySelectorAll('[data-currency]')];
  const setCurrency = value => {
    const usd = value === 'USD';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.currency === value)));
    document.getElementById('free-price').textContent = usd ? 'US$0' : '₹0';
    document.getElementById('pro-price').textContent = usd ? 'US$5' : '₹500';
    document.getElementById('pro-billing-note').textContent = usd
      ? 'Or ₹500 once. Lifetime access, with no recurring payments.'
      : 'Or US$5 once. Lifetime access, with no recurring payments.';
  };
  buttons.forEach(button => button.addEventListener('click', () => setCurrency(button.dataset.currency)));
  setCurrency('USD');
  if (currency) currency.hidden = false;

})();
