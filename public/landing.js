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


})();

// Reveal each below-the-fold section once, with no scroll handler or layout changes.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return;
  const targets = [...document.querySelectorAll('#landing-main > *')]
    .filter(element => element.id !== 'laptop-section'
      && !(document.getElementById('laptop-section')?.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      && element.getBoundingClientRect().top >= window.innerHeight);
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

// The navbar fill grows from pointer entry, or its center for keyboard focus.
(() => {
  const link = document.querySelector('.landing-nav-cta');
  if (!link) return;
  let origin = null;
  function measure(point) {
    const rect = link.getBoundingClientRect();
    const x = point ? Math.max(0,Math.min(rect.width,point.clientX-rect.left)) : rect.width/2;
    const y = point ? Math.max(0,Math.min(rect.height,point.clientY-rect.top)) : rect.height/2;
    origin = { x,y };
    const diameter = Math.ceil(2*Math.max(Math.hypot(x,y),Math.hypot(rect.width-x,y),Math.hypot(x,rect.height-y),Math.hypot(rect.width-x,rect.height-y)));
    link.style.setProperty('--origin-x',`${x}px`);link.style.setProperty('--origin-y',`${y}px`);link.style.setProperty('--origin-size',`${diameter}px`);
  }
  link.addEventListener('pointerenter',event=>measure(event));
  link.addEventListener('pointerdown',event=>{if(event.button!==0)return;measure(event);link.classList.add('origin-active');});
  for (const name of ['pointerleave','pointercancel','pointerup','blur']) link.addEventListener(name,()=>link.classList.remove('origin-active'));
  link.addEventListener('focus',()=>{if(link.matches(':focus-visible'))measure();});
  if ('ResizeObserver' in window) new ResizeObserver(()=>{
    if(link.matches(':hover,:focus-visible')||origin) measure();
  }).observe(link);
  document.fonts?.ready.then(()=>measure()).catch(()=>{});
})();

// Six scroll stages: closed, four app views, then closed again.
(() => {
 const stage=document.getElementById('laptop-section');if(!stage)return;
 const screens=[...stage.querySelectorAll('.laptop-screen')];
 const captions=[...stage.querySelectorAll('[data-laptop-caption]')];
 const bookends=[...stage.querySelectorAll('[data-laptop-bookend]')];
 const buttons=[...stage.querySelectorAll('[data-laptop-step]')];
 if(!screens.length)return;
 const tour=document.createElement('div');tour.className='laptop-tour';stage.before(tour);tour.append(stage);
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),height=matchMedia('(min-height:651px)');
 let frame=0,active=0;
 function show(phase){
  const index=Math.max(0,Math.min(3,phase-1)),isScreen=phase>0&&phase<5;
  active=index;stage.dataset.laptopPhase=String(phase);
  stage.querySelector('.laptop-screen-track').style.transform=`translateY(${-index*100}%)`;
  screens[index].loading='eager';
  screens.forEach((screen,i)=>{screen.classList.toggle('is-active',i===index);screen.setAttribute('aria-hidden',String(!isScreen||i!==index));});
  captions.forEach((caption,i)=>caption.hidden=!isScreen||i!==index);
  bookends.forEach(caption=>caption.hidden=caption.dataset.laptopBookend!==(phase===0?'intro':phase===5?'outro':''));
  buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(isScreen&&i===index)));
 }
 function update(){
  frame=0;const nav=document.querySelector('.site-nav').getBoundingClientRect().height;tour.style.setProperty('--laptop-nav',`${nav}px`);
  if(!tour.classList.contains('is-pinned'))return;
  const distance=Math.max(1,tour.offsetHeight-stage.offsetHeight);
  const progress=Math.max(0,Math.min(1,(nav-tour.getBoundingClientRect().top)/distance));
  const phase=Math.min(5,Math.floor(progress*6));show(phase);
  const opening=Math.min(1,progress*6),closing=Math.max(0,Math.min(1,progress*6-5));
  const ease=value=>value*value*(3-2*value);
  const lid=phase===0?112*(1-ease(opening)):phase===5?112*ease(closing):0;
  const slide=phase===0?ease(opening)-1:phase===5?ease(closing):0;
  stage.style.setProperty('--laptop-slide-x',`${slide*110}vw`);
  stage.style.setProperty('--laptop-tilt',`${10-6*progress}deg`);
  stage.style.setProperty('--laptop-yaw',`${-22+44*progress}deg`);
  stage.style.setProperty('--laptop-roll',`${-3+progress*5}deg`);
  stage.style.setProperty('--laptop-lid',`${lid}deg`);
 }
 function queue(){if(!frame)frame=requestAnimationFrame(update);}
 function setup(){
  tour.classList.toggle('is-pinned',!motion.matches&&height.matches);
  if(!tour.classList.contains('is-pinned')){show(active+1);stage.style.setProperty('--laptop-lid','0deg');stage.style.setProperty('--laptop-slide-x','0vw');}
  update();
 }
 const back=document.createElement('div');back.className='laptop-lid-back';back.setAttribute('aria-hidden','true');back.textContent='MacroMuse';stage.querySelector('.laptop-display').append(back);
 buttons.forEach((button,i)=>button.addEventListener('click',()=>{
  if(tour.classList.contains('is-pinned')){
   const nav=document.querySelector('.site-nav').getBoundingClientRect().height;
   window.scrollTo({top:scrollY+tour.getBoundingClientRect().top-nav+(tour.offsetHeight-stage.offsetHeight)*(i+1.35)/6,behavior:'instant'});
  }
  show(i+1);stage.style.setProperty('--laptop-lid','0deg');stage.style.setProperty('--laptop-slide-x','0vw');
 }));
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue);
 motion.addEventListener('change',setup);height.addEventListener('change',setup);setup();
})();
