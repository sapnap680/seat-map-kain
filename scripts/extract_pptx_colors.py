"""Extract palette from 78th incare pricing PPTX."""
from __future__ import annotations

import re
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image

PPTX = Path(r"c:\Users\cinco\OneDrive\画像\デスクトップ\78thインカレ料金表_座席図について.pptx")
OUT = Path(__file__).resolve().parent / "_pptx_extract"


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.upper()
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(PPTX)
    colors: Counter[str] = Counter()
    for name in z.namelist():
        if not name.endswith(".xml"):
            continue
        text = z.read(name).decode("utf-8", errors="ignore")
        for m in re.finditer(r'srgbClr val="([0-9A-Fa-f]{6})"', text):
            colors[m.group(1).upper()] += 1

    print("=== XML srgbClr (top 30) ===")
    for h, n in colors.most_common(30):
        r, g, b = hex_rgb(h)
        print(f"  #{h} rgb({r},{g},{b}) x{n}")

    for img_path in sorted(z.namelist()):
        if not img_path.startswith("ppt/media/") or not img_path.endswith(".png"):
            continue
        data = z.read(img_path)
        out_path = OUT / Path(img_path).name
        out_path.write_bytes(data)
        im = Image.open(out_path).convert("RGB")
        px = Counter(im.getpixel((x, y)) for y in range(0, im.height, 4) for x in range(0, im.width, 4))
        print(f"\n=== {Path(img_path).name} {im.size} pixel samples top 20 ===")
        for (r, g, b), n in px.most_common(20):
            print(f"  rgb({r:3},{g:3},{b:3}) x{n}")


if __name__ == "__main__":
    main()
