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


def is_ota_floor1_blue(r: int, g: int, b: int) -> bool:
    """会場総合図の水色 1 階席塗り → 料金表 PPTX の 1 階指定席色へ"""
    return 140 <= r <= 175 and 188 <= g <= 225 and b >= 238


def is_pdf_floor1_pink(r: int, g: int, b: int) -> bool:
    """駒オリ PDF 上の 1 階ピンク（PPTX #E38AB2 に揃える）"""
    if abs(r - FLOOR1_PINK[0]) <= 8 and abs(g - FLOOR1_PINK[1]) <= 8 and abs(b - FLOOR1_PINK[2]) <= 8:
        return True
    return r >= 200 and 130 <= g <= 200 and b >= 160


REDACT_LABEL_PARTS = ("ベンチ外", "メンバー", "チーム券席")


def redact_pdf_labels(page: fitz.Page, path: Path, scale: float = 2.0) -> None:
    """図面上のベンチ外・メンバー・チーム券席などの文字を消す"""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    w, h = im.size
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not any(part in text for part in REDACT_LABEL_PARTS):
                    continue
                x0, y0, x1, y1 = span["bbox"]
                px0 = max(0, int(x0 * scale) - 4)
                py0 = max(0, int(y0 * scale) - 3)
                px1 = min(w - 1, int(x1 * scale) + 4)
                py1 = min(h - 1, int(y1 * scale) + 3)
                sample_y = max(0, py0 - 2)
                sample_x = min(w - 1, max(0, px0))
                fill = im.getpixel((sample_x, sample_y))
                draw.rectangle([px0, py0, px1, py1], fill=fill)
    im.save(path)


def recolor_floor1_to_pptx_pink(path: Path) -> None:
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
        for x in range(w):
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
        # 色再現優先: RGB・注釈込み・2倍解像度（表示サイズは page 座標のまま）
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(
            matrix=mat,
            alpha=False,
            annots=True,
            colorspace=fitz.csRGB,
        )
        pix.save(out)
        redact_pdf_labels(page, out, scale=2.0)
        doc.close()
        recolor_floor1_to_pptx_pink(out)
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
