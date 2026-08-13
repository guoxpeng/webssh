package com.webssh.app;

import android.util.Log;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.Session;

import org.java_websocket.WebSocket;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;

/**
 * One terminal connection over the built-in gateway. Speaks the exact
 * /ws/ssh protocol of core/worker/index.mjs:
 *   client→server: config JSON first, then raw keystrokes, "resize:ROWS:COLS",
 *                  "stats:*", {"type":"ping"} and "\x00hb\x00" heartbeats
 *   server→client: raw shell output frames, {"type":"ssh_ready"} once the
 *                  shell is up, {"type":"host_stats","data":{...}} samples,
 *                  ANSI-red error lines on failure
 */
final class SshTerminalHandler {
    private static final String TAG = "LocalSsh";

    private final WebSocket conn;
    private final ExecutorService executor;

    private volatile boolean configured = false;
    private volatile boolean closed = false;
    private volatile boolean statsBusy = false;
    private Session session;
    private ChannelShell shell;
    private PipedOutputStream inputPipe;

    SshTerminalHandler(WebSocket conn, ExecutorService executor) {
        this.conn = conn;
        this.executor = executor;
    }

    void onMessage(String msg) {
        if (closed) return;
        // Heartbeat used by other webssh clients.
        if ("\u0000hb\u0000".equals(msg)) return;

        if (!configured) {
            configured = true;
            try {
                SshConfig cfg = SshConfig.parse(msg);
                if (!"ssh".equals(cfg.protocol)) {
                    sendError("[Error] 内置网关仅支持 SSH 协议，"
                            + cfg.protocol.toUpperCase() + " 请使用自建服务器版");
                    return;
                }
                if (cfg.host.isEmpty() || cfg.username.isEmpty()) {
                    sendText("\r\n\033[31mMissing host or username\033[0m\r\n");
                    return;
                }
                executor.submit(() -> connect(cfg));
            } catch (Exception e) {
                sendText("{\"type\":\"error\",\"message\":\"Invalid config JSON\"}");
            }
            return;
        }

        // Heartbeat JSON ({"type":"ping"} → {"type":"pong"})
        if (msg.startsWith("{")) {
            try {
                JSONObject o = new JSONObject(msg);
                if ("ping".equals(o.optString("type"))) {
                    sendText("{\"type\":\"pong\"}");
                    return;
                }
            } catch (Exception ignored) {
                // Not JSON — fall through, treat as terminal input.
            }
        }

        ChannelShell sh = shell;
        if (sh == null) return; // input before the shell is up is dropped (parity)

        if (msg.startsWith("resize:")) {
            // Worker format: resize:<rows>:<cols>
            String[] parts = msg.split(":");
            if (parts.length >= 3) {
                final int rows = parseInt(parts[1]);
                final int cols = parseInt(parts[2]);
                if (rows > 0 && cols > 0) {
                    executor.submit(() -> {
                        try { sh.setPtySize(cols, rows, 0, 0); } catch (Exception ignored) {}
                    });
                }
            }
            return;
        }
        if (msg.startsWith("stats:")) {
            executor.submit(this::runStats);
            return;
        }
        try {
            synchronized (this) {
                if (inputPipe != null) {
                    inputPipe.write(msg.getBytes(StandardCharsets.UTF_8));
                    inputPipe.flush();
                }
            }
        } catch (Exception ignored) {
            // Broken pipe = shell already closing; cleanup happens via watcher.
        }
    }

    /** Called when the WebSocket itself closes. */
    void onWsClosed() {
        cleanup();
    }

    private void connect(SshConfig cfg) {
        try {
            session = SshConnections.open(cfg);
            ChannelShell sh = (ChannelShell) session.openChannel("shell");
            sh.setPtyType("xterm-256color");
            sh.setPtySize(120, 30, 0, 0);
            PipedInputStream pin = new PipedInputStream(64 * 1024);
            synchronized (this) {
                inputPipe = new PipedOutputStream(pin);
            }
            sh.setInputStream(pin);
            sh.setOutputStream(new WsOutputStream());
            sh.connect(15000);
            shell = sh;
            sendText("{\"type\":\"ssh_ready\"}");

            Thread watcher = new Thread(() -> {
                try {
                    while (!closed && sh.isConnected() && !sh.isClosed()) {
                        Thread.sleep(250);
                    }
                } catch (InterruptedException ignored) {
                }
                // Shell exited → close the socket cleanly so the frontend can
                // treat it as a normal shell-exit (code 1000).
                if (!closed) {
                    try { conn.close(1000); } catch (Exception ignored) {}
                    cleanup();
                }
            }, "ssh-shell-watcher");
            watcher.setDaemon(true);
            watcher.start();
        } catch (Exception e) {
            Log.w(TAG, "SSH connect failed: " + e.getMessage());
            sendError("[SSH Error] " + safeMessage(e));
            cleanup();
        }
    }

    private void runStats() {
        Session s = session;
        if (statsBusy || s == null || !s.isConnected() || shell == null) return;
        statsBusy = true;
        try {
            ChannelExec exec = (ChannelExec) s.openChannel("exec");
            exec.setCommand(StatsProbe.SCRIPT);
            InputStream in = exec.getInputStream();
            exec.connect(10000);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            long deadline = System.currentTimeMillis() + 15000;
            while (System.currentTimeMillis() < deadline) {
                while (in.available() > 0) {
                    int n = in.read(buf);
                    if (n < 0) break;
                    bos.write(buf, 0, n);
                }
                if (exec.isClosed()) break;
                Thread.sleep(50);
            }
            exec.disconnect();
            // org.json does not guarantee key order, but the frontend matches
            // this frame with startsWith('{"type":"host_stats"') — keep "type"
            // first by building the envelope string manually.
            sendText("{\"type\":\"host_stats\",\"data\":"
                    + StatsProbe.parse(new String(bos.toByteArray(), StandardCharsets.UTF_8)) + "}");
        } catch (Exception ignored) {
            // Stats are best-effort; never break the shell over them.
        } finally {
            statsBusy = false;
        }
    }

    private void cleanup() {
        closed = true;
        synchronized (this) {
            try { if (inputPipe != null) inputPipe.close(); } catch (Exception ignored) {}
            inputPipe = null;
        }
        try { if (shell != null) shell.disconnect(); } catch (Exception ignored) {}
        try { if (session != null) session.disconnect(); } catch (Exception ignored) {}
        shell = null;
        session = null;
    }

    private void sendText(String text) {
        try {
            if (!closed && conn.isOpen()) conn.send(text);
        } catch (Exception ignored) {
        }
    }

    private void sendError(String message) {
        sendText("\r\n\033[31m" + message + "\033[0m\r\n");
    }

    private static String safeMessage(Throwable t) {
        String m = t.getMessage();
        if (m == null || m.isEmpty()) m = t.getClass().getSimpleName();
        return m;
    }

    private static int parseInt(String s) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; }
    }

    /** Forwards every shell output chunk to the client as a binary frame. */
    private final class WsOutputStream extends OutputStream {
        @Override
        public void write(int b) {
            sendBytes(new byte[]{(byte) b});
        }

        @Override
        public void write(byte[] b, int off, int len) {
            if (len <= 0) return;
            byte[] chunk = new byte[len];
            System.arraycopy(b, off, chunk, 0, len);
            sendBytes(chunk);
        }
    }

    private void sendBytes(byte[] data) {
        try {
            if (!closed && conn.isOpen()) conn.send(data);
        } catch (Exception ignored) {
        }
    }
}
