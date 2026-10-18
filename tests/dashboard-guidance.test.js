import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/dashboard-guidance.js', import.meta.url), 'utf8'), context);
const { greeting, guidance } = context.window.NutriGuidance;
const base = { goals: { kcal: 2000, protein: 90 }, totals: { kcal: 1200, protein: 65 }, mealCount: 2, waterCount: 3, hour: 13 };

test('greetings follow local morning, afternoon, evening and night boundaries and preserve the user name', () => {
  for (const [hour, expected] of [[0, 'night'], [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [16, 'afternoon'], [17, 'evening'], [21, 'evening'], [22, 'night'], [23, 'night']]) {
    assert.equal(greeting(new Date(2026, 9, 19, hour), ' Taylor '), `Good ${expected}, Taylor!`);
  }
  assert.equal(greeting(new Date(2026, 9, 19, 10)), 'Good morning!');
});

test('guidance uses actual logged totals, goal differences and hydration rather than fabricated progress', () => {
  const result = guidance(base);
  assert.equal(result.message, 'You have 25g of protein left today.');
  assert.equal(result.protein, '25g protein left');assert.equal(result.calories, '800 kcal left');assert.equal(result.water, '3/8 glasses of water');
  assert.match(guidance({ ...base, mealCount: 0 }).message, /Log a meal/);
  assert.equal(guidance({ ...base, totals: { kcal: 1900, protein: 100 } }).protein, 'Protein goal reached');
});

test('night and over-goal guidance stay neutral and never show negative remaining amounts', () => {
  const over = guidance({ ...base, totals: { kcal: 2100, protein: 100 }, waterCount: 10 });
  assert.equal(over.calories, '100 kcal above estimate');assert.equal(over.water, '8/8 glasses of water');assert.match(over.message, /without judgment/);
  assert.match(guidance({ ...base, hour: 23 }).message, /wind down/);
  assert.equal(guidance({ ...base, goals: { kcal: 0, protein: NaN } }).protein, 'Set your protein goal');
});
