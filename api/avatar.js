import { authenticated, consumeQuota, HttpError, sendError } from '../lib/api-security.js';
import { adminServices } from '../lib/firebase-admin.js';
import { avatarOption } from '../public/avatar-options.js';

export function createAvatarHandler({ getServices = adminServices, quota = consumeQuota } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST');return res.status(405).json({error:{message:'Method not allowed.'}}); }
    try {
      const {db,uid} = await authenticated(req,getServices);
      await quota(db,uid,'avatar');
      const ref = db.collection('users').doc(uid).collection('preferences').doc('avatar');
      if (req.method === 'GET') {
        const snapshot = await ref.get(), choice = snapshot.data()?.choice;
        return res.status(200).json({choice:avatarOption(choice) ? choice : 'initial'});
      }
      let body = req.body;
      if (typeof body === 'string') { if (Buffer.byteLength(body)>1024) throw new HttpError(413,'Invalid profile picture request.');try { body=JSON.parse(body); } catch { throw new HttpError(400,'Invalid profile picture request.'); } }
      if (!body || !avatarOption(body.choice)) throw new HttpError(400,'Choose a profile picture from the available options.');
      await ref.set({choice:body.choice});
      return res.status(200).json({choice:body.choice});
    } catch (error) { return sendError(res,error); }
  };
}
export default createAvatarHandler();
