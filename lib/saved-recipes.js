import { createHash } from 'node:crypto';
import { HttpError } from './api-security.js';

export function validateRecipe(raw) {
  const fail = () => { throw new HttpError(400, 'Please save a complete recipe with valid nutrition estimates.'); };
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!raw || !text(raw.name, 160) || !raw.perServing) fail();
  const perServing = {};
  for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
    const value = raw.perServing[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 20000 || (key === 'kcal' && value === 0)) fail();
    perServing[key] = value;
  }
  for (const [key, maxItems, maxLength] of [['ingredients', 12, 200], ['steps', 6, 300]]) {
    if (!Array.isArray(raw[key]) || raw[key].length < 1 || raw[key].length > maxItems || !raw[key].every(value => text(value, maxLength))) fail();
  }
  return { name: raw.name.trim(), perServing, ingredients: raw.ingredients.map(item => item.trim()), steps: raw.steps.map(item => item.trim()) };
}
export const recipeId = recipe => createHash('sha256').update(JSON.stringify(validateRecipe(recipe))).digest('hex');
