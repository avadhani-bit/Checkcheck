#!/usr/bin/env python3
"""
gen-widget-previews.py — the images shown in Android's widget picker.

Without these, every widget shows the app icon in the picker and you have to
place one to find out what it looks like. Android can use previewLayout on
API 31+ to render the real layout, but with no data it draws an empty shell —
worse than a mock.

These are deliberately drawn with the same colours, spacing and proportions as
the real widgets, so the picker doesn't promise something the widget doesn't
deliver. If you restyle a widget, rerun this.

Run:  python3 scripts/gen-widget-previews.py
Then: cd android && ./gradlew installDebug
"""

import os
from datetime import date, timedelta
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIGHT_OUT = os.path.join(ROOT, "android/app/src/main/res/drawable-xhdpi")
NIGHT_OUT = os.path.join(ROOT, "android/app/src/main/res/drawable-night-xhdpi")
os.makedirs(LIGHT_OUT, exist_ok=True)
os.makedirs(NIGHT_OUT, exist_ok=True)

S = 3  # supersample, downscaled at save time for clean edges

# Must track values/colors_widget.xml and values-night/colors_widget.xml.
THEMES = {
    "light": dict(OUT=LIGHT_OUT, CARD=(255, 255, 255), INK=(17, 24, 39), DIM=(156, 163, 175),
                  BRAND=(99, 102, 241), ACCENT=(99, 102, 241), EMPTY=(231, 233, 239),
                  OFF=(241, 242, 246), FUTURE=(245, 246, 250), OUTLINE=(209, 213, 219)),
    "night": dict(OUT=NIGHT_OUT, CARD=(28, 28, 30), INK=(245, 245, 247), DIM=(142, 142, 147),
                  BRAND=(99, 102, 241), ACCENT=(139, 141, 247), EMPTY=(46, 46, 49),
                  OFF=(37, 37, 39), FUTURE=(36, 36, 38), OUTLINE=(72, 72, 74)),
}
RED = (239, 68, 68)
AMBER = (245, 158, 11)


def font(px, bold=False):
    names = (["DejaVuSans-Bold.ttf"] if bold else []) + ["DejaVuSans.ttf"]
    for n in names:
        for p in ("/usr/share/fonts/truetype/dejavu/" + n, n):
            try:
                return ImageFont.truetype(p, px)
            except Exception:
                pass
    return ImageFont.load_default()


def card(w, h):
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=20 * S, fill=CARD)
    return img, d


def save(img, w, h, out_dir, name):
    img.resize((w, h), Image.LANCZOS).save(os.path.join(out_dir, name + ".png"), "PNG")
    print("  " + name + ".png")


def header(d, x, y, title, right=None, right_col=None):
    right_col = right_col or ACCENT
    d.rounded_rectangle([x, y, x + 13 * S, y + 13 * S], radius=4 * S, fill=BRAND)
    d.text((x + 19 * S, y - 1 * S), title, font=font(12 * S, True), fill=INK)
    if right:
        w = d.textlength(right, font=font(10 * S, True))
        d.text((PW * S - 12 * S - w, y + 1 * S), right, font=font(10 * S, True), fill=right_col)


def row(d, y, title, meta, stripe=None, check=False, emoji=None):
    x = 12 * S
    if stripe:
        d.rounded_rectangle([x, y + 2 * S, x + 3 * S, y + 20 * S], radius=1 * S, fill=stripe)
        x += 9 * S
    if check:
        if emoji == "done":
            d.rounded_rectangle([x, y + 3 * S, x + 14 * S, y + 17 * S], radius=4 * S, fill=BRAND)
            d.line([(x + 3.5 * S, y + 10 * S), (x + 6 * S, y + 13 * S), (x + 11 * S, y + 6.5 * S)],
                   fill=CARD, width=int(2 * S), joint="curve")
        else:
            d.rounded_rectangle([x, y + 3 * S, x + 14 * S, y + 17 * S], radius=4 * S,
                                outline=OUTLINE, width=int(1.6 * S))
        x += 20 * S
    d.text((x, y + 1 * S), title, font=font(11 * S), fill=DIM if emoji == "done" else INK)
    if meta:
        d.text((x, y + 12 * S), meta, font=font(9 * S), fill=DIM)


