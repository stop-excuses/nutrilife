"""Generate og-image.png (1200x630) for NutriLife social previews."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "og-image.png"

W, H = 1200, 630
BG = (10, 10, 10)
PANEL = (15, 18, 14)
TEXT = (240, 239, 232)
MUTED = (176, 175, 166)
GREEN = (151, 196, 89)
GREEN_DARK = (59, 109, 17)
RED = (226, 75, 74)
AMBER = (186, 117, 23)


def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/verdana.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img, "RGBA")

# Subtle brand glows, kept away from the text for Facebook mobile crops.
for radius, alpha in [(520, 70), (390, 50), (260, 34)]:
    draw.ellipse([W - radius, -radius // 2, W + radius // 3, radius], fill=(*GREEN_DARK, alpha))
for radius, alpha in [(440, 54), (300, 38), (190, 24)]:
    draw.ellipse([-radius // 2, H - radius // 2, radius, H + radius // 3], fill=(*RED, alpha))

draw.rounded_rectangle(
    [46, 46, W - 46, H - 46],
    radius=28,
    fill=(*PANEL, 205),
    outline=(255, 255, 255, 22),
    width=2,
)
draw.rectangle([82, 94, 178, 102], fill=GREEN)

f_kicker = load_font(28, bold=True)
f_title = load_font(60, bold=True)
f_sub = load_font(34)
f_url = load_font(26)

draw.text((82, 122), "NUTRILIFE", font=f_kicker, fill=GREEN)
draw.text((82, 210), "NutriLife — Все още имаш контрол", font=f_title, fill=TEXT)
draw.text((82, 302), "Малки навици. Огромна разлика.", font=f_title, fill=TEXT)
draw.text((82, 456), "Не диета. Не фитнес. Малки неща, правени редовно.", font=f_sub, fill=MUTED)
draw.ellipse([82, 548, 98, 564], fill=AMBER)
draw.text((112, 543), "stop-excuses.github.io/nutrilife", font=f_url, fill=MUTED)

img.save(OUT, "PNG", optimize=True)
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
