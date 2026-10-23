# MacroMuse Android wrapper

This directory contains the legacy `app.vercel.nutriglance.twa` source. The
published `/MacroMuse.apk` was supplied separately: package
`app.vercel.macromuse.twa`, version code 1, version name 1.0.0.0, opening
`https://macromuse.vercel.app/dashboard`. Its source was not included. It uses
a different signing certificate and installs separately from the legacy app.
The website asset links authorize both packages.

The exact launch origin must expose `/.well-known/assetlinks.json` as a public
HTTPS response with status 200, JSON content, and no redirect or login page.
An explicit Vercel rewrite serves that path through `api/assetlinks.js` using
the checked-in associations, even if a deployment omits the hidden static
directory. The current APK's certificate is
`4E:61:85:05:A8:1D:1D:93:D1:45:B5:99:C0:4B:41:5C:96:D9:E1:30:02:0B:C1:0D:A6:E2:DC:34:C4:B9:4D:17`.

A persistent close/share/address toolbar means the browser is running a Custom
Tab rather than a verified Trusted Web Activity. After deploying the matching
association on `macromuse.vercel.app`, fully close and reopen the Android app.
Chrome may retain a failed verification temporarily. Verify the live URL and
certificate before changing or reinstalling the APK. Choosing fullscreen in
PWABuilder or changing website CSS cannot override browser origin verification.

The source below was supplied through PWABuilder, with a startup
change for the brief Chrome toolbar seen between the splash and dashboard.

The launcher keeps its existing splash visible while the same Custom Tabs
session requests verification of `https://nutriglance.vercel.app`. It continues
through the standard Android Browser Helper launch flow when verification
returns, is unsupported, or takes more than five seconds. Chrome still enforces
origin verification; failure never grants full-screen access. The default
browser callback, notification delegation, sign-in context, and splash-image
handoff remain managed by Android Browser Helper.

This startup mitigation does not guarantee a toolbar-free launch on every
device. Chrome controls its own startup UI and “Running in Chrome” notice.
For future builds, confirm cold starts, repeat launches, sign-in, offline
reopening, and reminder delivery on a phone before publishing an update.

## Build

Use Android Studio with JDK 17 or 21, Android SDK platform 36, and the Android
build tools. Open this directory as a Gradle project. Set the SDK path through
Android Studio or a local `local.properties` file; that file is ignored by Git.

```sh
./gradlew :app:testDebugUnitTest :app:assembleRelease :app:bundleRelease
```

Release outputs are unsigned. Sign them locally using the keystore from the
PWABuilder package, Android Studio, or Android's `apksigner` tool. Keystores and
passwords must stay outside this repository. Reuse the same signing key for
future builds, and keep its certificate fingerprint in the website's
`public/.well-known/assetlinks.json`.

The legacy source builds version code 3, version name 1.0.2.0. Android can update an
installed app only when its package name and signing certificate match. A build
signed with a different key cannot update the old installation in place.

This legacy source keeps the original `app.vercel.nutriglance.twa` package and web origin.
This preserves installed-app updates and browser sign-in. Only the public app
and launcher labels change; use the existing release signing certificate.
