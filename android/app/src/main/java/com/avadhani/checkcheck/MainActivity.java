package com.avadhani.checkcheck;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this app (rather than an npm package) have to be
        // registered by hand, BEFORE super.onCreate() — that's when Capacitor
        // builds its plugin table. Register after, and calls from JS fail with
        // "WidgetBridge does not have an implementation".
        registerPlugin(WidgetBridge.class);
        super.onCreate(savedInstanceState);
    }
}
