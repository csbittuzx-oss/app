package com.auramusic.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
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

    private boolean checkHardwareDolby() {
        try {
            AudioEffect.Descriptor[] descriptors = AudioEffect.queryEffects();
            if (descriptors != null) {
                for (AudioEffect.Descriptor desc : descriptors) {
                    String name = desc.name != null ? desc.name.toLowerCase() : "";
                    String implementor = desc.implementor != null ? desc.implementor.toLowerCase() : "";
                    String type = desc.type != null ? desc.type.toString().toLowerCase() : "";
                    if (name.contains("dolby") || implementor.contains("dolby") || name.contains("atmos") || implementor.contains("atmos") || type.contains("dolby")) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                Context ctx = getContext();
                if (ctx != null) {
                    AudioManager audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                    if (audioManager != null) {
                        android.media.Spatializer spatializer = audioManager.getSpatializer();
                        if (spatializer != null && spatializer.isAvailable()) {
                            return true;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    private boolean isExternalAudioConnected(Context ctx) {
        if (ctx == null) return false;
        try {
            AudioManager audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                if (devices != null) {
                    for (AudioDeviceInfo dev : devices) {
                        int t = dev.getType();
                        if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                            t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                            t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                            t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                            t == AudioDeviceInfo.TYPE_USB_HEADSET ||
                            t == AudioDeviceInfo.TYPE_USB_DEVICE ||
                            t == AudioDeviceInfo.TYPE_HEARING_AID ||
                            t == AudioDeviceInfo.TYPE_AUX_LINE) {
                            return true;
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            if (t == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                                t == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
                                t == AudioDeviceInfo.TYPE_BLE_BROADCAST) {
                                return true;
                            }
                        }
                    }
                }
            } else {
                return audioManager.isWiredHeadsetOn() || audioManager.isBluetoothA2dpOn() || audioManager.isBluetoothScoOn();
            }
        } catch (Exception ignored) {}
        return false;
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hw = checkHardwareDolby();
        boolean external = isExternalAudioConnected(getContext());
        boolean canEnable = hw || external;

        ret.put("supported", true); // Always visible in UI
        ret.put("hardwareSupported", hw);
        ret.put("headsetConnected", external);
        ret.put("canEnable", canEnable);
        ret.put("effectName", hw ? "Hardware Dolby Atmos" : external ? "Dolby Atmos Spatial (Earphones/Speaker)" : "Dolby Atmos");
        call.resolve(ret);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context ctx = getContext();
        boolean hw = checkHardwareDolby();
        boolean external = isExternalAudioConnected(ctx);

        if (enabled && !hw && !external) {
            // Cannot enable on built-in speaker without Dolby hardware
            this.isDolbyEnabled = false;
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("enabled", false);
            ret.put("reason", "Connect earphones, earbuds, or a speaker to enable Dolby Atmos.");
            call.resolve(ret);
            return;
        }

        this.isDolbyEnabled = enabled;

        try {
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
