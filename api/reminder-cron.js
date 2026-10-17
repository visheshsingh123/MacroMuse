import { authorizedCron, configured, indiaDay, reminderBody, services } from '../lib/reminders.js';

export function createReminderCronHandler({ getServices = services, isConfigured = configured, clock = () => new Date() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!authorizedCron(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
    if (!isConfigured()) return res.status(503).json({ error: 'Reminders are not configured' });
    const slot = req.query.slot;
    if (!['afternoon', 'evening'].includes(slot)) return res.status(400).json({ error: 'Invalid reminder slot' });
    const now = clock();
    const day = indiaDay(now);
    const due = new Date(`${day}T${slot === 'afternoon' ? '13' : '19'}:00:00+05:30`);
    // Ignore accidental early runs and stale retries, especially during the night.
    if (now < due || now - due > 90 * 60_000) return res.status(200).json({ skipped: true });
    const delivery = `${day}:${slot}`;
    let sent = 0, failed = 0;
    let cursor;
    const activity = new Map();
    try {
      const { db, webpush } = getServices();
      // Page through subscriptions instead of loading every device into memory.
      do {
        let query = db.collection('reminderSubscriptions').where('enabled', '==', true).orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        cursor = page.docs.at(-1);
        for (const document of page.docs) {
          const data = document.data();
          try {
            if (!activity.has(data.uid)) {
              const since = new Date(`${day}T${slot === 'afternoon' ? '00' : '13'}:00:00+05:30`).toISOString();
              const [meals, progress] = await Promise.all([
                db.collection('users').doc(data.uid).collection('meals').where('loggedAt', '>=', since).where('loggedAt', '<=', now.toISOString()).limit(1).get(),
                db.collection('users').doc(data.uid).collection('progress').doc(now.toISOString().slice(0, 10)).get(),
              ]);
              activity.set(data.uid, reminderBody(!meals.empty, Number(progress.data()?.water) || 0, slot));
            }
            const body = activity.get(data.uid);
            if (!body) continue;
            // Claim each device's slot transactionally, so overlapping cron calls cannot double-send.
            const claimed = await db.runTransaction(async transaction => {
              const fresh = await transaction.get(document.ref);
              const current = fresh.data();
              if (!current?.enabled || current.uid !== data.uid || current.lastDelivery === delivery) return false;
              transaction.update(document.ref, { lastDelivery: delivery });
              return true;
            });
            if (!claimed) continue;
            await webpush.sendNotification(data.subscription, JSON.stringify({
              title: 'A little check-in from NutriGlance', body, tag: `nutriglance-reminder-${delivery}`,
            }), { TTL: 1800, urgency: 'normal', timeout: 10_000 });
            sent++;
          } catch (error) {
            if ([404, 410].includes(error.statusCode)) await document.ref.delete();
            failed++;
          }
        }
        if (page.size < 100) break;
      } while (cursor);
      return res.status(200).json({ sent, failed });
    } catch { return res.status(500).json({ error: 'Reminder delivery failed' }); }
  };
}

export default createReminderCronHandler();
