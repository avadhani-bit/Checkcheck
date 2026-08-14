package com.avadhani.checkcheck;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Shared behaviour for the two habit calendar widgets.
 *
 * Each placed widget remembers which habit it shows, keyed by its
 * appWidgetId — that's what the config activity writes. So you can place
 * the month widget three times for three different habits.
 */
public abstract class HabitWidgetBase extends AppWidgetProvider {

    protected abstract boolean isMonth();

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id, isMonth()));
    }

    /** Clean up the stored habit id when a widget is removed from the home screen. */
    @Override
    public void onDeleted(Context ctx, int[] ids) {
        for (int id : ids) HabitWidgetPrefs.clear(ctx, id);
    }

    static RemoteViews build(Context ctx, int widgetId, boolean month) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_habit);

        String habitId = HabitWidgetPrefs.getHabitId(ctx, widgetId);
        JSONObject habit = findHabit(ctx, habitId);

        if (habit == null) {
            // Either nothing was chosen, or the habit was deleted in the app.
            views.setTextViewText(R.id.habit_name, "Tap to pick a habit");
            views.setTextViewText(R.id.habit_sub, "");
            views.setViewVisibility(R.id.habit_grid, android.view.View.GONE);
            views.setOnClickPendingIntent(R.id.habit_root, configIntent(ctx, widgetId, month));
            return views;
        }

        String emoji = habit.optString("emoji", "");
        views.setTextViewText(R.id.habit_name,
                (emoji.isEmpty() ? "" : emoji + "  ") + habit.optString("name", ""));

        String sub = month
                ? new SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(new Date())
                : "This week";
        int streak = habit.optInt("streak", 0);
        views.setTextViewText(R.id.habit_sub,
                streak > 0 ? sub + "  ·  " + streak + " day streak" : sub);

        views.setViewVisibility(R.id.habit_grid, android.view.View.VISIBLE);
        Bitmap bmp = month
                ? HabitCalendarRenderer.month(habit, 640)
                : HabitCalendarRenderer.week(habit, 640);
        views.setImageViewBitmap(R.id.habit_grid, bmp);

        // Tapping toggles today. Unlike the list widgets there's no collection
        // here, so this is a direct PendingIntent rather than a fill-in.
        // requestCode must be unique per widget or all copies share one intent
        // and every tap toggles whichever habit was registered last.
        Intent tick = new Intent(ctx, WidgetActionReceiver.class);
        tick.setAction(WidgetActionReceiver.ACTION_TICK);
        tick.putExtra(WidgetActionReceiver.EXTRA_KIND, "habits");
        tick.putExtra(WidgetActionReceiver.EXTRA_ID, habit.optString("id"));
        tick.putExtra(WidgetActionReceiver.EXTRA_DONE, !habit.optBoolean("doneToday", false));
        tick.setData(android.net.Uri.parse("checkcheck://habit/" + widgetId));
        views.setOnClickPendingIntent(R.id.habit_root, PendingIntent.getBroadcast(
                ctx, 2000 + widgetId, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        views.setTextViewText(R.id.habit_hint,
                habit.optBoolean("doneToday", false) ? "Done today · tap to undo" : "Tap to mark today");

        return views;
    }

    private static PendingIntent configIntent(Context ctx, int widgetId, boolean month) {
        Intent i = new Intent(ctx, HabitWidgetConfigActivity.class);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        i.putExtra(HabitWidgetConfigActivity.EXTRA_IS_MONTH, month);
        i.setData(android.net.Uri.parse("checkcheck://config/" + widgetId));
        return PendingIntent.getActivity(ctx, 3000 + widgetId, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static JSONObject findHabit(Context ctx, String habitId) {
        if (habitId == null) return null;
        JSONArray habits = WidgetStore.getList(ctx, "habits");
        for (int i = 0; i < habits.length(); i++) {
            JSONObject h = habits.optJSONObject(i);
            if (h != null && habitId.equals(h.optString("id"))) return h;
        }
        return null;
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        redraw(ctx, mgr, HabitMonthWidget.class, true);
        redraw(ctx, mgr, HabitWeekWidget.class, false);
    }

    private static void redraw(Context ctx, AppWidgetManager mgr, Class<?> cls, boolean month) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
        if (ids == null) return;
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id, month));
    }
}
