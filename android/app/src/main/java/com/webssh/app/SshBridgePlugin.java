package com.webssh.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Frontend bridge to the built-in SSH gateway.
 *   SshBridge.getStatus() -> {running, port, listenLan:false}
 *
 * The gateway is deliberately loopback-only: exposing it on the LAN without
 * an access token would make the phone an open SSH relay. Remote access to
 * home networks is covered by the self-hosted gateway + tunnel instead
 * (see REMOTE-ACCESS.md).
 */
@CapacitorPlugin(name = "SshBridge")
public class SshBridgePlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        LocalSshServer s = LocalSshServer.getInstance(getContext().getApplicationContext());
        JSObject o = new JSObject();
        o.put("ok", true);
        o.put("running", s.isRunning());
        o.put("port", s.getPort());
        o.put("listenLan", false);
        call.resolve(o);
    }
}
