# MacroMuse Android wrapper

This is the clean Android source supplied through PWABuilder, with a startup
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

The current release is version code 3, version name 1.0.2.0. Android can update an
installed app only when its package name and signing certificate match. A build
signed with a different key cannot update the old installation in place.

MacroMuse keeps the original `app.vercel.nutriglance.twa` package and web origin.
This preserves installed-app updates and browser sign-in. Only the public app
and launcher labels change; use the existing release signing certificate.
