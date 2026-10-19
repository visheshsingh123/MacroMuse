import assert from 'node:assert/strict';
// Run with npm run test:rules; this suite only talks to the local emulator.
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createMealsHandler } from '../api/meals.js';
import { createProHandler } from '../api/pro.js';
import { createSavedRecipesHandler } from '../api/saved-recipes.js';
import { getUsage, reserveChef, finishChef } from '../lib/free-usage.js';

let env, adminApp;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run using npm run test:rules');
  env = await initializeTestEnvironment({ projectId: 'demo-nutriglance', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  adminApp = initializeApp({ projectId: 'demo-nutriglance' }, 'quota-emulator-tests');
});
after(async () => { await env?.cleanup();if (adminApp) await deleteApp(adminApp); });

test('users can save, read and delete their own legitimate app records', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', gender: 'female', age: 28, weight: 68, height: 172, targetKcal: 2100 } }));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/alice/meals/lunch'), { name: 'Lunch', kcal: 400, protein: 20, carbs: 40, fat: 12, loggedAt: new Date().toISOString(), createdAt: serverTimestamp() });
  });
  await assertSucceeds(setDoc(doc(db, 'users/alice/meals/lunch'), { name: 'Edited lunch' }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/progress/2026-10-18'), { water: 3 }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/progress/2026-10-18'), { kcal: 400, protein: 20, carbs: 40, fat: 12, notes: 'Good day', source: 'manual' }, { merge: true }));
  await assertSucceeds(getDocs(collection(db, 'users/alice/meals')));
  await assertSucceeds(getDocs(collection(db, 'users/alice/progress')));
  await assertSucceeds(deleteDoc(doc(db, 'users/alice/meals/lunch')));
});

test('anonymous and other-account clients cannot read or write private app records', async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('bob')]) {
    const db = context.firestore();
    for (const path of ['users/alice', 'users/alice/meals/lunch', 'users/alice/progress/2026-10-18']) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { profile: { name: 'Overwrite' } }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(getDocs(collection(db, 'users/alice/meals')));
  }
});

test('only valid lifestyle choices can be saved by the profile owner', async () => {
  const db = env.authenticatedContext('alice').firestore();
  for (const activityLevel of ['sedentary', 'lightly_active', 'moderately_active', 'very_active']) {
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', activityLevel } }));
  }
  for (const activityLevel of ['', 'active', 1.55, null, { admin: true }]) {
    await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', activityLevel } }));
  }
  await assertFails(setDoc(doc(env.authenticatedContext('bob').firestore(), 'users/alice'), {
    profile: { name: 'Alice', activityLevel: 'very_active' },
  }));
  // Profiles from before lifestyle setup remain valid.
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice' } }));
});

test('quotas, notification secrets, and unknown collections are server-only', async () => {
  const db = env.authenticatedContext('alice').firestore();
  for (const path of ['serverQuotas/global', 'reminderSubscriptions/device', 'unknown/data', 'users/alice/privateState/freeUsage-2026-10-20', 'users/alice/privateState/pro', 'users/alice/privateState/pro-code-fixture', 'users/alice/mealReceipts/receipt']) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { count: 0, enabled: true }));
    await assertFails(deleteDoc(doc(db, path)));
  }
  await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice' }, admin: true }));
});

test('goal preferences accept only known values on the owner profile', async () => {
  const db = env.authenticatedContext('alice').firestore();
  for (const goalPreference of ['maintenance', 'weight_loss', 'weight_gain']) {
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', age: 28, goalPreference } }));
  }
  for (const goalPreference of ['', null, 'extreme_loss', 10, { admin: true }]) {
    await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', goalPreference } }));
  }
  await assertFails(setDoc(doc(env.authenticatedContext('bob').firestore(), 'users/alice'), { profile: { name: 'Alice', goalPreference: 'maintenance' } }));
});

test('malformed nutrition and unrecognized profile fields cannot be persisted', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice/meals/bad'), { name: 'Bad', loggedAt: new Date().toISOString(), kcal: '<img onerror=alert(1)>' }));
  await assertFails(setDoc(doc(db, 'users/alice/progress/2026-10-18'), { kcal: -10 }));
  await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', admin: true } }));
  await assertFails(setDoc(doc(db, 'users/alice/progress/not-a-date'), { water: 1 }));
});

// Meal creation and restore must pass through the server's atomic daily quota.
test('owners cannot bypass the daily limit by creating meals directly', async () => {
  const db = env.authenticatedContext('quota-owner').firestore();
  const record = { name: 'Lunch', kcal: 400, protein: 20, carbs: 40, fat: 12, loggedAt: new Date().toISOString() };
  await assertFails(setDoc(doc(db, 'users/quota-owner/meals/direct'), record));
  await assertFails(setDoc(doc(db, 'users/quota-owner/meals/direct'), record, { merge: true }));
});


test('server meal transactions enforce the three-meal limit and Undo on real Firestore', async () => {
  const db = getFirestore(adminApp), uid = 'quota-server-owner';
  const handler = createMealsHandler({ getServices: () => ({ db, auth: { verifyIdToken: async () => ({ uid }) } }), quota: async () => {} });
  const call = async id => {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code;return this; }, json(body) { this.body = body;return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer emulator-fixture' }, body: { meal: { _id: id, name: 'Lunch', kcal: 400, protein: 25, carbs: 40, fat: 12 } } }, res);
    return res;
  };
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => call('meal-'+index)));
  assert.equal(results.filter(result => result.code === 200).length, 3);
  assert.equal(results.filter(result => result.code === 429).length, 3);
  const meals = db.collection('users').doc(uid).collection('meals');
  assert.equal((await meals.get()).size, 3);
  const id = results.find(result => result.code === 200).body.meal._id;
  await meals.doc(id).delete();
  assert.equal((await call('fourth')).code, 429);
  assert.equal((await call(id)).code, 200);
  assert.equal((await getUsage(db, uid)).meals.used, 3);
});

