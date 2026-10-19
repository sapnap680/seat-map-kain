"""PDF の塗りつぶし矩形を1席として抽出（色: ピンク/青=販売可、灰=非販売）"""
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


def dedupe_items(items: list[tuple[fitz.Rect, tuple]]) -> list[tuple[fitz.Rect, tuple]]:
    kept: list[tuple[fitz.Rect, tuple]] = []
    for r, fill in sorted(items, key=lambda x: x[0].width * x[0].height, reverse=True):
        if any(rect_contains(k, r) for k, _ in kept):
            continue
        kept.append((r, fill))
    return kept


def is_gray_fill(r: float, g: float, b: float) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return spread < 0.12 and 0.5 <= avg <= 0.88


def is_pink_floor1_komori(r: float, g: float, b: float) -> bool:
    """駒オリ 1階席（料金表 #E38AB2 および PDF ピンク）"""
    if r >= 0.85 and 0.5 <= g <= 0.58 and 0.68 <= b <= 0.72:
        return True
    return r >= 0.9 and 0.65 <= g <= 0.78 and b >= 0.75


def is_ota_team_zone(cx: float, cy: float) -> bool:
    """大田区 PDF: 東側ベンチ外・メンバー・チーム券（上下2ブロック）"""
    if cx < 0.62:
        return False
    return (0.275 <= cy <= 0.485) or (0.575 <= cy <= 0.785)


def is_blue_floor1(r: float, g: float, b: float) -> bool:
    """会場総合図 12/12・13 の水色席"""
    return b >= 0.9 and g >= 0.72 and 0.45 <= r <= 0.7


def classify_seat(
    slug: str,
    fill: tuple[float, ...] | None,
    cx: float,
    cy: float,
) -> tuple[str, bool]:
    if not fill or len(fill) < 3:
        return "floor2", False
    r, g, b = float(fill[0]), float(fill[1]), float(fill[2])

    if is_gray_fill(r, g, b):
        if slug in ("2025-12-12", "2025-12-13") and is_ota_team_zone(cx, cy):
            return "team_ticket", False
        return "floor2", False

    if slug == "2025-12-11":
        if is_pink_floor1_komori(r, g, b):
            return "floor1", True
        return "floor2", False

    if slug in ("2025-12-12", "2025-12-13"):
        if is_ota_team_zone(cx, cy):
            if is_blue_floor1(r, g, b) or is_gray_fill(r, g, b):
                return "team_ticket", False
        if is_blue_floor1(r, g, b):
            return "floor1", True
        if is_gray_fill(r, g, b):
            return "floor2", False
        return "floor2", False

    return "floor1", True


def refine_ota_team_zones(seats: list[dict]) -> None:
    """チーム券は灰色席のみ（ピンク1階は触らない）"""
    for s in seats:
        if s["zone"] == "floor1":
            continue
        cx = s["x"] + s["w"] / 2
        cy = s["y"] + s["h"] / 2
        in_team = is_ota_team_zone(cx, cy)
        if s["zone"] == "team_ticket" and not in_team:
            s["zone"] = "floor2"
            s["sellable"] = False
        elif in_team and s["zone"] == "floor2":
            s["zone"] = "team_ticket"
            s["sellable"] = False


def refine_komori_12_11_zones(seats: list[dict]) -> None:
    """12/11 駒沢: 端 2列×4段＝チーム券席。それ以外の灰色は 2 階自由席。"""
    f1 = [s for s in seats if s["zone"] == "floor1"]
    if not f1:
        return
    f1minx = min(s["x"] for s in f1)
    f1maxx = max(s["x"] + s["w"] for s in f1)
    f1ys = sorted(set(round(s["y"], 3) for s in f1))
    if len(f1ys) < 4:
        return
    team_rows = {f1ys[0], f1ys[1], f1ys[2], f1ys[3]}

    left_x: set[float] = set()
    right_x: set[float] = set()
    for s in seats:
        if s["zone"] != "floor2":
            continue
        rx = round(s["x"], 3)
        if s["x"] + s["w"] <= f1minx + 0.008:
            left_x.add(rx)
        if s["x"] >= f1maxx - 0.008:
            right_x.add(rx)
    team_left = set(sorted(left_x, reverse=True)[:2])
    team_right = set(sorted(right_x)[:2])

    for s in seats:
        if s["zone"] != "floor2":
            continue
        rx, ry = round(s["x"], 3), round(s["y"], 3)
        if ry in team_rows and (rx in team_left or rx in team_right):
            s["zone"] = "team_ticket"
            s["sellable"] = False


def extract_page(pdf_path: Path, slug: str) -> dict:
    doc = fitz.open(pdf_path)
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    raw: list[tuple[fitz.Rect, tuple]] = []
    for d in page.get_drawings():
        if d.get("type") != "f":
            continue
        r = d.get("rect")
        if not r:
            continue
        w, h = r.width, r.height
        if not seat_size_ok(slug, w, h):
            continue
        fill = d.get("fill")
        if fill is None:
            continue
        raw.append((fitz.Rect(r), tuple(fill)))
    doc.close()

    items = dedupe_items(raw)
    seats = []
    for i, (r, fill) in enumerate(items, start=1):
        x, y, w, h = r.x0 / pw, r.y0 / ph, r.width / pw, r.height / ph
        cx, cy = x + w / 2, y + h / 2
        zone, sellable = classify_seat(slug, fill, cx, cy)
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
    if slug == "2025-12-11":
        refine_komori_12_11_zones(seats)
    elif slug in ("2025-12-12", "2025-12-13"):
        refine_ota_team_zones(seats)
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
