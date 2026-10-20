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

// Settings section shortcuts scroll the page below the sticky navbar.
(() => {
  const nav = document.querySelector('.settings-sidebar nav');
  if (!nav) return;
  const links = nav.querySelectorAll('a[href^="#"]');
  const markCurrent = () => links.forEach(link => {
    if (link.hash === location.hash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });

  nav.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const section = document.getElementById(link.hash.slice(1));
    if (!section) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    markCurrent();

    const heading = section.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    const headerBottom = document.querySelector('.site-nav')?.getBoundingClientRect().bottom || 0;
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top - Math.max(0, headerBottom) - 24,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  });
  window.addEventListener('hashchange', markCurrent);
  markCurrent();
})();

// A small connection indicator; cached pages stay usable without a write queue.
(() => {
  const notice = document.createElement('aside');notice.className = 'connection-notice';notice.setAttribute('role', 'status');notice.hidden = true;
  const text = document.createElement('span');
  const refresh = document.createElement('button');refresh.type = 'button';refresh.textContent = 'Refresh';refresh.addEventListener('click', () => location.reload());
  const dismiss = document.createElement('button');dismiss.type = 'button';dismiss.textContent = '×';dismiss.setAttribute('aria-label', 'Dismiss connection notice');dismiss.addEventListener('click', () => { notice.hidden = true; });
  notice.append(text, refresh, dismiss);document.body.appendChild(notice);
  let wasOffline = navigator.onLine === false;
  function show() {
    const offline = navigator.onLine === false;
    document.documentElement.classList.toggle('is-offline', offline);
    if (!offline && !wasOffline) return;
    text.textContent = offline ? 'Offline · Viewing saved pages. AI and cloud updates need internet.' : 'Back online. Refresh to load the latest data.';
    refresh.hidden = offline;notice.hidden = false;wasOffline ||= offline;
  }
  show();window.addEventListener('offline', show);window.addEventListener('online', show);
  const onlineControls = '#download-apk,#water-drops button,#water-reset,#quick-water,#clear-btn,#clear-all-btn,#avatar-save,#cancel-pro-btn,#signin-btn,#signup-btn,#google-signin-btn,#google-signup-btn,#text-meal-btn,#result-log-btn';
  function preventOfflineUpdate(event) {
    if (navigator.onLine !== false) return;
    if (event.type !== 'submit' && !event.target.closest?.(onlineControls)) return;
    event.preventDefault();event.stopImmediatePropagation();show();
  }
  document.addEventListener('submit', preventOfflineUpdate, true);
  document.addEventListener('click', preventOfflineUpdate, true);
})();
