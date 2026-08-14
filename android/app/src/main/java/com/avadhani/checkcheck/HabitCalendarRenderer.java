package com.avadhani.checkcheck;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;

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

    private static final int DONE       = Color.parseColor("#6366F1");
    private static final int DONE_LIGHT = Color.parseColor("#C7D2FE");
    private static final int EMPTY      = Color.parseColor("#EEF0F4");
    private static final int OFF_TARGET = Color.parseColor("#F8F9FC");
    private static final int TEXT_DIM   = Color.parseColor("#9CA3AF");
    private static final int TEXT       = Color.parseColor("#111827");
    private static final int TODAY_RING = Color.parseColor("#111827");

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

    public static Bitmap month(JSONObject habit, int widthPx) {
        int cols = 7;
        int pad = dp(2);
        int cell = (widthPx - pad * (cols + 1)) / cols;
        int labelH = dp(14);
        int rows = 6;
        int height = labelH + pad + rows * (cell + pad) + pad;

        Bitmap bmp = Bitmap.createBitmap(widthPx, height, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);

        Set<String> done = doneDays(habit);

        // Weekday initials. Monday-first, matching the app's calendars.
        String[] initials = {"M", "T", "W", "T", "F", "S", "S"};
        tp.setColor(TEXT_DIM);
        tp.setTextSize(dp(9));
        for (int i = 0; i < 7; i++) {
            float cx = pad + i * (cell + pad) + cell / 2f;
            cv.drawText(initials[i], cx, labelH - dp(3), tp);
        }

        Calendar cal = Calendar.getInstance();
        Calendar today = Calendar.getInstance();
        cal.set(Calendar.DAY_OF_MONTH, 1);
        int month = cal.get(Calendar.MONTH);

        // Calendar.DAY_OF_WEEK has SUNDAY=1; convert to Monday-first 0..6.
        int firstCol = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        int daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH);

        tp.setTextSize(dp(9));
        for (int day = 1; day <= daysInMonth; day++) {
            int idx = firstCol + day - 1;
            int r = idx / 7, c = idx % 7;
            float x = pad + c * (cell + pad);
            float y = labelH + pad + r * (cell + pad);

            cal.set(Calendar.DAY_OF_MONTH, day);
            boolean isDone = done.contains(key(cal));
            boolean target = isTargetDay(habit, cal);
            boolean isToday = cal.get(Calendar.MONTH) == today.get(Calendar.MONTH)
                    && cal.get(Calendar.DAY_OF_MONTH) == today.get(Calendar.DAY_OF_MONTH)
                    && cal.get(Calendar.YEAR) == today.get(Calendar.YEAR);
            boolean future = cal.after(today) && !isToday;

            p.setStyle(Paint.Style.FILL);
            p.setColor(isDone ? DONE : (!target || future ? OFF_TARGET : EMPTY));
            cv.drawRoundRect(x, y, x + cell, y + cell, dp(4), dp(4), p);

            if (isToday) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(1.5f));
                p.setColor(TODAY_RING);
                float in = dp(0.75f);
                cv.drawRoundRect(x + in, y + in, x + cell - in, y + cell - in, dp(4), dp(4), p);
            }

            tp.setColor(isDone ? Color.WHITE : (target && !future ? TEXT : TEXT_DIM));
            // Vertical centring: baseline sits half a text height below centre.
            Rect b = new Rect();
            String s = String.valueOf(day);
            tp.getTextBounds(s, 0, s.length(), b);
            cv.drawText(s, x + cell / 2f, y + cell / 2f + b.height() / 2f, tp);

            cal.set(Calendar.MONTH, month);   // guard against month rollover
        }

        return bmp;
    }

    // ── Week view ────────────────────────────────────────────────────────

    public static Bitmap week(JSONObject habit, int widthPx) {
        int cols = 7;
        int pad = dp(4);
        int cell = (widthPx - pad * (cols + 1)) / cols;
        int labelH = dp(14);
        int height = labelH + pad + cell + pad;

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
            float x = pad + i * (cell + pad);
            float y = labelH + pad;

            boolean isDone = done.contains(key(cur));
            boolean target = isTargetDay(habit, cur);
            boolean isToday = cur.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
                    && cur.get(Calendar.YEAR) == today.get(Calendar.YEAR);
            boolean future = cur.after(today) && !isToday;

            tp.setColor(isToday ? TEXT : TEXT_DIM);
            tp.setTextSize(dp(9));
            cv.drawText(initials[i], x + cell / 2f, labelH - dp(3), tp);

            p.setStyle(Paint.Style.FILL);
            p.setColor(isDone ? DONE : (!target || future ? OFF_TARGET : EMPTY));
            cv.drawRoundRect(x, y, x + cell, y + cell, dp(8), dp(8), p);

            if (isToday) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(2));
                p.setColor(TODAY_RING);
                float in = dp(1);
                cv.drawRoundRect(x + in, y + in, x + cell - in, y + cell - in, dp(8), dp(8), p);
            }

            if (isDone) {
                // Tick mark, same proportions as the app's logo stroke.
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(2));
                p.setColor(Color.WHITE);
                p.setStrokeCap(Paint.Cap.ROUND);
                float cx = x + cell / 2f, cy = y + cell / 2f, u = cell / 6f;
                cv.drawLine(cx - u, cy, cx - u / 3f, cy + u, p);
                cv.drawLine(cx - u / 3f, cy + u, cx + u, cy - u, p);
            } else {
                tp.setColor(target && !future ? TEXT : TEXT_DIM);
                tp.setTextSize(dp(10));
                Rect b = new Rect();
                String s = String.valueOf(cur.get(Calendar.DAY_OF_MONTH));
                tp.getTextBounds(s, 0, s.length(), b);
                cv.drawText(s, x + cell / 2f, y + cell / 2f + b.height() / 2f, tp);
            }

            cur.add(Calendar.DAY_OF_MONTH, 1);
        }

        return bmp;
    }

    /** These bitmaps are drawn at a fixed scale, so "dp" here is just a unit. */
    private static int dp(float v) {
        return Math.max(1, Math.round(v * 2f));
    }
}
