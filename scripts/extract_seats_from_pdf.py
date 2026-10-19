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


def classify_komori_floor1(x: float, y: float) -> bool:
    """駒オリ 12/11: 中央付近が 1階（販売可）"""
    return 0.36 <= x <= 0.64 and 0.28 <= y <= 0.82


def classify_zone(slug: str, x: float, y: float, w: float, h: float) -> tuple[str, bool]:
    cx = x + w / 2
    cy = y + h / 2

    if slug in ("2025-12-12", "2025-12-13"):
        # チーム席エリア（PDF ラベル付近・右側）
        if cx >= 0.62 and (
            (0.28 <= cy <= 0.48) or (0.58 <= cy <= 0.78)
        ):
            return "team_ticket", False
        return "floor1", True

    if slug == "2025-12-11":
        if classify_komori_floor1(cx, cy):
            return "floor1", True
        return "floor2", False

    return "floor1", True


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
        x, y, w, h = r.x0 / pw, r.y0 / ph, r.width / pw, r.height / ph
        zone, sellable = classify_zone(slug, x, y, w, h)
        seats.append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{slug}-{i}-{r.x0}-{r.y0}")),
                "label": str(i),
                "section": None,
                "zone": zone,
                "sellable": sellable,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
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
        sellable = sum(1 for s in data["seats"] if s["sellable"])
        print(
            f"{pdf.name} -> {out.name} ({data['seat_count']} seats, sellable {sellable})"
        )


if __name__ == "__main__":
    main()
