package com.mitajimi.dshbot;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONException;

/**
 * The 消息通知 switch on the setup page (www/notify.js): turns the notice
 * service on and off, asks for the notification permission (Android 13+),
 * and opens the system pages where the user allows banners, the lock screen,
 * background running and auto-start.
 */
@CapacitorPlugin(
    name = "DshNotify",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DshNotifyPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context context = getContext();
        if (!on) {
            NotifyPrefs.setEnabled(context, false);
            NotifyService.stop(context);
            call.resolve(status());
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        turnOn(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        turnOn(call);
    }

    private void turnOn(PluginCall call) {
        Context context = getContext();
        Notices.ensureChannels(context);
        NotifyPrefs.setEnabled(context, true);
        NotifyService.startIfEnabled(context);
        call.resolve(status());
    }

    /** 发送测试通知: the server pushes a test notice back through the poll. */
    @PluginMethod
    public void sendTest(PluginCall call) {
        Context context = getContext();
        new Thread(() -> {
            String result = NotifyService.sendTest(context);
            JSObject answer = status();
            answer.put("test", result);
            call.resolve(answer);
        }, "dsh-notify-test").start();
    }

    /** 诊断记录: the app's own log and what the server decided, for a screenshot. */
    @PluginMethod
    public void diagnostics(PluginCall call) {
        Context context = getContext();
        new Thread(() -> {
            JSObject answer = status();
            try {
                answer.put("log", new JSArray(NotifyPrefs.log(context).toString()));
                answer.put("server", new JSObject(NotifyService.serverDiagnostics(context).toString()));
            } catch (JSONException e) {
                call.reject("diagnostics failed");
                return;
            }
            call.resolve(answer);
        }, "dsh-notify-diagnostics").start();
    }

    /** The app's notification page: banners, lock screen, sound, per channel. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        open(call, intent);
    }

    /**
     * Background running: first the "don't optimise battery" prompt, then the
     * app's info page, where phones with an auto-start switch keep it.
     */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent = batteryExempt()
            ? new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()))
            : new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
        open(call, intent);
    }

    private void open(PluginCall call, Intent intent) {
        try {
            getActivity().startActivity(intent);
            call.resolve(status());
        } catch (Exception e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName())));
                call.resolve(status());
            } catch (Exception again) {
                call.reject("cannot open settings");
            }
        }
    }

    private boolean batteryExempt() {
        PowerManager power = getContext().getSystemService(PowerManager.class);
        return power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject status() {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("enabled", NotifyPrefs.enabled(context));
        result.put("allowed", Notices.allowed(context));
        result.put("batteryExempt", batteryExempt());
        result.put("loggedIn", NotifyPrefs.baseUrl(context) != null);
        result.put("loginLost", NotifyPrefs.loginLost(context));
        result.put("lastPoll", NotifyPrefs.lastPoll(context));
        result.put("lastPollAt", NotifyPrefs.lastPollAt(context));
        return result;
    }
}