test('Chef reservations serialize on real Firestore and failed requests release their slot', async () => {
  const db = getFirestore(adminApp), uid = 'quota-chef-owner', now = Date.now();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserveChef(db, uid, now)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 5);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'FREE_QUOTA_EXCEEDED').length, 1);
  const reservations = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  await finishChef(db, uid, reservations[0], false);
  const replacement = await reserveChef(db, uid, now);
  for (const reservation of [...reservations.slice(1), replacement]) await finishChef(db, uid, reservation, true);
  const usage = await getUsage(db, uid, now);
  assert.equal(usage.chef.used, 5);assert.equal(usage.chef.remaining, 0);
});


test('lifetime code activation, Pro meal access and cancellation persist on real Firestore', async () => {
  const db = getFirestore(adminApp), uid = 'pro-activation-owner';let now = Date.parse('2026-10-31T08:00:00Z');
  const options = { getServices: () => ({ db, auth: { verifyIdToken: async () => ({ uid }) } }), quota: async () => {}, clock: () => now };
  const activate = createProHandler({ ...options, getCode: () => 'emulator-code-fixture' });
  const call = async (handler, body, query, method = body ? 'POST' : 'GET') => {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code;return this; }, json(body) { this.body = body;return this; } };
    await handler({ method, headers: { authorization: 'Bearer emulator-fixture' }, body, query }, res);return res;
  };
  const results = await Promise.all(Array.from({ length: 4 }, () => call(activate, { code: 'emulator-code-fixture' })));
  assert(results.every(result => result.code === 200));assert(results.every(result => result.body.access === 'lifetime' && result.body.expiresAt === null));
  const meals = createMealsHandler(options);
  for (let i = 0; i < 5; i++) assert.equal((await call(meals, { meal: { _id: 'pro-meal-'+i, name: 'Lunch', kcal: 400, protein: 25, carbs: 40, fat: 12 } })).code, 200);
  const usage = await getUsage(db, uid, now);assert.equal(usage.plan, 'pro');assert.equal(usage.meals.limit, null);
  const recipes = createSavedRecipesHandler({ ...options, clock: () => new Date(now) });
  const recipe = { name: 'Recipe', perServing: { kcal: 400, protein: 25, carbs: 40, fat: 12 }, ingredients: ['One cup rice'], steps: ['Warm and serve.'] };
  for (let i = 0; i < 51; i++) assert.equal((await call(recipes, { action: 'save', recipe: { ...recipe, name: 'Recipe '+i } })).code, 200);
  const first = await call(recipes);assert.equal(first.body.recipes.length, 50);assert(first.body.nextCursor);
  const second = await call(recipes, null, { after: first.body.nextCursor });assert.equal(second.body.recipes.length, 1);
  now = Date.parse('2026-11-30T08:00:00Z');
  assert.equal((await getUsage(db, uid, now)).access, 'lifetime');
  assert.equal((await call(activate, null, { feature: 'pdf' })).code, 200);
  assert.equal((await call(activate, null, null, 'DELETE')).code, 200);
  assert.equal((await getUsage(db, uid, now)).plan, 'free');
  assert.equal((await call(activate, null, { feature: 'pdf' })).code, 403);
  assert.equal((await call(recipes, { action: 'save', recipe: { ...recipe, name: 'Expired account recipe' } })).code, 403);
  assert.equal((await call(activate, { code: 'emulator-code-fixture' })).body.access, 'lifetime');
  assert.equal((await call(activate, null, { feature: 'pdf' })).code, 200);
});

test('cancelling Pro persists Free access and the same code can reactivate it without deleting user data', async () => {
  const db = getFirestore(adminApp), uid = 'pro-cancellation-owner', now = Date.parse('2026-10-31T08:00:00Z');
  const handler = createProHandler({ getServices: () => ({ db, auth: { verifyIdToken: async () => ({ uid }) } }), quota: async () => {}, clock: () => now, getCode: () => 'cancel-emulator-fixture' });
  const call = async (method, body, query) => {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code;return this; }, json(body) { this.body = body;return this; } };
    await handler({ method, headers: { authorization: 'Bearer emulator-fixture' }, body, query }, res);return res;
  };
  const meal = db.collection('users').doc(uid).collection('meals').doc('keep-meal');
  const recipe = db.collection('users').doc(uid).collection('savedRecipes').doc('keep-recipe');
  await meal.set({ name: 'Lunch', loggedAt: new Date(now).toISOString() });
  await recipe.set({ name: 'Rice bowl' });
  assert.equal((await call('POST', { code: 'cancel-emulator-fixture' })).code, 200);
  const results = await Promise.all([call('DELETE'), call('DELETE')]);
  assert(results.every(result => result.code === 200 && result.body.plan === 'free'));
  assert.equal(results[0].body.usage.meals.limit, 3);
  assert.equal((await call('GET', null, { feature: 'pdf' })).code, 403);
  assert.equal((await call('POST', { code: 'cancel-emulator-fixture' })).body.access, 'lifetime');
  assert((await meal.get()).exists);assert((await recipe.get()).exists);
});
