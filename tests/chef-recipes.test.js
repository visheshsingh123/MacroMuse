import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { window: { addEventListener() {} }, localStorage: { getItem: () => null, removeItem() {} }, location: { pathname: '/aichef' }, document: { documentElement: { classList: { add() {} } } }, Headers, AbortSignal };
vm.runInNewContext(readFileSync(new URL('../public/security.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(readFileSync(new URL('../public/chef-recipes.js', import.meta.url), 'utf8'), context);
const { parse, mealFromRecipe } = context.window.NutriRecipes;
const recipe = { name: 'Chickpea salad', perServing: { kcal: 400, protein: 25, carbs: 40, fat: 15 }, ingredients: ['150g chickpeas', 'Half a cucumber'], steps: ['Chop the cucumber.', 'Mix with the chickpeas.'] };
const response = recipes => JSON.stringify({ message: 'Try this fresh salad.', recipes });

test('structured recipes validate each nutrition field, ingredients and method before exposing logging', () => {
  const result = parse(response([recipe]));assert.equal(result.recipes[0].name, recipe.name);assert.equal(result.recipes[0].perServing.protein, 25);
  assert.equal(parse('Try adding chickpeas for a quick salad.'), null);
  assert.equal(parse('```json\n' + response([recipe]) + '\n```').recipes.length, 1);
  assert.equal(parse(response([])).recipes.length, 0);
  for (const value of ['25', null, -1, Infinity, '<img src=x>']) assert.throws(() => parse(response([{ ...recipe, perServing: { ...recipe.perServing, protein: value } }])));
  for (const bad of [{ ...recipe, ingredients: [] }, { ...recipe, steps: [] }, { ...recipe, name: '' }, { ...recipe, perServing: { kcal: 300 } }]) assert.throws(() => parse(response([bad])));
  assert.throws(() => parse(response([recipe, recipe, recipe])));assert.throws(() => parse('{"message":"cut off"'));
});

test('selected servings scale all nutrition consistently and produce an allowed meal record', () => {
  const parsed = parse(response([recipe])).recipes[0];
  const meal = mealFromRecipe(parsed, 1.5, new Date('2026-10-19T12:00:00Z'));
  assert.equal(meal.kcal, 600);assert.equal(meal.protein, 38);assert.equal(meal.carbs, 60);assert.equal(meal.fat, 23);
  assert.equal(meal.portionSize, '1.5 servings');assert.equal(meal.source, 'ai-chef');assert.equal(meal.loggedAt, '2026-10-19T12:00:00.000Z');
  assert.equal(mealFromRecipe(parsed, .5).kcal, 200);
  for (const servings of [0, -1, 4, '1', NaN]) assert.throws(() => mealFromRecipe(parsed, servings));
  assert.throws(() => mealFromRecipe({ ...parsed, perServing: { ...parsed.perServing, kcal: 15000 } }, 3));
});
