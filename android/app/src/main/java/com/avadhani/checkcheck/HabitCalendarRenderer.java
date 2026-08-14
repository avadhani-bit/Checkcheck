package com.avadhani.checkcheck;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * Draws the habit calendars as a Bitmap.
 *
 * WHY A BITMAP AND NOT A LAYOUT
 * A month grid is 42 cells. Expressing that in RemoteViews means 42 declared
 * view ids and 42 setter calls per redraw, or a GridView plus another
 * RemoteViewsService. Both are far more code than drawing it, and neither can
 * do rounded day cells or a proper "today" ring. Canvas gives exact control
 * and the whole thing is one setImageViewBitmap call.
 *
 * The tradeoff is that RemoteViews bitmaps count against a per-widget memory
 * budget, so these are rendered at modest pixel sizes rather than screen density.
 */
public class HabitCalendarRenderer {

    /**
     * Colours come from resources rather than constants so the grids follow
     * light/dark mode. Resolved per call because the widget can be rebuilt
     * after the user switches theme, and a cached palette would keep the
     * old one until the app process restarted.
     */
    private static class Palette {
        final int done, missed, rest, future, ring, textDim, text;

        Palette(Context ctx) {
            done    = ctx.getColor(R.color.widget_cell_done);
            missed  = ctx.getColor(R.color.widget_cell_missed);
            rest    = ctx.getColor(R.color.widget_cell_rest);
            future  = ctx.getColor(R.color.widget_cell_future);
            ring    = ctx.getColor(R.color.widget_today_ring);
            textDim = ctx.getColor(R.color.widget_text_secondary);
            text    = ctx.getColor(R.color.widget_text_primary);
        }
    }

