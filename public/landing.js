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

// Reveal each below-the-fold section once, with no scroll handler or layout changes.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return;
  const targets = [...document.querySelectorAll('#landing-main > *')]
    .filter(element => element.getBoundingClientRect().top >= window.innerHeight);
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -32px 0px' });
  for (const target of targets) {
    target.classList.add('landing-reveal');
    observer.observe(target);
  }
  motion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    targets.forEach(target => target.classList.add('is-revealed'));
  });
})();

// The requested hero headline gets a single, accessible letter reveal.
(() => {
  const heading = document.querySelector('#landing-hero h1');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!heading || motion.matches || !heading.animate || !('IntersectionObserver' in window)) return;
  let restore = () => {};
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    if (motion.matches) return;

    const original = [...heading.childNodes];
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    visual.append(...original.map(node => node.cloneNode(true)));
    const walker = document.createTreeWalker(visual, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const text of textNodes) {
      const fragment = document.createDocumentFragment();
      for (const part of text.textContent.split(/(\s+)/)) {
        if (!part || /^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          continue;
        }
        const word = document.createElement('span');
        word.className = 'hero-reveal-word';
        for (const character of Array.from(part)) {
          const letter = document.createElement('span');
          letter.className = 'hero-reveal-letter';
          letter.textContent = character;
          word.append(letter);
        }
        fragment.append(word);
      }
      text.replaceWith(fragment);
    }
    const accessible = document.createElement('span');
    accessible.className = 'hero-heading-accessible';
    accessible.append(...original);
    heading.replaceChildren(accessible, visual);
    const animations = [...visual.querySelectorAll('.hero-reveal-letter')].map((letter, index) => letter.animate([
      { opacity: 0, filter: 'blur(10px)', top: '.05em' },
      { opacity: 1, filter: 'blur(0px)', top: '0em' },
    ], { duration: 800, delay: index * 45, easing: 'cubic-bezier(.25,.46,.45,.94)', fill: 'both' }));
    let restored = false;
    restore = () => {
      if (restored) return;
      restored = true;
      heading.replaceChildren(...original);
      animations.forEach(animation => animation.cancel());
    };
    Promise.allSettled(animations.map(animation => animation.finished)).then(restore);
  }, { threshold: .15 });
  observer.observe(heading);
  motion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    restore();
  });
})();

// Highlight the step in view and read the introduction progressively as it scrolls.
(() => {
  const intro = document.querySelector('.story-reading');
  const section = document.getElementById('how-it-works');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!intro || !section || !('IntersectionObserver' in window)) return;
  const original = intro.textContent;
  const steps = [...section.querySelectorAll('.landing-steps>article')];
  let frame = 0, words = [];
  function update() {
    frame = 0;
    if (motion.matches) return;
    const rect = intro.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight * .85 - rect.top) / (rect.height + innerHeight * .3)));
    words.forEach((word, i) => word.classList.toggle('is-read', i < Math.ceil(progress * words.length)));
    let active = steps[0], distance = Infinity;
    for (const step of steps) {
      const r = step.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < distance) { distance = d;active = step; }
    }
    steps.forEach(step => step.classList.toggle('story-active', step === active));
  }
  function queue() { if (!frame && !motion.matches) frame = requestAnimationFrame(update); }
  function setup() {
    intro.replaceChildren();words = [];
    intro.classList.toggle('is-scroll-reading', !motion.matches);
    section.classList.toggle('story-scroll-ready', !motion.matches);
    if (motion.matches) { intro.textContent = original;return; }
    // The full sentence is exposed once; animated words are decorative duplicates.
    const accessible = document.createElement('span');accessible.className = 'sr-only';accessible.textContent = original;intro.append(accessible);
    for (const text of original.split(/(\s+)/)) {
      const span = document.createElement('span');span.textContent = text;span.setAttribute('aria-hidden','true');
      if (text.trim()) { span.className = 'story-word';words.push(span); }
      intro.append(span);
    }
    update();
  }
  addEventListener('scroll', queue, { passive:true });addEventListener('resize', queue);
  motion.addEventListener('change', setup);setup();
})();
