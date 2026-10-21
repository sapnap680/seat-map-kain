"""大田 12/12–13: 座席定義 +（任意）拡大PDFの重なり除去ジオメトリ"""
from __future__ import annotations

import hashlib
import json
import sys
import uuid
from pathlib import Path

try:
    import fitz
except ImportError:
    fitz = None  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "seats"
PDF_DIR = ROOT.parent

from ota_seat_definition import (  # noqa: E402
    expand_all_logical,
    load_definition,
)
from ota_geom_assign import assign_all_geometry  # noqa: E402
from ota_png_seats import build_png_seats  # noqa: E402
from pdf_slug import slug_from_pdf_stem  # noqa: E402

OTA_SLUGS = frozenset({"2025-12-12", "2025-12-13"})


def _cx(s: dict) -> float:
    return s["x"] + s["w"] / 2


def _cy(s: dict) -> float:
    return s["y"] + s["h"] / 2


def dedupe_rects(raw: list[tuple], pw: float, ph: float) -> list[tuple]:
    cell_x = max(13.6 / pw, 0.003)
    cell_y = max(13.6 / ph, 0.003)
    cells: dict[tuple[int, int], tuple] = {}
    for r, fill in sorted(raw, key=lambda x: x[0].width * x[0].height, reverse=True):
        cx = (r.x0 + r.x1) / 2 / pw
        cy = (r.y0 + r.y1) / 2 / ph
        key = (round(cx / cell_x), round(cy / cell_y))
        if key not in cells:
            cells[key] = (r, fill)
    return list(cells.values())


def _png_center_class(
    g: dict, im, width: int, height: int
) -> str:
    px = max(0, min(width - 1, int(_cx(g) * width)))
    py = max(0, min(height - 1, int(_cy(g) * height)))
    r, gb, b = im.getpixel((px, py))[:3]
    if r >= 250 and gb >= 250 and b >= 250:
        return "white"
    if abs(r - gb) <= 22 and abs(gb - b) <= 22 and 130 <= (r + gb + b) / 3 <= 225:
        return "gray"
    return "color"


def filter_geom_to_visible_seats(
    geom: list[dict], slug: str
) -> list[dict]:
    """拡大PDFの「白抜け」矩形を除外（表示PNGと一致する席だけ残す）"""
    try:
        from PIL import Image
    except ImportError:
        return geom
    png = ROOT / "public" / "backgrounds" / f"{slug}.png"
    if not png.is_file():
        return geom
    im = Image.open(png).convert("RGB")
    w, h = im.size
    kept = [g for g in geom if _png_center_class(g, im, w, h) != "white"]
    im.close()
    return kept


def dedupe_geom_cells(geom: list[dict]) -> list[dict]:
    cell = 0.0086
    cells: dict[tuple[int, int], dict] = {}
    for g in sorted(geom, key=lambda x: x["w"] * x["h"], reverse=True):
        cx, cy = _cx(g), _cy(g)
        key = (round(cx / cell), round(cy / cell))
        if key not in cells:
            cells[key] = g
    return list(cells.values())


def load_geometry_norm(pdf_path: Path) -> list[dict]:
    """拡大PDFから重なり除去した矩形のみ（分類・カウントに使わない）"""
    if fitz is None or not pdf_path.is_file():
        return []
    doc = fitz.open(pdf_path)
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    raw: list[tuple] = []
    for d in page.get_drawings():
        if d.get("type") != "f":
            continue
        r = d.get("rect")
        fill = d.get("fill")
        if not r or fill is None:
            continue
        if not (13.4 <= r.width <= 13.85 and 13.4 <= r.height <= 13.85):
            continue
        raw.append((fitz.Rect(r), tuple(fill)))
    items = dedupe_rects(raw, pw, ph)
    doc.close()
    out = []
    for r, _fill in items:
        out.append(
            {
                "x": r.x0 / pw,
                "y": r.y0 / ph,
                "w": r.width / pw,
                "h": r.height / ph,
            }
        )
    return out


def _logical_key(log: dict) -> tuple:
    if log["stand"] == "premium":
        return (log["section"], 0, log["num"])
    return (log["section"], log["row"], log["num"])


