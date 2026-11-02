# MacroMuse → Android APK Guide
Using **Trusted Web Activity (TWA)** — the official Google-recommended method.

## Mint browser and app header

The website uses a solid `#59CBAA` navbar in light mode and deep green liquid glass (`#064E3B` with translucency, a subtle highlight, and blur) in dark mode, including the dashboard skeleton. Browser theme-color metadata follows the selected app theme. The PWA manifest uses `#59CBAA` as its default. Dark glass can change appearance over scrolled content; native Android bars use a solid color. Browser tabs and browser-installed PWAs can receive this web update without uninstalling; reopening the app may be needed, and Android WebAPK manifest updates can take time.

A PWABuilder/TWA APK may retain the status-bar colors compiled into its package. For the published MacroMuse package (`app.vercel.macromuse.twa`), regenerate the Android package in PWABuilder with `#59CBAA` as the light theme/status-bar color and `#064E3B` as the dark theme/status-bar color. Use the existing package name and signing key and a higher Android version code. Install the resulting APK as an update over the installed app; do not uninstall it or generate a new signing key. This website change does not rebuild or replace the existing APK.

The checked-in `android/` project still targets the legacy `app.vercel.nutriglance.twa` package and old domain. Use the current MacroMuse PWABuilder project for this update rather than publishing a build from that legacy source.

### Settings for the next MacroMuse APK

Open `https://macromuse.vercel.app` in PWABuilder and choose **Package for stores → Android**. Set:

| Setting | Value |
| --- | --- |
| Package ID | `app.vercel.macromuse.twa` |
| Launch URL | `https://macromuse.vercel.app/dashboard` |
| Version code | `2` (or higher than any version already distributed) |
| Version name | `1.0.1` |
| Theme/status-bar color, light | `#59CBAA` |
| Theme/status-bar color, dark | `#064E3B` |
| Navigation-bar and divider color, light | `#EFF7F4` |
| Navigation-bar and divider color, dark | `#0F172A` |
| Splash background | `#EFF7F4` |
| Signing | Reuse the existing MacroMuse signing key |

Keep signing files and passwords private; do not commit them or place the package ZIP in `public/`. Download the generated package and retain the Android source project for future builds.

Before replacing `public/MacroMuse.apk`, verify the new APK has the same package ID and signing-certificate SHA-256 fingerprint as the currently published APK, and a higher version code. The currently published certificate is `79:59:6D:35:14:2E:A5:F2:3A:FF:63:A7:B2:84:49:4D:BE:1E:7C:8D:3A:CA:8A:DF:E0:B3:62:C7:91:B0:94:67`. Install it over the current app on a phone, check the header in light and dark modes, and confirm that sign-in and stored data survive the update.


---

## What You Need (one-time setup)
- [Android Studio](https://developer.android.com/studio) (free)
- [Java JDK 17+](https://adoptium.net/) (free)
- A Google Play Developer account ($25 one-time fee) — only if publishing
- Your live site URL (e.g. https://macromuse.vercel.app)

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
    "package_name": "app.vercel.macromuse.twa",
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
| Application name | MacroMuse |
| Package ID | app.vercel.macromuse.twa |
| Start URL | https://your-site.com/dashboard |
| Theme colour | #59CBAA |
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

---

## Part 4 — Test on Your Phone

1. Transfer `app-release-signed.apk` to your Android phone
2. Enable **Install from unknown sources** in Settings → Security
3. Open the APK file and install it
4. Launch MacroMuse — it should open full-screen with no browser chrome

---

## Part 5 — Publish to Google Play

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create a new app → set name to **MacroMuse**
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

## Current published APK

The latest user-supplied APK is published as `public/MacroMuse.apk`, package `app.vercel.macromuse.twa`, version code `1`, version name `1.0.0.0`. Its signing certificate is `79:59:6D:35:14:2E:A5:F2:3A:FF:63:A7:B2:84:49:4D:BE:1E:7C:8D:3A:CA:8A:DF:E0:B3:62:C7:91:B0:94:67`. Digital Asset Links retains previously published certificates as well. Future updates must reuse this signing key and increase the version code.

SHA-256: `d7c7a7e565d3d97d7e5c04b299cc2d7ef0a3854e3e27a8c50bbacaf9f71ee6bf`.
