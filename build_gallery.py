"""Build web-ready images and gallery/images.json.

Usage:  pip install pillow
        python build_gallery.py
Put originals in ./images (optionally in sub-folders; each sub-folder becomes an album).
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

SRC, OUT = Path("images"), Path("gallery")
(OUT / "full").mkdir(parents=True, exist_ok=True)
(OUT / "thumbs").mkdir(exist_ok=True)

exts = {".jpg", ".jpeg", ".png"}
files = sorted(p for p in SRC.rglob("*") if p.suffix.lower() in exts)
items = []
for i, p in enumerate(files, 1):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")  # fixes rotation, drops GPS/EXIF
    name = f"photo-{i:03d}"
    big = im.copy(); big.thumbnail((2000, 2000))
    big.save(OUT / "full" / f"{name}.webp", quality=82)
    th = im.copy(); th.thumbnail((500, 500))
    th.save(OUT / "thumbs" / f"{name}.webp", quality=75)
    item = {"full": f"gallery/full/{name}.webp", "thumb": f"gallery/thumbs/{name}.webp",
            "w": th.width, "h": th.height, "title": f"Photo {i}"}
    if p.parent != SRC:
        item["album"] = p.parent.name
    items.append(item)
    print(f"{i}/{len(files)} {p.name}")

(OUT / "images.json").write_text(json.dumps(items, indent=2))
print("Done:", len(items), "photos")