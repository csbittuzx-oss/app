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
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
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
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean isBecomingNoisyRegistered = false;
    private boolean hasAudioFocus = false;

    private String currentTitle = "Soundwave";
    private String currentArtist = "Playing";
    private String currentAlbum = "Soundwave";
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
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannel();
        initMediaSession();
        initLocks();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Music Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for active background music playback");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

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

                @Override
                public void onStop() {
                    stopPlayback();
                    stopSelf();
                }
            });

            PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY |
                    PlaybackStateCompat.ACTION_PAUSE |
                    PlaybackStateCompat.ACTION_PLAY_PAUSE |
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackStateCompat.ACTION_SEEK_TO |
                    PlaybackStateCompat.ACTION_STOP
                )
                .setState(PlaybackStateCompat.STATE_PAUSED, 0, 0f, SystemClock.elapsedRealtime());

            mediaSession.setPlaybackState(stateBuilder.build());
            mediaSession.setActive(true);
        }
    }

    private void initLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "soundwave:playback_wakelock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int wifiMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(wifiMode, "soundwave:wifi_lock");
                wifiLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}
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
        this.currentAlbum = (album != null && !album.isEmpty()) ? album : "Soundwave";
        this.isPlaying = playing;
        this.currentDuration = duration;
        this.currentPosition = position;

        if (playing) {
            if (!hasAudioFocus) {
                requestAudioFocus();
            }
            acquireLocks();
            registerNoisyReceiver();
        } else {
            releaseLocks();
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

        // Update MediaSession state with elapsedRealtime for smooth live seekbar rendering in Android 13+
        long playbackActions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO
            | PlaybackStateCompat.ACTION_STOP;

        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        float speed = playing ? 1.0f : 0.0f;

        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(playbackActions)
            .setState(state, positionSec * 1000L, speed, SystemClock.elapsedRealtime());

        mediaSession.setPlaybackState(stateBuilder.build());

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationSec * 1000L);

        if (cachedArtwork != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cachedArtwork);
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, cachedArtwork);
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, cachedArtwork);
        }

        mediaSession.setMetadata(metaBuilder.build());
        mediaSession.setActive(true);

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
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
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

    private void requestAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        }
        if (audioManager != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                    audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(playbackAttributes)
                        .setAcceptsDelayedFocusGain(true)
                        .setOnAudioFocusChangeListener(focusChange -> {
                            // Only handle true permanent focus loss, ignore transient focus shifts
                            if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                hasAudioFocus = false;
                                if (MediaNotificationPlugin.instance != null) {
                                    MediaNotificationPlugin.instance.handleAction("pause");
                                }
                            } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                                hasAudioFocus = true;
                            }
                        })
                        .build();
                    int res = audioManager.requestAudioFocus(audioFocusRequest);
                    hasAudioFocus = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
                } else {
                    int res = audioManager.requestAudioFocus(
                        focusChange -> {
                            if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                hasAudioFocus = false;
                                if (MediaNotificationPlugin.instance != null) {
                                    MediaNotificationPlugin.instance.handleAction("pause");
                                }
                            } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                                hasAudioFocus = true;
                            }
                        },
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN
                    );
                    hasAudioFocus = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
                }
            } catch (Exception ignored) {}
        }
    }

    private void abandonAudioFocus() {
        if (audioManager != null && hasAudioFocus) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else {
                    audioManager.abandonAudioFocus(null);
                }
            } catch (Exception ignored) {}
            hasAudioFocus = false;
        }
    }

    public void stopPlayback() {
        isPlaying = false;
        releaseLocks();
        abandonAudioFocus();
        unregisterNoisyReceiver();

        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    }

    private void acquireLocks() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours safety lock
            } catch (Exception ignored) {}
        }
        if (wifiLock != null && !wifiLock.isHeld()) {
            try {
                wifiLock.acquire();
            } catch (Exception ignored) {}
        }
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Exception ignored) {}
        }
    }

    private void registerNoisyReceiver() {
        if (!isBecomingNoisyRegistered) {
            try {
                registerReceiver(becomingNoisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
                isBecomingNoisyRegistered = true;
            } catch (Exception ignored) {}
        }
    }

    private void unregisterNoisyReceiver() {
        if (isBecomingNoisyRegistered) {
            try {
                unregisterReceiver(becomingNoisyReceiver);
            } catch (Exception ignored) {}
            isBecomingNoisyRegistered = false;
        }
    }

    private Bitmap downloadBitmap(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10)");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.connect();
            InputStream input = connection.getInputStream();
            Bitmap bitmap = BitmapFactory.decodeStream(input);
            if (bitmap != null) {
                // Ensure max dimensions of 512x512 to avoid Binder transaction limit
                int maxDim = 512;
                if (bitmap.getWidth() > maxDim || bitmap.getHeight() > maxDim) {
                    float ratio = Math.min((float) maxDim / bitmap.getWidth(), (float) maxDim / bitmap.getHeight());
                    int width = Math.round(ratio * bitmap.getWidth());
                    int height = Math.round(ratio * bitmap.getHeight());
                    return Bitmap.createScaledBitmap(bitmap, width, height, true);
                }
            }
            return bitmap;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // When the user completely closes/swipes away the app from Recents, stop playback completely
        stopPlayback();
        stopSelf();
        super.onTaskRemoved(rootIntent);
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
