# Twice-daily Web Push reminders

Meal Reminders defaults to on for signed-in users without a saved reminder preference on that browser. Existing off choices are preserved. The switch represents the saved preference; its status explains whether notifications are active, awaiting permission, blocked, or unavailable. In Settings, **Allow notifications** requests browser permission after a click. No permission prompt appears automatically on page load. If permission is already granted, an on preference subscribes automatically. Delivery starts only after the server saves the subscription.

Turning reminders on in Settings, or choosing **Allow notifications**, displays
an immediate “MacroMuse reminders enabled” notification after permission is
granted and the subscription is saved. It is displayed locally through the
service worker and opens the dashboard when tapped; it does not wait for the
scheduled push job or test the remote push-delivery path. Reloading a page or
restoring a subscription does not repeat this confirmation. If the browser
cannot display it, Settings explains that reminders are still enabled.

Vercel runs two jobs at 07:30 and 13:30 UTC (1 PM and 7 PM IST). Delivery works with the page closed on browsers that support Web Push. On iPhone/iPad, the user must install the site to their Home Screen first (iOS/iPadOS 16.4+).

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
5. On the deployed HTTPS site, sign in and open Meal Reminders in Settings. New preferences start on; use **Allow notifications** and grant browser permission. For an existing off preference, turn the switch on. Confirm the active status and saved preference after reload, close the page, and check delivery at the next reminder time. Test disabling the toggle on the same device and confirm future pushes stop.

Without the production variables, `/api/reminders` returns 503 and Settings shows that reminders are not available, even if the saved preference is on. Only a saved subscription and granted browser permission produce the active delivery status.

## Troubleshooting a switch that will not turn on

Check that all five variable names above exist in Vercel's **Production** environment, then redeploy after changes. Keep an existing VAPID key pair; generate one only if it has never been configured. Groq keys do not configure Web Push.

Open Settings and inspect the failed `/api/reminders` request in Vercel Logs. Missing configuration logs list variable names only. Invalid Firebase credentials and invalid VAPID settings have separate messages; server initialization failures return 503 instead of incorrectly asking the user to sign in again. Never share secret values or the service-account JSON in chat or logs.

After fixing the deployment, use **Retry reminders** in Settings to check availability. Availability checks do not request notification permission. If the preference is off, enable the switch; if browser permission is pending, use **Allow notifications**. The switch remains clickable during an outage so the preference can be turned off; it is disabled only while a request is running. Service-worker readiness has a 15-second timeout so a stalled worker cannot permanently disable the controls. If notifications are blocked, allow them in the browser's site settings first. A successful subscription should remain active after reload; confirm actual delivery with a real device at the next scheduled time.

## Operational details

- Subscription requests require a verified Firebase ID token. Devices are separate subscriptions; disabling a device affects that browser/install. Signing out or resetting app data also unsubscribes that device.
- Subscription endpoints are restricted to supported Chrome/Edge, Firefox, and Safari push services. Expired subscriptions (404/410) are removed automatically.
- A Firestore transaction claims each device's daily slot before delivery, preventing duplicate sends from overlapping cron invocations. A failed send is counted and is not retried in that slot, favoring no duplicate notifications. Monitor `failed` in the cron response/logs.
- The app's existing hydration sync uses UTC date document IDs; the cron reads the same IDs. Meal checks use IST boundaries and ISO `loggedAt` values.
- Run `npm test` for reminder policy, endpoint authentication/validation, subscription ownership, scheduling, duplicate prevention, and service-worker behavior. Client behavior was additionally checked in Chromium with mocked browser permission/push APIs; actual closed-app delivery requires the deployed credentials and a real subscribed device.
