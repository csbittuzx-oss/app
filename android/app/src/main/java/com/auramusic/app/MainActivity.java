package com.auramusic.app;

import android.Manifest;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int NOTIFICATION_PERMISSION_CODE = 101;

    public boolean isTelevision() {
        try {
            UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            if (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) {
                return true;
            }
            PackageManager pm = getPackageManager();
            if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) || pm.hasSystemFeature(PackageManager.FEATURE_TELEVISION)) {
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaNotificationPlugin.class);
        registerPlugin(DolbyAudioPlugin.class);
        registerPlugin(SpotifyImportPlugin.class);
        super.onCreate(savedInstanceState);

        boolean isTv = isTelevision();
        try {
            if (isTv) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            }
        } catch (Exception ignored) {}

        // Configure WebView for seamless background audio playback and TV user agent tagging
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);

                if (isTv) {
                    String currentUa = settings.getUserAgentString();
                    settings.setUserAgentString(currentUa + " AndroidTV/SoundwaveTV");
                }
            }
        } catch (Exception ignored) {}

        // Request POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
        if (!isTv && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_CODE
                );
            }
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Prevent Chromium from pausing HTML5 audio when minimized
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        // Keep audio streaming active when screen locked or app hidden
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) {
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.onResume();
                    webView.resumeTimers();
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        // When the user completely closes the app, terminate background playback service
        try {
            Intent intent = new Intent(this, MediaPlaybackService.class);
            intent.setAction(MediaPlaybackService.ACTION_STOP_SERVICE);
            startService(intent);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
