# Security deployment

## Required production setup

The AI API now requires a Firebase ID token and persistent server-side quotas. It fails closed if its server credentials are missing; client login redirects alone cannot protect an API.

1. In Firebase Console → Project settings → Service accounts, create a server service-account key for **nutriglance**. Add the complete JSON as **`FIREBASE_SERVICE_ACCOUNT_JSON`** in Vercel's Production environment variables. Never put this key in browser code, Git, or chat. This is the same server credential used for reminders; Web Push keys are not required for AI analysis.
2. Keep the existing `GROQ_API_KEY_1` through `_5` (or the documented single-key alternative). Redeploy in Vercel after changing environment variables. Requests without a token receive 401; missing server configuration returns 503. Check that a signed-in meal scan and AI Chef request succeed after configuration.
3. Publish the included **`firestore.rules`** to the actual database. Either paste the complete file into Firebase Console → Firestore Database → Rules and click Publish, or authenticate the Firebase CLI and run `npx firebase deploy --only firestore:rules --project nutriglance`. The CLI command deploys only database rules, not Hosting. Rules replace the previous ruleset; these rules cover the user profile, meals, progress, and all current server-only collections.
4. Verify that another signed-in account cannot read or write your user's profile, meal log, or progress. Verify that browser clients cannot read or write `reminderSubscriptions` or `serverQuotas`. Admin SDK access intentionally bypasses these rules.

Lifestyle setup adds the optional profile field `activityLevel`, limited to `sedentary`, `lightly_active`, `moderately_active`, or `very_active`. Publish the updated rules before using this feature; older rules reject the new field. Existing profiles without it remain valid and keep their saved targets until the user updates their profile. Setup and Settings show a retryable error if the profile cannot be saved.

Goal preferences add the optional field `goalPreference`, limited to `maintenance`, `weight_loss`, or `weight_gain`. Publish the latest rules to allow it. Adults can choose an estimated 10% calorie deficit or surplus relative to activity-based maintenance; under-18 profiles use maintenance estimates. Existing profiles keep their saved targets until edited. Weekly insights compare Monday through today with the same weekdays in the previous week, exclude unlogged days from averages, and evaluate both weeks against the current calorie goal.

The repository cannot publish Firebase rules or add Vercel secrets without authorized access to those services. Pushing a Git commit alone does not change the deployed Firestore rules.

## Protections

- Firebase ID tokens are verified, including revocation, before AI calls. Caller-supplied user IDs never choose the quota identity. Anonymous Firebase sessions are rejected.
- Transactional quotas apply across server instances: AI limits are 10 requests/minute and 100/day per account, plus 100/minute and 2,000/day globally. Subscription changes have 10/minute and 100/day per account, plus 100/minute and 5,000/day globally. Daily windows use UTC. Requests after a limit receive 429 and Retry-After. These quotas do not depend on a browser's Pro flag.
- Allowed models, roles, message count, text length, image MIME/signatures, and output tokens are checked. Remote image URLs, tools, streaming flags, unsupported models, and excessive requests are rejected. At most one inline JPG/PNG/WebP image is accepted; the total payload is capped at 2.5 MB, and the upload UI accepts images under 1.8 MB. Upstream requests time out and errors do not reveal keys or key-selection details.
- AI nutrition must contain finite, nonnegative numeric values. Rendered fields are escaped; cached nutrition is normalized. Invalid model responses are not logged.
- Account data stays hidden on an initial or expired session. For five minutes after Firebase confirms an identity, the same browser tab may immediately paint that account's cache during page navigation while Firebase restores in the background. The tab hint never authorizes API or database requests. Signing out clears account data and the hint; an account mismatch or cross-tab logout hides the page and revalidates. Restored history entries revalidate too. Legacy caches without a known account owner are discarded; records already synced to Firestore remain there.
- The service worker no longer caches API requests, Firebase traffic, authenticated responses, or no-store/private responses. Its cache version changes to discard the old cache.
- Automatic Google Forms submission of onboarding health details is removed. Only the explicit feedback Submit action still sends a review to Google Forms; the privacy page describes this.
- Vercel supplies CSP, anti-framing, nosniff, referrer, permissions, and HTTPS transport headers. Inline scripts are authorized by hashes; inline event handlers and eval are blocked. Tailwind is compiled at build time. Chart.js is pinned with Subresource Integrity. Google Firebase/OAuth and font hosts remain allowed for existing features.
- Paid upgrades remain unavailable until a real billing backend exists. A localStorage flag cannot grant a subscription or bypass quotas.

## Checks and maintenance

Run `npm test`, `npm run build`, and `npm run test:rules`. The rules suite downloads the official emulator, verifies its pinned SHA-256 checksum, and uses a demo project bound to localhost, never the production database. Java 21 is required. The GitHub security workflow repeats these checks and the production dependency audit.

The `jwks-rsa` dependency has a scoped override to `jose` 5.10.0, which supports CommonJS. Its default ESM-only dependency crashes Firebase Admin startup under Vercel loaders that cannot use synchronous `require(ESM)`. The startup regression runs without that Node feature and checks public-key import and signature verification. Keep this check passing when updating or removing the override; it does not replace Firebase token verification or revocation checks.

When changing inline JavaScript, run **`npm run security:headers`** and commit `vercel.json`; the build rejects stale CSP hashes. When changing utility classes, run `npm run build` and commit `public/app.css`. Vercel runs the build as well. Static generated files remain in Git so previews and plain static servers work.

