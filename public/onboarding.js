// Keep keyboard focus in the required first-time setup while it is visible.
(() => {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  let active = false;
  let previousFocus;
  let background = [];
  function sync() {
    const open = !overlay.classList.contains('hidden');
    if (open === active) return;
    active = open;
    if (open) {
      previousFocus = document.activeElement;
      background = [...document.body.children].filter(node => node !== overlay && !['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node => [node, node.inert]);
      background.forEach(([node]) => { node.inert = true; });
      document.getElementById('onboarding-title').focus({ preventScroll: true });
    } else {
      background.forEach(([node, inert]) => { node.inert = inert; });
      background = [];
      if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      else document.getElementById('text-meal-input')?.focus({ preventScroll: true });
    }
  }
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const fields = [...overlay.querySelectorAll('input,select,button,a[href]')].filter(node => !node.disabled);
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === document.getElementById('onboarding-title'))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  new MutationObserver(sync).observe(overlay, { attributes:true, attributeFilter:['class'] });
  sync();
})();
