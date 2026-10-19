import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/dashboard-guidance.js', import.meta.url), 'utf8'), context);
const { greeting, guidance } = context.window.NutriGuidance;
const base = { goals: { kcal: 2000, protein: 90 }, totals: { kcal: 1200, protein: 65 }, mealCount: 2, waterCount: 3, hour: 13 };

test('rotating greetings use only the first name and only use appropriate time-of-day phrases', () => {
  const common = ['Hello', 'Hey there', 'Good to see you', 'Welcome back'];
  const periods = [
    [0, 5, ['Good night', 'Good to see you tonight']],
    [5, 12, ['Good morning', 'Rise and shine', 'Ready for a fresh start?']],
    [12, 17, ['Good afternoon', 'How’s your day going?']],
    [17, 22, ['Good evening', 'How was your day?']],
    [22, 24, ['Good night', 'Good to see you tonight']],
  ];
  for (const [start, end, timely] of periods) {
    const allowed = [...common, ...timely].map(phrase => phrase.endsWith('?') ? `${phrase.slice(0, -1)}, Taylor?` : `${phrase}, Taylor!`);
    for (let minute = start * 60; minute < end * 60; minute += 29) {
      assert(allowed.includes(greeting(new Date(2026, 9, 19, 0, minute), ' Taylor  Morgan Smith ')));
    }
  }
  assert(!greeting(new Date(2026, 9, 19, 10)).includes(','));
});

test('greetings remain stable within a half hour and change with the next slot or day', () => {
  const first = greeting(new Date(2026, 9, 19, 10, 1), 'Taylor');
  assert.equal(greeting(new Date(2026, 9, 19, 10, 29), 'Taylor'), first);
  assert.notEqual(greeting(new Date(2026, 9, 19, 10, 30), 'Taylor'), first);
  assert.notEqual(greeting(new Date(2026, 9, 20, 10, 1), 'Taylor'), first);
  const morning = Array.from({ length: 14 }, (_, slot) => greeting(new Date(2026, 9, 19, 5, slot * 30), 'Taylor'));
  assert(morning.includes('Hello, Taylor!'));
  assert(morning.includes('Good morning, Taylor!'));
  assert(morning.includes('Ready for a fresh start, Taylor?'));
});

test('guidance uses actual logged totals, goal differences and hydration rather than fabricated progress', () => {
  const result = guidance(base);
  assert.equal(result.message, 'You have 25g of protein left today.');
  assert.equal(result.protein, '25g protein left');assert.equal(result.calories, '800 kcal left');assert.equal(result.water, '3/8 glasses of water');
  assert.match(guidance({ ...base, mealCount: 0 }).message, /Log a meal/);
  assert.equal(guidance({ ...base, totals: { kcal: 1900, protein: 100 } }).protein, 'Protein goal reached');
});

test('over-goal guidance stays neutral and nutrition guidance remains available at night', () => {
  const over = guidance({ ...base, totals: { kcal: 2100, protein: 100 }, waterCount: 10 });
  assert.equal(over.calories, '100 kcal above estimate');assert.equal(over.water, '8/8 glasses of water');assert.match(over.message, /without judgment/);
  assert.equal(guidance({ ...base, hour: 23 }).message, 'You have 25g of protein left today.');
  assert.equal(guidance({ ...base, goals: { kcal: 0, protein: NaN } }).protein, 'Set your protein goal');
});
