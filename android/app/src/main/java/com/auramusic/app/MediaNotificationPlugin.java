package com.auramusic.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "MediaNotification",
    permissions = {
        @Permission(
            strings = { "android.permission.POST_NOTIFICATIONS" },
            alias = "notifications"
        )
    }
)
public class MediaNotificationPlugin extends Plugin {

    public static MediaNotificationPlugin instance;
    private MediaPlaybackService playbackService;
    private boolean isBound = false;

    private Runnable pendingUpdateRunnable = null;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            MediaPlaybackService.LocalBinder binder = (MediaPlaybackService.LocalBinder) service;
            playbackService = binder.getService();
            isBound = true;
            if (pendingUpdateRunnable != null) {
                pendingUpdateRunnable.run();
                pendingUpdateRunnable = null;
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            isBound = false;
            playbackService = null;
        }
    };

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    private void ensureServiceRunning() {
        Context context = getContext();
        if (context != null) {
            Intent intent = new Intent(context, MediaPlaybackService.class);
            try {
                ContextCompat.startForegroundService(context, intent);
            } catch (Exception e) {
                try {
                    context.startService(intent);
                } catch (Exception ex) {
                    // ignore
                }
            }
            if (!isBound) {
                context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
            }
        }
    }

    public void handleAction(String action) {
        String eventName = action;
        if (action.endsWith(".ACTION_PLAY") || action.equals("play")) eventName = "play";
        else if (action.endsWith(".ACTION_PAUSE") || action.equals("pause")) eventName = "pause";
        else if (action.endsWith(".ACTION_NEXT") || action.equals("next")) eventName = "next";
        else if (action.endsWith(".ACTION_PREV") || action.equals("prev")) eventName = "prev";

        JSObject data = new JSObject();
        data.put("action", eventName);
        notifyListeners("mediaAction", data);
    }

    public void handleSeek(long posMs) {
        JSObject data = new JSObject();
        data.put("action", "seekTo");
        data.put("position", posMs / 1000.0);
        notifyListeners("mediaAction", data);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String album = call.getString("album", "");
        String artworkUrl = call.getString("artwork", "");
        boolean playing = call.getBoolean("isPlaying", true);
        long duration = call.getLong("duration", 0L);
        long position = call.getLong("position", 0L);

        if (playing) {
            ensureServiceRunning();
        }

        if (playbackService != null) {
            playbackService.updateTrack(title, artist, album, artworkUrl, playing, duration, position);
        } else if (playing) {
            pendingUpdateRunnable = () -> {
                if (playbackService != null) {
                    playbackService.updateTrack(title, artist, album, artworkUrl, true, duration, position);
                }
            };
        }

        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        pendingUpdateRunnable = null;
        if (playbackService != null) {
            playbackService.stopPlayback();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        pendingUpdateRunnable = null;
        playbackService = null;
        if (isBound && getContext() != null) {
            try {
                getContext().unbindService(serviceConnection);
            } catch (Exception e) {
                // ignore
            }
            isBound = false;
        }
        super.handleOnDestroy();
    }
}
