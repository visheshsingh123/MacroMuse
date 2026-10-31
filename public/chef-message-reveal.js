// Animate new reply text without replaying cached chats or delaying recipe controls.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  function start(container, text) {
    if (!text || motion.matches || document.hidden || !window.requestAnimationFrame) return;
    const characters = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
      : Array.from(text);
    const accessible = document.createElement('span');
    accessible.className = 'chef-reply-accessible';accessible.textContent = text;
    const layout = document.createElement('span');
    layout.className = 'chef-reply-layout';layout.textContent = text;layout.setAttribute('aria-hidden', 'true');
    const visual = document.createElement('span');
    visual.className = 'chef-reply-visual';visual.setAttribute('aria-hidden', 'true');
    const visibleText = document.createTextNode('');visual.append(visibleText);
    container.classList.add('chef-reply-revealing');
    container.replaceChildren(accessible, layout, visual);
    const duration = Math.min(2200, Math.max(300, characters.length * 14));
    const began = performance.now();
    let frame, shown = 0, finished = false;
    function finish() {
      if (finished) return;
      finished = true;cancelAnimationFrame(frame);active.delete(finish);
      visibleText.data = text;
      layout.remove();
      visual.classList.remove('chef-reply-visual');
      container.classList.remove('chef-reply-revealing');
    }
    function tick(now) {
      if (!container.isConnected || motion.matches || document.hidden) { finish();return; }
      const count = Math.min(characters.length, Math.floor((now - began) / duration * characters.length));
      if (count > shown) { visibleText.appendData(characters.slice(shown, count).join(''));shown = count; }
      if (shown === characters.length) finish();
      else frame = requestAnimationFrame(tick);
    }
    active.add(finish);frame = requestAnimationFrame(tick);
  }
  motion.addEventListener('change', event => { if (event.matches) [...active].forEach(finish => finish()); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) [...active].forEach(finish => finish()); });
  window.NutriChefReveal = { start };
})();
