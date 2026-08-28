package com.auramusic.app;

import android.os.Handler;
import android.os.Looper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Lightweight, zero-dependency embedded HTTP server for Android TV.
 * Built with standard java.net.ServerSocket for 100% Android compatibility.
 */
public class LocalImportServer {

    public interface ImportCallback {
        void onPlaylistReceived(String playlistUrl, String playlistId);
        void onClientConnected();
    }

    private static final int DEFAULT_PORT = 8765;
    private static final long SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    private ServerSocket serverSocket;
    private ExecutorService threadPool;
    private volatile boolean isRunning = false;

    private String currentIp;
    private int currentPort = DEFAULT_PORT;
    private String currentToken;
    private ImportCallback callback;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stop;

    public synchronized boolean start(ImportCallback cb) {
        stop();
        this.callback = cb;
        this.currentIp = getLocalIpAddress();
        if (this.currentIp == null) {
            return false;
        }

        this.currentToken = UUID.randomUUID().toString().substring(0, 8);

        try {
            try {
                serverSocket = new ServerSocket();
                serverSocket.setReuseAddress(true);
                serverSocket.bind(new InetSocketAddress(currentPort));
            } catch (Exception e) {
                // If default port is taken, let system allocate free port
                serverSocket = new ServerSocket();
                serverSocket.setReuseAddress(true);
                serverSocket.bind(new InetSocketAddress(0));
                currentPort = serverSocket.getLocalPort();
            }

            isRunning = true;
            threadPool = Executors.newCachedThreadPool();

            // Background accept loop
            new Thread(this::acceptLoop, "TV-LocalImportServer").start();

            // Auto-stop after 5 minutes
            mainHandler.postDelayed(timeoutRunnable, SESSION_TIMEOUT_MS);
            return true;
        } catch (Exception e) {
            stop();
            return false;
        }
    }

