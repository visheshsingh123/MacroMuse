import { createHash, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

export function configured() {
  return ['FIREBASE_SERVICE_ACCOUNT_JSON', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET']
    .every(key => Boolean(process.env[key]));
}

export function services() {
  if (!configured()) throw new Error('Reminders are not configured');
  const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return { auth: getAuth(app), db: getFirestore(app), webpush };
}

export function subscriptionId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

export function validEndpoint(endpoint) {
  try {
    if (typeof endpoint !== 'string' || endpoint.length > 4096) return false;
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname === 'web.push.apple.com' ||
       url.hostname === 'updates.push.services.mozilla.com' || url.hostname.endsWith('.push.services.mozilla.com'));
  } catch { return false; }
}

export function validSubscription(subscription) {
  return validEndpoint(subscription?.endpoint) &&
    typeof subscription.keys?.p256dh === 'string' && typeof subscription.keys?.auth === 'string' &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(subscription.keys.p256dh) &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(subscription.keys.auth) &&
    Buffer.from(subscription.keys.p256dh, 'base64url').length === 65 &&
    Buffer.from(subscription.keys.auth, 'base64url').length === 16;
}

export function authorizedCron(header) {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function indiaDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function reminderBody(hasMeal, water, slot) {
  const parts = [];
  if (water < 8) parts.push('Time for a glass of water.');
  if (!hasMeal) parts.push(slot === 'evening' ? 'Had a meal this afternoon? Add it to your log.' : 'Eaten today? Remember to log your meal.');
  return parts.join(' ');
}
