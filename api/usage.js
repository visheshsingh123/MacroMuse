import { authenticated, sendError } from '../lib/api-security.js';
import { getUsage } from '../lib/free-usage.js';
export function createUsageHandler({ getServices, clock = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET');return res.status(405).json({ error: { message: 'Method not allowed.' } }); }
    try {
      const { uid, db } = await authenticated(req, getServices);
      return res.status(200).json({ usage: await getUsage(db, uid, clock()) });
    } catch (error) { return sendError(res, error); }
  };
}
export default createUsageHandler();
