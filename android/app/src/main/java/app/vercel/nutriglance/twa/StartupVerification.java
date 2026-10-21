package app.vercel.nutriglance.twa;

import java.util.function.BooleanSupplier;

/** Wait briefly for the browser's verification result before handing off the splash screen. */
final class StartupVerification {
    interface Scheduler {
        void postDelayed(Runnable action, long delayMillis);
        void remove(Runnable action);
    }

    private final Scheduler scheduler;
    private final Runnable timeout = this::complete;
    private Runnable continuation;
    private boolean started;
    private boolean cancelled;

    StartupVerification(Scheduler scheduler) {
        this.scheduler = scheduler;
    }

    void start(BooleanSupplier requestVerification, Runnable continueLaunch) {
        if (started || cancelled) return;
        started = true;
        continuation = continueLaunch;
        scheduler.postDelayed(timeout, 5000);
        try {
            if (!requestVerification.getAsBoolean()) complete();
        } catch (RuntimeException unavailableBrowser) {
            complete();
        }
    }

    // A rejected or unsupported verification still uses Chrome's normal, secure fallback.
    void complete() {
        if (cancelled || continuation == null) return;
        Runnable launch = continuation;
        continuation = null;
        scheduler.remove(timeout);
        launch.run();
    }

    void cancel() {
        cancelled = true;
        continuation = null;
        scheduler.remove(timeout);
    }
}
