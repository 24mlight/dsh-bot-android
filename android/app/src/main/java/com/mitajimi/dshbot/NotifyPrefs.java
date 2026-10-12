package com.mitajimi.dshbot;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the notice service remembers between runs: whether the user turned
 * notifications on, which server the app last logged in to, and where the
 * long poll left off (the server run's {@code boot} id and the last notice
 * number), so a restart neither repeats nor skips notices.
 */
final class NotifyPrefs {
    private static final String FILE = "dsh_notify";
    private static final String ENABLED = "enabled";
    private static final String BASE_URL = "base_url";
    private static final String BOOT = "boot";
    private static final String SINCE = "since";
    private static final String LOGIN_LOST = "login_lost";
    private static final String LAST_POLL = "last_poll";
    private static final String LAST_POLL_AT = "last_poll_at";
    private static final String LOG = "log";
    private static final int KEEP_LOG = 30;

    private NotifyPrefs() {}

    private static SharedPreferences of(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context context) {
        return of(context).getBoolean(ENABLED, false);
    }

    static void setEnabled(Context context, boolean on) {
        of(context).edit().putBoolean(ENABLED, on).apply();
    }

    static String baseUrl(Context context) {
        return of(context).getString(BASE_URL, null);
    }

    static void setBaseUrl(Context context, String baseUrl) {
        SharedPreferences prefs = of(context);
        if (baseUrl == null || baseUrl.equals(prefs.getString(BASE_URL, null))) return;
        // Another server: its notice numbers mean nothing here.
        prefs.edit().putString(BASE_URL, baseUrl).remove(BOOT).remove(SINCE).apply();
    }

    static String boot(Context context) {
        return of(context).getString(BOOT, null);
    }

    static long since(Context context) {
        return of(context).getLong(SINCE, -1);
    }

    static void saveCursor(Context context, String boot, long since) {
        of(context).edit().putString(BOOT, boot).putLong(SINCE, since).apply();
    }

    static boolean loginLost(Context context) {
        return of(context).getBoolean(LOGIN_LOST, false);
    }

    static void setLoginLost(Context context, boolean lost) {
        of(context).edit().putBoolean(LOGIN_LOST, lost).apply();
    }

    /**
     * What the last poll found ("ok", "not-installed", "login-lost", "network", …),
     * for the setup page. A change of result also goes into the log.
     */
    static void setLastPoll(Context context, String result) {
        if (!result.equals(lastPoll(context))) log(context, "连接：" + result);
        of(context).edit().putString(LAST_POLL, result).putLong(LAST_POLL_AT, System.currentTimeMillis()).apply();
    }

    /** One line in the 诊断记录 log the setup page shows; the last 30 are kept. */
    static synchronized void log(Context context, String text) {
        JSONArray kept = log(context);
        JSONArray next = new JSONArray();
        for (int i = Math.max(0, kept.length() - KEEP_LOG + 1); i < kept.length(); i++) next.put(kept.opt(i));
        try {
            next.put(new JSONObject().put("at", System.currentTimeMillis()).put("text", text));
        } catch (JSONException ignored) {
            return;
        }
        of(context).edit().putString(LOG, next.toString()).apply();
    }

    static JSONArray log(Context context) {
        try {
            return new JSONArray(of(context).getString(LOG, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static String lastPoll(Context context) {
        return of(context).getString(LAST_POLL, null);
    }

    static long lastPollAt(Context context) {
        return of(context).getLong(LAST_POLL_AT, 0);
    }
}
