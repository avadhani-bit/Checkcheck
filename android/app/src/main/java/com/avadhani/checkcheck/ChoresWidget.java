package com.avadhani.checkcheck;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * ChoresWidget — chores that are due, plus what's coming up.
 *
 * Same shape as TodayTasksWidget: frame here, rows from a RemoteViewsService.
 * The difference is what a tick means. Ticking a task completes it once;
 * ticking a chore resets its clock and appends to its history, so a chore is
 * never "done" in a permanent sense. js/widget.js routes chore ticks through
 * markChoreDone() for exactly that reason.
 */
public class ChoresWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] appWidgetIds) {
        for (int id : appWidgetIds) mgr.updateAppWidget(id, build(ctx, id));
    }

    static RemoteViews build(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_chores);

        JSONArray chores = WidgetStore.getList(ctx, "chores");
        int due = 0;
        for (int i = 0; i < chores.length(); i++) {
            JSONObject c = chores.optJSONObject(i);
            if (c != null && c.optBoolean("due", false)) due++;
        }
        views.setTextViewText(R.id.widget_count, due == 0 ? "Nothing due" : (due + " due"));

        Intent svc = new Intent(ctx, ChoresService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, svc);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent tick = new Intent(ctx, WidgetActionReceiver.class);
        tick.setAction(WidgetActionReceiver.ACTION_TICK);
        views.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getBroadcast(
                ctx, 1, tick, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_header, PendingIntent.getActivity(
                ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        return views;
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ChoresWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
