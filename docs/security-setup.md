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
