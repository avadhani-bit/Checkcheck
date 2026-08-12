#!/usr/bin/env python3
"""
gen-icons.py — generate every Android launcher icon and splash image
from the CheckCheck double-check mark.

Why this exists instead of @capacitor/assets: that tool depends on `sharp`,
which needs to download native binaries at install time. This script uses
Pillow and draws the mark directly from the same coordinates as the SVG in
index.html, so the app icon and the in-app logo can never drift apart.

Run:  python3 scripts/gen-icons.py
Then: npm run sync
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")

BRAND = (99, 102, 241, 255)      # #6366F1 — accent, icon + splash background
WHITE = (255, 255, 255, 255)

# The mark, taken straight from the <svg> in index.html (28x28 viewBox):
#   path 1: M4 14.5 l3.5 3.5 6.5 -8
#   path 2: M13 14.5 l3.5 3.5 6.5 -8
# stroke-width 2.2, round caps and joins.
VB = 28.0
STROKE = 2.2
CHECKS = [
    [(4.0, 14.5), (7.5, 18.0), (14.0, 10.0)],
    [(13.0, 14.5), (16.5, 18.0), (23.0, 10.0)],
]

# Tight bounding box of the drawn mark, including the stroke's round caps.
_r = STROKE / 2.0
MARK_X0, MARK_X1 = 4.0 - _r, 23.0 + _r
MARK_Y0, MARK_Y1 = 10.0 - _r, 18.0 + _r
MARK_W = MARK_X1 - MARK_X0
MARK_H = MARK_Y1 - MARK_Y0

SS = 4  # supersampling factor — draw big, shrink down, get smooth edges


def draw_mark(canvas_px, mark_width_frac, colour=WHITE):
    """
    Returns an RGBA image (canvas_px square, transparent) with the double-check
    mark centred, scaled so the mark spans `mark_width_frac` of the canvas width.

    Pillow has no round line caps, so each vertex and endpoint gets a circle
    painted over it. That's what produces the soft rounded ends of the SVG.
    """
    S = canvas_px * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    target_w = S * mark_width_frac
    scale = target_w / MARK_W
    off_x = (S - MARK_W * scale) / 2.0 - MARK_X0 * scale
    off_y = (S - MARK_H * scale) / 2.0 - MARK_Y0 * scale

    def pt(p):
        return (p[0] * scale + off_x, p[1] * scale + off_y)

    w = STROKE * scale
    for path in CHECKS:
        pts = [pt(p) for p in path]
        d.line(pts, fill=colour, width=int(round(w)), joint="curve")
        for (x, y) in pts:                      # round caps + joins
            r = w / 2.0
            d.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def rounded_square(size, radius_frac, colour):
    """Solid rounded square — the legacy (pre-adaptive) icon shape."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=int(S * radius_frac), fill=colour
    )
    return img.resize((size, size), Image.LANCZOS)


def circle(size, colour):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([0, 0, S - 1, S - 1], fill=colour)
    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print("  " + os.path.relpath(path, ROOT))


# ── Launcher icons ────────────────────────────────────────────────────────
# Legacy icons are the final rendered shape. Adaptive foregrounds are drawn on
# a 108dp canvas of which only the centre 66dp is guaranteed visible — the
# launcher crops the rest to whatever mask the phone uses. Hence the small
# mark fraction on the foreground: it keeps the mark inside the safe zone.
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

print("launcher icons:")
for dpi, px in LEGACY.items():
    base = rounded_square(px, 0.22, BRAND)
    base.alpha_composite(draw_mark(px, 0.68))
    save(base, f"{RES}/mipmap-{dpi}/ic_launcher.png")

    rnd = circle(px, BRAND)
    rnd.alpha_composite(draw_mark(px, 0.60))
    save(rnd, f"{RES}/mipmap-{dpi}/ic_launcher_round.png")

for dpi, px in ADAPTIVE.items():
    fg = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    fg.alpha_composite(draw_mark(px, 0.44))   # 0.44 keeps it inside the 66/108 safe zone
    save(fg, f"{RES}/mipmap-{dpi}/ic_launcher_foreground.png")

# ── Splash screens ────────────────────────────────────────────────────────
SPLASH = {
    "drawable": (480, 320),
    "drawable-port-mdpi": (320, 480), "drawable-land-mdpi": (480, 320),
    "drawable-port-hdpi": (480, 800), "drawable-land-hdpi": (800, 480),
    "drawable-port-xhdpi": (720, 1280), "drawable-land-xhdpi": (1280, 720),
    "drawable-port-xxhdpi": (960, 1600), "drawable-land-xxhdpi": (1600, 960),
    "drawable-port-xxxhdpi": (1280, 1920), "drawable-land-xxxhdpi": (1920, 1280),
}

print("splash screens:")
for folder, (w, h) in SPLASH.items():
    img = Image.new("RGBA", (w, h), BRAND)
    side = min(w, h)
    mark = draw_mark(side, 0.42)
    img.alpha_composite(mark, ((w - side) // 2, (h - side) // 2))
    save(img, f"{RES}/{folder}/splash.png")

# ── Web / PWA icons, so the browser and the APK stay identical ────────────
print("web icons:")
for px in (192, 512):
    img = rounded_square(px, 0.22, BRAND)
    img.alpha_composite(draw_mark(px, 0.68))
    save(img, os.path.join(ROOT, f"assets/icon-{px}.png"))

# Android 13+ themed ("monochrome") icon — the silhouette used when the user
# turns on themed icons. Must be a single-colour shape on transparent.
print("monochrome icon:")
for dpi, px in ADAPTIVE.items():
    mono = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    mono.alpha_composite(draw_mark(px, 0.44, colour=(0, 0, 0, 255)))
    save(mono, f"{RES}/mipmap-{dpi}/ic_launcher_monochrome.png")

# ── Status bar (notification) icon ────────────────────────────────────────
# Android draws these as a silhouette: it keeps the alpha channel and throws
# the colour away. So it must be a WHITE shape on transparent — anything else
# comes out as a solid white blob. This is why the app icon can't be reused.
STATUS = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

print("status bar icon:")
for dpi, px in STATUS.items():
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    img.alpha_composite(draw_mark(px, 0.86))
    save(img, f"{RES}/drawable-{dpi}/ic_stat_checkcheck.png")

print("\nDone. Now run: npm run sync")
