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
