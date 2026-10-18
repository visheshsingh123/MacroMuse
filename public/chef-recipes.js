(() => {
  let logger = null;
  const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  function parse(raw) {
    if (typeof raw !== 'string' || raw.length > 16000) throw new Error('Invalid recipe response.');
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    // A conversational answer can still be shown safely, without a logging button.
    if (!cleaned.startsWith('{')) return null;
    let value;
    try { value = JSON.parse(cleaned); } catch { throw new Error('Incomplete recipe response.'); }
    if (!value || !text(value.message, 600) || !Array.isArray(value.recipes) || value.recipes.length > 2) throw new Error('Invalid recipe response.');
    const recipes = value.recipes.map(recipe => {
      if (!recipe || !text(recipe.name, 160) || !recipe.perServing ||
        !Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > 12 || !recipe.ingredients.every(item => text(item, 200)) ||
        !Array.isArray(recipe.steps) || recipe.steps.length < 1 || recipe.steps.length > 6 || !recipe.steps.every(item => text(item, 300))) throw new Error('Invalid recipe details.');
      const nutrition = {};
      for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
        const number = recipe.perServing[key];
        if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 20000 || (key === 'kcal' && number === 0)) throw new Error('Invalid recipe nutrition.');
        nutrition[key] = number;
      }
      return { name: recipe.name.trim(), perServing: nutrition, ingredients: recipe.ingredients.map(item => item.trim()), steps: recipe.steps.map(item => item.trim()) };
    });
    return { message: value.message.trim(), recipes };
  }
  function mealFromRecipe(recipe, servings, now = new Date()) {
    if (typeof servings !== 'number' || ![.5, 1, 1.5, 2, 2.5, 3].includes(servings)) throw new Error('Choose between half and three servings.');
    const meal = window.NutriSecurity.normalizeMeal({ name: recipe.name, ...Object.fromEntries(['kcal', 'protein', 'carbs', 'fat'].map(key => [key, Math.round(recipe.perServing[key] * servings)])) });
    return { ...meal, description: `AI Chef recipe: ${recipe.ingredients.join(', ')}`.slice(0, 1000), portionSize: `${servings} serving${servings === 1 ? '' : 's'}`, source: 'ai-chef', loggedAt: now.toISOString() };
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function render(container, recipes, ownerUid) {
    container.classList.add('chef-recipe-bubble');
    for (const recipe of recipes) {
      const id = crypto.randomUUID();
      const card = element('section', 'chef-recipe-card');
      card.appendChild(element('h3', 'chef-recipe-name', recipe.name));
      const estimate = element('p', 'chef-recipe-estimate');card.appendChild(estimate);
      const nutrition = element('div', 'chef-recipe-nutrition');card.appendChild(nutrition);
      const details = element('details', 'chef-recipe-details');
      details.appendChild(element('summary', '', 'Ingredients & method'));
      details.appendChild(element('h4', '', 'Ingredients · 1 serving'));
      const ingredients = element('ul', '');recipe.ingredients.forEach(item => ingredients.appendChild(element('li', '', item)));details.appendChild(ingredients);
      details.appendChild(element('h4', '', 'Method'));
      const steps = element('ol', '');recipe.steps.forEach(step => steps.appendChild(element('li', '', step)));details.appendChild(steps);card.appendChild(details);
      const controls = element('div', 'chef-recipe-controls');
      const label = element('label', '', 'Servings eaten');
      const select = element('select', 'chef-recipe-servings');
      select.setAttribute('aria-label', `Servings eaten for ${recipe.name}`);
      for (const servings of [.5, 1, 1.5, 2, 2.5, 3]) { const option = element('option', '', String(servings));option.value = String(servings);option.selected = servings === 1;select.appendChild(option); }
      label.appendChild(select);controls.appendChild(label);
      const button = element('button', 'chef-recipe-log', 'Log meal');button.type = 'button';controls.appendChild(button);card.appendChild(controls);
      const status = element('p', 'chef-recipe-status');status.setAttribute('role', 'status');card.appendChild(status);
      function update() {
        nutrition.replaceChildren();
        try {
          const meal = mealFromRecipe(recipe, Number(select.value));
          estimate.textContent = `Estimated nutrition · ${meal.portionSize}`;
          for (const [key, title, unit] of [['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']]) {
            const metric = element('div', '');metric.appendChild(element('strong', '', `${meal[key]}${unit === 'g' ? 'g' : ''}`));metric.appendChild(element('span', '', title === 'Calories' ? 'kcal' : title));nutrition.appendChild(metric);
          }
          button.disabled = false;status.textContent = '';
        } catch { button.disabled = true;status.textContent = 'Choose a smaller serving amount to log this recipe.'; }
      }
      select.addEventListener('change', update);update();
      let saving = false, logged = false;
      button.addEventListener('click', async () => {
        if (saving || logged) return;
        if (!logger || logger.uid !== ownerUid || !window.NutriSecurity.isCurrent(ownerUid)) { status.textContent = 'Please sign in to log this recipe.';return; }
        if (navigator.onLine === false) { status.textContent = 'You’re offline. Reconnect to log this recipe.';return; }
        const connection = logger;
        saving = true;button.disabled = true;select.disabled = true;button.setAttribute('aria-busy', 'true');button.classList.add('inline-loading');button.textContent = 'Logging…';
        try {
          const meal = { ...mealFromRecipe(recipe, Number(select.value)), _id: id };
          await connection.save(id, meal);
          if (!window.NutriSecurity.isCurrent(ownerUid) || logger !== connection) return;
          let meals;
          try { meals = window.NutriSecurity.readMeals(JSON.parse(localStorage.getItem('nutriglance_meals') || '[]')); } catch { meals = []; }
          if (!meals.some(item => item._id === id)) meals.push(meal);
          localStorage.setItem('nutriglance_meals', JSON.stringify(meals));
          logged = true;button.textContent = 'Logged ✓';
          status.textContent = `${meal.portionSize} added to today’s meals.`;
          const link = element('a', 'chef-recipe-view', 'View in Meals →');link.href = '/meals';status.appendChild(link);
        } catch {
          if (window.NutriSecurity.isCurrent(ownerUid)) { button.textContent = 'Try logging again';status.textContent = 'Couldn’t confirm this meal was saved. Retry safely with the same meal.'; }
        } finally {
          saving = false;button.removeAttribute('aria-busy');button.classList.remove('inline-loading');button.disabled = logged;select.disabled = logged;
        }
      });
      container.appendChild(card);
    }
  }
  window.NutriRecipes = { parse, mealFromRecipe, render, setLogger: value => logger = value };
})();
