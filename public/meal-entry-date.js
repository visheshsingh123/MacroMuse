// Keep the selected local diary day when arriving from a history date's plus action.
(() => {
  const value = new URLSearchParams(location.search).get('mealDate');
  if (!value) return;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = parts ? new Date(+parts[1], +parts[2]-1, +parts[3], 12) : null;
  const today = new Date();today.setHours(23,59,59,999);
  if (!date || !Number.isFinite(date.getTime()) || date.getFullYear()<2000 || date>today || date.getFullYear()!==+parts[1] || date.getMonth()!==+parts[2]-1 || date.getDate()!==+parts[3]) return;
  const label = date.toLocaleDateString([], { weekday:'long',year:'numeric',month:'short',day:'numeric' });
  const notice = document.createElement('aside');notice.className='meal-entry-date-notice';
  const message = document.createElement('p');message.textContent=`Adding meals for ${label}`;
  const back = document.createElement('a');back.href='/meals';back.textContent='Return to Meals';notice.append(message,back);
  document.getElementById('dashboard-page').prepend(notice);
  window.NutriMealDate = { apply(meal) {
    const now = new Date();
    const sameDay = date.toDateString()===now.toDateString();
    return { ...meal, entryDate: (sameDay ? now : date).toISOString() };
  } };
  document.getElementById('text-meal-input')?.focus({preventScroll:true});
})();
