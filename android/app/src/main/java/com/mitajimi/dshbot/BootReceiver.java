package com.mitajimi.dshbot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Restarts the notice service after the phone boots or the app is updated,
 * when the user has notifications on. On phones with an auto-start switch
 * (MIUI/HyperOS, ColorOS, …) this only runs once the user allows auto-start.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            NotifyService.startIfEnabled(context);
        }
    }
}
