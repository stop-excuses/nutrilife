#!/usr/bin/env python3
"""Generate NutriLife PWA icons using Pillow."""

from PIL import Image, ImageDraw
import math
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "images", "pwa")


def make_rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + t * (c2[i] - c1[i])) for i in range(3))


def vertical_gradient_rgba(size, top, bot):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        c = lerp_color(top, bot, y / max(size - 1, 1))
        draw.line([(0, y), (size - 1, y)], fill=(*c, 255))
    return img


def leaf_pts(cx, cy, w, h, angle_deg=0):
    """Diamond-style leaf: sharp tip top, wide belly, pointed base."""
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)

    local = [
        (0,       -h),            # tip
        (w,       -int(h * 0.08)),# right belly
        (0,        int(h * 0.32)),# base
        (-w,      -int(h * 0.08)),# left belly
    ]

    result = []
    for px, py in local:
        rx = px * cos_a - py * sin_a + cx
        ry = px * sin_a + py * cos_a + cy
        result.append((rx, ry))
    return result


def create_icon(size: int) -> Image.Image:
    s = size
    cx, cy = s // 2, s // 2

    # ── Background gradient (deep forest green → slightly lighter) ────────────
    img = vertical_gradient_rgba(s, (5, 14, 2), (10, 25, 5))
    img.putalpha(make_rounded_mask(s, s // 5))

    draw = ImageDraw.Draw(img, "RGBA")

    # ── Colours ───────────────────────────────────────────────────────────────
    LIME  = (151, 196, 89)   # #97C459  bright leaf
    MID   = (80,  145, 28)   # mid green
    DARK  = (45,   90, 12)   # darker back leaves
    STEM  = (72,  130, 32)
    VEIN  = (195, 238, 135, 190)

    # ── Stem ──────────────────────────────────────────────────────────────────
    stem_top_y = cy - int(s * 0.31)
    stem_bot_y = cy + int(s * 0.24)
    sw = max(3, s // 44)
    draw.line([(cx, stem_top_y), (cx, stem_bot_y)], fill=STEM, width=sw)

    # ── Far side leaves (draw first = behind) ─────────────────────────────────
    bw = int(s * 0.185)
    bh = int(s * 0.260)
    bx  = int(s * 0.190)
    by  = cy - int(s * 0.035)
    draw.polygon(leaf_pts(cx - bx, by, bw, bh, -44), fill=DARK)
    draw.polygon(leaf_pts(cx + bx, by, bw, bh,  44), fill=DARK)

    # ── Mid upper leaves ──────────────────────────────────────────────────────
    mw = int(s * 0.140)
    mh = int(s * 0.210)
    mx = int(s * 0.095)
    my = cy - int(s * 0.185)
    draw.polygon(leaf_pts(cx - mx, my, mw, mh, -20), fill=MID)
    draw.polygon(leaf_pts(cx + mx, my, mw, mh,  20), fill=MID)

    # ── Centre leaf (lime, foreground) ────────────────────────────────────────
    lw = int(s * 0.195)
    lh = int(s * 0.315)
    ly = cy - int(s * 0.080)

    # Main leaf
    draw.polygon(leaf_pts(cx, ly, lw, lh), fill=LIME)
    # Vein — thin, lime-tinted
    vw = max(1, s // 110)
    draw.line([(cx, ly - lh + s // 18), (cx, ly + int(lh * 0.25))], fill=VEIN, width=vw)

    # ── Ground circle ─────────────────────────────────────────────────────────
    gdx, gdy = int(s * 0.078), int(s * 0.020)
    draw.ellipse([cx - gdx, stem_bot_y - gdy, cx + gdx, stem_bot_y + gdy], fill=DARK)

    return img


def save_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    BG = (5, 14, 2)

    for size, name, maskable in [
        (192, "icon-192.png",          False),
        (512, "icon-512.png",          False),
        (180, "apple-touch-icon.png",  False),
        (192, "icon-maskable-192.png", True),
        (512, "icon-maskable-512.png", True),
    ]:
        icon = create_icon(size)
        if maskable:
            bg = Image.new("RGB", (size, size), BG)
            inner = int(size * 0.76)
            small = create_icon(inner)
            off = (size - inner) // 2
            bg.paste(small, (off, off), small)
            bg.save(os.path.join(OUTPUT_DIR, name))
        else:
            icon.save(os.path.join(OUTPUT_DIR, name))
        tag = "maskable " if maskable else ""
        print(f"  {tag}{name} saved ({size}px)")

    print("\nAll icons generated.")


if __name__ == "__main__":
    save_all()