    public synchronized void stop() {
        mainHandler.removeCallbacks(timeoutRunnable);
        isRunning = false;
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (Exception ignored) {}
            serverSocket = null;
        }
        if (threadPool != null) {
            try {
                threadPool.shutdownNow();
            } catch (Exception ignored) {}
            threadPool = null;
        }
        currentToken = null;
    }

    public boolean isRunning() {
        return isRunning && serverSocket != null && !serverSocket.isClosed();
    }

    public String getIp() {
        return currentIp;
    }

    public int getPort() {
        return currentPort;
    }

    public String getToken() {
        return currentToken;
    }

    public String getImportUrl() {
        if (currentIp == null || currentToken == null) return null;
        return "http://" + currentIp + ":" + currentPort + "/import?t=" + currentToken;
    }

    private void acceptLoop() {
        while (isRunning && serverSocket != null && !serverSocket.isClosed()) {
            try {
                Socket client = serverSocket.accept();
                if (threadPool != null && !threadPool.isShutdown()) {
                    threadPool.execute(() -> handleClient(client));
                }
            } catch (Exception e) {
                // Socket closed or server stopped
                break;
            }
        }
    }

    private void handleClient(Socket client) {
        try (
            Socket s = client;
            BufferedReader reader = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            OutputStream out = s.getOutputStream()
        ) {
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;

            String method = parts[0];
            String uri = parts[1];

            // Read Headers
            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("content-length:")) {
                    contentLength = Integer.parseInt(line.substring(15).trim());
                }
            }

            // Route handling
            String path = uri.contains("?") ? uri.substring(0, uri.indexOf("?")) : uri;
            String query = uri.contains("?") ? uri.substring(uri.indexOf("?") + 1) : "";
            String token = extractQueryParam(query, "t");

            if ("OPTIONS".equalsIgnoreCase(method)) {
                sendResponse(out, 204, "No Content", "text/plain", "");
                return;
            }

            if ("/import".equals(path)) {
                if (callback != null) {
                    mainHandler.post(() -> callback.onClientConnected());
                }

                if (currentToken == null || !currentToken.equals(token)) {
                    String errorHtml = "<!DOCTYPE html><html><body style='background:#0B0C10;color:#FFF;font-family:sans-serif;text-align:center;padding:40px;'><h2>Session Expired or Invalid</h2><p>Please open a new Spotify Import session on your TV.</p></body></html>";
                    sendResponse(out, 403, "Forbidden", "text/html; charset=UTF-8", errorHtml);
                    return;
                }

                String html = generateMobileWebPageHtml(token);
                sendResponse(out, 200, "OK", "text/html; charset=UTF-8", html);
            } else if ("/api/import".equals(path) && "POST".equalsIgnoreCase(method)) {
                if (currentToken == null || !currentToken.equals(token)) {
                    sendResponse(out, 403, "Forbidden", "application/json", "{\"error\":\"Invalid or expired session token\"}");
                    return;
                }

                // Read POST body
                char[] buf = new char[contentLength];
                int read = 0;
                while (read < contentLength) {
                    int r = reader.read(buf, read, contentLength - read);
                    if (r == -1) break;
                    read += r;
                }
                String body = new String(buf);

                try {
                    JSONObject json = new JSONObject(body);
                    String url = json.optString("url", "").trim();
                    String playlistId = json.optString("playlistId", "").trim();

                    if (callback != null) {
                        final String finalUrl = url;
                        final String finalId = playlistId;
                        mainHandler.post(() -> callback.onPlaylistReceived(finalUrl, finalId));
                    }

                    sendResponse(out, 200, "OK", "application/json", "{\"success\":true,\"message\":\"Playlist sent to TV successfully\"}");
                } catch (Exception e) {
                    sendResponse(out, 400, "Bad Request", "application/json", "{\"error\":\"Invalid payload\"}");
                }
            } else if ("/api/status".equals(path)) {
                sendResponse(out, 200, "OK", "application/json", "{\"alive\":true}");
            } else {
                sendResponse(out, 404, "Not Found", "text/plain", "Not Found");
            }
        } catch (Exception ignored) {}
    }

    private void sendResponse(OutputStream out, int code, String statusText, String contentType, String body) {
        try {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            String header = "HTTP/1.1 " + code + " " + statusText + "\r\n" +
                "Content-Type: " + contentType + "\r\n" +
                "Content-Length: " + bytes.length + "\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type\r\n" +
                "Connection: close\r\n\r\n";
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.write(bytes);
            out.flush();
        } catch (Exception ignored) {}
    }

    private String extractQueryParam(String query, String key) {
        if (query == null || key == null) return null;
        for (String param : query.split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && pair[0].equals(key)) {
                return pair[1];
            }
        }
        return null;
    }

    public static String getLocalIpAddress() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                for (InetAddress addr : addrs) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        String ip = addr.getHostAddress();
                        if (ip != null && (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172."))) {
                            return ip;
                        }
                    }
                }
            }
            // Fallback: any IPv4
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String generateMobileWebPageHtml(String token) {
        return "<!DOCTYPE html>\n" +
            "<html lang=\"en\">\n" +
            "<head>\n" +
            "  <meta charset=\"UTF-8\">\n" +
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">\n" +
            "  <title>Import Playlist • Soundwave TV</title>\n" +
            "  <style>\n" +
            "    * { box-sizing: border-box; margin: 0; padding: 0; }\n" +
            "    body {\n" +
            "      background: #0B0C10;\n" +
            "      color: #FFFFFF;\n" +
            "      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n" +
            "      display: flex;\n" +
            "      flex-direction: column;\n" +
            "      align-items: center;\n" +
            "      justify-content: center;\n" +
            "      min-height: 100vh;\n" +
            "      padding: 24px 16px;\n" +
            "    }\n" +
            "    .card {\n" +
            "      background: #14151E;\n" +
            "      border: 1px solid rgba(255, 255, 255, 0.1);\n" +
            "      border-radius: 20px;\n" +
            "      padding: 28px 24px;\n" +
            "      width: 100%;\n" +
            "      max-width: 440px;\n" +
            "      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);\n" +
            "    }\n" +
            "    .logo-badge {\n" +
            "      width: 44px;\n" +
            "      height: 44px;\n" +
            "      border-radius: 12px;\n" +
            "      background: linear-gradient(135deg, #6366F1, #A855F7);\n" +
            "      display: flex;\n" +
            "      align-items: center;\n" +
            "      justify-content: center;\n" +
            "      margin-bottom: 16px;\n" +
            "    }\n" +
            "    h1 { font-size: 20px; font-weight: 800; margin-bottom: 6px; }\n" +
            "    p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 22px; line-height: 1.4; }\n" +
            "    label { font-size: 12px; font-weight: 700; color: #E2E8F0; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }\n" +
            "    input[type=\"text\"] {\n" +
            "      width: 100%;\n" +
            "      background: #1E202C;\n" +
            "      border: 1.5px solid rgba(255, 255, 255, 0.15);\n" +
            "      border-radius: 12px;\n" +
            "      padding: 14px 16px;\n" +
            "      color: #FFFFFF;\n" +
            "      font-size: 14px;\n" +
            "      outline: none;\n" +
            "      margin-bottom: 14px;\n" +
            "      transition: border-color 0.2s ease;\n" +
            "    }\n" +
            "    input[type=\"text\"]:focus { border-color: #6366F1; background: #232534; }\n" +
            "    button.btn-import {\n" +
            "      width: 100%;\n" +
            "      background: #6366F1;\n" +
            "      border: none;\n" +
            "      border-radius: 12px;\n" +
            "      padding: 14px 20px;\n" +
            "      color: #FFFFFF;\n" +
            "      font-size: 15px;\n" +
            "      font-weight: 700;\n" +
            "      cursor: pointer;\n" +
            "      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);\n" +
            "      transition: background-color 0.15s ease, transform 0.1s active;\n" +
            "    }\n" +
            "    button.btn-import:active { transform: scale(0.98); background: #4F46E5; }\n" +
            "    button:disabled { opacity: 0.6; cursor: not-allowed; }\n" +
            "    .status-msg {\n" +
            "      margin-top: 16px;\n" +
            "      font-size: 13px;\n" +
            "      padding: 12px;\n" +
            "      border-radius: 10px;\n" +
            "      display: none;\n" +
            "      line-height: 1.4;\n" +
            "    }\n" +
            "    .status-error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #FCA5A5; display: block; }\n" +
            "    .status-success { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #6EE7B7; display: block; }\n" +
            "    .instructions {\n" +
            "      margin-top: 24px;\n" +
            "      padding-top: 18px;\n" +
            "      border-top: 1px solid rgba(255, 255, 255, 0.08);\n" +
            "      font-size: 12px;\n" +
            "      color: #64748B;\n" +
            "      line-height: 1.5;\n" +
            "    }\n" +
            "  </style>\n" +
            "</head>\n" +
            "<body>\n" +
            "  <div class=\"card\">\n" +
            "    <div class=\"logo-badge\">\n" +
            "      <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n" +
            "        <path d=\"M9 18V5l12-2v13\" />\n" +
            "        <circle cx=\"6\" cy=\"18\" r=\"3\" />\n" +
            "        <circle cx=\"18\" cy=\"16\" r=\"3\" />\n" +
            "      </svg>\n" +
            "    </div>\n" +
            "    <h1>Import Spotify Playlist</h1>\n" +
            "    <p class=\"sub\">Send any Spotify playlist directly to your TV without typing on the TV remote.</p>\n" +
            "\n" +
            "    <label for=\"playlist-url\">Spotify Playlist Link</label>\n" +
            "    <input type=\"text\" id=\"playlist-url\" placeholder=\"https://open.spotify.com/playlist/...\" autofocus autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"off\">\n" +
            "\n" +
            "    <button id=\"btn-submit\" class=\"btn-import\" onclick=\"handleSend()\">Import to TV</button>\n" +
            "    <div id=\"status-box\" class=\"status-msg\"></div>\n" +
            "\n" +
            "    <div class=\"instructions\">\n" +
            "      <strong>How to get the link:</strong> In Spotify, open your playlist → Tap Share (•••) → Copy Link → Paste here.\n" +
            "    </div>\n" +
            "  </div>\n" +
            "\n" +
            "  <script>\n" +
            "    const token = \"" + token + "\";\n" +
            "    function validateUrl(input) {\n" +
            "      if (!input) return null;\n" +
            "      const trimmed = input.trim();\n" +
            "      const match = trimmed.match(/playlist\\/([a-zA-Z0-9]+)/);\n" +
            "      if (match && match[1]) return match[1];\n" +
            "      const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);\n" +
            "      if (uriMatch && uriMatch[1]) return uriMatch[1];\n" +
            "      return null;\n" +
            "    }\n" +
            "\n" +
            "    async function handleSend() {\n" +
            "      const input = document.getElementById('playlist-url');\n" +
            "      const btn = document.getElementById('btn-submit');\n" +
            "      const statusBox = document.getElementById('status-box');\n" +
            "      const rawUrl = input.value.trim();\n" +
            "      const playlistId = validateUrl(rawUrl);\n" +
            "\n" +
            "      if (!playlistId) {\n" +
            "        statusBox.className = 'status-msg status-error';\n" +
            "        statusBox.textContent = 'Please enter a valid Spotify playlist link (e.g. open.spotify.com/playlist/...)';\n" +
            "        return;\n" +
            "      }\n" +
            "\n" +
            "      btn.disabled = true;\n" +
            "      btn.textContent = 'Sending to TV...';\n" +
            "      statusBox.style.display = 'none';\n" +
            "\n" +
            "      try {\n" +
            "        const res = await fetch('/api/import?t=' + token, {\n" +
            "          method: 'POST',\n" +
            "          headers: { 'Content-Type': 'application/json' },\n" +
            "          body: JSON.stringify({ url: rawUrl, playlistId: playlistId })\n" +
            "        });\n" +
            "        const data = await res.json();\n" +
            "        if (res.ok && data.success) {\n" +
            "          statusBox.className = 'status-msg status-success';\n" +
            "          statusBox.innerHTML = '<strong>✓ Playlist sent to TV!</strong><br>Check your TV screen to see the import progress.';\n" +
            "          btn.textContent = 'Sent Successfully';\n" +
            "        } else {\n" +
            "          throw new Error(data.error || 'Server rejected the request');\n" +
            "        }\n" +
            "      } catch (err) {\n" +
            "        btn.disabled = false;\n" +
            "        btn.textContent = 'Import to TV';\n" +
            "        statusBox.className = 'status-msg status-error';\n" +
            "        statusBox.textContent = 'Failed to reach TV: ' + (err.message || 'Network error. Ensure phone and TV are on the same Wi-Fi.');\n" +
            "      }\n" +
            "    }\n" +
            "  </script>\n" +
            "</body>\n" +
            "</html>";
    }
}
