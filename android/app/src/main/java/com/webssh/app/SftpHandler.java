package com.webssh.app;

import android.util.Base64;
import android.util.Log;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;

import org.java_websocket.WebSocket;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.Vector;
import java.util.concurrent.ExecutorService;

/**
 * One SFTP connection over the built-in gateway. Mirrors the /ws/sftp
 * protocol of core/worker/index.mjs: config JSON first, then
 * {id, action, path, ...} requests answered with {id, result} / {id, error}.
 * Supported actions: list, stat, read, write, delete, rmdir, mkdir, rename, chmod.
 */
final class SftpHandler {
    private static final String TAG = "LocalSsh";

    private final WebSocket conn;
    private final ExecutorService executor;

    private volatile boolean configured = false;
    private volatile boolean closed = false;
    private Session session;
    private ChannelSftp sftp;

    SftpHandler(WebSocket conn, ExecutorService executor) {
        this.conn = conn;
        this.executor = executor;
    }

    void onMessage(String msg) {
        if (closed) return;
        if ("\u0000hb\u0000".equals(msg)) return;

        if (!configured) {
            configured = true;
            try {
                SshConfig cfg = SshConfig.parse(msg);
                if (!"ssh".equals(cfg.protocol)) {
                    send("{\"type\":\"status\",\"status\":\"error\",\"error\":\"built-in gateway supports SSH only\"}");
                    return;
                }
                executor.submit(() -> connect(cfg));
            } catch (Exception e) {
                send("{\"type\":\"status\",\"status\":\"error\",\"error\":\"Invalid config JSON\"}");
            }
            return;
        }

        try {
            JSONObject req = new JSONObject(msg);
            if ("ping".equals(req.optString("type"))) {
                send("{\"type\":\"pong\"}");
                return;
            }
            final int id = req.optInt("id", -1);
            final String action = req.optString("action", "");
            executor.submit(() -> dispatch(id, action, req));
        } catch (Exception e) {
            send("{\"error\":\"Invalid JSON\"}");
        }
    }

    void onWsClosed() {
        cleanup();
    }

    private void connect(SshConfig cfg) {
        send("{\"type\":\"status\",\"status\":\"connecting\"}");
        try {
            session = SshConnections.open(cfg);
            ChannelSftp ch = (ChannelSftp) session.openChannel("sftp");
            ch.connect(15000);
            sftp = ch;
            send("{\"type\":\"status\",\"status\":\"connected\"}");
        } catch (Exception e) {
            Log.w(TAG, "SFTP connect failed: " + e.getMessage());
            send("{\"type\":\"status\",\"status\":\"error\",\"error\":"
                    + JSONObject.quote(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()) + "}");
            cleanup();
        }
    }

    private void cleanup() {
        closed = true;
        try { if (sftp != null) sftp.disconnect(); } catch (Exception ignored) {}
        try { if (session != null) session.disconnect(); } catch (Exception ignored) {}
        sftp = null;
        session = null;
    }

    private void send(String text) {
        try {
            if (!closed && conn.isOpen()) conn.send(text);
        } catch (Exception ignored) {
        }
    }

    private void dispatch(int id, String action, JSONObject req) {
        ChannelSftp f = sftp;
        if (f == null || closed) return;
        try {
            JSONObject result;
            String path = req.optString("path", "/");
            switch (action) {
                case "list":
                    result = doList(f, path);
                    break;
                case "stat":
                    result = doStat(f, path);
                    break;
                case "read": {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    InputStream in = f.get(path);
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                    in.close();
                    result = new JSONObject().put("content",
                            Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
                    break;
                }
                case "write": {
                    String content = req.optString("content", "");
                    byte[] bytes = "base64".equals(req.optString("encoding", ""))
                            ? Base64.decode(content, Base64.DEFAULT)
                            : content.getBytes(StandardCharsets.UTF_8);
                    OutputStream out = f.put(path, ChannelSftp.OVERWRITE);
                    out.write(bytes);
                    out.close();
                    result = new JSONObject().put("success", true);
                    break;
                }
                case "delete":
                    f.rm(path);
                    result = new JSONObject().put("success", true);
                    break;
                case "rmdir":
                    f.rmdir(path);
                    result = new JSONObject().put("success", true);
                    break;
                case "mkdir":
                    f.mkdir(path);
                    result = new JSONObject().put("success", true);
                    break;
                case "rename":
                    f.rename(req.optString("srcPath", ""), req.optString("destPath", ""));
                    result = new JSONObject().put("success", true);
                    break;
                case "chmod":
                    f.chmod(Integer.parseInt(req.optString("mode", "644"), 8), path);
                    result = new JSONObject().put("success", true);
                    break;
                default:
                    send("{\"id\":" + id + ",\"error\":" + JSONObject.quote("Unknown action: " + action) + "}");
                    return;
            }
            send("{\"id\":" + id + ",\"result\":" + result + "}");
        } catch (Exception e) {
            String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            send("{\"id\":" + id + ",\"error\":" + JSONObject.quote(m) + "}");
        }
    }

    @SuppressWarnings("unchecked")
    private JSONObject doList(ChannelSftp f, String path) throws Exception {
        JSONArray entries = new JSONArray();
        Vector<ChannelSftp.LsEntry> ls = f.ls(path);
        for (ChannelSftp.LsEntry e : ls) {
            String name = e.getFilename();
            if (".".equals(name) || "..".equals(name)) continue;
            SftpATTRS attrs = e.getAttrs();
            boolean dir = attrs.isDir();
            entries.put(new JSONObject()
                    .put("name", name)
                    .put("type", dir ? "dir" : "file")
                    .put("size", attrs.getSize())
                    .put("mode", (dir ? 040000 : 0100000) | (attrs.getPermissions() & 07777))
                    .put("mtime", isoDate(attrs.getMTime())));
        }
        return new JSONObject().put("entries", entries);
    }

    private JSONObject doStat(ChannelSftp f, String path) throws Exception {
        SftpATTRS attrs = f.stat(path);
        boolean dir = attrs.isDir();
        return new JSONObject()
                .put("size", attrs.getSize())
                .put("mode", (dir ? 040000 : 0100000) | (attrs.getPermissions() & 07777))
                .put("mtime", isoDate(attrs.getMTime()));
    }

    private static String isoDate(int epochSeconds) {
        if (epochSeconds <= 0) return null;
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date(epochSeconds * 1000L));
    }
}
