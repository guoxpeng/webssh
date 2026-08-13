package com.webssh.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Edge-to-edge: draw behind the status/navigation bars. The web layer already
    // honors env(safe-area-inset-*), so notches and gesture areas stay clear.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
  }
}
