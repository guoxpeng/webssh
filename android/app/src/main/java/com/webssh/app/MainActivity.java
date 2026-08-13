package com.webssh.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(SshBridgePlugin.class);
    super.onCreate(savedInstanceState);
    // Edge-to-edge: draw behind the status/navigation bars. The web layer already
    // honors env(safe-area-inset-*), so notches and gesture areas stay clear.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    // Built-in SSH gateway: the WebView connects to ws://127.0.0.1:<port>/ws/ssh
    // so the APK works without any external webssh backend.
    LocalSshServer.getInstance(getApplicationContext()).startAsync();
  }

  @Override
  protected void onDestroy() {
    LocalSshServer.getInstance(getApplicationContext()).stopAll();
    super.onDestroy();
  }
}
