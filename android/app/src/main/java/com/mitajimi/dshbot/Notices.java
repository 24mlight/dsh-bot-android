package com.mitajimi.dshbot;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * The app's notification channels and the notifications it posts.
 *
 * "消息" is high importance, so Android shows a heads-up banner, and public on
 * the lock screen; banners, lock screen and sound can be changed per channel
 * in the system settings, the same way as for any other app.
 *
 * There is no ongoing notice: the background service posts nothing of its
 * own. The channels earlier versions used for 消息通知已开启 are deleted.
 */
final class Notices {
    static final String CHANNEL_MESSAGES = "messages";
    private static final String[] OLD_CHANNELS = { "connection", "connection-hidden" };
    private static final int NOTICE_ID = 2;
    private static final String LOGIN_TAG = "login";
    private static final String GROUP = "dsh";

    private Notices() {}

    static void ensureChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel messages = new NotificationChannel(CHANNEL_MESSAGES, "消息", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Bot、群聊和 DSH Agent 的回复");
        messages.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        messages.enableVibration(true);
        manager.createNotificationChannel(messages);
        for (String old : OLD_CHANNELS) manager.deleteNotificationChannel(old);
    }

    /** Whether posting notifications is allowed (permission on Android 13+, app switch). */
    static boolean allowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** One notice from the server; the newest per conversation replaces the last. */
    static void show(Context context, Notice notice) {
        if (!allowed(context)) return;
        String line = lineOf(notice);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_dsh)
            .setContentTitle(titleOf(notice))
            .setContentText(line)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(line))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setGroup(GROUP)
            .setContentIntent(openApp(context))
            .build();
        notify(context, notice.sessionId == null ? "dsh" : notice.sessionId, notification);
    }

    /** Said once when the server stops accepting the saved login. */
    static void showLoginLost(Context context) {
        if (!allowed(context)) return;
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_dsh)
            .setContentTitle("消息通知已暂停")
            .setContentText("登录已失效，打开 App 重新登录后会自动恢复")
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build();
        notify(context, LOGIN_TAG, notification);
    }

    private static void notify(Context context, String tag, Notification notification) {
        try {
            NotificationManagerCompat.from(context).notify(tag, NOTICE_ID, notification);
        } catch (SecurityException ignored) {
            // Permission withdrawn between the check and the post.
        }
    }

    /** Clears the message notifications (the app was opened). */
    static void clearMessages(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            if (posted.getId() == NOTICE_ID) manager.cancel(posted.getTag(), posted.getId());
        }
    }

    static String titleOf(Notice notice) {
        String title = notice.title == null || notice.title.isEmpty() ? "DSH" : notice.title;
        return "question".equals(notice.kind) ? title + " 在问你" : title;
    }

    static String lineOf(Notice notice) {
        String text = notice.text == null ? "" : notice.text;
        if (notice.who != null && !notice.who.isEmpty()) return notice.who + "：" + text;
        return text;
    }

    /** One notice as the server sends it (see lib/tracker.js in github.com/24mlight/dsh-notify-plugin). */
    static final class Notice {
        final String kind;
        final String sessionId;
        final String title;
        final String who;
        final String text;

        Notice(String kind, String sessionId, String title, String who, String text) {
            this.kind = kind;
            this.sessionId = sessionId;
            this.title = title;
            this.who = who;
            this.text = text;
        }
    }
}
