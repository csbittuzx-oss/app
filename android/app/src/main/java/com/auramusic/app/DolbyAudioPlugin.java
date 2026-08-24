package com.auramusic.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.audiofx.AudioEffect;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DolbyAudio")
public class DolbyAudioPlugin extends Plugin {

    private boolean isDolbyEnabled = false;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = false;
        String effectName = "";

        try {
            AudioEffect.Descriptor[] descriptors = AudioEffect.queryEffects();
            if (descriptors != null) {
                for (AudioEffect.Descriptor desc : descriptors) {
                    String name = desc.name != null ? desc.name.toLowerCase() : "";
                    String implementor = desc.implementor != null ? desc.implementor.toLowerCase() : "";
                    String type = desc.type != null ? desc.type.toString().toLowerCase() : "";
                    if (name.contains("dolby") || implementor.contains("dolby") || name.contains("atmos") || implementor.contains("atmos") || type.contains("dolby")) {
                        supported = true;
                        effectName = desc.name != null ? desc.name : "Dolby Atmos Audio Engine";
                        break;
                    }
                }
            }
        } catch (Exception ignored) {}

        // Check Spatializer on Android 13+ if Dolby effect not directly named
        if (!supported && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    android.media.Spatializer spatializer = audioManager.getSpatializer();
                    if (spatializer != null && spatializer.isAvailable()) {
                        supported = true;
                        effectName = "System Dolby Spatializer";
                    }
                }
            } catch (Exception ignored) {}
        }

        ret.put("supported", supported);
        ret.put("effectName", effectName);
        call.resolve(ret);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        this.isDolbyEnabled = enabled;

        try {
            Context ctx = getContext();
            if (ctx != null) {
                int sessionId = 0; // Global app media session ID
                Intent intent = new Intent(enabled ? AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION : AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION);
                intent.putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sessionId);
                intent.putExtra(AudioEffect.EXTRA_PACKAGE_NAME, ctx.getPackageName());
                intent.putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC);
                ctx.sendBroadcast(intent);
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("enabled", this.isDolbyEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", this.isDolbyEnabled);
        call.resolve(ret);
    }
}
