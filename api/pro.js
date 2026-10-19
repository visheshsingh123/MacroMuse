import { authenticated, consumeQuota, HttpError, sendError } from '../lib/api-security.js';
import { activatePro, getPlan, requirePro } from '../lib/pro.js';
export function createProHandler({ getServices, quota = consumeQuota, clock = Date.now, getCode = () => process.env.PRO_ACTIVATION_CODE } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST');return res.status(405).json({ error: { message: 'Method not allowed.' } }); }
    try {
      const { uid, db } = await authenticated(req, getServices);
      if (req.method === 'GET') {
        const plan = await getPlan(db, uid, clock());
        if (req.query?.feature === 'pdf') requirePro(plan);
        return res.status(200).json(plan);
      }
      // Count every activation attempt, including incorrect codes.
      await quota(db, uid, 'pro-activation');
      let body = req.body;
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 1024) throw new HttpError(413, 'Activation request is too large.');try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid activation request.'); } }
      return res.status(200).json(await activatePro(db, uid, body?.code, getCode(), clock()));
    } catch (error) { return sendError(res, error); }
  };
}
export default createProHandler();
