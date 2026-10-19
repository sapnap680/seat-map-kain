"""PDF の塗りつぶし矩形を1席として抽出し public/seats/{slug}.json に出力"""
from __future__ import annotations

import json
import re
import sys
import uuid
from pathlib import Path

try:
    import fitz
except ImportError:
    print("pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT.parent
OUT_DIR = ROOT / "public" / "seats"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATE_MAP = {"12.11": "2025-12-11", "12.12": "2025-12-12", "12.13": "2025-12-13"}


def slug_from_name(name: str) -> str | None:
    for key, slug in DATE_MAP.items():
        if key in name:
            return slug
    m = re.search(r"(\d{1,2})\.(\d{1,2})", name)
    if m:
        return f"2025-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


def seat_size_ok(slug: str, w: float, h: float) -> bool:
    if slug == "2025-12-11":
        return 14 <= w <= 28 and 18 <= h <= 32
    return 7.5 <= w <= 10.5 and 7.5 <= h <= 10.5


def rect_contains(a: fitz.Rect, b: fitz.Rect, tol: float = 1.0) -> bool:
    return (
        a.x0 - tol <= b.x0
        and a.y0 - tol <= b.y0
        and a.x1 + tol >= b.x1
        and a.y1 + tol >= b.y1
    )


def dedupe_rects(rects: list[fitz.Rect]) -> list[fitz.Rect]:
    kept: list[fitz.Rect] = []
    for r in sorted(rects, key=lambda x: (x.width * x.height), reverse=True):
        if any(rect_contains(k, r) for k in kept):
            continue
        kept.append(r)
    return kept


def extract_page(pdf_path: Path, slug: str) -> dict:
    doc = fitz.open(pdf_path)
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    raw: list[fitz.Rect] = []
    for d in page.get_drawings():
        if d.get("type") != "f":
            continue
        r = d.get("rect")
        if not r:
            continue
        w, h = r.width, r.height
        if not seat_size_ok(slug, w, h):
            continue
        raw.append(fitz.Rect(r))
    doc.close()

    rects = dedupe_rects(raw)
    seats = []
    for i, r in enumerate(rects, start=1):
        seats.append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{slug}-{i}-{r.x0}-{r.y0}")),
                "label": str(i),
                "section": None,
                "zone": "floor1",
                "x": r.x0 / pw,
                "y": r.y0 / ph,
                "w": r.width / pw,
                "h": r.height / ph,
            }
        )
    return {
        "slug": slug,
        "map_width": int(pw),
        "map_height": int(ph),
        "seat_count": len(seats),
        "seats": seats,
    }


def main() -> None:
    for pdf in sorted(PDF_DIR.glob("*.pdf")):
        slug = slug_from_name(pdf.stem)
        if not slug:
            continue
        data = extract_page(pdf, slug)
        out = OUT_DIR / f"{slug}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{pdf.name} -> {out.name} ({data['seat_count']} seats)")


if __name__ == "__main__":
    main()
