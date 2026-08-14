package com.avadhani.checkcheck;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * WidgetStore — the only thing the WebView and the home screen widgets share.
 *
 * WHY THIS EXISTS
 * A home screen widget is drawn by the launcher's process, not yours. It cannot
 * run JavaScript, cannot read localStorage, and cannot reach Firestore. So the
 * app has to hand it a plain snapshot of data ahead of time. SharedPreferences
 * is the simplest store both sides can reach.
 *
 * DATA FLOWS BOTH WAYS
 *   app -> widget : SNAPSHOT, rewritten whenever app data changes
 *   widget -> app : ACTIONS, a queue of ticks made on the home screen that the
 *                   app drains and applies to the real data next time it runs
 *
 * The widget also patches the snapshot itself when you tick something, so the
 * home screen updates instantly rather than waiting for the app to open.
 * That makes the snapshot briefly ahead of the real data — the action queue is
 * what reconciles it.
 */
public class WidgetStore {

    private static final String PREFS = "checkcheck_widget";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_ACTIONS = "actions";

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── Snapshot ─────────────────────────────────────────────────────────

    public static String getSnapshotRaw(Context ctx) {
        return prefs(ctx).getString(KEY_SNAPSHOT, "{}");
    }

    public static void setSnapshotRaw(Context ctx, String json) {
        prefs(ctx).edit().putString(KEY_SNAPSHOT, json).apply();
    }

    public static JSONObject getSnapshot(Context ctx) {
        try {
            return new JSONObject(getSnapshotRaw(ctx));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** Returns the named array from the snapshot, never null. */
    public static JSONArray getList(Context ctx, String key) {
        JSONArray arr = getSnapshot(ctx).optJSONArray(key);
        return arr == null ? new JSONArray() : arr;
    }

    /**
     * Flip the done flag on one item inside the snapshot, so the widget can
     * redraw immediately without waiting for the app to run and push a new one.
     */
    public static void markDoneInSnapshot(Context ctx, String listKey, String id, boolean done) {
        try {
            JSONObject snap = getSnapshot(ctx);
            JSONArray arr = snap.optJSONArray(listKey);
            if (arr == null) return;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) {
                    item.put("done", done);
                    break;
                }
            }
            snap.put(listKey, arr);
            setSnapshotRaw(ctx, snap.toString());
        } catch (JSONException e) {
            // A malformed snapshot is not worth crashing the launcher over.
            // The next app launch overwrites it wholesale.
        }
    }

    /**
     * A chore has no done flag — it has a clock. Ticking it means "just did
     * this", so optimistically show it as satisfied and clear the due state.
     * The app recomputes the real status from lastDone on next launch.
     */
    public static void markChoreDoneInSnapshot(Context ctx, String id) {
        try {
            JSONObject snap = getSnapshot(ctx);
            JSONArray arr = snap.optJSONArray("chores");
            if (arr == null) return;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject c = arr.optJSONObject(i);
                if (c != null && id.equals(c.optString("id"))) {
                    c.put("due", false);
                    c.put("status", "ok");
                    c.put("meta", "Just done");
                    break;
                }
            }
            snap.put("chores", arr);
            setSnapshotRaw(ctx, snap.toString());
        } catch (JSONException e) {
            // Next app launch replaces the snapshot wholesale.
        }
    }

    /** Add or remove today from a habit's done days, so the grid updates at once. */
    public static void markHabitTodayInSnapshot(Context ctx, String id, boolean done) {
        try {
            JSONObject snap = getSnapshot(ctx);
            JSONArray habits = snap.optJSONArray("habits");
            if (habits == null) return;

            java.util.Calendar cal = java.util.Calendar.getInstance();
            String today = String.format(java.util.Locale.US, "%04d-%02d-%02d",
                    cal.get(java.util.Calendar.YEAR),
                    cal.get(java.util.Calendar.MONTH) + 1,
                    cal.get(java.util.Calendar.DAY_OF_MONTH));

            for (int i = 0; i < habits.length(); i++) {
                JSONObject h = habits.optJSONObject(i);
                if (h == null || !id.equals(h.optString("id"))) continue;

                JSONArray days = h.optJSONArray("days");
                if (days == null) days = new JSONArray();
                JSONArray next = new JSONArray();
                for (int d = 0; d < days.length(); d++) {
                    String v = days.optString(d);
                    if (!today.equals(v)) next.put(v);
                }
                if (done) next.put(today);

                h.put("days", next);
                h.put("doneToday", done);
                break;
            }
            snap.put("habits", habits);
            setSnapshotRaw(ctx, snap.toString());
        } catch (JSONException e) {
            // Same reasoning as above.
        }
    }

    // ── Action queue ─────────────────────────────────────────────────────

    /**
     * Append a tick made on the home screen. Append-only on purpose: the widget
     * must never try to be clever about the app's data model. It records what
     * you did and lets the app decide what that means (a recurring task, for
     * instance, does more than flip a boolean).
     */
    public static void queueAction(Context ctx, String kind, String id, boolean done) {
        try {
            JSONArray actions = getActions(ctx);
            JSONObject a = new JSONObject();
            a.put("kind", kind);
            a.put("id", id);
            a.put("done", done);
            a.put("ts", System.currentTimeMillis());
            actions.put(a);
            prefs(ctx).edit().putString(KEY_ACTIONS, actions.toString()).apply();
        } catch (JSONException e) {
            // Dropping one tick is better than crashing the home screen.
        }
    }

    public static JSONArray getActions(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(KEY_ACTIONS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static void clearActions(Context ctx) {
        prefs(ctx).edit().putString(KEY_ACTIONS, "[]").apply();
    }

    // ── Redraw ───────────────────────────────────────────────────────────

    /**
     * Tell every placed widget to rebuild. notifyAppWidgetViewDataChanged is
     * the part people miss: updateAppWidget alone redraws the frame but leaves
     * the ListView showing its old rows, because collection contents come from
     * a separate RemoteViewsService.
     */
    public static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        refreshOne(ctx, mgr, TodayTasksWidget.class, R.id.widget_list);
        refreshOne(ctx, mgr, ChoresWidget.class, R.id.widget_list);
        // The habit widgets draw a bitmap rather than a collection, so they
        // need a rebuild rather than a data-changed notification.
        HabitWidgetBase.refreshAll(ctx);
    }

    static void refreshOne(Context ctx, AppWidgetManager mgr, Class<?> cls, int listViewId) {
        ComponentName cn = new ComponentName(ctx, cls);
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids == null || ids.length == 0) return;
        mgr.notifyAppWidgetViewDataChanged(ids, listViewId);
        ctx.sendBroadcast(new android.content.Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .setComponent(cn)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids));
    }
}
