# NutriGlance → Android APK Guide
Using **Trusted Web Activity (TWA)** — the official Google-recommended method.

---

## What You Need (one-time setup)
- [Android Studio](https://developer.android.com/studio) (free)
- [Java JDK 17+](https://adoptium.net/) (free)
- A Google Play Developer account ($25 one-time fee) — only if publishing
- Your live site URL (e.g. https://nutriglance.app)

---

## Part 1 — Add Files to Your Hosted Site

Upload these two files to the **root** of your website:

### 1. `manifest.json`
Already generated — upload it to your site root so it's accessible at:
`https://your-site.com/manifest.json`

### 2. `service-worker.js`
Already generated — upload it to your site root:
`https://your-site.com/service-worker.js`

### 3. Link them in every HTML page
Add these lines inside the `<head>` of all your HTML files
(dashboard.html, login.html, meals.html, etc.):

```html
<link rel="manifest" href="/manifest.json" />
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
  }
</script>
```

### 4. Add the assetlinks.json file (critical for TWA)
Create this file at exactly this path on your server:
`.well-known/assetlinks.json`

So it's reachable at:
`https://your-site.com/.well-known/assetlinks.json`

You'll fill in your SHA-256 fingerprint in Part 3. For now create the file:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourname.nutriglance",
    "sha256_cert_fingerprints": ["PASTE_YOUR_SHA256_HERE"]
  }
}]
```

---

## Part 2 — Create the Android Project with Bubblewrap

Bubblewrap is Google's official CLI tool for creating TWA apps.

### Install Bubblewrap
Open Terminal (Mac/Linux) or Command Prompt (Windows):
```bash
npm install -g @bubblewrap/cli
```

### Run the setup wizard
```bash
bubblewrap init --manifest https://your-site.com/manifest.json
```

It will ask you a few questions — answer like this:

| Question | Answer |
|---|---|
| Application name | NutriGlance |
| Package ID | com.yourname.nutriglance |
| Start URL | https://your-site.com/dashboard |
| Theme colour | #10B981 |
| Background colour | #EFF7F4 |
| Icon URL | https://your-site.com/icons/icon-512.png |

### Build the APK
```bash
bubblewrap build
```

This produces two files:
- `app-release-signed.apk` — for sideloading / testing
- `app-release-bundle.aab` — for Google Play Store upload

---

## Part 3 — Get Your SHA-256 Fingerprint

After building, run:
```bash
keytool -list -v -keystore ./android.keystore -alias android -storepass android -keypass android
```

Copy the **SHA-256** value and paste it into your `.well-known/assetlinks.json` file on your server (replacing `PASTE_YOUR_SHA256_HERE`).

**This step is critical** — without it, TWA will fall back to showing the browser address bar instead of looking like a native app.

The hosted association currently supports both NutriGlance APK signing
certificates for `app.vercel.nutriglance.twa`. If another build uses a different
signing key, verify its package name and certificate fingerprint, then add the
fingerprint to `sha256_cert_fingerprints` while retaining those for builds still
in use. The association must be publicly available over HTTPS at
`/.well-known/assetlinks.json` as JSON without a redirect. Android and Chrome may
cache verification results, so a website update may not take effect immediately
on an installed app. This association enables a verified full-screen TWA; the
browser still controls any brief startup or verification UI.

---

## Part 4 — Test on Your Phone

1. Transfer `app-release-signed.apk` to your Android phone
2. Enable **Install from unknown sources** in Settings → Security
3. Open the APK file and install it
4. Launch NutriGlance — it should open full-screen with no browser chrome

---

## Part 5 — Publish to Google Play

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create a new app → set name to **NutriGlance**
3. Under **Release → Production**, upload `app-release-bundle.aab`
4. Fill in the store listing:
   - Short description: AI-powered nutrition & meal tracker
   - Category: Health & Fitness
   - Upload screenshots (take them from your phone after installing)
5. Set content rating (answer the questionnaire — it's a health app)
6. Submit for review — usually takes 3–7 days for new accounts

---

## Icons You Need

Create PNG icons at these exact sizes and host them at `/icons/`:
- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

You can generate them from your existing SVG favicon using:
- [realfavicongenerator.net](https://realfavicongenerator.net)
- [maskable.app](https://maskable.app) (to make them "maskable" for Android)

---

## Quick Summary

```
Your site  →  Add manifest.json + service-worker.js + assetlinks.json
Bubblewrap →  bubblewrap init + bubblewrap build
Test       →  Install APK on phone
Publish    →  Upload .aab to Google Play Console
```

---

## Alternatives (if you don't want to use the CLI)

**PWABuilder** (easiest, no CLI needed):
1. Go to [pwabuilder.com](https://pwabuilder.com)
2. Enter your site URL
3. Click **Package for stores → Android**
4. Download the ready-made APK/AAB

This is the fastest route — takes about 5 minutes.
