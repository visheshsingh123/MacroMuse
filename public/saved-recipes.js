(() => {
  let uid = null, version = 0, loading = false;
  const saved = new Map(), pending = new Set(), bindings = new Set();
  const keyOf = recipe => JSON.stringify(recipe);
  const current = owner => Boolean(owner && owner === uid && window.NutriSecurity.isCurrent(owner));
  const byId = id => document.getElementById(id);
  async function request(body) {
    const response = await window.NutriSecurity.apiFetch('/api/saved-recipes', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Couldn’t update saved recipes. Please try again.');
    return data;
  }
  function validateItem(item) {
    if (!item || !/^[a-f0-9]{64}$/.test(item.id)) throw new Error('Couldn’t load this saved recipe.');
    return { id: item.id, savedAt: typeof item.savedAt === 'string' ? item.savedAt : '', recipe: window.NutriRecipes.parse(JSON.stringify({ message: 'Saved recipe', recipes: [item.recipe] })).recipes[0] };
  }
  function syncButtons() {
    for (const binding of bindings) {
      const { button, key, owner } = binding;
      if (!button.isConnected) { bindings.delete(binding);continue; }
      const on = saved.has(key) && current(owner);
      button.textContent = on ? 'Remove saved' : 'Save recipe';
      button.setAttribute('aria-pressed', String(on));
      button.disabled = !current(owner) || loading || pending.has(key);
      button.classList.toggle('inline-loading', pending.has(key));
    }
    if (byId('saved-recipe-count')) byId('saved-recipe-count').textContent = String(saved.size);
    if (byId('saved-recipes-refresh')) byId('saved-recipes-refresh').disabled = loading || pending.size > 0;
  }
  function renderLibrary() {
    const grid = byId('saved-recipe-grid');if (!grid) return;
    grid.replaceChildren();
    const query = (byId('saved-recipe-search')?.value || '').trim().toLowerCase();
    const items = [...saved.values()].filter(item => `${item.recipe.name} ${item.recipe.ingredients.join(' ')}`.toLowerCase().includes(query)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    byId('saved-recipes-empty').hidden = loading || items.length > 0;
    byId('saved-recipes-loading').hidden = !loading;
    byId('saved-recipes-empty-title').textContent = query ? 'No recipes match your search' : 'Keep your next favorite close';
    byId('saved-recipes-empty-copy').textContent = query ? 'Try another ingredient or clear your search.' : 'Save a recipe from your conversation. Its ingredients, method, and nutrition will be here when you return.';
    byId('saved-recipes-clear-search').hidden = !query;
    byId('saved-recipes-start-chat').hidden = Boolean(query);
    for (const item of items) window.NutriRecipes.render(grid, [item.recipe], uid, { library: true });
    syncButtons();
  }
  async function load() {
    const owner = uid;if (!current(owner) || loading || pending.size) return;
    const generation = ++version;loading = true;
    byId('saved-recipes-error').hidden = true;renderLibrary();syncButtons();
    try {
      const data = await request();
      if (!current(owner) || generation !== version) return;
      if (!Array.isArray(data.recipes)) throw new Error('Couldn’t load your saved recipes.');
      const items = data.recipes.map(validateItem);
      saved.clear();items.forEach(item => saved.set(keyOf(item.recipe), item));
    } catch (error) {
      if (current(owner) && generation === version) { byId('saved-recipes-error').textContent = error.message;byId('saved-recipes-error').hidden = false; }
    } finally {
      if (current(owner) && generation === version) { loading = false;renderLibrary();syncButtons(); }
    }
  }
  function decorate(card, recipe, owner) {
    const key = keyOf(recipe), button = document.createElement('button');
    button.type = 'button';button.className = 'chef-recipe-save';button.textContent = 'Save recipe';
    button.setAttribute('aria-pressed', 'false');
    card.querySelector('.chef-recipe-controls').appendChild(button);
    bindings.add({ button, key, owner });queueMicrotask(syncButtons);
    button.addEventListener('click', async () => {
      if (!current(owner) || loading || pending.has(key)) return;
      const status = card.querySelector('.chef-recipe-save-status');
      if (navigator.onLine === false) { status.textContent = 'Reconnect to update your saved recipes.';return; }
      const generation = version, existing = saved.get(key);
      pending.add(key);syncButtons();
      try {
        const data = await request(existing ? { action: 'remove', id: existing.id } : { action: 'save', recipe });
        if (!current(owner) || generation !== version) return;
        if (existing) saved.delete(key);else { const item = validateItem(data.item);saved.set(key, item); }
        const inLibrary = Boolean(button.closest('#saved-recipe-grid'));
        status.textContent = existing ? 'Removed from saved recipes.' : 'Saved to your recipe collection.';
        renderLibrary();
        if (inLibrary) { const target = byId('saved-recipe-grid').querySelector('button') || byId('saved-recipes-heading');target.focus({ preventScroll: true }); }
        window.NutriFeedback?.show(existing ? 'Recipe removed from your collection.' : 'Recipe saved. Find it in Saved recipes.');
      } catch (error) { if (current(owner) && generation === version) status.textContent = error.message; }
      finally { if (current(owner) && generation === version) { pending.delete(key);syncButtons(); } }
    });
    const status = document.createElement('p');status.className = 'chef-recipe-status chef-recipe-save-status';status.setAttribute('role', 'status');card.appendChild(status);
  }
  function connect(owner) {
    if (uid === owner) return;
    uid = owner;version++;loading = false;saved.clear();pending.clear();renderLibrary();
    if (uid) load();
  }
  function activate(name, focus = false) {
    for (const view of ['chat', 'saved']) {
      const on = name === view, tab = byId(`chef-${view}-tab`);
      tab.setAttribute('aria-selected', String(on));tab.tabIndex = on ? 0 : -1;
      byId(`chef-${view}-panel`).hidden = !on;
    }
    if (focus) byId(`chef-${name}-tab`).focus();
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const name of ['chat', 'saved']) {
      const tab = byId(`chef-${name}-tab`);
      tab.addEventListener('click', () => activate(name));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();activate(event.key === 'Home' ? 'chat' : event.key === 'End' ? 'saved' : name === 'chat' ? 'saved' : 'chat', true);
      });
    }
    byId('saved-recipes-refresh').addEventListener('click', load);
    byId('saved-recipe-search').addEventListener('input', renderLibrary);
    byId('saved-recipes-clear-search').addEventListener('click', () => { byId('saved-recipe-search').value = '';renderLibrary();byId('saved-recipe-search').focus(); });
    byId('saved-recipes-start-chat').addEventListener('click', () => { activate('chat');byId('chat-input').focus(); });
    activate('chat');renderLibrary();
  });
  window.NutriSavedRecipes = { connect, decorate };
})();
