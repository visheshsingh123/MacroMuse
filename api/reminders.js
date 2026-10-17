import { configured, services, subscriptionId, validEndpoint, validSubscription } from '../lib/reminders.js';

export function createReminderHandler({ getServices = services, isConfigured = configured } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!isConfigured()) return res.status(503).json({ error: 'Reminders are not available yet. Please try again later.' });
    if (req.method === 'GET') return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Please sign in again.' });
    let auth, db, uid;
    try {
      ({ auth, db } = getServices());
      ({ uid } = await auth.verifyIdToken(token, true));
    } catch { return res.status(401).json({ error: 'Please sign in again.' }); }
    const { enabled, subscription, endpoint } = req.body || {};
    if (typeof enabled !== 'boolean' || !validEndpoint(enabled ? subscription?.endpoint : endpoint) ||
        (enabled && !validSubscription(subscription))) return res.status(400).json({ error: 'Invalid notification subscription.' });
    const ref = db.collection('reminderSubscriptions').doc(subscriptionId(enabled ? subscription.endpoint : endpoint));
    try {
      if (enabled) {
        await ref.set({ uid, enabled: true, subscription: {
          endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh },
        }, updatedAt: new Date().toISOString() }, { merge: true });
      } else {
        await db.runTransaction(async transaction => {
          const snap = await transaction.get(ref);
          if (snap.exists && snap.data().uid === uid) transaction.delete(ref);
        });
      }
      return res.status(200).json({ enabled });
    } catch { return res.status(500).json({ error: 'Couldn’t save your reminder preference. Please try again.' }); }
  };
}

export default createReminderHandler();
