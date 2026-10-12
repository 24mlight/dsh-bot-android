package com.mitajimi.dshbot;

import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final long BAR_POLL_MS = 500;

    private OnBackPressedCallback backCallback;
    private final Handler barHandler = new Handler(Looper.getMainLooper());
    private final Runnable barPoll = new Runnable() {
        @Override
        public void run() {
            syncSystemBars();
            barHandler.postDelayed(this, BAR_POLL_MS);
        }
    };
    private String barScript;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The system launch screen is the plain launch colour; the Orbit
        // animation plays on the setup page (www/index.html, #intro), which
        // starts from that same colour. Played by the system it froze on its
        // first frame on some phones while the WebView started up.
        SplashScreen.installSplashScreen(this);
        // Local plugins must be registered before the bridge starts.
        registerPlugin(DshNavPlugin.class);
        registerPlugin(DshNotifyPlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor core does not handle WebView back navigation (that lives in
        // @capacitor/app). Dialogs in DSH create no history entries, so first ask
        // the page to close an open dialog; if none is open, go back in WebView
        // history so the back button returns from DSH to the setup page; otherwise
        // use the system default.
        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                String js = webView != null ? closeModalScript() : null;
                if (js == null) {
                    goBackOrDefault(webView);
                    return;
                }
                webView.evaluateJavascript(js, result -> {
                    if (!"true".equals(result)) goBackOrDefault(webView);
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
        // Keep the gesture bar the same colour as the page instead of a
        // system-tinted scrim.
        getWindow().setNavigationBarContrastEnforced(false);
        // DSH and the setup page have their own dark and light looks (they
        // follow prefers-color-scheme); the system must not darken them on top.
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.setForceDarkAllowed(false);
            if (Build.VERSION.SDK_INT >= 33) webView.getSettings().setAlgorithmicDarkeningAllowed(false);
            // The WebView is the whole app: let it draw the parts just off
            // screen ahead of time, so a quick fling does not show blank tiles.
            webView.getSettings().setOffscreenPreRaster(true);
        }
        preferFastestRefresh();
    }

    @Override
    public void onResume() {
        super.onResume();
        preferFastestRefresh();
        Notices.clearMessages(this);
        // Notifications on: make sure the notice service runs (it may have been
        // stopped while the app was closed) and polls now, not after a pause.
        NotifyService.kick(this);
        barHandler.post(barPoll);
    }

    @Override
    public void onPause() {
        barHandler.removeCallbacks(barPoll);
        super.onPause();
    }

    /**
     * The status bar and gesture bar are native, so the page's CSS cannot reach
     * them, and Capacitor colours them from the phone's system theme, which can
     * disagree with DSH's own light/dark switch (light bar, white icons).
     * Read the page's background colour and paint both bars with it, picking
     * dark or light icons to match.
     */
    private void syncSystemBars() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;
        if (barScript == null) barScript = readAsset("dsh-bar-color.js");
        if (barScript == null) return;
        webView.evaluateJavascript(barScript, result -> {
            int color = SystemBarTheme.parse(result);
            if (color == 0) return;
            Window window = getWindow();
            // Capacitor repaints the bars from the phone's theme on every page load and
            // theme change, so compare with what is on screen instead of remembering
            // what was applied.
            Drawable current = window.getDecorView().getBackground();
            boolean painted = current instanceof ColorDrawable && ((ColorDrawable) current).getColor() == color;
            if (!painted) window.getDecorView().setBackgroundColor(color);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            boolean light = SystemBarTheme.isLight(color);
            bars.setAppearanceLightStatusBars(light);
            bars.setAppearanceLightNavigationBars(light);
        });
    }

    /**
     * Ask for the screen's fastest refresh rate at its current resolution.
     * Many phones run an app (and its WebView) at 60Hz unless the window asks
     * for more, so on a 120Hz screen scrolling and animations showed half the
     * frames they could.
     */
    @SuppressWarnings("deprecation")
    private void preferFastestRefresh() {
        Display display = Build.VERSION.SDK_INT >= 30 ? getDisplay() : getWindowManager().getDefaultDisplay();
        if (display == null) return;
        Display.Mode current = display.getMode();
        Display.Mode[] modes = display.getSupportedModes();
        if (current == null || modes == null) return;
        int n = modes.length;
        int[] ids = new int[n];
        int[] widths = new int[n];
        int[] heights = new int[n];
        float[] rates = new float[n];
        for (int i = 0; i < n; i++) {
            ids[i] = modes[i].getModeId();
            widths[i] = modes[i].getPhysicalWidth();
            heights[i] = modes[i].getPhysicalHeight();
            rates[i] = modes[i].getRefreshRate();
        }
        int want = DisplayModes.fastest(current.getModeId(), ids, widths, heights, rates);
        Window window = getWindow();
        WindowManager.LayoutParams params = window.getAttributes();
        if (params.preferredDisplayModeId == want) return;
        params.preferredDisplayModeId = want;
        window.setAttributes(params);
    }

    private void goBackOrDefault(WebView webView) {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        backCallback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        backCallback.setEnabled(true);
    }

    /** Script that closes the topmost open dialog and returns true, or false if none. */
    private String closeModalScript() {
        return readAsset("dsh-close-modal.js");
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return null;
        }
    }
}