def assign_geometry(
    logical: list[dict], geom: list[dict], defn: dict
) -> list[dict]:
    """定義席 ↔ スタンド分割した PDF 矩形（ブロック幅で 1:1）"""
    by_key = assign_all_geometry(geom, logical)
    seats: list[dict] = []
    for log in logical:
        key = _logical_key(log)
        g = by_key.get(key)
        if g:
            box = {k: g[k] for k in ("x", "y", "w", "h")}
        elif log["stand"] == "premium":
            box = _synthetic_premium_box(log)
        else:
            box = _synthetic_box(log, log["slotIndex"], log["stand"])
        seats.append(_merge_log_geometry(log, box))
    return seats


def _synthetic_box(log: dict, j: int, stand: str) -> dict:
    w, h = 0.0086, 0.0113
    row = log["row"] - 1
    col = log["slotIndex"]
    if stand == "left":
        return {"x": 0.05 + col * w * 1.1, "y": 0.2 + row * h * 1.2, "w": w, "h": h}
    if stand == "topGoal":
        return {"x": 0.25 + col * w * 1.1, "y": 0.05 + row * h * 1.2, "w": w, "h": h}
    if stand == "botGoal":
        return {"x": 0.28 + col * w * 1.1, "y": 0.88 + row * h * 1.2, "w": w, "h": h}
    return {"x": 0.84 + col * w * 1.1, "y": 0.05 + row * h * 1.2, "w": w, "h": h}


def _synthetic_premium_box(log: dict) -> dict:
    w, h = 0.012, 0.015
    n = log["slotIndex"]
    return {"x": 0.35 + (n % 6) * w, "y": 0.4 + (n // 6) * h, "w": w, "h": h}


def _merge_log_geometry(log: dict, box: dict) -> dict:
    sid = str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"ota-{log['section']}-{log['row']}-{log['num']}-{box['x']:.5f}",
        )
    )
    return {
        "id": sid,
        "label": log["label"],
        "section": log["section"],
        "category": log["category"],
        "zone": log["zone"],
        "sellable": log["sellable"],
        "x": box["x"],
        "y": box["y"],
        "w": box["w"],
        "h": box["h"],
    }


def build_ota_catalog(slug: str, pdf_path: Path | None) -> dict:
    defn = load_definition()
    logical = expand_all_logical(defn)
    seats = build_png_seats(slug, pdf_path, defn)
    if not seats:
        geom = load_geometry_norm(pdf_path) if pdf_path else []
        seats = assign_geometry(logical, geom, defn) if geom else [
            _merge_log_geometry(log, _synthetic_box(log, i, log["stand"]))
            for i, log in enumerate(logical)
        ]
    rev_src = json.dumps(
        [(s["id"], s.get("label"), s.get("zone")) for s in seats],
        ensure_ascii=False,
    )
    pw, ph = 1583, 1199
    if pdf_path and fitz and pdf_path.is_file():
        doc = fitz.open(pdf_path)
        pw, ph = int(doc[0].rect.width), int(doc[0].rect.height)
        doc.close()
    return {
        "slug": slug,
        "map_width": pw,
        "map_height": ph,
        "seat_count": len(seats),
        "floor2_free_capacity": defn["free2F"],
        "inventory_source": "definition",
        "event_display_year": defn.get("eventDisplayYear"),
        "catalog_revision": hashlib.sha256(rev_src.encode()).hexdigest()[:16],
        "seats": seats,
    }


def pdf_for_slug(slug: str) -> Path | None:
    for pdf in PDF_DIR.glob("*.pdf"):
        if slug_from_pdf_stem(pdf.stem) == slug:
            return pdf
    return None


def main() -> None:
    slugs = sys.argv[1:] if len(sys.argv) > 1 else sorted(OTA_SLUGS)
    for slug in slugs:
        if slug not in OTA_SLUGS:
            print(f"skip (not Ota): {slug}")
            continue
        pdf = pdf_for_slug(slug)
        data = build_ota_catalog(slug, pdf)
        out = OUT_DIR / f"{slug}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        sell = sum(1 for s in data["seats"] if s["sellable"])
        print(
            f"{slug}.json: {data['seat_count']} mapped 1F seats, "
            f"sellable flags {sell}, 2F free {data['floor2_free_capacity']} "
            f"(definition)"
        )


if __name__ == "__main__":
    main()
