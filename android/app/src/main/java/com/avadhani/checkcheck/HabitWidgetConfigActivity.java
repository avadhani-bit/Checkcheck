package com.avadhani.checkcheck;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Shown when you drop a habit widget on the home screen: pick which habit.
 *
 * Built in code rather than XML because it's a plain list of buttons and an
 * XML layout plus adapter would be more moving parts than the screen deserves.
 * This is a normal Activity, not RemoteViews, so the view whitelist that
 * constrains the widgets themselves does not apply here.
 *
 * Two rules Android enforces and both are easy to get wrong:
 *   - setResult(RESULT_CANCELED) FIRST, so backing out doesn't leave a broken
 *     widget stuck on the home screen
 *   - the result Intent must carry EXTRA_APPWIDGET_ID back, or the launcher
 *     discards the widget you just configured
 */
public class HabitWidgetConfigActivity extends Activity {

    public static final String EXTRA_IS_MONTH = "is_month";

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private boolean isMonth = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setResult(RESULT_CANCELED);

        Intent intent = getIntent();
        Bundle extras = intent.getExtras();
        if (extras != null) {
            widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            isMonth = extras.getBoolean(EXTRA_IS_MONTH, true);
        }
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        // If launched from a placed widget we can't tell month from week via
        // the extra alone, so fall back to which provider owns this id.
        isMonth = extras != null && extras.containsKey(EXTRA_IS_MONTH)
                ? isMonth
                : providerIsMonth();

        setContentView(buildUi());
    }

    private boolean providerIsMonth() {
        AppWidgetManager mgr = AppWidgetManager.getInstance(this);
        android.appwidget.AppWidgetProviderInfo info = mgr.getAppWidgetInfo(widgetId);
        return info == null || info.provider == null
                || info.provider.getClassName().contains("Month");
    }

    private View buildUi() {
        int pad = dp(20);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("Which habit?");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#111827"));
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText(isMonth ? "Shown as a month grid" : "Shown as this week");
        sub.setTextSize(13);
        sub.setTextColor(Color.parseColor("#6B7280"));
        sub.setPadding(0, dp(4), 0, dp(16));
        root.addView(sub);

        JSONArray habits = WidgetStore.getList(this, "habits");

        if (habits.length() == 0) {
            TextView empty = new TextView(this);
            // The snapshot only exists once the app has run at least once.
            empty.setText("No habits found.\n\nOpen CheckCheck once so it can share your habits, then add this widget again.");
            empty.setTextSize(14);
            empty.setTextColor(Color.parseColor("#6B7280"));
            empty.setLineSpacing(dp(4), 1f);
            root.addView(empty);
            return root;
        }

        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);

        for (int i = 0; i < habits.length(); i++) {
            final JSONObject h = habits.optJSONObject(i);
            if (h == null) continue;

            TextView row = new TextView(this);
            String emoji = h.optString("emoji", "");
            row.setText((emoji.isEmpty() ? "" : emoji + "   ") + h.optString("name", ""));
            row.setTextSize(16);
            row.setTextColor(Color.parseColor("#111827"));
            row.setPadding(dp(14), dp(14), dp(14), dp(14));
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setBackgroundColor(Color.parseColor("#F3F4F6"));

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(8);
            row.setLayoutParams(lp);

            row.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    choose(h.optString("id"));
                }
            });

            list.addView(row);
        }

        ScrollView scroll = new ScrollView(this);
        scroll.addView(list);
        root.addView(scroll);

        return root;
    }

    private void choose(String habitId) {
        HabitWidgetPrefs.setHabitId(this, widgetId, habitId);

        AppWidgetManager mgr = AppWidgetManager.getInstance(this);
        mgr.updateAppWidget(widgetId, HabitWidgetBase.build(this, widgetId, isMonth));

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
