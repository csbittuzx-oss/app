# ═══════════════════════════════════════════════════════════════════
#  Soundwave R8 & ProGuard Optimization Rules
# ═══════════════════════════════════════════════════════════════════

# Capacitor Framework & Plugins
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * implements com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}

# Android WebKit JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Native Android Media Session & Notifications
-keep class androidx.media.** { *; }
-keep class androidx.core.app.NotificationCompat** { *; }
-keep class com.auramusic.app.MediaActionReceiver { *; }
-keep class com.auramusic.app.MediaPlaybackService { *; }
-keep class com.auramusic.app.MainActivity { *; }

# Preserve Coroutine, Reflection, and Serialized Names if any
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Strip all debug logs from Android Logcat in Production Release Build
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(java.lang.String, java.lang.String);
}
