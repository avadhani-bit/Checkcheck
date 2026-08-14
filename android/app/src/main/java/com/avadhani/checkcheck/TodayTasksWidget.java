package com.avadhani.checkcheck;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * TodayTasksWidget — home screen widget listing everything due today or overdue.
 *
 * The frame (header, empty state) is built here. The rows come from
 * TodayTasksService, because a ListView inside a widget can't be populated
 * directly — RemoteViews has no access to your process when the launcher
 * scrolls it, so it asks a RemoteViewsService for each row instead.
 */
public class TodayTasksWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = build(ctx, id);
            mgr.updateAppWidget(id, views);
        }
    }

    static RemoteViews build(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);

        views.setTextViewText(R.id.widget_date,
                new SimpleDateFormat("EEEE d MMM", Locale.getDefault()).format(new Date()));

        int count = WidgetStore.getList(ctx, "today").length();
        int open = 0;
        for (int i = 0; i < count; i++) {
            org.json.JSONObject o = WidgetStore.getList(ctx, "today").optJSONObject(i);
            if (o != null && !o.optBoolean("done", false)) open++;
        }
        views.setTextViewText(R.id.widget_count, open == 0 ? "All clear" : (open + " left"));

        // ── The list ──────────────────────────────────────────────────────
        Intent svc = new Intent(ctx, TodayTasksService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        // The launcher caches RemoteViewsServices by Intent. Without a unique
        // data URI per widget, placing a second copy silently reuses the first
        // one's adapter and both show identical content.
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, svc);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // ── Tapping a row ─────────────────────────────────────────────────
        // Collection items can't each own a PendingIntent — that would be one
        // per row and the system caps them. Instead the ListView gets a single
        // template, and each row supplies a "fill-in" Intent with its own extras.
        // The template MUST be mutable, or the fill-in values are discarded.
        Intent tick = new Intent(ctx, WidgetActionReceiver.class);
        tick.setAction(WidgetActionReceiver.ACTION_TICK);
        PendingIntent tickTemplate = PendingIntent.getBroadcast(
                ctx, 0, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.widget_list, tickTemplate);

        // ── Tapping the header opens the app ──────────────────────────────
        Intent open2 = new Intent(ctx, MainActivity.class);
        open2.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_header, PendingIntent.getActivity(
                ctx, 0, open2, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        return views;
    }

    /** Called by WidgetActionReceiver after a tick, to redraw everything. */
    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayTasksWidget.class));
        if (ids == null) return;
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
