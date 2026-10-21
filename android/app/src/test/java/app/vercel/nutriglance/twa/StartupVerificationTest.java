package app.vercel.nutriglance.twa;

import org.junit.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class StartupVerificationTest {
    private static class Clock implements StartupVerification.Scheduler {
        Runnable pending;
        long delay;

        @Override
        public void postDelayed(Runnable action, long delayMillis) {
            pending = action;
            delay = delayMillis;
        }

        @Override
        public void remove(Runnable action) {
            if (pending == action) pending = null;
        }

        void expire() {
            Runnable action = pending;
            if (action != null) action.run();
        }
    }

    @Test
    public void waitsForVerificationAndContinuesExactlyOnce() {
        Clock clock = new Clock();
        StartupVerification verification = new StartupVerification(clock);
        AtomicInteger launches = new AtomicInteger();
        verification.start(() -> true, launches::incrementAndGet);
        assertEquals(0, launches.get());
        verification.complete();
        verification.complete();
        clock.expire();
        assertEquals(1, launches.get());
        assertNull(clock.pending);
    }

    @Test
    public void aMissingCallbackCannotBlockStartupIndefinitely() {
        Clock clock = new Clock();
        StartupVerification verification = new StartupVerification(clock);
        AtomicInteger launches = new AtomicInteger();
        verification.start(() -> true, launches::incrementAndGet);
        assertTrue(clock.delay > 0 && clock.delay <= 5000);
        clock.expire();
        verification.complete();
        assertEquals(1, launches.get());
    }

    @Test
    public void unsupportedOrFailedBrowserRequestsKeepNormalFallbackAvailable() {
        for (boolean throwsException : new boolean[]{false, true}) {
            Clock clock = new Clock();
            StartupVerification verification = new StartupVerification(clock);
            AtomicInteger launches = new AtomicInteger();
            verification.start(() -> {
                if (throwsException) throw new IllegalStateException("Browser disconnected");
                return false;
            }, launches::incrementAndGet);
            assertEquals(1, launches.get());
            assertNull(clock.pending);
        }
    }

    @Test
    public void destroyedActivitiesCannotLaunchFromDelayedCallbacks() {
        Clock clock = new Clock();
        StartupVerification verification = new StartupVerification(clock);
        AtomicInteger launches = new AtomicInteger();
        verification.start(() -> true, launches::incrementAndGet);
        Runnable delayed = clock.pending;
        verification.cancel();
        verification.complete();
        delayed.run();
        assertEquals(0, launches.get());
    }

    @Test
    public void synchronousCallbacksAndRepeatedPreparationCannotLaunchTwice() {
        Clock clock = new Clock();
        StartupVerification verification = new StartupVerification(clock);
        AtomicInteger launches = new AtomicInteger();
        verification.start(() -> {
            verification.complete();
            return false;
        }, launches::incrementAndGet);
        verification.start(() -> true, launches::incrementAndGet);
        assertEquals(1, launches.get());
        assertNull(clock.pending);
    }
}
