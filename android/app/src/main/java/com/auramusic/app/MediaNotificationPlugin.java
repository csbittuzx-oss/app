package com.auramusic.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
    private static final String CHANNEL_ID = "soundwave_media_playback";
    private static final int NOTIFICATION_ID = 1001;

    private MediaSessionCompat mediaSession;
    private NotificationManagerCompat notificationManager;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private String currentTitle = "";
    private String currentArtist = "";
    private String currentArtworkUrl = "";
    private Bitmap cachedArtwork = null;
    private boolean isPlaying = false;

    @Override
    public void load() {
        super.load();
        instance = this;
        initMediaSession();
        createNotificationChannel();
    }

    private void initMediaSession() {
        Context context = getContext();
        if (mediaSession == null && context != null) {
            mediaSession = new MediaSessionCompat(context, "SoundwaveMediaSession");
            mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            );

            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    handleAction("play");
                }

                @Override
                public void onPause() {
                    handleAction("pause");
                }

                @Override
                public void onSkipToNext() {
                    handleAction("next");
                }

                @Override
                public void onSkipToPrevious() {
                    handleAction("prev");
                }

                @Override
                public void onSeekTo(long pos) {
                    JSObject data = new JSObject();
                    data.put("action", "seekTo");
                    data.put("position", pos / 1000.0);
                    notifyListeners("mediaAction", data);
                }
            });

            mediaSession.setActive(true);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Context context = getContext();
            if (context != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Music Playback",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Controls for active music playback");
                channel.setShowBadge(false);
                channel.setSound(null, null);

                NotificationManager manager = context.getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                }
            }
        }
        if (getContext() != null) {
            notificationManager = NotificationManagerCompat.from(getContext());
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

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String album = call.getString("album", "");
        String artworkUrl = call.getString("artwork", "");
        boolean playing = call.getBoolean("isPlaying", true);
        long duration = call.getLong("duration", 0L);
        long position = call.getLong("position", 0L);

        this.currentTitle = title;
        this.currentArtist = artist;
        this.isPlaying = playing;

        executor.execute(() -> {
            try {
                if (artworkUrl != null && !artworkUrl.isEmpty() && !artworkUrl.equals(currentArtworkUrl)) {
                    currentArtworkUrl = artworkUrl;
                    cachedArtwork = downloadBitmap(artworkUrl);
                } else if (artworkUrl == null || artworkUrl.isEmpty()) {
                    cachedArtwork = null;
                }

                showNotification(title, artist, album, duration, position, playing);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to update media notification: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
            if (mediaSession != null) {
                mediaSession.setActive(false);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to clear notification: " + e.getMessage());
        }
    }

    private void showNotification(
        String title,
        String artist,
        String album,
        long durationSec,
        long positionSec,
        boolean playing
    ) {
        Context context = getContext();
        if (context == null) return;

        if (mediaSession == null) {
            initMediaSession();
        }

        // Update MediaSession state
        long playbackActions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO;

        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(playbackActions)
            .setState(state, positionSec * 1000L, 1.0f);

        mediaSession.setPlaybackState(stateBuilder.build());

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationSec * 1000L);

        if (cachedArtwork != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cachedArtwork);
        }

        mediaSession.setMetadata(metaBuilder.build());
        mediaSession.setActive(true);

        // Intents for notification buttons
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(context, 0, openAppIntent, flag);

        Intent prevIntent = new Intent(context, MediaActionReceiver.class).setAction("com.auramusic.app.ACTION_PREV");
        PendingIntent prevPendingIntent = PendingIntent.getBroadcast(context, 1, prevIntent, flag);

        String toggleAction = playing ? "com.auramusic.app.ACTION_PAUSE" : "com.auramusic.app.ACTION_PLAY";
        Intent toggleIntent = new Intent(context, MediaActionReceiver.class).setAction(toggleAction);
        PendingIntent togglePendingIntent = PendingIntent.getBroadcast(context, 2, toggleIntent, flag);

        Intent nextIntent = new Intent(context, MediaActionReceiver.class).setAction("com.auramusic.app.ACTION_NEXT");
        PendingIntent nextPendingIntent = PendingIntent.getBroadcast(context, 3, nextIntent, flag);

        // Build Notification
        int smallIcon = android.R.drawable.ic_media_play;
        int playPauseIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = playing ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText(album.isEmpty() ? null : album)
            .setContentIntent(contentPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setSilent(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPendingIntent)
            .addAction(playPauseIcon, playPauseTitle, togglePendingIntent)
            .addAction(android.R.drawable.ic_media_next, "Next", nextPendingIntent)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            );

        if (cachedArtwork != null) {
            builder.setLargeIcon(cachedArtwork);
        }

        try {
            notificationManager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException se) {
            // Android 13+ permission not granted yet
        }
    }

    private Bitmap downloadBitmap(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.connect();
            InputStream input = connection.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            return null;
        }
    }
}
