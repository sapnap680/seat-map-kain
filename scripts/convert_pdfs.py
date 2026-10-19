"""Convert parent-folder venue PDFs to public/backgrounds/*.png"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("PyMuPDF が必要です: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT.parent
OUT_DIR = ROOT / "public" / "backgrounds"
META_DIR = ROOT / "public" / "backgrounds"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATE_MAP = {
    "12.11": "2025-12-11",
    "12.12": "2025-12-12",
    "12.13": "2025-12-13",
}

from incare_palette import FLOOR1_PINK  # noqa: E402

# 説明ラベルだけ消す（ベンチ表記は残す）
REDACT_TEXT_PARTS = ("ベンチ外", "メンバー", "チーム券")


def is_ota_floor1_blue(r: int, g: int, b: int) -> bool:
    """大田 1階席の水色系（複数トーン）"""
    if b < 200 or g < 165:
        return False
    if r > 200:
        return False
    return b >= g >= r


def is_pdf_floor1_pink(r: int, g: int, b: int) -> bool:
    if abs(r - FLOOR1_PINK[0]) <= 10 and abs(g - FLOOR1_PINK[1]) <= 10 and abs(b - FLOOR1_PINK[2]) <= 10:
        return True
    return r >= 200 and 130 <= g <= 200 and b >= 160


def is_seat_gray(r: int, g: int, b: int) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return spread < 25 and 140 <= avg <= 220


def _sample_fill(im, px0: int, py0: int) -> tuple[int, int, int]:
    w, h = im.size
    sx = min(w - 1, max(0, px0))
    sy = min(h - 1, max(0, py0 - 3))
    return im.getpixel((sx, sy))


def redact_map_labels(page: fitz.Page, path: Path, scale: float = 2.0) -> None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            line_text = "".join(s.get("text", "") for s in line.get("spans", []))
            if not any(part in line_text for part in REDACT_TEXT_PARTS):
                continue
            x0, y0, x1, y1 = line["bbox"]
            px0 = max(0, int(x0 * scale) - 6)
            py0 = max(0, int(y0 * scale) - 4)
            px1 = min(im.size[0], int(x1 * scale) + 6)
            py1 = min(im.size[1], int(y1 * scale) + 4)
            fill = _sample_fill(im, px0, py0)
            draw.rectangle([px0, py0, px1, py1], fill=fill)
    im.save(path)


def paint_nonsellable_seats(path: Path, slug: str) -> None:
    """PDF が枠だけの席を、抽出データで灰色塗り（チーム券の中抜け防止）"""
    seat_path = ROOT / "public" / "seats" / f"{slug}.json"
    if not seat_path.exists():
        print(f"  skip seat paint (no {seat_path.name})", file=sys.stderr)
        return
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    data = json.loads(seat_path.read_text(encoding="utf-8"))
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    w, h = im.size
    painted = 0
    for s in data.get("seats", []):
        zone = s.get("zone")
        if zone not in ("team_ticket", "floor2"):
            continue
        if slug in ("2025-12-12", "2025-12-13") and zone != "team_ticket":
            continue
        x0 = int(s["x"] * w)
        y0 = int(s["y"] * h)
        x1 = int((s["x"] + s["w"]) * w)
        y1 = int((s["y"] + s["h"]) * h)
        if x1 <= x0 or y1 <= y0:
            continue
        fill = (191, 191, 191) if zone == "team_ticket" else (210, 210, 210)
        draw.rectangle([x0, y0, x1, y1], fill=fill, outline=(160, 160, 160))
        painted += 1
    im.save(path)
    print(f"  painted {painted} nonsellable seats on {path.name}")


def recolor_floor1_to_pptx_pink(path: Path, slug: str) -> None:
    """1階席だけピンクに。灰色席は触らない。"""
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        ny = y / h
        for x in range(w):
            nx = x / w
            r, g, b = px[x, y]
            if is_seat_gray(r, g, b):
                continue
            if slug in ("2025-12-12", "2025-12-13"):
                if nx >= 0.62:
                    continue
                if not is_ota_floor1_blue(r, g, b):
                    continue
            elif not is_pdf_floor1_pink(r, g, b):
                continue
            px[x, y] = FLOOR1_PINK
            changed += 1
    if changed:
        im.save(path)
        print(f"  recolored {changed} px to #E38AB2 on {path.name}")


def slug_from_name(name: str) -> str | None:
    for key, slug in DATE_MAP.items():
        if key in name:
            return slug
    m = re.search(r"(\d{1,2})\.(\d{1,2})", name)
    if m:
        return f"2025-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


def main() -> None:
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"PDF が見つかりません: {PDF_DIR}")
        return

    for pdf in pdfs:
        slug = slug_from_name(pdf.stem)
        if not slug:
            print(f"スキップ（日付不明）: {pdf.name}")
            continue
        out = OUT_DIR / f"{slug}.png"
        doc = fitz.open(pdf)
        page = doc[0]
        pw, ph = page.rect.width, page.rect.height
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(
            matrix=mat,
            alpha=False,
            annots=False,
            colorspace=fitz.csRGB,
        )
        pix.save(out)
        doc.close()
        recolor_floor1_to_pptx_pink(out, slug)
        doc = fitz.open(pdf)
        redact_map_labels(doc[0], out, scale=2.0)
        doc.close()
        paint_nonsellable_seats(out, slug)
        meta = {
            "slug": slug,
            "page_width": pw,
            "page_height": ph,
            "image_width": pix.width,
            "image_height": pix.height,
        }
        (META_DIR / f"{slug}.meta.json").write_text(
            json.dumps(meta, indent=2), encoding="utf-8"
        )
        print(f"Wrote {out} from {pdf.name}")


if __name__ == "__main__":
    main()
