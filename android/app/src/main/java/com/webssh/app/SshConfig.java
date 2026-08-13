package com.webssh.app;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Connection config parsed from the first WebSocket message. Mirrors the
 * fields the web frontend sends (see core/worker/index.mjs makeSSHConfig):
 * {host, port, username, auth_type, auth_value, protocol, name, ...}
 */
final class SshConfig {
    String host = "";
    int port = 22;
    String username = "root";
    String authType = "password"; // "password" | "key"
    String authValue = "";
    String protocol = "ssh";

    static SshConfig parse(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        SshConfig cfg = new SshConfig();
        cfg.host = o.optString("host", "").trim();
        cfg.port = o.optInt("port", 22);
        if (cfg.port <= 0 || cfg.port > 65535) cfg.port = 22;
        cfg.username = o.optString("username", "").trim();
        if (cfg.username.isEmpty()) cfg.username = "root";
        cfg.authType = "key".equals(o.optString("auth_type", "password")) ? "key" : "password";
        cfg.authValue = o.optString("auth_value", "");
        cfg.protocol = o.optString("protocol", "ssh").toLowerCase();
        return cfg;
    }
}
