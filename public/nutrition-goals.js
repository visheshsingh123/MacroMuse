// Shared estimates for first-time setup and profile edits.
(() => {
  const activityLevels = Object.freeze({
    sedentary: Object.freeze({ label: 'Sedentary', factor: 1.2, description: 'Mostly sitting, with little exercise or movement during the day.' }),
    lightly_active: Object.freeze({ label: 'Lightly active', factor: 1.375, description: 'Light exercise 1–3 days a week, plus some walking or everyday movement.' }),
    moderately_active: Object.freeze({ label: 'Moderately active', factor: 1.55, description: 'Exercise 3–5 days a week, or a routine with plenty of walking and movement.' }),
    very_active: Object.freeze({ label: 'Very active', factor: 1.725, description: 'Hard exercise most days, or a physically demanding daily routine.' }),
  });
  const hasActivityLevel = value => typeof value === 'string' && Object.hasOwn(activityLevels, value);

  function calculateTargets({ gender, age, weight, height, activityLevel }) {
    if (!hasActivityLevel(activityLevel)) throw new Error('Please choose your activity level.');
    const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (gender === 'male' ? 5 : -161);
    const totalCalories = bmr * activityLevels[activityLevel].factor;
    // Preserve the existing age-based protein and fat estimates.
    const proteinMultiplier = age <= 3 ? 1.3 : age <= 13 ? 1.15 : age <= 25 ? 1.4 : age <= 45 ? 1 : 1.25;
    const targetProtein = weight * proteinMultiplier;
    const fatPercentage = age <= 3 ? .35 : age <= 15 ? .3 : gender === 'male' ? .25 : .3;
    const fatKcal = totalCalories * fatPercentage;
    return {
      targetKcal: Math.round(totalCalories),
      targetProtein: Math.round(targetProtein),
      targetFat: Math.round(fatKcal / 9),
      targetCarbs: Math.round(Math.max(0, (totalCalories - targetProtein * 4 - fatKcal) / 4)),
    };
  }

  window.NutriGoals = Object.freeze({ activityLevels, hasActivityLevel, calculateTargets });
  document.addEventListener('DOMContentLoaded', () => {
    for (const prefix of ['onb', 'prof']) {
      const field = document.getElementById(`${prefix}-activity`);
      const help = document.getElementById(`${prefix}-activity-help`);
      if (!field || !help) continue;
      const describe = () => {
        help.textContent = hasActivityLevel(field.value) ? activityLevels[field.value].description : 'Include your work, walking, and exercise in a typical week.';
      };
      field.addEventListener('change', describe);
      describe();
    }
  });
})();
