import { randomUUID } from 'node:crypto';
import { HttpError, prepareQuota, readDocuments } from './api-security.js';
import { proRef, planFromRecord } from './pro.js';

export const FREE_LIMITS = { meals: 3, chef: 5 };
const dayMs = 86_400_000;
export function dailyWindow(now = Date.now()) {
  const start = Math.floor(Number(now) / dayMs) * dayMs;
  return { day: new Date(start).toISOString().slice(0, 10), start: new Date(start).toISOString(), resetAt: new Date(start + dayMs).toISOString() };
}
const ownerRef = (db, uid) => db.collection('users').doc(uid);
export const usageRef = (db, uid, now) => ownerRef(db, uid).collection('privateState').doc(`freeUsage-${dailyWindow(now).day}`);

// Initialize from existing records so today's meals count when limits first launch.
export async function readDaily(transaction, db, uid, now) {
  const ref = usageRef(db, uid, now);
  const [snapshot, entitlement] = await readDocuments(transaction, [ref, proRef(db, uid)]);
  const plan = planFromRecord(entitlement.data(), now);
  let state = snapshot.data();
  if (!snapshot.exists) {
    const window = dailyWindow(now);
    const meals = await transaction.get(ownerRef(db, uid).collection('meals')
      .where('loggedAt', '>=', window.start).where('loggedAt', '<', window.resetAt).limit(FREE_LIMITS.meals));
    state = { meals: meals.size, chef: 0, pendingChef: [] };
  }
  return { ref, plan, state: { meals: Math.max(0, Number(state.meals) || 0), chef: Math.max(0, Number(state.chef) || 0),
    pendingChef: (state.pendingChef || []).filter(item => item.expiresAt > Number(now)) } };
}
export function usageSummary(state, now, plan = { plan: 'free', expiresAt: null }) {
  const item = (feature, pending = 0) => ({ used: state[feature], limit: plan.plan === 'pro' ? null : FREE_LIMITS[feature], remaining: plan.plan === 'pro' ? null : Math.max(0, FREE_LIMITS[feature] - state[feature] - pending) });
  return { ...plan, timezone: 'UTC', resetAt: dailyWindow(now).resetAt,
    meals: item('meals'), chef: item('chef', state.pendingChef.length), upgradeAvailable: true };
}
export function quotaExceeded(feature, state, now) {
  const message = feature === 'meals'
    ? 'Your Free meal quota is used up: 3 meal logs per day. Pro includes unlimited meal logs.'
    : 'Your Free AI Chef quota is used up: 5 replies per day. Pro includes unlimited AI Chef replies.';
  const error = new HttpError(429, message, Math.max(1, Math.ceil((Date.parse(dailyWindow(now).resetAt) - Number(now)) / 1000)));
  error.code = 'FREE_QUOTA_EXCEEDED';error.feature = feature;error.usage = usageSummary(state, now);
  return error;
}
export async function getUsage(db, uid, now = Date.now()) {
  return db.runTransaction(async transaction => {
    const { ref, state, plan } = await readDaily(transaction, db, uid, now);
    transaction.set(ref, state);
    return usageSummary(state, now, plan);
  });
}

// Reserve before contacting the provider. Concurrent requests cannot exceed five;
// failed requests release their slot, and abandoned requests expire automatically.
export async function reserveChef(db, uid, now = Date.now(), { requestQuota = false } = {}) {
  const id = randomUUID();
  const denied = await db.runTransaction(async transaction => {
    const { ref, state, plan } = await readDaily(transaction, db, uid, now);
    const writeQuota = requestQuota ? await prepareQuota(transaction, db, uid, plan.plan === 'pro' ? 'pro-ai' : 'ai', now) : () => {};
    if (plan.plan !== 'pro' && state.chef + state.pendingChef.length >= FREE_LIMITS.chef) {
      writeQuota();return quotaExceeded('chef', state, now);
    }
    state.pendingChef.push({ id, expiresAt: Number(now) + 120_000 });
    writeQuota();
    transaction.set(ref, state);
  });
  if (denied) throw denied;
  return { id, now };
}
export async function finishChef(db, uid, reservation, success, now = Date.now()) {
  return db.runTransaction(async transaction => {
    const ref = usageRef(db, uid, reservation.now);
    const [snapshot, entitlement] = await readDocuments(transaction, [ref, proRef(db, uid)]);
    const state = snapshot.data();
    if (!state?.pendingChef?.some(item => item.id === reservation.id)) {
      if (success) throw new HttpError(503, 'Couldn’t confirm this reply. Please try again.');
      return;
    }
    const plan = planFromRecord(entitlement.data(), now);
    state.pendingChef = state.pendingChef.filter(item => item.id !== reservation.id);
    if (success) state.chef += 1;
    transaction.set(ref, state);
    return usageSummary(state, reservation.now, plan);
  });
}
