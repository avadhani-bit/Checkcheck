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
OUT = os.path.join(ROOT, "android/app/src/main/res/drawable-xhdpi")
os.makedirs(OUT, exist_ok=True)

S = 3  # supersample, downscaled at save time for clean edges

BRAND = (99, 102, 241)
INK = (17, 24, 39)
DIM = (156, 163, 175)
CARD = (255, 255, 255)
EMPTY = (231, 233, 239)
OFF = (241, 242, 246)
FUTURE = (245, 246, 250)
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


def save(img, w, h, name):
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name + ".png"), "PNG")
    print("  " + name + ".png")


def header(d, x, y, title, right=None, right_col=BRAND):
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
                                outline=(209, 213, 219), width=int(1.6 * S))
        x += 20 * S
    d.text((x, y + 1 * S), title, font=font(11 * S), fill=DIM if emoji == "done" else INK)
    if meta:
        d.text((x, y + 12 * S), meta, font=font(9 * S), fill=DIM)


# ── Today ────────────────────────────────────────────────────────────────
PW, PH = 180, 110
img, d = card(PW, PH)
header(d, 12 * S, 12 * S, "Today", "3 left")
row(d, 34 * S, "Submit Q3 report", "Compliance · Overdue", stripe=RED, check=True)
row(d, 58 * S, "Reply to auditor", "Compliance", stripe=RED, check=True)
row(d, 82 * S, "Order charger", "Admin", stripe=None, check=True, emoji="done")
save(img, PW, PH, "preview_today")

# ── Chores ───────────────────────────────────────────────────────────────
img, d = card(PW, PH)
header(d, 12 * S, 12 * S, "Chores", "2 due", RED)
row(d, 34 * S, "Take out bins", "3d overdue", stripe=RED)
row(d, 58 * S, "Vacuum", "Due today", stripe=AMBER)
row(d, 82 * S, "Water plants", "In 2d", stripe=BRAND)
save(img, PW, PH, "preview_chores")

# ── Habit month ──────────────────────────────────────────────────────────
PW, PH = 160, 150
img, d = card(PW, PH)
d.ellipse([10 * S, 11 * S, 17 * S, 18 * S], fill=BRAND)
d.text((21 * S, 9 * S), "Floss", font=font(11 * S, True), fill=INK)
d.text((10 * S, 24 * S), "August 2026 · 12 day streak", font=font(8 * S), fill=DIM)

# Size the cell from the available HEIGHT, not the width. Six rows have to fit
# inside the card; deriving from width overflowed the bottom edge.
gy = 40 * S
gap = 3 * S
avail_h = (PH - 40 - 10) * S
cell = (avail_h - gap * 5) / 6
grid_w = cell * 7 + gap * 6
gx = ((PW * S) - grid_w) / 2
today_idx = 25
for i in range(42):
    r, c = divmod(i, 7)
    x, y = gx + c * (cell + gap), gy + r * (cell + gap)
    if i > today_idx:
        col = FUTURE
    elif i in (4, 11, 17, 23):
        col = EMPTY
    elif i % 7 == 6:
        col = OFF
    else:
        col = BRAND
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.28, fill=col)
    if i == today_idx:
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.28,
                            outline=INK, width=int(1.4 * S))
save(img, PW, PH, "preview_habit_month")

# ── Habit week ───────────────────────────────────────────────────────────
PW, PH = 220, 70
img, d = card(PW, PH)
d.ellipse([10 * S, 10 * S, 17 * S, 17 * S], fill=BRAND)
d.text((21 * S, 8 * S), "Floss", font=font(11 * S, True), fill=INK)
d.text((10 * S, 21 * S), "This week · 12 day streak", font=font(8 * S), fill=DIM)

gx, gy = 10 * S, 36 * S
gap = 4 * S
cell = ((PW - 20) * S - gap * 6) / 7
initials = ["M", "T", "W", "T", "F", "S", "S"]
mon = date.today() - timedelta(days=date.today().weekday())
for i in range(7):
    x = gx + i * (cell + gap)
    tw = d.textlength(initials[i], font=font(8 * S))
    d.text((x + cell / 2 - tw / 2, gy - 1 * S), initials[i], font=font(8 * S), fill=DIM)
    y = gy + 11 * S
    col = BRAND if i < 4 else (EMPTY if i == 4 else FUTURE)
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.3, fill=col)
    if col == BRAND:
        u = cell / 6
        cx, cy = x + cell / 2, y + cell / 2
        d.line([(cx - u, cy), (cx - u / 3, cy + u), (cx + u, cy - u)],
               fill=CARD, width=int(1.8 * S), joint="curve")
    if i == 4:
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.3,
                            outline=INK, width=int(1.4 * S))
save(img, PW, PH, "preview_habit_week")

print("\nDone. Rebuild the app to see them in the widget picker.")
