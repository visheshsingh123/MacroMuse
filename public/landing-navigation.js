// Keep landing-page section navigation below the sticky header, including
// when the mobile menu is expanded. Other pages retain normal navigation.
(() => {
  const nav = document.querySelector('.landing-page .site-nav');
  if (!nav) return;
  const menu = nav.querySelector('#mobile-menu');
  const toggle = nav.querySelector('#hamburger');
  const links = nav.querySelectorAll('a[href^="#"]');

  function markCurrent(hash) {
    links.forEach(link => {
      const current = link.hash === hash;
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();

    // Collapse immediately before measuring the target, so the shrinking menu
    // cannot move the section after its scroll position has been calculated.
    const transition = menu.style.transition;
    menu.style.transition = 'none';
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    void menu.offsetHeight;
    menu.style.transition = transition;

    if (location.hash !== url.hash) history.pushState(null, '', url.hash);
    markCurrent(url.hash);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  window.addEventListener('hashchange', () => markCurrent(location.hash));
  markCurrent(location.hash);
})();
