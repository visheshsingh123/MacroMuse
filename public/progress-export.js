// Native printing keeps the report local and supports both paper and Save as PDF.
(() => {
  const button = document.getElementById('export-pdf-btn');
  const report = document.getElementById('progress-print-report');
  const originalTitle = document.title;
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function display(value) {
    const parsed = number(value);
    return parsed === null ? '—' : numberFormat.format(parsed);
  }

  function buildReport() {
    // Use the same merged manual/scanned records as the Progress page.
    const data = loadProgress();
    const keys = Object.keys(data).filter(key => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !data[key]) return false;
      const date = new Date(`${key}T12:00:00`);
      return !Number.isNaN(date.valueOf()) && dateKeyFrom(date) === key;
    }).sort();
    const goal = getGoal();
    const profile = loadProfile();
    const generated = new Date();
    const header = element('header');
    header.append(element('p', 'NutriGlance', 'report-brand'), element('h1', 'Your progress report'));
    if (profile?.name) header.append(element('p', String(profile.name), 'report-name'));
    header.append(element('p', `Generated ${generated.toLocaleString()}`, 'report-meta'));
    header.append(element('p', keys.length
      ? `All logged days · ${formatDate(keys[0])} – ${formatDate(keys.at(-1))}`
      : 'All logged days · No entries yet', 'report-meta'));

    const calories = keys.map(key => number(data[key].kcal)).filter(value => value !== null);
    const hits = calories.filter(value => value >= goal * 0.9 && value <= goal * 1.1).length;
    const summary = element('dl', undefined, 'report-summary');
    for (const [label, value] of [
      ['Days logged', String(keys.length)],
      ['Average kcal / logged day', calories.length ? display(calories.reduce((sum, value) => sum + value, 0) / calories.length) : '—'],
      ['Days within ±10% of calorie goal', calories.length ? `${hits} of ${calories.length}` : '—'],
    ]) {
      const item = element('div');
      item.append(element('dt', label), element('dd', value));
      summary.append(item);
    }

    const targets = element('section', undefined, 'report-targets');
    targets.append(element('h2', 'Current daily targets'));
    targets.append(element('p', `${display(goal)} kcal · Protein ${display(getProteinGoal())} g · Carbs ${display(getCarbsGoal())} g · Fat ${display(getFatGoal())} g · Fibre ${display(getFibreGoal())} g`));
    targets.append(element('p', 'Goal comparisons use your current calorie target. Averages include only logged days with calorie values; days without entries are excluded.', 'report-meta'));
    const history = element('section');
    history.append(element('h2', 'Daily history'));
    if (!keys.length) {
      history.append(element('p', 'No progress logged yet. Log a day or scan a meal to start tracking your progress.'));
    } else {
      const table = element('table');
      const caption = element('caption', 'Manual daily entries take precedence over scanned meal totals for the same date. Water is measured in glasses; — means no value was recorded.');
      const head = element('thead');
      const headRow = element('tr');
      for (const label of ['Date', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)', 'Water (glasses)', 'Source']) {
        const cell = element('th', label);
        cell.scope = 'col';
        headRow.append(cell);
      }
      head.append(headRow);
      table.append(caption, head);
      for (const key of keys) {
        const entry = data[key];
        const group = element('tbody');
        const row = element('tr');
        const date = element('th', formatDate(key));
        date.scope = 'row';
        row.append(date);
        for (const field of ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'water']) row.append(element('td', display(entry[field])));
        row.append(element('td', entry.source === 'manual' ? 'Manual' : 'Scanned'));
        group.append(row);
        if (typeof entry.notes === 'string' && entry.notes.trim()) {
          const notesRow = element('tr');
          const notes = element('td', `Notes: ${entry.notes.trim()}`, 'report-notes');
          notes.colSpan = 8;
          notesRow.append(notes);
          group.append(notesRow);
        }
        // Separate row groups keep each day's notes with its nutrition values.
        table.append(group);
      }
      history.append(table);
    }
    report.replaceChildren(header, summary, targets, history);
    document.title = `NutriGlance-Progress-${todayKey()}`;
  }

  let authorizedOwner = null, authorizedUntil = 0;
  window.addEventListener('beforeprint', () => {
    if (!authorizedOwner || Date.now() >= authorizedUntil || !window.NutriSecurity.isCurrent(authorizedOwner)) {
      report.replaceChildren(element('h1', 'PDF exports require NutriGlance Pro'), element('p', 'Activate Pro and use Export as PDF to create a report.'));
      return;
    }
    buildReport();
  });
  window.addEventListener('afterprint', () => { authorizedOwner = null;document.title = originalTitle;report.replaceChildren(); });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const plan = await window.NutriUsage.request('/api/pro?feature=pdf');
      authorizedUntil = Date.parse(plan.expiresAt);
      authorizedOwner = window.nutriGlanceReminderAuth?.currentUser?.uid;
      if (!window.NutriSecurity.isCurrent(authorizedOwner)) throw new Error('Please sign in again.');
      buildReport();
      window.print();
    } catch (error) {
      document.title = originalTitle;
      authorizedOwner = null;
      if (error.code !== 'PRO_REQUIRED') showToast(error.message || 'Could not open the print dialog. Please try again.');
    } finally { button.disabled = false; }
  });
})();
