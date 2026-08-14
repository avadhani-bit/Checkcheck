package com.avadhani.checkcheck;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles a tick made on the home screen.
 *
 * Runs with the app closed, in a few milliseconds, with no access to Firestore
 * or your JavaScript. So it does the least it possibly can:
 *
 *   1. record the tick in the action queue
 *   2. patch the snapshot so the row visibly changes straight away
 *   3. redraw the widget
 *
 * It does NOT try to update the real data. Completing a task in CheckCheck can
 * mean spawning the next occurrence of a recurring task, writing history, and
 * syncing to Firestore — logic that lives in app.js and would have to be
 * duplicated in Java to run here. Duplicated business rules drift apart, and
 * the two copies would eventually disagree about your data.
 *
 * Instead the app drains the queue next time it launches and applies each tick
 * through its own normal code path.
 */
public class WidgetActionReceiver extends BroadcastReceiver {

    public static final String ACTION_TICK = "com.avadhani.checkcheck.WIDGET_TICK";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_ID = "id";
    public static final String EXTRA_DONE = "done";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION_TICK.equals(intent.getAction())) return;

        String kind = intent.getStringExtra(EXTRA_KIND);
        String id = intent.getStringExtra(EXTRA_ID);
        boolean done = intent.getBooleanExtra(EXTRA_DONE, true);
        if (id == null || id.isEmpty()) return;
        if (kind == null || kind.isEmpty()) kind = "tasks";

        WidgetStore.queueAction(ctx, kind, id, done);
        WidgetStore.markDoneInSnapshot(ctx, "today", id, done);
        TodayTasksWidget.refresh(ctx);
    }
}
