// Existing application menus retain their handlers and profile bindings.
// Information pages use the same menu behavior through this shared helper.
(() => {
  const nav = document.querySelector('.site-nav');
  const menu = nav?.querySelector('#mobile-menu');
  const button = nav?.querySelector('#hamburger');
  if (!menu || !button) return;

  const close = () => {
    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  };
  if (button.hasAttribute('data-site-menu-toggle')) {
    button.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a')) close();
    });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target)) close();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      close();
      button.focus();
    }
  });
  const sync = () => {
    menu.inert = !menu.classList.contains('open');
  };
  new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
  sync();
  const desktop = window.matchMedia('(min-width: 768px)');
  desktop.addEventListener('change', () => { if (desktop.matches) close(); });
})();
