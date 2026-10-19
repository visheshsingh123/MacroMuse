import { authenticated, consumeQuota, HttpError, sendError } from '../lib/api-security.js';
import { adminServices } from '../lib/firebase-admin.js';
import { FieldPath } from 'firebase-admin/firestore';
import { getPlan, proRef, planFromRecord, requirePro } from '../lib/pro.js';
import { recipeId, validateRecipe } from '../lib/saved-recipes.js';

export function createSavedRecipesHandler({ getServices = adminServices, quota = consumeQuota, clock = () => new Date() } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST');return res.status(405).json({ error: { message: 'Method not allowed.' } }); }
    try {
      const { db, uid } = await authenticated(req, getServices);
      const plan = await getPlan(db, uid, clock());
      await quota(db, uid, plan.plan === 'pro' ? 'pro-recipes' : 'recipes');
      const owner = db.collection('users').doc(uid);
      const collection = owner.collection('savedRecipes');
      const lock = owner.collection('privateState').doc('savedRecipes');
      if (req.method === 'GET') {
        const after = req.query?.after;
        if (after !== undefined && (typeof after !== 'string' || !/^[a-f0-9]{64}$/.test(after))) throw new HttpError(400, 'Invalid recipe page.');
        let page = collection.orderBy(FieldPath.documentId()).limit(50);
        if (after) page = page.startAfter(after);
        const snapshot = await page.get();
        const recipes = snapshot.docs.flatMap(doc => {
          try { const data = doc.data();return [{ id: doc.id, recipe: validateRecipe(data.recipe), savedAt: data.savedAt }]; }
          catch { return []; }
        }).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
        return res.status(200).json({ recipes, nextCursor: snapshot.docs.length === 50 ? snapshot.docs.at(-1).id : null });
      }
      let body = req.body;
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 16000) throw new HttpError(413, 'This recipe is too large.');try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid recipe request.'); } }
      if (!body || Buffer.byteLength(JSON.stringify(body)) > 16000) throw new HttpError(400, 'Invalid recipe request.');
      if (body.action === 'remove') {
        if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) throw new HttpError(400, 'Invalid saved recipe.');
        await collection.doc(body.id).delete();
        return res.status(200).json({ removed: body.id });
      }
      if (body.action !== 'save') throw new HttpError(400, 'Invalid recipe action.');
      const recipe = validateRecipe(body.recipe), id = recipeId(recipe), ref = collection.doc(id);
      const item = await db.runTransaction(async transaction => {
        // A shared write serializes additions, including an initially empty collection.
        const entitlement = planFromRecord((await transaction.get(proRef(db, uid))).data(), clock());
        requirePro(entitlement);
        const state = await transaction.get(lock);
        const existing = await transaction.get(ref);
        if (existing.exists) return { id, recipe, savedAt: existing.data().savedAt };
        const savedAt = clock().toISOString();
        transaction.set(ref, { recipe, savedAt });
        transaction.set(lock, { revision: (Number(state.data()?.revision) || 0) + 1 });
        return { id, recipe, savedAt };
      });
      return res.status(200).json({ item });
    } catch (error) { return sendError(res, error); }
  };
}
export default createSavedRecipesHandler();
