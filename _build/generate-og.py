#!/usr/bin/env python3
"""Generate the OG image for Double Check social shares."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
NAVY = (15, 23, 42)
BLUE = (37, 99, 235)
BLUE_LIGHT = (96, 165, 250)
WHITE = (255, 255, 255)
MUTED = (148, 163, 184)
GREEN = (22, 163, 74)
RED = (220, 38, 38)

img = Image.new("RGB", (W, H), NAVY)
draw = ImageDraw.Draw(img)

# Try to load a clean sans-serif. Fall back if missing.
def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

font_brand = load_font(40, bold=True)
font_h1 = load_font(86, bold=True)
font_sub = load_font(34, bold=False)
font_tag = load_font(26, bold=True)
font_url = load_font(24, bold=False)

# Top brand row
brand_y = 60
draw.text((80, brand_y), "Double", font=font_brand, fill=WHITE)
# measure 'Double' width
db_w = draw.textlength("Double", font=font_brand)
draw.text((80 + db_w, brand_y), "Check", font=font_brand, fill=BLUE_LIGHT)

# Eyebrow pill
pill_text = "FREE  ·  SCAM DETECTION  ·  AI-POWERED"
pill_y = 200
pill_w = draw.textlength(pill_text, font=font_tag)
pill_pad_x, pill_pad_y = 22, 12
pill_box = (80, pill_y, 80 + pill_w + pill_pad_x * 2, pill_y + 26 + pill_pad_y * 2)
draw.rounded_rectangle(pill_box, radius=30, fill=(30, 41, 59), outline=BLUE_LIGHT, width=2)
draw.text((80 + pill_pad_x, pill_y + pill_pad_y - 2), pill_text, font=font_tag, fill=BLUE_LIGHT)

# Headline
draw.text((80, 280), "Real or scam?", font=font_h1, fill=WHITE)
draw.text((80, 380), "Know in seconds.", font=font_h1, fill=BLUE_LIGHT)

# Subhead
draw.text((80, 500), "Paste any suspicious message. Get a plain-English", font=font_sub, fill=MUTED)
draw.text((80, 540), "answer. Free. Recommended by financial advisors.", font=font_sub, fill=MUTED)

# URL bottom right
url = "mydoublecheck.app"
url_w = draw.textlength(url, font=font_url)
draw.text((W - 80 - url_w, H - 60), url, font=font_url, fill=MUTED)

# Decorative shield on right
shield_cx, shield_cy = 980, 320
shield_r = 110
# Outer circle
draw.ellipse(
    (shield_cx - shield_r, shield_cy - shield_r, shield_cx + shield_r, shield_cy + shield_r),
    fill=(30, 41, 59), outline=BLUE_LIGHT, width=4
)
# Inner checkmark
check_pts = [
    (shield_cx - 50, shield_cy + 5),
    (shield_cx - 15, shield_cy + 40),
    (shield_cx + 55, shield_cy - 35),
]
draw.line(check_pts, fill=BLUE_LIGHT, width=12, joint="curve")

out = os.path.join(os.path.dirname(__file__), "..", "og-image.png")
img.save(out, "PNG", optimize=True)
print(f"Wrote {out} ({W}x{H})")
