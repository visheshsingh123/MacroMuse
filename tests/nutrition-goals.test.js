import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(readFileSync(new URL('../public/nutrition-goals.js', import.meta.url), 'utf8'), context);
const goals = context.window.NutriGoals;
const profile = { gender: 'male', age: 28, weight: 68, height: 172 };

test('activity choices increase energy estimates while preserving the existing protein calculation', () => {
  const expected = { sedentary: 1944, lightly_active: 2228, moderately_active: 2511, very_active: 2795 };
  for (const [activityLevel, calories] of Object.entries(expected)) {
    const targets = goals.calculateTargets({ ...profile, activityLevel });
    assert.equal(targets.targetKcal, calories);
    assert.equal(targets.targetProtein, 68);
    assert(Math.abs(targets.targetProtein * 4 + targets.targetCarbs * 4 + targets.targetFat * 9 - calories) <= 10);
  }
  const female = goals.calculateTargets({ ...profile, gender: 'female', activityLevel: 'moderately_active' });
  assert.equal(female.targetKcal, 2254);
  assert.equal(female.targetProtein, 68);
});

test('unknown or missing lifestyle choices cannot silently generate targets', () => {
  for (const activityLevel of [undefined, null, '', 'active', 'constructor', 'toString', 1.55, {}]) {
    assert.equal(goals.hasActivityLevel(activityLevel), false);
    assert.throws(() => goals.calculateTargets({ ...profile, activityLevel }), /choose your activity level/);
  }
});

test('adult goal preferences adjust maintenance by ten percent and keep macros consistent', () => {
  const expected = { maintenance: 2511, weight_loss: 2260, weight_gain: 2762 };
  for (const [goalPreference, calories] of Object.entries(expected)) {
    const targets = goals.calculateTargets({ ...profile, activityLevel: 'moderately_active', goalPreference });
    assert.equal(targets.targetKcal, calories);
    assert.equal(targets.targetProtein, 68);
    assert(Math.abs(targets.targetProtein * 4 + targets.targetCarbs * 4 + targets.targetFat * 9 - calories) <= 10);
  }
  assert.equal(goals.calculateTargets({ ...profile, activityLevel: 'moderately_active' }).targetKcal, 2511);
});

test('unknown goals are rejected and under-18 estimates stay at maintenance', () => {
  for (const goalPreference of ['', null, 'extreme_loss', 'constructor', 10, {}]) {
    assert.equal(goals.hasGoalPreference(goalPreference), false);
    assert.throws(() => goals.calculateTargets({ ...profile, activityLevel: 'sedentary', goalPreference }), /choose your goal/);
  }
  const young = { ...profile, age: 17, activityLevel: 'lightly_active' };
  const maintenance = goals.calculateTargets(young).targetKcal;
  for (const goalPreference of ['weight_loss', 'weight_gain']) assert.equal(goals.calculateTargets({ ...young, goalPreference }).targetKcal, maintenance);
});
