package com.avadhani.checkcheck;

import android.content.Context;

/**
 * Remembers which habit each placed widget shows.
 *
 * Keyed by appWidgetId, which Android assigns when you drop a widget on the
 * home screen and keeps for its lifetime. That's what makes it possible to
 * place the same widget several times for different habits.
 */
public class HabitWidgetPrefs {

    private static String key(int widgetId) {
        return "habit_widget_" + widgetId;
    }

    public static void setHabitId(Context ctx, int widgetId, String habitId) {
        WidgetStore.prefs(ctx).edit().putString(key(widgetId), habitId).apply();
    }

    public static String getHabitId(Context ctx, int widgetId) {
        return WidgetStore.prefs(ctx).getString(key(widgetId), null);
    }

    /** Called from onDeleted so removed widgets don't leave entries behind. */
    public static void clear(Context ctx, int widgetId) {
        WidgetStore.prefs(ctx).edit().remove(key(widgetId)).apply();
    }
}
