"""Render the existing vector tara mark into installable PWA icons."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "apps/web"
scale = 8
canvas = Image.new("RGBA", (128 * scale, 128 * scale), "white")
draw = ImageDraw.Draw(canvas)
for x1, y1, x2, y2 in [(37, 49, 30, 78), (58, 38, 48, 89), (79, 40, 68, 88), (98, 51, 91, 78)]:
    coordinates = tuple(value * scale for value in (x1, y1, x2, y2))
    draw.line(coordinates, fill="#3869ed", width=8 * scale)
    for x, y in [(x1 * scale, y1 * scale), (x2 * scale, y2 * scale)]:
        radius = 4 * scale
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="#3869ed")
for filename, size in [
    ("apple-touch-icon.png", 180),
    ("favicon-96x96.png", 96),
    ("web-app-manifest-192x192.png", 192),
    ("web-app-manifest-512x512.png", 512),
]:
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / "public/favicon" / filename)
canvas.resize((256, 256), Image.Resampling.LANCZOS).save(
    root / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
)
(root / "public/favicon/site.webmanifest").write_text(json.dumps({
    "name": "tara · Field assistant", "short_name": "tara", "start_url": "/",
    "display": "standalone", "background_color": "#ffffff", "theme_color": "#3869ed",
    "icons": [{"src": f"/favicon/web-app-manifest-{size}x{size}.png",
               "sizes": f"{size}x{size}", "type": "image/png"} for size in (192, 512)],
}, indent=2) + "\n")
print("Generated tara favicon and PWA icons")