    /** Days the habit was completed, as yyyy-MM-dd, taken from the snapshot. */
    private static Set<String> doneDays(JSONObject habit) {
        Set<String> out = new HashSet<>();
        JSONArray arr = habit.optJSONArray("days");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) out.add(arr.optString(i));
        return out;
    }

    private static String key(Calendar c) {
        return String.format(java.util.Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private static boolean isTargetDay(JSONObject habit, Calendar c) {
        String target = habit.optString("targetDays", "daily");
        int dow = c.get(Calendar.DAY_OF_WEEK);              // SUN=1 .. SAT=7
        if ("weekdays".equals(target)) return dow >= Calendar.MONDAY && dow <= Calendar.FRIDAY;
        if ("weekends".equals(target)) return dow == Calendar.SATURDAY || dow == Calendar.SUNDAY;
        return true;
    }

    // ── Month view ───────────────────────────────────────────────────────

    public static Bitmap month(Context ctx, JSONObject habit, int widthPx) {
        Palette pal = new Palette(ctx);

        // Day numbers are back. They were dropped when the grid was tiny and
        // they were illegible; now that the bitmap scales to the card width the
        // cells are big enough to carry them, and a calendar without dates is
        // hard to read a specific day off.
        //
        // Height is derived from the number of weeks this month ACTUALLY spans,
        // not a fixed six. Most months need five, and always drawing six left an
        // empty row of dead space at the bottom of every widget.
        int cols = 7;
        int gap = dp(3);
        int cell = (widthPx - gap * (cols - 1)) / cols;
        // Cells are slightly SHORTER than they are wide. Seven square columns
        // make an inherently square block, and six rows of it forced the widget
        // to be three cells tall. Squashing each cell to 84% height takes ~16%
        // off the total without narrowing the grid or shrinking the numbers.
        int cellH = Math.round(cell * 0.84f);
        int labelH = Math.round(cell * 0.58f);          // weekday initials strip

        Calendar cal = Calendar.getInstance();
        Calendar today = Calendar.getInstance();
        cal.set(Calendar.DAY_OF_MONTH, 1);

        // Calendar.DAY_OF_WEEK has SUNDAY=1; convert to Monday-first 0..6.
        int firstCol = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        int daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (int) Math.ceil((firstCol + daysInMonth) / 7.0);

        int height = labelH + rows * cellH + (rows - 1) * gap;

        Bitmap bmp = Bitmap.createBitmap(widthPx, height, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);

        Set<String> done = doneDays(habit);
        float radius = cell * 0.28f;

        // Weekday initials, Monday first to match the app's calendars.
        String[] initials = {"M", "T", "W", "T", "F", "S", "S"};
        tp.setColor(pal.textDim);
        tp.setTextSize(cell * 0.42f);
        for (int i = 0; i < 7; i++) {
            cv.drawText(initials[i], i * (cell + gap) + cell / 2f, labelH * 0.78f, tp);
        }

        tp.setTextSize(cell * 0.44f);
        for (int day = 1; day <= daysInMonth; day++) {
            int idx = firstCol + day - 1;
            int r = idx / 7, c = idx % 7;
            float x = c * (cell + gap);
            float y = labelH + r * (cellH + gap);

            cal.set(Calendar.DAY_OF_MONTH, day);
            boolean isDone = done.contains(key(cal));
            boolean target = isTargetDay(habit, cal);
            boolean isToday = cal.get(Calendar.DAY_OF_MONTH) == today.get(Calendar.DAY_OF_MONTH)
                    && cal.get(Calendar.MONTH) == today.get(Calendar.MONTH)
                    && cal.get(Calendar.YEAR) == today.get(Calendar.YEAR);
            boolean future = cal.after(today) && !isToday;

            p.setStyle(Paint.Style.FILL);
            p.setColor(isDone ? pal.done : (future ? pal.future : (!target ? pal.rest : pal.missed)));
            cv.drawRoundRect(x, y, x + cell, y + cellH, radius, radius, p);

            if (isToday && !isDone) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(1.5f));
                p.setColor(pal.ring);
                float in = dp(0.75f);
                cv.drawRoundRect(x + in, y + in, x + cell - in, y + cellH - in, radius, radius, p);
            }

            // White on a filled cell, dim on a future one, normal otherwise.
            tp.setColor(isDone ? Color.WHITE : (future || !target ? pal.textDim : pal.text));
            cv.drawText(String.valueOf(day), x + cell / 2f, y + cellH / 2f + cell * 0.16f, tp);
        }

        return bmp;
    }

    // ── Week view ────────────────────────────────────────────────────────

    public static Bitmap week(Context ctx, JSONObject habit, int widthPx) {
        Palette pal = new Palette(ctx);
        // Seven days gets enough room for a weekday letter, unlike the month
        // grid. Sized to content so the ImageView never scales it up.
        int cols = 7;
        int pad = dp(4);
        int cell = (widthPx - pad * (cols - 1)) / cols;
        int labelH = dp(13);
        int height = labelH + dp(3) + cell;

        Bitmap bmp = Bitmap.createBitmap(widthPx, height, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);

        Set<String> done = doneDays(habit);

        Calendar today = Calendar.getInstance();
        Calendar cur = Calendar.getInstance();
        // Rewind to Monday of the current week.
        int back = (cur.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        cur.add(Calendar.DAY_OF_MONTH, -back);

        String[] initials = {"M", "T", "W", "T", "F", "S", "S"};

        for (int i = 0; i < 7; i++) {
            float x = i * (cell + pad);
            float y = labelH + dp(3);

            boolean isDone = done.contains(key(cur));
            boolean target = isTargetDay(habit, cur);
            boolean isToday = cur.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
                    && cur.get(Calendar.YEAR) == today.get(Calendar.YEAR);
            boolean future = cur.after(today) && !isToday;

            tp.setColor(isToday ? pal.text : pal.textDim);
            tp.setTextSize(cell * 0.34f);
            cv.drawText(initials[i], x + cell / 2f, labelH - dp(2), tp);

            p.setStyle(Paint.Style.FILL);
            p.setColor(isDone ? pal.done : (future ? pal.future : (!target ? pal.rest : pal.missed)));
            float rad = cell * 0.3f;
            cv.drawRoundRect(x, y, x + cell, y + cell, rad, rad, p);

            if (isToday && !isDone) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(1.5f));
                p.setColor(pal.ring);
                float in = dp(0.75f);
                cv.drawRoundRect(x + in, y + in, x + cell - in, y + cell - in, rad, rad, p);
            }

            // Date in every cell, like the month grid. A tick told you the day
            // was done but not WHICH day, which made the strip hard to read
            // against a calendar.
            tp.setColor(isDone ? Color.WHITE : (future || !target ? pal.textDim : pal.text));
            tp.setTextSize(cell * 0.4f);
            cv.drawText(String.valueOf(cur.get(Calendar.DAY_OF_MONTH)),
                    x + cell / 2f, y + cell / 2f + cell * 0.145f, tp);

            cur.add(Calendar.DAY_OF_MONTH, 1);
        }

        return bmp;
    }

    /** These bitmaps are drawn at a fixed scale, so "dp" here is just a unit. */
    private static int dp(float v) {
        return Math.max(1, Math.round(v * 2f));
    }
}
