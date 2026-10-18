// Calendar-week comparisons use local dates, matching the meal and progress logs.
(() => {
  const keyOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const offset = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; };
  const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

  function compareWeeks(data, goal, now = new Date()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const elapsedDays = (today.getDay() + 6) % 7 + 1;
    const monday = offset(today, 1 - elapsedDays);
    const summarize = start => {
      const entries = [];
      for (let day = 0; day < elapsedDays; day++) {
        const key = keyOf(offset(start, day));
        const entry = Object.hasOwn(data, key) ? data[key] : null;
        if (entry && validNumber(entry.kcal)) entries.push(entry);
      }
      const protein = entries.filter(entry => validNumber(entry.protein));
      return {
        start: keyOf(start), end: keyOf(offset(start, elapsedDays - 1)),
        daysLogged: entries.length,
        averageKcal: entries.length ? entries.reduce((sum, entry) => sum + entry.kcal, 0) / entries.length : null,
        averageProtein: protein.length ? protein.reduce((sum, entry) => sum + entry.protein, 0) / protein.length : null,
        goalRate: entries.length && validNumber(goal) && goal > 0
          ? entries.filter(entry => entry.kcal >= goal * .9 && entry.kcal <= goal * 1.1).length / entries.length * 100 : null,
      };
    };
    return { elapsedDays, current: summarize(monday), previous: summarize(offset(monday, -7)) };
  }

  function render(data, goal, now = new Date()) {
    const panel = document.getElementById('weekly-insights');
    if (!panel) return;
    const { current, previous, elapsedDays } = compareWeeks(data, goal, now);
    const number = value => Math.round(value).toLocaleString();
    const formatDate = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
    const range = week => `${formatDate(week.start)} – ${formatDate(week.end)}`;
    document.getElementById('weekly-current-range').textContent = range(current);
    document.getElementById('weekly-previous-range').textContent = range(previous);

    for (const [id, key, unit] of [
      ['calories', 'averageKcal', 'kcal'], ['protein', 'averageProtein', 'g'],
      ['logged', 'daysLogged', 'days'], ['goal', 'goalRate', '%'],
    ]) {
      const value = current[key], last = previous[key];
      const format = amount => amount === null ? '—' : unit === 'days' ? `${amount}/${elapsedDays}` : `${number(amount)}${unit === '%' ? '%' : ` ${unit}`}`;
      document.getElementById(`weekly-${id}-value`).textContent = format(value);
      document.getElementById(`weekly-${id}-previous`).textContent = `Last week: ${last === null ? 'no entries' : format(last)}`;
      let change;
      if (value === null) change = 'Add a log to compare';
      else if (last === null) change = 'No comparison yet';
      else {
        const delta = Math.round(value) - Math.round(last);
        if (unit === 'days' && !current.daysLogged && !previous.daysLogged) change = 'No logs yet';
        else if (!delta) change = 'Same as last week';
        else {
          const quantity = Math.abs(delta);
          const label = unit === '%' ? `percentage point${quantity === 1 ? '' : 's'}` : unit === 'days' && quantity === 1 ? 'day' : unit;
          change = `${number(quantity)} ${label} ${delta > 0 ? 'more' : 'less'}`;
        }
      }
      document.getElementById(`weekly-${id}-change`).textContent = change;
    }
    document.getElementById('weekly-status').textContent = !current.daysLogged && !previous.daysLogged
      ? 'Your first logged day will start this comparison.'
      : `Based on ${current.daysLogged} logged ${current.daysLogged === 1 ? 'day' : 'days'} this week and ${previous.daysLogged} last week.`;
  }
  window.NutriWeekly = { compareWeeks, render };
})();
