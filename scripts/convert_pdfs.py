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

REDACT_TEXT_PARTS = (
    "ベンチ外",
    "メンバー",
    "チーム券",
    "チーム席",
    "濃色",
    "淡色",
    "販売しません",
)

def is_ota_floor1_blue(r: int, g: int, b: int) -> bool:
    return 140 <= r <= 175 and 188 <= g <= 225 and b >= 238


def is_ota_team_zone_norm(nx: float, ny: float) -> bool:
    if nx < 0.62:
        return False
    return (0.275 <= ny <= 0.485) or (0.575 <= ny <= 0.785)


def is_pdf_floor1_pink(r: int, g: int, b: int) -> bool:
    if abs(r - FLOOR1_PINK[0]) <= 8 and abs(g - FLOOR1_PINK[1]) <= 8 and abs(b - FLOOR1_PINK[2]) <= 8:
        return True
    return r >= 200 and 130 <= g <= 200 and b >= 160


def _sample_fill(im, px0: int, py0: int, pw: int, ph: int) -> tuple[int, int, int]:
    w, h = im.size
    sx = min(w - 1, max(0, px0))
    sy = min(h - 1, max(0, py0 - 4))
    return im.getpixel((sx, sy))


def redact_map_labels(page: fitz.Page, path: Path, _slug: str, scale: float = 2.0) -> None:
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
            pad_x, pad_y = 8, 6
            px0 = max(0, int(x0 * scale) - pad_x)
            py0 = max(0, int(y0 * scale) - pad_y)
            px1 = min(im.size[0], int(x1 * scale) + pad_x)
            py1 = min(im.size[1], int(y1 * scale) + pad_y)
            fill = _sample_fill(im, px0, py0, page.rect.width, page.rect.height)
            draw.rectangle([px0, py0, px1, py1], fill=fill)

    im.save(path)


def strip_pdf_red_boxes(path: Path) -> None:
    """PDF に描かれた赤い囲い線だけ白にする（席の色は残す）"""
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        for x in range(w):
            if x / w < 0.68:
                continue
            r, g, b = px[x, y]
            if r >= 170 and g <= 90 and b <= 90 and r - max(g, b) >= 80:
                px[x, y] = (255, 255, 255)
                changed += 1
    if changed:
        im.save(path)
        print(f"  stripped {changed} red-box px on {path.name}")


def recolor_floor1_to_pptx_pink(path: Path, slug: str) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("Pillow が無いため水色→ピンク変換をスキップ: pip install pillow", file=sys.stderr)
        return
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        ny = y / h
        for x in range(w):
            nx = x / w
            if slug in ("2025-12-12", "2025-12-13") and is_ota_team_zone_norm(nx, ny):
                continue
            r, g, b = px[x, y]
            if is_ota_floor1_blue(r, g, b) or is_pdf_floor1_pink(r, g, b):
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
            annots=True,
            colorspace=fitz.csRGB,
        )
        pix.save(out)
        doc.close()
        recolor_floor1_to_pptx_pink(out, slug)
        if slug in ("2025-12-12", "2025-12-13"):
            strip_pdf_red_boxes(out)
        doc = fitz.open(pdf)
        redact_map_labels(doc[0], out, slug, scale=2.0)
        doc.close()
        meta = {
            "slug": slug,
            "page_width": pw,
            "page_height": ph,
            "image_width": pix.width,
            "image_height": pix.height,
        }
        meta_path = META_DIR / f"{slug}.meta.json"
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"Wrote {out} ({pix.width}x{pix.height}) page=({pw}x{ph}) from {pdf.name}")


if __name__ == "__main__":
    main()
