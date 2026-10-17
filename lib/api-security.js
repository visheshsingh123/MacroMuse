import { createHash } from 'node:crypto';
import { adminServices } from './firebase-admin.js';

export class HttpError extends Error {
  constructor(status, message, retryAfter) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

export async function authenticated(req, getServices = adminServices) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !/^Bearer [^\s]{1,8192}$/.test(header)) throw new HttpError(401, 'Please sign in to continue.');
  let services;
  try { services = getServices(); } catch { throw new HttpError(503, 'The service is not configured yet. Please try again later.'); }
  try {
    const user = await services.auth.verifyIdToken(header.slice(7), true);
    if (!user.uid || user.firebase?.sign_in_provider === 'anonymous') throw new Error('Sign in required');
    return { ...services, uid: user.uid };
  } catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
}

export function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 503;
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  return res.status(status).json({ error: { message: error instanceof HttpError ? error.message : 'The service is temporarily unavailable. Please try again.' } });
}

// Firestore transactions enforce quotas across server instances and cold starts.
export async function consumeQuota(db, uid, purpose, now = Date.now()) {
  const minute = Math.floor(now / 60_000), day = Math.floor(now / 86_400_000);
  const hash = createHash('sha256').update(uid).digest('hex');
  const limits = purpose === 'ai' ? [10, 100, 100, 2000] : [10, 100, 100, 5000];
  const buckets = [
    [`${purpose}-user-minute-${hash}`, minute, limits[0], 60],
    [`${purpose}-user-day-${hash}`, day, limits[1], 86400],
    [`${purpose}-global-minute`, minute, limits[2], 60],
    [`${purpose}-global-day`, day, limits[3], 86400],
  ];
  await db.runTransaction(async transaction => {
    const refs = buckets.map(([id]) => db.collection('serverQuotas').doc(id));
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const counts = snapshots.map((snap, index) => snap.data()?.window === buckets[index][1] ? Number(snap.data().count) || 0 : 0);
    for (let i = 0; i < buckets.length; i++) {
      if (counts[i] >= buckets[i][2]) throw new HttpError(429, 'You’ve reached the request limit. Please try again later.', buckets[i][3]);
    }
    refs.forEach((ref, index) => transaction.set(ref, { window: buckets[index][1], count: counts[index] + 1 }));
  });
}
