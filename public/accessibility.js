(() => {
  const focusable = root => [...root.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]'));
  const main = document.querySelector('#landing-hero,main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');skip.className = 'skip-link';skip.href = `#${main.id}`;skip.textContent = 'Skip to content';
    skip.addEventListener('click', event => { event.preventDefault();main.focus({ preventScroll:true });main.scrollIntoView({ behavior:'instant',block:'start' }); });
    document.body.prepend(skip);
  }
  const path = value => value.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  for (const link of document.querySelectorAll('.site-nav a[href],#bottom-nav a[href]')) {
    const url = new URL(link.href, location.href);
    if (!url.hash && url.origin === location.origin && path(url.pathname) === path(location.pathname)) link.setAttribute('aria-current','page');
  }
  for (const svg of document.querySelectorAll('button svg,a svg')) {
    const control = svg.closest('button,a');
    if (control.getAttribute('aria-label') || control.textContent.trim()) { svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false'); }
  }
  // Optional dialogs share focus containment and return focus to their opener.
  for (const id of ['log-modal','profile-modal']) {
    const dialog = document.getElementById(id);if (!dialog) continue;
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title = dialog.querySelector('h2,h3');if (title) { if (!title.id) title.id = `${id}-title`;dialog.setAttribute('aria-labelledby',title.id); }
    let open = false, previous = null;
    const visible = () => Boolean(dialog.getClientRects().length && getComputedStyle(dialog).visibility !== 'hidden');
    const update = () => {
      const next = visible();if (open === next) return;open = next;
      if (open) { previous = document.activeElement;dialog.tabIndex = -1;(dialog.querySelector('[aria-invalid=true]') || focusable(dialog)[0] || dialog).focus({preventScroll:true}); }
      else if (previous?.isConnected) previous.focus({preventScroll:true});
    };
    new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['class','style','hidden']});update();
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { document.getElementById(`${id}-close`)?.click();return; }
      if (event.key !== 'Tab') return;
      const items = focusable(dialog), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault();dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault();last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
    });
  }
  const tabs = ['signin','signup'].map(name => ({ name,tab:document.getElementById(`tab-${name}`),panel:document.getElementById(`panel-${name}`) }));
  if (tabs.every(item => item.tab && item.panel)) {
    tabs[0].tab.parentElement.setAttribute('role','tablist');
    const sync = () => tabs.forEach(({tab,panel}) => { const on = !panel.classList.contains('hidden');tab.setAttribute('aria-selected',String(on));tab.removeAttribute('aria-pressed');tab.tabIndex=on?0:-1; });
    tabs.forEach(({name,tab,panel},index) => {
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
      tab.addEventListener('click',() => queueMicrotask(sync));
      tab.addEventListener('keydown',event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;event.preventDefault();const next=tabs[event.key==='Home'?0:event.key==='End'?1:1-index].tab;next.click();next.focus(); });
      panel.querySelectorAll('input').forEach(input => input.setAttribute('aria-describedby',`${name}-error`));
    });sync();
  }
  for (const group of document.querySelectorAll('[role=radiogroup]')) {
    const radios=[...group.querySelectorAll('button[role=radio]')];if (!radios.length) continue;
    const sync=()=>radios.forEach((radio,index)=>radio.tabIndex=radio.getAttribute('aria-checked')==='true' || (!radios.some(item=>item.getAttribute('aria-checked')==='true') && index===0)?0:-1);
    radios.forEach((radio,index)=>{
      radio.addEventListener('click',()=>queueMicrotask(sync));
      radio.addEventListener('keydown',event=>{if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?radios.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+radios.length)%radios.length;radios[next].click();radios[next].focus();});
    });sync();
  }
  document.querySelectorAll('#panel-signin input,#panel-signup input').forEach(field=>field.addEventListener('input',()=>{field.removeAttribute('aria-invalid');field.classList.remove('error');}));
  // Form-specific handlers still own validation; this connects their inline errors.
  for (const [formId,errorId] of [['log-form','log-error'],['profile-edit-form','profile-edit-error']]) {
    const form=document.getElementById(formId), error=document.getElementById(errorId);if (!form || !error) continue;
    error.setAttribute('role','alert');
    form.querySelectorAll('input,select,textarea').forEach(field => {
      field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),errorId].filter(Boolean).join(' '));
      field.addEventListener('input',()=>field.removeAttribute('aria-invalid'));
    });
  }
})();
