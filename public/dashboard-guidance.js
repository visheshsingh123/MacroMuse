(() => {
  const positive = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  function greeting(date, name = '') {
    const hour = date.getHours();
    const phrase = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 22 ? 'Good evening' : 'Good night';
    return `${phrase}${name.trim() ? `, ${name.trim()}` : ''}!`;
  }
  function guidance({ totals, goals, mealCount, waterCount }) {
    const kcal = positive(totals.kcal), protein = positive(totals.protein);
    const calorieGoal = positive(goals.kcal), proteinGoal = positive(goals.protein);
    const proteinLeft = Math.max(0, Math.round(proteinGoal - protein));
    const calorieLeft = Math.round(calorieGoal - kcal);
    let message;
    if (!mealCount) message = 'Ready when you are. Log a meal to see your day take shape.';
    else if (calorieGoal && kcal > calorieGoal) message = 'Today’s log is a little above your calorie estimate. Use it to notice patterns, without judgment.';
    else if (proteinGoal && proteinLeft > 0) message = `You have ${proteinLeft}g of protein left today.`;
    else if (proteinGoal && protein >= proteinGoal) message = 'You’ve reached your protein goal today. Nice work staying aware of your nutrition.';
    else message = 'Small, consistent steps add up. Keep tracking in a way that works for you.';
    return {
      message,
      protein: proteinGoal ? proteinLeft ? `${proteinLeft}g protein left` : 'Protein goal reached' : 'Set your protein goal',
      calories: calorieGoal ? calorieLeft >= 0 ? `${calorieLeft} kcal left` : `${Math.abs(calorieLeft)} kcal above estimate` : 'Set your calorie goal',
      water: `${Math.min(8, Math.floor(positive(waterCount)))}/8 glasses of water`,
    };
  }
  window.NutriGuidance = { greeting, guidance };
})();
