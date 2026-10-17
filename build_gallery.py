"""Build web-ready images and gallery/images.json, adding only NEW photos.

Usage:  pip install pillow
        python build_gallery.py            # adds new photos, keeps everything else
        python build_gallery.py --prune    # also drops entries whose original is gone from images/
        python build_gallery.py --rebuild  # redo every photo from scratch

Put originals in ./images (optionally in sub-folders; each sub-folder becomes an album).

Choosing an album's cover photo (either way works):
  1. Name the file so it starts with "cover", e.g. cover.jpg or cover-group.jpg
  2. Or create covers.json next to this script:
     {"Opening Day": "20261010_154505.jpg"}
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageOps

SRC, OUT = Path("images"), Path("gallery")
MANIFEST = OUT / "images.json"
REBUILD, PRUNE = "--rebuild" in sys.argv, "--prune" in sys.argv

(OUT / "full").mkdir(parents=True, exist_ok=True)
(OUT / "thumbs").mkdir(exist_ok=True)

covers = json.loads(Path("covers.json").read_text(encoding="utf-8")) if Path("covers.json").exists() else {}
exts = {".jpg", ".jpeg", ".png"}
files = sorted(p for p in SRC.rglob("*") if p.suffix.lower() in exts)
rel = lambda p: p.relative_to(SRC).as_posix()

old = []
if MANIFEST.exists():
    shutil.copy2(MANIFEST, "images.backup.json")  # safety copy, kept outside gallery/
    if not REBUILD:
        old = json.loads(MANIFEST.read_text(encoding="utf-8"))
        if any("src" not in it for it in old):
            print("Upgrading from the old script: rebuilding everything once.")
            print("(Your previous list is saved as images.backup.json.)")
            old = []

known = {it["src"]: it for it in old}
next_n = max((int(Path(it["full"]).stem.split("-")[1]) for it in old), default=0) + 1


def make(p, name):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")  # fixes rotation, drops GPS/EXIF
    big = im.copy(); big.thumbnail((2000, 2000))
    big.save(OUT / "full" / f"{name}.webp", quality=82)
    th = im.copy(); th.thumbnail((500, 500))
    th.save(OUT / "thumbs" / f"{name}.webp", quality=75)
    return th.width, th.height


present = {rel(p) for p in files}
orphans = [it for it in old if it["src"] not in present]  # originals that vanished (deleted, moved or renamed)
items, added, fixed, moved = list(old), 0, 0, 0
for p in files:
    key = rel(p)
    it = known.get(key)
    if it and Path(it["full"]).exists() and Path(it["thumb"]).exists():
        it.setdefault("size", p.stat().st_size)
        continue  # already built: skip
    if it:  # in the list but its web files are missing: recreate them
        it["w"], it["h"] = make(p, Path(it["full"]).stem)
        fixed += 1
        print("REPAIRED", key)
        continue
    size = p.stat().st_size
    m = next((o for o in orphans if Path(o["src"]).name == p.name and o.get("size") == size), None)
    if m:  # same file name and size as a vanished original: it was moved or its folder renamed
        orphans.remove(m)
        m["src"] = key
        m.pop("cover", None)
        if p.parent != SRC:
            m["album"] = p.parent.name
        else:
            m.pop("album", None)
        moved += 1
        print("MOVED", key)
        continue
    name = f"photo-{next_n:03d}"
    w, h = make(p, name)
    item = {"full": f"gallery/full/{name}.webp", "thumb": f"gallery/thumbs/{name}.webp",
            "w": w, "h": h, "title": f"Photo {next_n}", "src": key, "size": size}
    if p.parent != SRC:
        item["album"] = p.parent.name
    items.append(item)
    next_n += 1
    added += 1
    print("NEW", key)

# Cover rules (applied to every photo, so covers.json also works for existing ones)
for it in items:  # covers.json wins: clear an album's old cover before re-applying
    if it.get("album") in covers:
        it.pop("cover", None)
for it in items:
    if it.get("album") and "src" in it:
        fname = Path(it["src"]).name
        if covers.get(it["album"]) == fname or Path(fname).stem.lower().startswith("cover"):
            it["cover"] = True

removed = 0
if PRUNE:
    kept = [it for it in items if it.get("src") in present]
    removed = len(items) - len(kept)
    items = kept

MANIFEST.write_text(json.dumps(items, indent=2), encoding="utf-8")
print(f"Done: {added} new, {moved} moved, {fixed} repaired, {removed} removed, {len(items)} total")