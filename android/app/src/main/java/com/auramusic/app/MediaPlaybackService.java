package com.auramusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaPlaybackService extends Service {

    public static final String CHANNEL_ID = "soundwave_media_playback";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_STOP_SERVICE = "com.auramusic.app.ACTION_STOP_SERVICE";

    private final IBinder binder = new LocalBinder();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private MediaSessionCompat mediaSession;
    private NotificationManagerCompat notificationManager;
    private PowerManager.WakeLock wakeLock;
    private boolean isBecomingNoisyRegistered = false;

    private String currentTitle = "Soundwave";
    private String currentArtist = "Playing";
    private String currentAlbum = "";
    private String currentArtworkUrl = "";
    private Bitmap cachedArtwork = null;
    private boolean isPlaying = false;
    private long currentDuration = 0;
    private long currentPosition = 0;

    public class LocalBinder extends Binder {
        public MediaPlaybackService getService() {
            return MediaPlaybackService.this;
        }
    }

    private final BroadcastReceiver becomingNoisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                if (MediaNotificationPlugin.instance != null) {
                    MediaNotificationPlugin.instance.handleAction("pause");
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        initWakeLock();
    }

    private void startForegroundSynchronously() {
        try {
            Notification notification = buildNotification(
                currentTitle,
                currentArtist,
                currentAlbum,
                currentDuration,
                currentPosition,
                isPlaying
            );
            int serviceType = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            }
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType);
        } catch (Exception e) {
            // ignore
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Music Playback Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for active background music playback");
            channel.setShowBadge(false);
            channel.setSound(null, null);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
        notificationManager = NotificationManagerCompat.from(this);
    }

    private void initMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSessionCompat(this, "SoundwaveMediaSession");
            mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            );

            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    if (MediaNotificationPlugin.instance != null) {
                        MediaNotificationPlugin.instance.handleAction("play");
                    }
                }

                @Override
                public void onPause() {
                    if (MediaNotificationPlugin.instance != null) {
                        MediaNotificationPlugin.instance.handleAction("pause");
                    }
                }

                @Override
                public void onSkipToNext() {
                    if (MediaNotificationPlugin.instance != null) {
                        MediaNotificationPlugin.instance.handleAction("next");
                    }
                }

                @Override
                public void onSkipToPrevious() {
                    if (MediaNotificationPlugin.instance != null) {
                        MediaNotificationPlugin.instance.handleAction("prev");
                    }
                }

                @Override
                public void onSeekTo(long pos) {
                    if (MediaNotificationPlugin.instance != null) {
                        MediaNotificationPlugin.instance.handleSeek(pos);
                    }
                }
            });

            PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PLAY_PAUSE)
                .setState(PlaybackStateCompat.STATE_PAUSED, 0, 0f);
            mediaSession.setPlaybackState(stateBuilder.build());
            mediaSession.setActive(false);
        }
    }

    private void initWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "soundwave:playback_wakelock");
            wakeLock.setReferenceCounted(false);
        }
    }

    public MediaSessionCompat getMediaSession() {
        return mediaSession;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP_SERVICE.equals(action)) {
                stopPlayback();
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        return START_NOT_STICKY;
    }

    public void updateTrack(
        String title,
        String artist,
        String album,
        String artworkUrl,
        boolean playing,
        long duration,
        long position
    ) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "Soundwave";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Playing";
        this.currentAlbum = album != null ? album : "";
        this.isPlaying = playing;
        this.currentDuration = duration;
        this.currentPosition = position;

        if (playing) {
            acquireWakeLock();
            registerNoisyReceiver();
        } else {
            releaseWakeLock();
            unregisterNoisyReceiver();
        }

        executor.execute(() -> {
            try {
                if (artworkUrl != null && !artworkUrl.isEmpty() && !artworkUrl.equals(currentArtworkUrl)) {
                    currentArtworkUrl = artworkUrl;
                    cachedArtwork = downloadBitmap(artworkUrl);
                } else if (artworkUrl == null || artworkUrl.isEmpty()) {
                    cachedArtwork = null;
                }

                Notification notification = buildNotification(
                    currentTitle,
                    currentArtist,
                    currentAlbum,
                    currentDuration,
                    currentPosition,
                    isPlaying
                );

                if (isPlaying) {
                    int serviceType = 0;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                    }
                    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType);
                } else {
                    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
                    notificationManager.notify(NOTIFICATION_ID, notification);
                }
            } catch (Exception e) {
                // Ignore notification update errors
            }
        });
    }

    private Notification buildNotification(
        String title,
        String artist,
        String album,
        long durationSec,
        long positionSec,
        boolean playing
    ) {
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
        mediaSession.setActive(playing);

        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, flag);

        Intent prevIntent = new Intent(this, MediaActionReceiver.class).setAction("com.auramusic.app.ACTION_PREV");
        PendingIntent prevPendingIntent = PendingIntent.getBroadcast(this, 1, prevIntent, flag);

        String toggleAction = playing ? "com.auramusic.app.ACTION_PAUSE" : "com.auramusic.app.ACTION_PLAY";
        Intent toggleIntent = new Intent(this, MediaActionReceiver.class).setAction(toggleAction);
        PendingIntent togglePendingIntent = PendingIntent.getBroadcast(this, 2, toggleIntent, flag);

        Intent nextIntent = new Intent(this, MediaActionReceiver.class).setAction("com.auramusic.app.ACTION_NEXT");
        PendingIntent nextPendingIntent = PendingIntent.getBroadcast(this, 3, nextIntent, flag);

        int smallIcon = android.R.drawable.ic_media_play;
        int playPauseIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = playing ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
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

        return builder.build();
    }

    public void stopPlayback() {
        isPlaying = false;
        releaseWakeLock();
        unregisterNoisyReceiver();

        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // Max 12 hours safety
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private void registerNoisyReceiver() {
        if (!isBecomingNoisyRegistered) {
            registerReceiver(becomingNoisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            isBecomingNoisyRegistered = true;
        }
    }

    private void unregisterNoisyReceiver() {
        if (isBecomingNoisyRegistered) {
            try {
                unregisterReceiver(becomingNoisyReceiver);
            } catch (Exception e) {
                // ignore
            }
            isBecomingNoisyRegistered = false;
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

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        stopPlayback();
        super.onDestroy();
    }
}