Local API/rendering/session tests and browser checks do not certify the deployed website. Confirm the environment variables, published database rules, HTTPS response headers, email/Google login, meal scans, and notifications on the real deployment. Keep Firebase Authentication's authorized domains restricted to the domains you actually use, and remove old server keys if they were ever exposed.

## Free daily allowances

Free accounts can create 3 meal logs and receive 5 successful AI Chef replies per
UTC calendar day. The UI shows remaining usage and the midnight UTC reset. Pro
can be activated for lifetime access with a server-verified activation code.
Active Pro accounts have no daily meal or Chef cap, unlimited saved recipes, and
PDF export. Free accounts can save one recipe and cannot use PDF export.
Browser storage and caller-supplied Pro flags never grant more usage.

New meals (including recipes logged from AI Chef or Saved recipes) use the
Firebase-authenticated `/api/meals` endpoint. It saves the meal and increments the
private daily counter in one transaction. Existing meals from today count when
the daily counter is first initialized. Retries use the same meal ID. A private
receipt allows Undo to restore the original record without charging again;
deleting meals or clearing the diary does not refund daily usage. Client edits,
reads and deletes remain protected by the owner rules.

AI Chef uses `/api/chef`. A transactional reservation prevents concurrent requests
from exceeding five; failed or malformed provider replies release the slot, and
abandoned reservations expire after two minutes. `/api/groq` now returns only
validated meal nutrition using a server-owned prompt, so it cannot be used as an
unmetered conversation endpoint. Existing short-term/global AI safety limits
still apply separately. `/api/usage` returns the authenticated account's counters
without consuming a daily allowance.

Deployment requires the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and Groq
credentials. Code activation also needs `PRO_ACTIVATION_CODE` as described below. Deploy the updated Vercel application,
then publish the complete updated `firestore.rules` in Firebase Console →
Firestore Database → Rules (or with your authorized Firebase CLI). The new rules
require meal creation/restoration through the server and deny direct client
creates, private counters, and meal receipts. A Git push alone does not publish
these rules. Until they are published, legacy/direct Firestore writes can bypass
the meal allowance. Older cached app versions cannot create meals after the rules
update; reload to pick up the new service-worker version.

Validate with `npm test`, `npm run build`, and `npm run test:rules`. On the deployed
app, check the fourth meal and sixth Chef reply, reload/cross-device persistence,
Undo, failed AI requests and the reset boundary. Existing meals and conversations
must remain readable after reaching a quota.


## One-time Pro pricing and lifetime activation

Pro is advertised at **US$5 or ₹500 once**, with lifetime access and no recurring
billing. The INR/USD selector changes the displayed currency. No payment gateway
is connected: entering a code does not take or verify a payment.

Set `PRO_ACTIVATION_CODE` as a server-only environment variable in Vercel for the
required deployment environment, then redeploy. Enter the intended activation
code securely in Vercel; never put it in browser code, Git, URLs, or logs. Existing
Firebase Admin configuration is also required. No payment gateway is involved.

On `/premium`, choose Activate Pro and enter the code while signed in. `/api/pro`
verifies the Firebase session, rate-limits activation attempts, and compares the
code on the server. It writes the entitlement to `users/{uid}/privateState/pro`
and a per-account redemption receipt containing only a code digest identifier
and timestamps. Clients cannot write either document under the existing rules.
New activations write an explicit `access: 'lifetime'` entitlement with
`expiresAt: null`. Missing or null expiry without this marker never grants Pro.
The configured code is reusable across accounts and across repeated activations
on the same account, including after cancellation. Repeated/concurrent activation
while lifetime Pro is already active is idempotent. Receipts track the most recent
activation and do not impose a redemption limit. Rotating the environment value
changes which code is valid without revoking existing Pro access.

Existing dated entitlements keep their original expiry. Re-entering their used
code preserves that access; redeeming an unused new code upgrades to lifetime.
Expired legacy entitlements return to Free until a valid code is redeemed; the
same still-configured code can be used again to activate lifetime access.

Settings → Account & data offers Cancel Pro to active members. Its confirmation
button unlocks after five seconds. Confirming sends an authenticated, rate-limited
`DELETE /api/pro`, which ends Pro immediately and restores Free limits without
deleting user data. Cancellation is idempotent and retains the redemption receipt;
the same still-valid activation code can reactivate a cancelled membership. Cancellation
does not issue a refund and there is no recurring charge to stop.

Tier and daily-usage displays share a five-minute account-scoped browser cache.
Recent verified navigation can paint the quota cards, Pro badge and cancellation
option immediately while authenticated requests refresh in the background.
Activation, cancellation, meal saves and Chef replies update the cache, including
other open tabs. Sign-out clears it; expiry and UTC rollover invalidate the
affected state. This cache controls presentation only: API access, PDF export and
quota enforcement always use the server-owned entitlement and usage records.

Every protected operation checks the server-owned entitlement; there is no cron
requirement and no browser Pro flag. Legacy dated entitlements also check current
server time. Usage continues to be recorded while Pro is active, so cancellation
or legacy expiry restores Free allowances without removing existing meals or
recipes. Settings shows lifetime/no expiry for new activations and the expiry
date for legacy access. Short-term and global protections still apply; Pro has
no per-user daily request cap.

Saved recipes are returned in pages of 50 without a total collection cap for
Pro. Free accounts that downgrade keep access to their full collection but must
remove excess recipes before saving a new one. The PDF button verifies active
Pro before generating the local print report; browser printing of a user's own
visible information cannot be prevented as a form of copy protection.
