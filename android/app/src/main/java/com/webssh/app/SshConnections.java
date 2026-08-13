package com.webssh.app;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Builds JSch sessions the same way the Node/CF gateways do: trust-all host
 * keys (webssh never persists known_hosts), password or private-key auth,
 * keyboard-interactive prompts auto-answered with the password (parity with
 * setupSSHClient in core/worker/index.mjs).
 */
final class SshConnections {

    private SshConnections() {}

    static Session open(SshConfig cfg) throws JSchException {
        JSch jsch = new JSch();
        if ("key".equals(cfg.authType) && !cfg.authValue.isEmpty()) {
            // Same as upstream: the key material travels in auth_value; no
            // separate passphrase field exists in the webssh protocol.
            byte[] key = cfg.authValue.getBytes(StandardCharsets.UTF_8);
            jsch.addIdentity(cfg.username + "@builtin", key, null, null);
        }
        Session session = jsch.getSession(cfg.username, cfg.host, cfg.port);
        if ("password".equals(cfg.authType) && !cfg.authValue.isEmpty()) {
            session.setPassword(cfg.authValue);
        }
        session.setConfig("StrictHostKeyChecking", "no");
        session.setUserInfo(new AutoUserInfo(cfg.authValue));
        session.connect(15000);
        session.setServerAliveInterval(15000);
        session.setServerAliveCountMax(3);
        return session;
    }

    /** Answers every prompt with the configured password; accepts host keys. */
    static final class AutoUserInfo implements UserInfo, UIKeyboardInteractive {
        private final String password;

        AutoUserInfo(String password) {
            this.password = password == null ? "" : password;
        }

        @Override public String getPassphrase() { return null; }
        @Override public String getPassword() { return password; }
        @Override public boolean promptPassword(String message) { return true; }
        @Override public boolean promptPassphrase(String message) { return false; }
        @Override public boolean promptYesNo(String message) { return true; }
        @Override public void showMessage(String message) {}

        @Override
        public String[] promptKeyboardInteractive(String destination, String name,
                                                  String instruction, String[] prompt, boolean[] echo) {
            String[] answers = new String[prompt.length];
            Arrays.fill(answers, password);
            return answers;
        }
    }
}
