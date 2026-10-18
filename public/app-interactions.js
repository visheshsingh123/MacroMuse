(() => {
  const activeToasts = [];
  function show(message, { label, action, duration = 4000 } = {}) {
    let region = document.getElementById('app-feedback');
    if (!region) {
      region = document.createElement('div');
      region.id = 'app-feedback';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-relevant', 'additions text');
      document.body.appendChild(region);
    }
    const toast = document.createElement('div');
    toast.className = 'app-feedback-card';
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    let timer;
    const dismiss = () => { clearTimeout(timer); toast.remove(); const i = activeToasts.indexOf(dismiss); if (i >= 0) activeToasts.splice(i, 1); };
    dismiss.hasAction = Boolean(action);
    if (!action) activeToasts.filter(item => !item.hasAction).forEach(item => item());
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-feedback-action';
      button.textContent = label;
      button.addEventListener('click', async () => {
        clearTimeout(timer);
        button.disabled = true;
        button.classList.add('inline-loading');
        try { await action(); dismiss(); show('Meal restored.'); }
        catch (error) {
          text.textContent = error.message || 'Couldn’t restore this meal. Please try again.';
          button.disabled = false;
          button.classList.remove('inline-loading');
        }
      });
      toast.appendChild(button);
    }
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'app-feedback-close';
    close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss notification');
    close.addEventListener('click', dismiss);toast.appendChild(close);
    // Keep Undo reachable while a pointer or keyboard focus is inside the toast.
    const schedule = () => { clearTimeout(timer); timer = setTimeout(dismiss, duration); };
    toast.addEventListener('pointerenter', () => clearTimeout(timer));
    toast.addEventListener('pointerleave', () => { if (!toast.contains(document.activeElement)) schedule(); });
    toast.addEventListener('focusin', () => clearTimeout(timer));
    toast.addEventListener('focusout', event => { if (!toast.contains(event.relatedTarget)) schedule(); });
    region.appendChild(toast);activeToasts.push(dismiss);
    if (activeToasts.length > 3) activeToasts[0]();
    schedule();
  }
  window.NutriFeedback = { show };
  document.addEventListener('focusin', event => {
    if (event.target.matches('input,textarea,select')) document.body.classList.add('editing-field');
  });
  document.addEventListener('focusout', () => {
    requestAnimationFrame(() => document.body.classList.toggle('editing-field', document.activeElement.matches('input,textarea,select')));
  });
})();
