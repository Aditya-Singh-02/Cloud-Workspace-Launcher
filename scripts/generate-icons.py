"""Generate PNG icons for the extension manifest.

Renders the same shapes as src/icons/icon.svg using Pillow, so the script has
no native dependencies. Run:  python scripts/generate-icons.py
Install deps:    pip install pillow
"""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    sys.exit("Missing dependency. Install with: pip install pillow\n" + str(exc))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE_DIR, "src", "icons")

SIZES = {"icon16": 16, "icon48": 48, "icon128": 128}

# Background gradient stops (top-left -> bottom-right), normalized 0..1
BG_STOPS = ((0.278, 0.561, 1.0), (0.486, 0.361, 1.0))  # #4f8cff -> #7c5cff
WHITE = (255, 255, 255, 255)


def _lerp(a, b, t):
    return int(round(a + (b - a) * t))


def _gradient(size):
    """Return a list of (x, y, (r, g, b)) rows for a diagonal gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            r = _lerp(BG_STOPS[0][0], BG_STOPS[1][0], t)
            g = _lerp(BG_STOPS[0][1], BG_STOPS[1][1], t)
            b = _lerp(BG_STOPS[0][2], BG_STOPS[1][2], t)
            px[x, y] = (r, g, b)
    return img


def _round_rect(draw, box, radius, fill):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def render(size):
    img = _gradient(size).convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Rounded canvas background (24-radius corner in 128-space => scale)
    corner = max(1, int(round(size * 24 / 128)))
    _round_rect(draw, (0, 0, size - 1, size - 1), corner, (0, 0, 0, 0))

    def s(v):
        """Scale a 128-space coordinate to this size."""
        return int(round(v * size / 128))

    # Top full-width bar
    _round_rect(draw, (s(20), s(28), s(108), s(48)), s(3), (255, 255, 255, 235))
    # Middle-left bar
    _round_rect(draw, (s(20), s(56), s(76), s(74)), s(2), (255, 255, 255, 179))
    # Middle-right bar
    _round_rect(draw, (s(84), s(56), s(108), s(74)), s(2), (255, 255, 255, 179))
    # Bottom bar
    _round_rect(draw, (s(20), s(84), s(84), s(100)), s(2), (255, 255, 255, 128))
    # Status dot
    r = max(1, s(3))
    cx, cy = s(104), s(38)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=WHITE)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, size in SIZES.items():
        out_path = os.path.join(OUT_DIR, f"{name}.png")
        img = render(size)
        img.save(out_path)
        print(f"Generated {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()