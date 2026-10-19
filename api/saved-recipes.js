import { authenticated, consumeQuota, HttpError, sendError } from '../lib/api-security.js';
import { adminServices } from '../lib/firebase-admin.js';
import { recipeId, validateRecipe } from '../lib/saved-recipes.js';

export function createSavedRecipesHandler({ getServices = adminServices, quota = consumeQuota, clock = () => new Date() } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST');return res.status(405).json({ error: { message: 'Method not allowed.' } }); }
    try {
      const { db, uid } = await authenticated(req, getServices);
      await quota(db, uid, 'recipes');
      const owner = db.collection('users').doc(uid);
      const collection = owner.collection('savedRecipes');
      const lock = owner.collection('privateState').doc('savedRecipes');
      if (req.method === 'GET') {
        const snapshot = await collection.limit(50).get();
        const recipes = snapshot.docs.flatMap(doc => {
          try { const data = doc.data();return [{ id: doc.id, recipe: validateRecipe(data.recipe), savedAt: data.savedAt }]; }
          catch { return []; }
        }).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
        return res.status(200).json({ recipes });
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
        const state = await transaction.get(lock);
        const existing = await transaction.get(ref);
        if (existing.exists) return { id, recipe, savedAt: existing.data().savedAt };
        const entries = await transaction.get(collection.limit(50));
        if (entries.size >= 50) throw new HttpError(409, 'Your collection has 50 recipes. Remove one before saving another.');
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
