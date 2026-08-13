package com.webssh.app;

import android.content.Context;
import android.util.Log;

import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.extensions.IExtension;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.protocols.IProtocol;
import org.java_websocket.protocols.Protocol;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Built-in WebSocket gateway living inside the APK. The WebView frontend
 * connects to ws://127.0.0.1:<port>/ws/ssh (terminal) and /ws/sftp (files)
 * and gets a direct JSch SSH connection to the target host — no external
 * webssh backend required.
 *
 * Loopback-only by design: exposing the gateway on the LAN without an
 * access token would turn the phone into an open SSH relay. Remote access
 * to home networks belongs to the self-hosted gateway (REMOTE-ACCESS.md).
 */
public final class LocalSshServer {
    private static final String TAG = "LocalSsh";
    public static final int BASE_PORT = 8725;

    private static volatile LocalSshServer instance;

    private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "local-ssh-worker");
        t.setDaemon(true);
        return t;
    });
    private WebSocketServer server;
    private volatile int port = BASE_PORT;
    private volatile boolean running = false;

    private LocalSshServer() {
    }

    public static LocalSshServer getInstance(Context ctx) {
        LocalSshServer s = instance;
        if (s == null) {
            synchronized (LocalSshServer.class) {
                s = instance;
                if (s == null) {
                    s = new LocalSshServer();
                    instance = s;
                }
            }
        }
        return s;
    }

    public boolean isRunning() { return running; }
    public int getPort() { return port; }

    public void startAsync() {
        Thread t = new Thread(this::startLocked, "local-ssh-start");
        t.setDaemon(true);
        t.start();
    }

    public void stopAll() {
        stopLocked();
        executor.shutdownNow();
    }

    private synchronized void startLocked() {
        if (running) return;
        String bindHost = "127.0.0.1";

        // Accept the webssh-auth subprotocol in case a client offers it,
        // plus a bare draft for clients that request none.
        List<Draft> drafts = new ArrayList<>();
        drafts.add(new Draft_6455(Collections.<IExtension>emptyList(),
                Collections.<IProtocol>singletonList(new Protocol("webssh-auth"))));
        drafts.add(new Draft_6455());

        for (int p = BASE_PORT; p < BASE_PORT + 10; p++) {
            if (!canBind(bindHost, p)) continue;
            try {
                CountDownLatch started = new CountDownLatch(1);
                AtomicInteger state = new AtomicInteger(0); // 1=up, -1=bind error
                InetSocketAddress addr = new InetSocketAddress(bindHost, p);
                WebSocketServer s = new WebSocketServer(addr, drafts) {
                    @Override
                    public void onStart() {
                        state.set(1);
                        started.countDown();
                    }

                    @Override
                    public void onOpen(WebSocket conn, ClientHandshake handshake) {
                        String path = conn.getResourceDescriptor();
                        if (path != null && path.startsWith("/ws/sftp")) {
                            conn.setAttachment(new SftpHandler(conn, executor));
                        } else {
                            conn.setAttachment(new SshTerminalHandler(conn, executor));
                        }
                    }

                    @Override
                    public void onMessage(WebSocket conn, String message) {
                        Object h = conn.getAttachment();
                        if (h instanceof SshTerminalHandler) {
                            ((SshTerminalHandler) h).onMessage(message);
                        } else if (h instanceof SftpHandler) {
                            ((SftpHandler) h).onMessage(message);
                        }
                    }

                    @Override
                    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
                        Object h = conn.getAttachment();
                        if (h instanceof SshTerminalHandler) {
                            ((SshTerminalHandler) h).onWsClosed();
                        } else if (h instanceof SftpHandler) {
                            ((SftpHandler) h).onWsClosed();
                        }
                    }

                    @Override
                    public void onError(WebSocket conn, Exception ex) {
                        Log.w(TAG, "WS error: " + ex.getMessage());
                        if (conn == null) { // bind-level failure
                            state.set(-1);
                            started.countDown();
                        }
                    }
                };
                s.setReuseAddr(true);
                s.start();
                if (started.await(2, TimeUnit.SECONDS) && state.get() == 1) {
                    server = s;
                    port = p;
                    running = true;
                    Log.i(TAG, "built-in gateway listening on " + bindHost + ":" + p);
                    return;
                }
                try { s.stop(200); } catch (Exception ignored) {}
            } catch (Exception e) {
                Log.w(TAG, "failed to start on port " + p + ": " + e.getMessage());
            }
        }
        Log.e(TAG, "built-in gateway could not bind any port");
    }

    private synchronized void stopLocked() {
        running = false;
        WebSocketServer s = server;
        server = null;
        if (s != null) {
            try { s.stop(500); } catch (Exception ignored) {}
        }
    }

    private static boolean canBind(String host, int port) {
        try (ServerSocket ss = new ServerSocket()) {
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(host, port));
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
