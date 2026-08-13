package com.webssh.app;

import android.app.Activity;
import android.app.Application;
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
    // BridgeActivity.onDestroy() is final on some Capacitor versions, so shut
    // the gateway down through a lifecycle callback instead of an override.
    getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
      @Override public void onActivityDestroyed(Activity activity) {
        if (activity == MainActivity.this) {
          LocalSshServer.getInstance(getApplicationContext()).stopAll();
        }
      }
      @Override public void onActivityCreated(Activity a, Bundle b) {}
      @Override public void onActivityStarted(Activity a) {}
      @Override public void onActivityResumed(Activity a) {}
      @Override public void onActivityPaused(Activity a) {}
      @Override public void onActivityStopped(Activity a) {}
      @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
    });
  }
}
