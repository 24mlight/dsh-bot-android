package com.mitajimi.dshbot;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps one long poll open on the server's dsh-notify plugin
 * (POST /api/dsh-notify) and turns each notice into a notification.
 *
 * It is a plain background service with no notification of its own: the
 * user does not want an ongoing 消息通知已开启 notice, and a foreground
 * service must show one (a channel the app blocks itself is not honoured).
 * Android lets it run with the app closed when the app may run in the
 * background (battery optimisation off, which the 后台与自启动 shortcut
 * asks for; on ColorOS, MIUI and the like, background activity allowed
 * too). START_STICKY and {@link BootReceiver} bring it back after the
 * system stops it or the phone restarts. It logs in with the same
 * session cookie the app's WebView got when the user tapped 登录, read from
 * the WebView cookie store, so it never sees the token. Notices show whether
 * or not the app is on screen.
 *
 * With the screen off the phone's CPU sleeps, and plain timers (Thread.sleep,
 * socket timeouts) stop with it. So: a partial wake lock is held only while
 * the service works (answer in hand, next request going out), never while it
 * waits; an incoming answer wakes the phone by itself. Pauses between polls
 * and a watchdog on each poll run on AlarmManager, which wakes the phone; a
 * poll stuck on a dead connection is dropped when the alarm finds it overdue
 * or the network changes. Opening the app polls at once.
 */
public class NotifyService extends Service {
    static final String PATH = "/api/dsh-notify";
    private static final String ACTION_KICK = "com.mitajimi.dshbot.notify.KICK";
    private static final String ACTION_ALARM = "com.mitajimi.dshbot.notify.ALARM";
    private static final long WAKE_MS = 30_000;
    private static final int WAIT_MS = 25_000;
    private static final int READ_TIMEOUT_MS = WAIT_MS + 15_000;
    private static final long IDLE_MS = 60_000;
    private static final long NOT_INSTALLED_MS = 2 * 60_000;

    private volatile boolean running;
    // Whether the service is up, so opening the app nudges it instead of
    // starting it.
    private static volatile boolean alive;
    private volatile HttpURLConnection current;
    private volatile long pollStartedAt;
    private Thread worker;
    private final Object lock = new Object();
    private boolean kicked;
    private PowerManager.WakeLock wake;
    private ConnectivityManager.NetworkCallback networkCallback;

    /** Starts the service when the user turned notifications on and they are allowed. */
    static void startIfEnabled(Context context) {
        start(context, null);
    }

    /** The app came to the front: poll now instead of finishing a pause. */
    static void kick(Context context) {
        start(context, alive ? ACTION_KICK : null);
    }

