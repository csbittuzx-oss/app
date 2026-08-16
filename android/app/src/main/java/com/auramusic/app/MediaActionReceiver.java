package com.auramusic.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MediaActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (MediaNotificationPlugin.instance != null) {
            MediaNotificationPlugin.instance.handleAction(action);
        }
    }
}
