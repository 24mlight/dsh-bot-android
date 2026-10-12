package com.mitajimi.dshbot;

/** How {@link NotifyService} reacts to each poll answer. Pure, so it is unit-tested. */
final class PollPlan {
    enum Outcome { OK, LOGIN_LOST, NOT_INSTALLED, RETRY }

    private PollPlan() {}

    static Outcome outcomeOf(int status) {
        if (status == 200) return Outcome.OK;
        // dsh web answers a missing or stale login with 401/403, or redirects to its login.
        if (status == 401 || status == 403 || (status >= 300 && status < 400)) return Outcome.LOGIN_LOST;
        // The server runs without the dsh-notify plugin.
        if (status == 404) return Outcome.NOT_INSTALLED;
        return Outcome.RETRY;
    }

    /** Pause after the n-th failure in a row: 5 s, 10 s, 20 s, 40 s, then every 60 s. */
    static long backoffMs(int failures) {
        if (failures <= 0) return 0;
        long ms = 5_000L << Math.min(failures - 1, 4);
        return Math.min(ms, 60_000L);
    }
}
