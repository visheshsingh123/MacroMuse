/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package app.vercel.nutriglance.twa;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

import com.google.androidbrowserhelper.trusted.QualityEnforcer;
import com.google.androidbrowserhelper.trusted.SessionStore;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.splashscreens.SplashScreenStrategy;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final Uri ORIGIN = Uri.parse("https://nutriglance.vercel.app");
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final StartupVerification verification = new StartupVerification(
            new StartupVerification.Scheduler() {
                @Override
                public void postDelayed(Runnable action, long delayMillis) {
                    mainHandler.postDelayed(action, delayMillis);
                }

                @Override
                public void remove(Runnable action) {
                    mainHandler.removeCallbacks(action);
                }
            });



    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();



        return uri;
    }

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return new QualityEnforcer() {
            @Override
            public void onRelationshipValidationResult(int relation, Uri origin,
                                                       boolean result, Bundle extras) {
                super.onRelationshipValidationResult(relation, origin, result, extras);
                if (relation == CustomTabsService.RELATION_HANDLE_ALL_URLS && ORIGIN.equals(origin)) {
                    mainHandler.post(verification::complete);
                }
            }
        };
    }

    @Override
    protected TwaLauncher createTwaLauncher() {
        // Match the default launcher's task/session identity and notification token store.
        return new TwaLauncher(this, null, SessionStore.makeSessionId(getTaskId()),
                new SharedPreferencesTokenStore(this)) {
            @Override
            public void launch(TrustedWebActivityIntentBuilder builder,
                               CustomTabsCallback callback, SplashScreenStrategy splash,
                               Runnable completed, FallbackStrategy fallback) {
                SplashScreenStrategy verifiedSplash = new SplashScreenStrategy() {
                    @Override
                    public void onTwaLaunchInitiated(String provider,
                                                    TrustedWebActivityIntentBuilder intentBuilder) {
                        if (splash != null) splash.onTwaLaunchInitiated(provider, intentBuilder);
                    }

                    @Override
                    public void configureTwaBuilder(TrustedWebActivityIntentBuilder intentBuilder,
                                                    CustomTabsSession session, Runnable ready) {
                        verification.start(
                                () -> session.validateRelationship(
                                        CustomTabsService.RELATION_HANDLE_ALL_URLS, ORIGIN, null),
                                () -> {
                                    if (isFinishing() || isDestroyed()) return;
                                    if (splash != null) {
                                        splash.configureTwaBuilder(intentBuilder, session, ready);
                                    } else {
                                        ready.run();
                                    }
                                });
                    }
                };
                super.launch(builder, callback, verifiedSplash, completed, fallback);
            }
        };
    }

    @Override
    protected void onDestroy() {
        verification.cancel();
        super.onDestroy();
    }
}
