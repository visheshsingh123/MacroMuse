// Individual meal changes share the same verified account and document identity.
(() => {
  const key = 'nutriglance_meals';
  const pendingWrites = new Map();
  const deleting = new Set();
  let session = null;
  const current = uid => Boolean(uid && session?.uid === uid && window.NutriSecurity.isCurrent(uid));
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\/\0]/.test(id);
  const read = () => {
    try { return window.NutriSecurity.readMeals(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return []; }
  };
  const write = meals => localStorage.setItem(key, JSON.stringify(meals));
  function notify(message, undo) {
    window.NutriFeedback.show(message, undo ? { label: 'Undo', action: undo, duration: 10000 } : {});
  }
  function configure(next) {
    session = next;
    document.querySelectorAll('.meal-delete').forEach(button => {
      button.disabled = !current(next?.uid) || !validId(button.dataset.mealId);
    });
  }
  function trackWrite(id, promise) {
    pendingWrites.set(id, promise);
    promise.finally(() => { if (pendingWrites.get(id) === promise) pendingWrites.delete(id); }).catch(() => {});
    return promise;
  }
  function addDeleteButton(container, meal) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'meal-delete';
    button.dataset.mealId = validId(meal._id) ? meal._id : '';
    button.setAttribute('aria-label', `Delete ${meal.name || 'meal'}`);
    button.title = validId(meal._id) ? 'Delete meal' : 'Waiting for meal sync';
    button.disabled = !current(session?.uid) || !validId(meal._id);
    button.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
    button.addEventListener('click', () => remove(meal._id, button));
    container.appendChild(button);
  }
  async function remove(id, button) {
    const owner = session;
    if (!current(owner?.uid) || !validId(id) || deleting.has(id)) return;
    if (navigator.onLine === false) { notify('You’re offline. Reconnect before deleting a meal.'); return; }
    const meals = read();
    const index = meals.findIndex(meal => meal._id === id);
    if (index < 0) return;
    const meal = meals[index];
    deleting.add(id);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      if (pendingWrites.has(id)) await pendingWrites.get(id);
      if (!current(owner.uid)) return;
      await owner.remove(id);
      if (!current(owner.uid)) return;
      write(read().filter(entry => entry._id !== id));
      owner.refresh();
      const remaining = document.querySelectorAll('.meal-delete');
      remaining[Math.min(index, remaining.length - 1)]?.focus({ preventScroll: true });
      notify('Meal deleted. Your totals are updated.', async () => {
        if (!current(owner.uid)) throw new Error('Sign in to the same account to restore this meal.');
        if (navigator.onLine === false) throw new Error('Reconnect to restore this meal.');
        await owner.restore(id, meal);
        if (!current(owner.uid)) throw new Error('Your account changed.');
        const latest = read();
        if (!latest.some(entry => entry._id === id)) {
          latest.splice(Math.min(index, latest.length), 0, meal);
          write(latest);
        }
        owner.refresh();
      });
    } catch {
      if (current(owner.uid)) notify('Couldn’t delete this meal. Please try again.');
    } finally {
      deleting.delete(id);
      button.disabled = !current(owner?.uid);
      button.removeAttribute('aria-busy');
    }
  }
  window.NutriMeals = { configure, trackWrite, addDeleteButton };
})();
