package com.auramusic.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SpotifyImport")
public class SpotifyImportPlugin extends Plugin {

    private final LocalImportServer server = new LocalImportServer();

    @PluginMethod
    public void startServer(PluginCall call) {
        boolean success = server.start(new LocalImportServer.ImportCallback() {
            @Override
            public void onPlaylistReceived(String playlistUrl, String playlistId) {
                JSObject ret = new JSObject();
                ret.put("playlistUrl", playlistUrl);
                ret.put("playlistId", playlistId);
                notifyListeners("playlistReceived", ret);
            }

            @Override
            public void onClientConnected() {
                notifyListeners("clientConnected", new JSObject());
            }
        });

        JSObject res = new JSObject();
        if (success) {
            res.put("success", true);
            res.put("ip", server.getIp());
            res.put("port", server.getPort());
            res.put("token", server.getToken());
            res.put("url", server.getImportUrl());
            call.resolve(res);
        } else {
            res.put("success", false);
            res.put("error", "Unable to detect local Wi-Fi IP address or bind server.");
            call.reject("Failed to start local import server", res);
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        server.stop();
        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void getServerStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("running", server.isRunning());
        res.put("ip", server.getIp());
        res.put("port", server.getPort());
        res.put("url", server.getImportUrl());
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        server.stop();
    }
}
