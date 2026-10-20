(() => {
  const toggle = document.getElementById('dark-mode-toggle');
  const mobileToggle = document.getElementById('dark-mode-toggle-mobile');
  function applyTheme(dark, persist = false) {
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
    toggle.setAttribute('aria-checked', String(dark));
    mobileToggle.setAttribute('aria-checked', String(dark));
    document.getElementById('dark-mode-icon-moon').classList.toggle('hidden', dark);
    document.getElementById('dark-mode-icon-sun').classList.toggle('hidden', !dark);
    if (persist) { try { localStorage.setItem('nutriglance_darkmode', dark ? '1' : '0'); } catch {} }
  }
  applyTheme(document.documentElement.classList.contains('dark'));
  for (const button of [toggle, mobileToggle]) button.addEventListener('click', () => applyTheme(!document.documentElement.classList.contains('dark'), true));
  window.addEventListener('storage', event => { if (event.key === 'nutriglance_darkmode') applyTheme(event.newValue === '1'); });

  const menu = document.getElementById('mobile-menu');
  const hamburger = document.getElementById('hamburger');
  window.matchMedia('(min-width: 1051px)').addEventListener('change', event => {
    if (event.matches) {
      menu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    }
  });

  const tips = [
    'Make room for one more color on your plate.',
    'Keep a few easy ingredients ready for your busiest days.',
    'A familiar meal is a good place to start a new habit.',
    'Add a little detail to your meal log. Portions and ingredients matter.',
    'Put your water bottle somewhere you’ll see it.',
    'Try one small change you would happily repeat tomorrow.',
    'Save yourself a decision: plan one meal you already enjoy.',
  ];
  document.getElementById('daily-tip').textContent = tips[Math.floor(Date.now() / 86400000) % tips.length];
})();