    private static void start(Context context, String action) {
        if (!NotifyPrefs.enabled(context) || !Notices.allowed(context)) return;
        try {
            context.startService(new Intent(context, NotifyService.class).setAction(action));
        } catch (IllegalStateException e) {
            // Android refuses a start from the background when the app may not
            // run there (battery optimisation on); the next app launch starts it.
            NotifyPrefs.log(context, "后台服务无法启动：未允许后台运行");
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, NotifyService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        alive = true;
        NotifyPrefs.log(this, "后台服务启动");
        Notices.ensureChannels(this);
        PowerManager power = getSystemService(PowerManager.class);
        wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dshbot:notify");
        wake.setReferenceCounted(false);
        // A new default network (Wi-Fi to mobile data and back) leaves the open
        // poll on the old one, where it may hang: drop it and poll again.
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            private boolean first = true;

            @Override
            public void onAvailable(Network network) {
                if (first) {
                    first = false;
                    return;
                }
                nudge(true, true);
            }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        boolean working = worker != null && worker.isAlive();
        if (working && (ACTION_ALARM.equals(action) || ACTION_KICK.equals(action))) {
            nudge(ACTION_KICK.equals(action), false);
            return START_STICKY;
        }
        if (!NotifyPrefs.enabled(this) || !Notices.allowed(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (worker == null || !worker.isAlive()) {
            // Started at boot no WebView exists yet: set up the cookie store on
            // the main thread before the worker reads it.
            CookieManager.getInstance();
            running = true;
            worker = new Thread(this::loop, "dsh-notify");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        alive = false;
        NotifyPrefs.log(this, "后台服务停止");
        HttpURLConnection open = current;
        if (open != null) open.disconnect();
        if (worker != null) worker.interrupt();
        getSystemService(AlarmManager.class).cancel(alarm());
        if (networkCallback != null) getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback);
        if (wake.isHeld()) wake.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void loop() {
        int failures = 0;
        while (running) {
            wake.acquire(WAKE_MS);
            long pause;
            try {
                pause = pollOnce();
                failures = 0;
            } catch (JSONException e) {
                failures++;
                NotifyPrefs.setLastPoll(this, "bad-answer");
                pause = PollPlan.backoffMs(failures);
            } catch (IOException e) {
                failures++;
                NotifyPrefs.setLastPoll(this, running ? "network" : "stopped");
                pause = PollPlan.backoffMs(failures);
            }
            if (pause > 0 && !pause(pause)) return;
        }
        if (wake.isHeld()) wake.release();
    }

    /** One long poll; returns how long to pause before the next one. */
    private long pollOnce() throws IOException, JSONException {
        String base = NotifyPrefs.baseUrl(this);
        String cookie = base == null ? null : CookieManager.getInstance().getCookie(base);
        // Not logged in yet (or logged out): wait quietly; only a server that
        // refuses the login counts as lost.
        if (base == null || cookie == null || cookie.isEmpty()) {
            NotifyPrefs.setLastPoll(this, "no-login");
            return IDLE_MS;
        }
        String boot = NotifyPrefs.boot(this);
        long since = NotifyPrefs.since(this);
        JSONObject body = new JSONObject().put("waitMs", WAIT_MS);
        if (boot != null && since >= 0) body.put("boot", boot).put("since", since);

        HttpURLConnection http = post(base, cookie, body, READ_TIMEOUT_MS);
        current = http;
        pollStartedAt = SystemClock.elapsedRealtime();
        try {
            // The request is out; wait for the answer without keeping the CPU up.
            // The alarm checks on this poll in case the connection died silently.
            armAlarm(pollStartedAt + READ_TIMEOUT_MS + 5_000);
            wake.release();
            int status;
            try {
                status = http.getResponseCode();
            } finally {
                wake.acquire(WAKE_MS);
            }
            switch (PollPlan.outcomeOf(status)) {
                case LOGIN_LOST:
                    NotifyPrefs.setLastPoll(this, "login-lost");
                    loginLost();
                    return IDLE_MS;
                case NOT_INSTALLED:
                    NotifyPrefs.setLastPoll(this, "not-installed");
                    return NOT_INSTALLED_MS;
                case RETRY:
                    NotifyPrefs.setLastPoll(this, "http-" + status);
                    throw new IOException("HTTP " + status);
                default:
                    break;
            }
            JSONObject answer = new JSONObject(read(http.getInputStream()));
            JSONObject value = answer.optJSONObject("value");
            if (!answer.optBoolean("ok") || value == null) throw new JSONException("bad answer");
            NotifyPrefs.setLoginLost(this, false);
            NotifyPrefs.setLastPoll(this, "ok");
            List<Notices.Notice> notices = parse(value.optJSONArray("events"));
            for (Notices.Notice notice : notices) {
                NotifyPrefs.log(this, "收到：" + Notices.titleOf(notice) + "（" + notice.kind + "）");
                Notices.show(this, notice);
            }
            NotifyPrefs.saveCursor(this, value.getString("boot"), value.getLong("seq"));
            return 0;
        } finally {
            current = null;
            http.disconnect();
        }
    }

    /** A POST to the server's dsh-notify route with the WebView's login cookie. */
    static HttpURLConnection post(String base, String cookie, JSONObject body, int readTimeoutMs) throws IOException {
        HttpURLConnection http = (HttpURLConnection) new URL(base + PATH).openConnection();
        http.setRequestMethod("POST");
        http.setInstanceFollowRedirects(false);
        http.setConnectTimeout(15_000);
        http.setReadTimeout(readTimeoutMs);
        http.setDoOutput(true);
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        // Fixed length: the request is sent while writing, before the caller waits.
        http.setFixedLengthStreamingMode(payload.length);
        http.setRequestProperty("content-type", "application/json");
        http.setRequestProperty("accept", "application/json");
        http.setRequestProperty("cookie", cookie);
        http.setRequestProperty("origin", base);
        http.setRequestProperty("referer", base + "/");
        try (OutputStream out = http.getOutputStream()) {
            out.write(payload);
        }
        return http;
    }

    /**
     * The 发送测试通知 button: asks the server for a test notice, which the
     * running poll then delivers. Returns what happened, as a status code
     * the setup page explains. Blocking; call off the main thread.
     */
    static String sendTest(Context context) {
        String base = NotifyPrefs.baseUrl(context);
        String cookie = base == null ? null : CookieManager.getInstance().getCookie(base);
        if (base == null || cookie == null || cookie.isEmpty()) return "no-login";
        HttpURLConnection http = null;
        try {
            http = post(base, cookie, new JSONObject().put("test", true), 15_000);
            int status = http.getResponseCode();
            switch (PollPlan.outcomeOf(status)) {
                case LOGIN_LOST:
                    return "login-lost";
                case NOT_INSTALLED:
                    return "not-installed";
                case RETRY:
                    return "http-" + status;
                default:
                    break;
            }
            JSONObject answer = new JSONObject(read(http.getInputStream()));
            return answer.optBoolean("ok") ? "sent" : "bad-answer";
        } catch (JSONException e) {
            return "bad-answer";
        } catch (IOException e) {
            return "network";
        } finally {
            if (http != null) http.disconnect();
        }
    }

    /**
     * The 诊断记录 button: what the server's plugin saw and decided for the
     * last turns ({"debug": true}), or why it could not be asked. Blocking.
     */
    static JSONObject serverDiagnostics(Context context) {
        JSONObject result = new JSONObject();
        String base = NotifyPrefs.baseUrl(context);
        String cookie = base == null ? null : CookieManager.getInstance().getCookie(base);
        HttpURLConnection http = null;
        try {
            if (base == null || cookie == null || cookie.isEmpty()) return result.put("error", "no-login");
            http = post(base, cookie, new JSONObject().put("debug", true), 15_000);
            int status = http.getResponseCode();
            if (status != 200) return result.put("error", "http-" + status);
            JSONObject answer = new JSONObject(read(http.getInputStream()));
            JSONObject value = answer.optJSONObject("value");
            // A plugin older than 0.1.3 does not know the request and answers a poll.
            if (value == null || !value.has("decisions")) return result.put("error", "old-plugin");
            return value;
        } catch (JSONException e) {
            return result;
        } catch (IOException e) {
            try {
                return result.put("error", "network");
            } catch (JSONException ignored) {
                return result;
            }
        } finally {
            if (http != null) http.disconnect();
        }
    }

    private void loginLost() {
        if (NotifyPrefs.loginLost(this)) return;
        NotifyPrefs.setLoginLost(this, true);
        Notices.showLoginLost(this);
    }

    private static List<Notices.Notice> parse(JSONArray events) {
        List<Notices.Notice> notices = new ArrayList<>();
        if (events == null) return notices;
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null) continue;
            notices.add(new Notices.Notice(
                event.optString("kind", "reply"),
                event.has("sessionId") ? event.optString("sessionId") : null,
                event.optString("title", ""),
                event.has("who") ? event.optString("who") : null,
                event.optString("text", "")));
        }
        return notices;
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = stream.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    /**
     * Waits {@code ms} of real time (sleep included), or until kicked. The
     * alarm wakes the phone when the pause is over.
     */
    private boolean pause(long ms) {
        long until = SystemClock.elapsedRealtime() + ms;
        armAlarm(until);
        synchronized (lock) {
            wake.release();
            try {
                while (running && !kicked) {
                    long left = until - SystemClock.elapsedRealtime();
                    if (left <= 0) break;
                    lock.wait(left);
                }
            } catch (InterruptedException e) {
                return false;
            }
            kicked = false;
        }
        return running;
    }

    /**
     * Something happened (the alarm, the app opening, a network change):
     * drop a poll that is overdue or on an old network, and end a pause that
     * is over or should be cut short.
     */
    private void nudge(boolean now, boolean dropPoll) {
        wake.acquire(WAKE_MS);
        HttpURLConnection open = current;
        if (open != null && (dropPoll || SystemClock.elapsedRealtime() - pollStartedAt > READ_TIMEOUT_MS)) open.disconnect();
        synchronized (lock) {
            if (now) kicked = true;
            lock.notifyAll();
        }
    }

    private void armAlarm(long atElapsed) {
        getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsed, alarm());
    }

    private PendingIntent alarm() {
        Intent intent = new Intent(this, NotifyService.class).setAction(ACTION_ALARM);
        return PendingIntent.getService(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
