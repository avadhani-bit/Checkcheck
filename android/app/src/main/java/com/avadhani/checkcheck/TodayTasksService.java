package com.avadhani.checkcheck;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Supplies the rows for the today-tasks ListView.
 *
 * The launcher binds to this service and asks for one row at a time. It runs
 * in your process but is called from the launcher's, so it must be cheap and
 * must never assume the app is running — it usually isn't. All it does is read
 * the snapshot out of SharedPreferences.
 */
public class TodayTasksService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static class Factory implements RemoteViewsService.RemoteViewsFactory {
        private final Context ctx;
        private JSONArray items = new JSONArray();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override
        public void onCreate() {
            load();
        }

        /** Called whenever notifyAppWidgetViewDataChanged fires. */
        @Override
        public void onDataSetChanged() {
            load();
        }

        private void load() {
            items = WidgetStore.getList(ctx, "today");
        }

        @Override
        public void onDestroy() {
            items = new JSONArray();
        }

        @Override
        public int getCount() {
            return items.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_today_item);
            JSONObject t = items.optJSONObject(position);
            if (t == null) return row;

            boolean done = t.optBoolean("done", false);
            String title = t.optString("title", "");
            String meta = t.optString("meta", "");

            row.setTextViewText(R.id.item_title, title);
            row.setTextViewText(R.id.item_meta, meta);
            row.setViewVisibility(R.id.item_meta, meta.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);

            // A widget can't apply a strikethrough span through RemoteViews, so
            // completion is shown by dimming the row and swapping the checkbox.
            row.setImageViewResource(R.id.item_check,
                    done ? R.drawable.ic_widget_checked : R.drawable.ic_widget_unchecked);
            row.setTextColor(R.id.item_title, done ? Color.parseColor("#9CA3AF") : Color.parseColor("#111827"));

            // Priority stripe. Colours match PRIORITIES in js/app.js.
            String priority = t.optString("priority", "");
            int stripe;
            if ("high".equals(priority)) stripe = Color.parseColor("#EF4444");
            else if ("medium".equals(priority)) stripe = Color.parseColor("#F59E0B");
            else if ("low".equals(priority)) stripe = Color.parseColor("#6366F1");
            else stripe = Color.TRANSPARENT;
            row.setInt(R.id.item_stripe, "setBackgroundColor", stripe);

            // Fill-in intent: merged into the ListView's template when tapped.
            Intent fill = new Intent();
            fill.putExtra(WidgetActionReceiver.EXTRA_KIND, t.optString("kind", "tasks"));
            fill.putExtra(WidgetActionReceiver.EXTRA_ID, t.optString("id"));
            fill.putExtra(WidgetActionReceiver.EXTRA_DONE, !done);
            row.setOnClickFillInIntent(R.id.item_root, fill);

            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            JSONObject t = items.optJSONObject(position);
            return t == null ? position : t.optString("id", String.valueOf(position)).hashCode();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
