import { authenticated, prepareQuota, HttpError, sendError } from '../lib/api-security.js';
import { getPlan } from '../lib/pro.js';
import { FREE_LIMITS, readDaily, usageSummary, quotaExceeded } from '../lib/free-usage.js';

export function validateMeal(body) {
  if (typeof body === 'string') { if (Buffer.byteLength(body) > 8000) throw new HttpError(413, 'This meal is too large.');try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid meal.'); } }
  const meal = body?.meal;
  if (!meal || typeof meal !== 'object' || Array.isArray(meal) || Buffer.byteLength(JSON.stringify(meal)) > 8000 ||
    typeof meal._id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(meal._id) ||
    typeof meal.name !== 'string' || !meal.name.trim() || meal.name.length > 160) throw new HttpError(400, 'Invalid meal.');
  const data = { name: meal.name.trim() };
  for (const key of ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'fiber']) {
    if (!(key in meal) && ['fibre', 'fiber'].includes(key)) continue;
    if (typeof meal[key] !== 'number' || !Number.isFinite(meal[key]) || meal[key] < 0 || meal[key] > 100000) throw new HttpError(400, 'Invalid meal nutrition.');
    data[key] = meal[key];
  }
  for (const [key, limit] of [['description', 1000], ['portionSize', 200], ['source', 20]]) {
    if (!(key in meal)) continue;
    if (typeof meal[key] !== 'string' || meal[key].length > limit) throw new HttpError(400, 'Invalid meal details.');
    data[key] = meal[key];
  }
  return { id: meal._id, data };
}
export function createMealsHandler({ getServices, quota, clock = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST');return res.status(405).json({ error: { message: 'Method not allowed.' } }); }
    try {
      const { db, uid } = await authenticated(req, getServices);
      const { id, data } = validateMeal(req.body);
      const now = clock();
      // Custom quota providers retain their standalone contract. The production
      // limiter participates in the save, avoiding two extra database transactions.
      if (quota) {
        const plan = await getPlan(db, uid, now);
        await quota(db, uid, plan.plan === 'pro' ? 'pro-meal-writes' : 'meal-writes');
      }
      const owner = db.collection('users').doc(uid);
      const mealRef = owner.collection('meals').doc(id), receiptRef = owner.collection('mealReceipts').doc(id);
      const result = await db.runTransaction(async transaction => {
        const [existing, receipt, daily] = await Promise.all([
          transaction.get(mealRef), transaction.get(receiptRef), readDaily(transaction, db, uid, now),
        ]);
        const { ref, state, plan } = daily;
        const writeQuota = !quota
          ? await prepareQuota(transaction, db, uid, plan.plan === 'pro' ? 'pro-meal-writes' : 'meal-writes', now)
          : () => {};
        // A Free-limit rejection still consumes the anti-abuse request quota.
        // Return it after committing those counters instead of rolling them back.
        if (!existing.exists && !receipt.exists && plan.plan !== 'pro' && state.meals >= FREE_LIMITS.meals) {
          writeQuota();return { error: quotaExceeded('meals', state, now) };
        }
        writeQuota();
        // Retries and Undo use the original canonical record, without another charge.
        if (existing.exists || receipt.exists) {
          const record = existing.exists ? existing.data() : receipt.data().meal;
          if (!existing.exists) transaction.set(mealRef, record);
          if (!receipt.exists) transaction.set(receiptRef, { meal: record });
          transaction.set(ref, state);
          return { meal: { ...record, createdAt: undefined, _id: id }, usage: usageSummary(state, now, plan) };
        }
        const record = { ...data, loggedAt: new Date(now).toISOString(), createdAt: new Date(now) };
        state.meals += 1;
        transaction.set(mealRef, record);
        transaction.set(receiptRef, { meal: record });
        transaction.set(ref, state);
        return { meal: { ...data, _id: id, loggedAt: record.loggedAt }, usage: usageSummary(state, now, plan) };
      });
      if (result.error) throw result.error;
      return res.status(200).json(result);
    } catch (error) { return sendError(res, error); }
  };
}
export default createMealsHandler();
