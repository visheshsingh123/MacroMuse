# Twice-daily Web Push reminders

The app subscribes a signed-in device only after the user enables **Settings → Meal Reminders** and grants notification permission. Vercel runs two jobs at 07:30 and 13:30 UTC (1 PM and 7 PM IST). Delivery works with the page closed on browsers that support Web Push. On iPhone/iPad, the user must install the site to their Home Screen first (iOS/iPadOS 16.4+).

Each job sends at most one combined notification per device. Water reminders stop after eight glasses; meal reminders are skipped when a meal is logged today (afternoon job), or since 1 PM IST (evening job). Both checks use the user's synced Firestore records. If both are satisfied, nothing is sent. Missed notifications expire after 30 minutes at the push service. Delivery timing also depends on the browser, device, and Vercel plan; Hobby daily jobs may run within an hour of the configured time.

## Enable in production

1. Run `npm ci` in the repository. Generate a VAPID key pair with `npx web-push generate-vapid-keys --json`. Generate a cron secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. In Firebase Console → Project settings → Service accounts, create a server service-account key for this Firebase project. In Vercel → Project → Settings → Environment Variables, add **Production** values for:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON, as a single JSON object string.
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: the generated pair. Keep this pair stable; changing it requires devices to subscribe again.
   - `VAPID_SUBJECT`: an actual support contact, such as `mailto:support@your-domain.com`.
   - `CRON_SECRET`: the generated random value. Vercel adds this as the Authorization bearer token for scheduled invocations.
3. Protect the new Firestore collection **before enabling subscriptions**. Merge this rule into the existing database rules:

   ```text
   match /reminderSubscriptions/{subscriptionId} {
     allow read, write: if false;
   }
   ```

   Firestore permissions are additive: remove or restrict any existing broad wildcard rule that also grants access to this collection. Keep the existing rules for `users/{uid}` and its meal/progress collections. The server uses the Admin SDK; browser clients must have no read or write access to push endpoints or encryption keys. Use the Firebase Rules simulator to verify an authenticated client cannot read or write `reminderSubscriptions`.
4. Redeploy on Vercel, then check Project → Cron Jobs for both schedules. No Firebase service-account, VAPID private key, or cron secret belongs in public files or Git. The setup values are not currently supplied by this repository.
5. On the deployed HTTPS site, sign in and enable Meal Reminders. Grant browser permission, confirm the toggle stays on after reload, close the page, and check delivery at the next reminder time. Test disabling the toggle on the same device and confirm future pushes stop.

Without the production variables, `/api/reminders` returns 503 and Settings shows that reminders are not available. It never displays a working on switch for an unconfigured service.

## Troubleshooting a switch that will not turn on

Check that all five variable names above exist in Vercel's **Production** environment, then redeploy after changes. Keep an existing VAPID key pair; generate one only if it has never been configured. Groq keys do not configure Web Push.

Open Settings and inspect the failed `/api/reminders` request in Vercel Logs. Missing configuration logs list variable names only. Invalid Firebase credentials and invalid VAPID settings have separate messages; server initialization failures return 503 instead of incorrectly asking the user to sign in again. Never share secret values or the service-account JSON in chat or logs.

After fixing the deployment, use **Retry reminders** in Settings, then enable the switch. Retry checks availability without requesting notification permission. If notifications are blocked, allow them in the browser's site settings first. A successful subscription should remain on after reload; confirm actual delivery with a real device at the next scheduled time.

## Operational details

- Subscription requests require a verified Firebase ID token. Devices are separate subscriptions; disabling a device affects that browser/install. Signing out or resetting app data also unsubscribes that device.
- Subscription endpoints are restricted to supported Chrome/Edge, Firefox, and Safari push services. Expired subscriptions (404/410) are removed automatically.
- A Firestore transaction claims each device's daily slot before delivery, preventing duplicate sends from overlapping cron invocations. A failed send is counted and is not retried in that slot, favoring no duplicate notifications. Monitor `failed` in the cron response/logs.
- The app's existing hydration sync uses UTC date document IDs; the cron reads the same IDs. Meal checks use IST boundaries and ISO `loggedAt` values.
- Run `npm test` for reminder policy, endpoint authentication/validation, subscription ownership, scheduling, duplicate prevention, and service-worker behavior. Client behavior was additionally checked in Chromium with mocked browser permission/push APIs; actual closed-app delivery requires the deployed credentials and a real subscribed device.
