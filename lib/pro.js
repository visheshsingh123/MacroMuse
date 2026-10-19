import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './api-security.js';

export const proRef = (db, uid) => db.collection('users').doc(uid).collection('privateState').doc('pro');
export function planFromRecord(record, now = Date.now()) {
  if (record?.plan === 'pro' && record.access === 'lifetime' && record.expiresAt === null) {
    return { plan: 'pro', access: 'lifetime', expiresAt: null };
  }
  const expires = Date.parse(record?.expiresAt);
  return record?.plan === 'pro' && Number.isFinite(expires) && expires > Number(now)
    ? { plan: 'pro', expiresAt: record.expiresAt }
    : { plan: 'free', expiresAt: null };
}
export async function getPlan(db, uid, now = Date.now()) {
  return db.runTransaction(async transaction => planFromRecord((await transaction.get(proRef(db, uid))).data(), now));
}
export async function cancelPro(db, uid, now = Date.now()) {
  return db.runTransaction(async transaction => {
    const ref = proRef(db, uid), record = (await transaction.get(ref)).data();
    if (planFromRecord(record, now).plan === 'pro') {
      transaction.set(ref, { ...record, plan: 'free', cancelledAt: new Date(now).toISOString() });
    }
    // Keep the activation receipt for reference; it does not limit reuse.
    return { plan: 'free', expiresAt: null };
  });
}
export function requirePro(plan) {
  if (plan.plan === 'pro') return;
  const error = new HttpError(403, 'This feature requires NutriGlance Pro. Activate Pro with a code to continue.');
  error.code = 'PRO_REQUIRED';throw error;
}
const hash = value => createHash('sha256').update(value).digest();
export async function activatePro(db, uid, code, configured, now = Date.now()) {
  if (typeof configured !== 'string' || !configured.trim()) throw new HttpError(503, 'Pro activation is not configured yet. Please try again later.');
  if (typeof code !== 'string' || !code.trim() || code.length > 128) throw new HttpError(400, 'Enter a valid activation code.');
  const candidate = hash(code.trim()), expected = hash(configured.trim());
  if (!timingSafeEqual(candidate, expected)) throw new HttpError(403, 'That activation code is invalid. Please check it and try again.');
  const subscription = proRef(db, uid);
  const redemption = db.collection('users').doc(uid).collection('privateState').doc(`pro-code-${expected.toString('hex')}`);
  return db.runTransaction(async transaction => {
    const [current, used] = await Promise.all([transaction.get(subscription), transaction.get(redemption)]);
    const plan = planFromRecord(current.data(), now);
    if (plan.plan === 'pro' && (plan.access === 'lifetime' || used.exists)) return plan;
    const record = { plan: 'pro', access: 'lifetime', activatedAt: new Date(now).toISOString(), expiresAt: null, source: 'activation-code' };
    transaction.set(subscription, record);
    transaction.set(redemption, { redeemedAt: record.activatedAt, expiresAt: record.expiresAt });
    return planFromRecord(record, now);
  });
}
