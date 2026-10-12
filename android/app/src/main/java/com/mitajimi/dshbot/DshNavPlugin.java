package com.mitajimi.dshbot;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens the user's DSH web server with a native WebView.loadUrl(), and keeps
 * that server inside the app.
 *
 * Why native: dsh web answers /?token=… with a SameSite=Strict session
 * cookie and a 303 to ./ . A navigation started by script on the
 * https://localhost setup page is cross-site, so the browser drops the
 * Strict cookie on that redirect and the server replies 401
 * ("dsh web authentication required"). loadUrl() has no initiating page,
 * so it behaves like typing the link into the address bar.
 *
 * The app is not tied to one server: whatever http(s) address the user
 * logs in to becomes "the server". Its origin is remembered, and
 * {@link #shouldOverrideLoad} keeps navigation to it in the WebView; every
 * other site still opens in the system browser (Capacitor's default). The
 * server is loaded directly, not through Capacitor's proxy, so its pages get
 * no access to the app's native plugins.
 */
@CapacitorPlugin(name = "DshNav")
public class DshNavPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        Uri u = url == null ? null : Uri.parse(url);
        String origin = u == null ? null : originOf(u.getScheme(), u.getHost(), u.getPort(), u.getUserInfo());
        if (origin == null) {
            call.reject("url not allowed");
            return;
        }
        // The server the app now belongs to; the notice service polls it too.
        NotifyPrefs.setBaseUrl(getContext(), origin);
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().loadUrl(url);
            call.resolve();
            NotifyService.startIfEnabled(getContext());
        });
    }

    /** Navigation to the user's server stays in the app; anything else keeps Capacitor's default. */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String saved = NotifyPrefs.baseUrl(getContext());
        if (saved == null || url == null) return null;
        String origin = originOf(url.getScheme(), url.getHost(), url.getPort(), url.getUserInfo());
        return saved.equals(origin) ? Boolean.FALSE : null;
    }

    /**
     * {@code scheme://host[:port]} for an http(s) address, or null for
     * anything else (other schemes, no host, user info that would hide the
     * real host). Pure, so it is unit-tested.
     */
    static String originOf(String scheme, String host, int port, String userInfo) {
        if (!"https".equals(scheme) && !"http".equals(scheme)) return null;
        if (host == null || host.isEmpty() || userInfo != null) return null;
        String origin = scheme + "://" + host.toLowerCase(java.util.Locale.ROOT);
        boolean defaultPort = port == -1 || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80);
        return defaultPort ? origin : origin + ":" + port;
    }
}
