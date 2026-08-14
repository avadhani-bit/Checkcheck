package com.avadhani.checkcheck;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

/** Supplies the rows for the chores widget. See TodayTasksService for the pattern. */
public class ChoresService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static class Factory implements RemoteViewsService.RemoteViewsFactory {
        private final Context ctx;
        private JSONArray items = new JSONArray();

        Factory(Context ctx) { this.ctx = ctx; }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() { items = new JSONArray(); }
        @Override public int getCount() { return items.length(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public boolean hasStableIds() { return true; }

        private void load() { items = WidgetStore.getList(ctx, "chores"); }

        @Override
        public long getItemId(int position) {
            JSONObject c = items.optJSONObject(position);
            return c == null ? position : c.optString("id", String.valueOf(position)).hashCode();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            // Every view class in this layout must be one RemoteViews can
            // inflate — no bare <View>. See widget_chores_item.xml.
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_chores_item);
            JSONObject c = items.optJSONObject(position);
            if (c == null) return row;

            String emoji = c.optString("emoji", "");
            row.setTextViewText(R.id.item_emoji, emoji.isEmpty() ? "•" : emoji);
            row.setTextViewText(R.id.item_title, c.optString("title", ""));
            row.setTextViewText(R.id.item_meta, c.optString("meta", ""));

            // status: overdue | due | soon | ok — colours match the app's chore cards
            String status = c.optString("status", "ok");
            int colour;
            if ("overdue".equals(status)) colour = Color.parseColor("#EF4444");
            else if ("due".equals(status)) colour = Color.parseColor("#F59E0B");
            else if ("soon".equals(status)) colour = Color.parseColor("#6366F1");
            else colour = Color.parseColor("#10B981");
            row.setInt(R.id.item_stripe, "setBackgroundColor", colour);
            row.setTextColor(R.id.item_meta, colour);

            Intent fill = new Intent();
            fill.putExtra(WidgetActionReceiver.EXTRA_KIND, "chores");
            fill.putExtra(WidgetActionReceiver.EXTRA_ID, c.optString("id"));
            fill.putExtra(WidgetActionReceiver.EXTRA_DONE, true);
            row.setOnClickFillInIntent(R.id.item_root, fill);

            return row;
        }
    }
}