for _name, _t in THEMES.items():
    OUT = _t["OUT"]
    CARD, INK, DIM = _t["CARD"], _t["INK"], _t["DIM"]
    BRAND, EMPTY, OFF, FUTURE = _t["BRAND"], _t["EMPTY"], _t["OFF"], _t["FUTURE"]
    ACCENT, OUTLINE = _t["ACCENT"], _t["OUTLINE"]
    print(_name + ":")

    # ── Today ────────────────────────────────────────────────────────────
    
    PW, PH = 180, 110
    img, d = card(PW, PH)
    header(d, 12 * S, 12 * S, "Today", "3 left")
    row(d, 34 * S, "Submit Q3 report", "Compliance · Overdue", stripe=RED, check=True)
    row(d, 58 * S, "Reply to auditor", "Compliance", stripe=RED, check=True)
    row(d, 82 * S, "Order charger", "Admin", stripe=None, check=True, emoji="done")
    save(img, PW, PH, OUT, "preview_today")
    
    # ── Chores ───────────────────────────────────────────────────────────────
    img, d = card(PW, PH)
    header(d, 12 * S, 12 * S, "Chores", "2 due", RED)
    row(d, 34 * S, "Take out bins", "3d overdue", stripe=RED)
    row(d, 58 * S, "Vacuum", "Due today", stripe=AMBER)
    row(d, 82 * S, "Water plants", "In 2d", stripe=BRAND)
    save(img, PW, PH, OUT, "preview_chores")
    
    # ── Habit month ──────────────────────────────────────────────────────
    # Mirrors HabitCalendarRenderer.month(): weekday strip, day numbers, and a
    # row count derived from the weeks the month actually spans.
    import calendar as _cal
    _t = date.today()
    first_col = _cal.monthrange(_t.year, _t.month)[0]        # Mon=0
    ndays = _cal.monthrange(_t.year, _t.month)[1]
    nrows = -(-(first_col + ndays) // 7)

    PW = 160
    inner = (PW - 20) * S
    gap = 3 * S
    cellm = (inner - gap * 6) / 7
    cellmH = cellm * 0.84
    labelH = cellm * 0.58
    grid_h = labelH + nrows * cellmH + (nrows - 1) * gap
    PH = int(round((10 + 16 + 6) + grid_h / S + 10))

    img, d = card(PW, PH)
    d.text((10 * S, 9 * S), "Floss", font=font(11 * S, True), fill=INK)
    _streak = "12 day streak"
    _w = d.textlength(_streak, font=font(9 * S))
    d.text((PW * S - 10 * S - _w, 11 * S), _streak, font=font(9 * S), fill=DIM)

    gx, gy = 10 * S, 32 * S
    for i, ini in enumerate(["M", "T", "W", "T", "F", "S", "S"]):
        tw = d.textlength(ini, font=font(cellm * 0.42))
        d.text((gx + i * (cellm + gap) + cellm / 2 - tw / 2, gy), ini,
               font=font(cellm * 0.42), fill=DIM)

    gy += labelH
    for day in range(1, ndays + 1):
        idx = first_col + day - 1
        r, c = divmod(idx, 7)
        x, y = gx + c * (cellm + gap), gy + r * (cellmH + gap)
        if day > _t.day:
            col, tcol = FUTURE, DIM
        elif day in (4, 11, 17, 23):
            col, tcol = EMPTY, INK
        elif idx % 7 == 6:
            col, tcol = OFF, DIM
        else:
            col, tcol = BRAND, CARD
        d.rounded_rectangle([x, y, x + cellm, y + cellmH], radius=cellm * 0.28, fill=col)
        if day == _t.day:
            d.rounded_rectangle([x, y, x + cellm, y + cellmH], radius=cellm * 0.28,
                                outline=INK, width=int(1.4 * S))
        ds = str(day)
        tw = d.textlength(ds, font=font(cellm * 0.44))
        d.text((x + cellm / 2 - tw / 2, y + cellmH / 2 - cellm * 0.3), ds,
               font=font(cellm * 0.44), fill=tcol)
    save(img, PW, PH, OUT, "preview_habit_month")

    # ── Habit week ───────────────────────────────────────────────────────
    PW = 220
    innerw = (PW - 20) * S
    gapw = 4 * S
    cellw = (innerw - gapw * 6) / 7
    labelHw = cellw * 0.5
    PH = int(round(10 + 16 + 6 + (labelHw + cellw) / S + 10))

    img, d = card(PW, PH)
    d.text((10 * S, 8 * S), "Floss", font=font(11 * S, True), fill=INK)
    _w = d.textlength("12 day streak", font=font(9 * S))
    d.text((PW * S - 10 * S - _w, 10 * S), "12 day streak", font=font(9 * S), fill=DIM)

    gx, gy = 10 * S, 30 * S
    mon = _t - timedelta(days=_t.weekday())
    for i, ini in enumerate(["M", "T", "W", "T", "F", "S", "S"]):
        x = gx + i * (cellw + gapw)
        tw = d.textlength(ini, font=font(cellw * 0.34))
        d.text((x + cellw / 2 - tw / 2, gy), ini, font=font(cellw * 0.34), fill=DIM)
        y = gy + labelHw
        dd = mon + timedelta(days=i)
        if dd > _t:
            col, tcol = FUTURE, DIM
        elif i == 4:
            col, tcol = EMPTY, INK
        else:
            col, tcol = BRAND, CARD
        d.rounded_rectangle([x, y, x + cellw, y + cellw], radius=cellw * 0.3, fill=col)
        if dd == _t:
            d.rounded_rectangle([x, y, x + cellw, y + cellw], radius=cellw * 0.3,
                                outline=INK, width=int(1.4 * S))
        ds = str(dd.day)
        tw = d.textlength(ds, font=font(cellw * 0.4))
        d.text((x + cellw / 2 - tw / 2, y + cellw / 2 - cellw * 0.27), ds,
               font=font(cellw * 0.4), fill=tcol)
    save(img, PW, PH, OUT, "preview_habit_week")
    
    print("\nDone. Rebuild the app to see them in the widget picker.")
