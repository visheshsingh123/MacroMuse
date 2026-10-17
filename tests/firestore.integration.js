// Run with npm run test:rules; this suite only talks to the local emulator.
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run using npm run test:rules');
  env = await initializeTestEnvironment({ projectId: 'demo-nutriglance', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });

test('users can save, read and delete their own legitimate app records', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', gender: 'female', age: 28, weight: 68, height: 172, targetKcal: 2100 } }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/meals/lunch'), { name: 'Lunch', kcal: 400, protein: 20, carbs: 40, fat: 12, loggedAt: new Date().toISOString(), createdAt: serverTimestamp() }));
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

test('quotas, notification secrets, and unknown collections are server-only', async () => {
  const db = env.authenticatedContext('alice').firestore();
  for (const path of ['serverQuotas/global', 'reminderSubscriptions/device', 'unknown/data']) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { count: 0, enabled: true }));
    await assertFails(deleteDoc(doc(db, path)));
  }
  await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice' }, admin: true }));
});

test('malformed nutrition and unrecognized profile fields cannot be persisted', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice/meals/bad'), { name: 'Bad', loggedAt: new Date().toISOString(), kcal: '<img onerror=alert(1)>' }));
  await assertFails(setDoc(doc(db, 'users/alice/progress/2026-10-18'), { kcal: -10 }));
  await assertFails(setDoc(doc(db, 'users/alice'), { profile: { name: 'Alice', admin: true } }));
  await assertFails(setDoc(doc(db, 'users/alice/progress/not-a-date'), { water: 1 }));
});
