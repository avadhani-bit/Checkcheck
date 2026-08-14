package com.avadhani.checkcheck;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * WidgetBridge — the Capacitor plugin js/widget.js talks to.
 *
 * Three jobs, deliberately dumb:
 *   setSnapshot()    app hands the widgets a fresh copy of the data
 *   getActions()     app collects ticks made on the home screen
 *   clearActions()   app confirms it has applied them
 *
 * No business logic lives here. Deciding what "done" means for a recurring
 * task belongs in app.js, which already has that code and can sync it to
 * Firestore. This class only moves bytes.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        WidgetStore.setSnapshotRaw(getContext(), json);
        WidgetStore.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getActions(PluginCall call) {
        JSONArray actions = WidgetStore.getActions(getContext());
        JSObject ret = new JSObject();
        // Hand it back as a string and let JS parse. Converting JSONArray to
        // Capacitor's JSArray loses nothing here and costs an extra failure mode.
        ret.put("json", actions.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearActions(PluginCall call) {
        WidgetStore.clearActions(getContext());
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        WidgetStore.refreshAll(getContext());
        call.resolve();
    }
}
