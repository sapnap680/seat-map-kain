"""PDF の塗りつぶし矩形を1席として抽出（色: ピンク/青=販売可、灰=非販売）"""
from __future__ import annotations

import hashlib
import json
import re
import statistics
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

from pdf_slug import slug_from_pdf_stem  # noqa: E402

from komori_seat_labels import apply_komori_seat_labels  # noqa: E402
from ota_seat_labels import apply_ota_seat_labels  # noqa: E402


def slug_from_name(name: str) -> str | None:
    return slug_from_pdf_stem(name)


def seat_size_ok(slug: str, w: float, h: float) -> bool:
    if slug == "2025-12-11":
        return 14 <= w <= 28 and 18 <= h <= 32
    if slug in ("2025-12-12", "2025-12-13"):
        if 7.5 <= w <= 10.5 and 7.5 <= h <= 10.5:
            return True
        if 12 <= w <= 18 and 12 <= h <= 22:
            return True
        if 24 <= w <= 32 and 24 <= h <= 32:
            return True
        return False
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


def is_pink_floor1(r: float, g: float, b: float) -> bool:
    """料金表 1階指定席 #E38AB2"""
    return is_pink_floor1_komori(r, g, b)


def is_team_green_fill(r: float, g: float, b: float) -> bool:
    """料金表 チーム券席 #92D050"""
    return r >= 0.48 and g >= 0.72 and b <= 0.45 and g >= r + 0.08


def is_ota_team_zone(cx: float, cy: float) -> bool:
    """大田区 PDF: 東側チーム券列（上下の隙間も含む）"""
    if cx < 0.62:
        return False
    return 0.275 <= cy <= 0.785


def is_blue_floor1(r: float, g: float, b: float) -> bool:
    """会場総合図 12/12・13 の水色席"""
    return b >= 0.9 and g >= 0.72 and 0.45 <= r <= 0.7


def is_ota_goal_magenta(r: float, g: float, b: float) -> bool:
    """1階指定席（ゴール裏）"""
    return 0.72 <= r <= 0.88 and g <= 0.38 and 0.48 <= b <= 0.62


def is_ota_courtside_purple(r: float, g: float, b: float) -> bool:
    """コートサイド A/B（料金表の紫系）"""
    if r <= 0.52 and g <= 0.28 and b >= 0.55:
        return True
    return 0.72 <= r <= 0.88 and 0.52 <= g <= 0.68 and b >= 0.78


def is_ota_end_blue(r: float, g: float, b: float) -> bool:
    """コートエンド"""
    return r <= 0.35 and g >= 0.38 and b >= 0.68


def is_ota_special_gold(r: float, g: float, b: float) -> bool:
    """スペシャルシート"""
    if r >= 0.92 and g >= 0.68 and b <= 0.15:
        return True
    return 0.68 <= r <= 0.82 and 0.48 <= g <= 0.62 and b <= 0.12


def classify_ota_seat(
    fill: tuple[float, ...] | None,
    cx: float,
    cy: float,
) -> tuple[str, bool]:
    if not fill or len(fill) < 3:
        return "floor2", False
    r, g, b = float(fill[0]), float(fill[1]), float(fill[2])

    if is_team_green_fill(r, g, b):
        return "team_ticket", False
    if is_pink_floor1(r, g, b):
        return "floor1", True
    if is_ota_goal_magenta(r, g, b):
        return "floor1", True
    if is_ota_courtside_purple(r, g, b):
        return "courtside", True
    if is_ota_end_blue(r, g, b):
        return "end", True
    if is_ota_special_gold(r, g, b):
        return "special", True
    if is_gray_fill(r, g, b):
        return "floor2", False
    if is_blue_floor1(r, g, b):
        return "floor1", True

    return "floor2", False


def classify_seat(
    slug: str,
    fill: tuple[float, ...] | None,
    cx: float,
    cy: float,
) -> tuple[str, bool]:
    if slug in ("2025-12-12", "2025-12-13"):
        return classify_ota_seat(fill, cx, cy)

    if not fill or len(fill) < 3:
        return "floor2", False
    r, g, b = float(fill[0]), float(fill[1]), float(fill[2])

    if is_team_green_fill(r, g, b):
        return "team_ticket", False
    if is_pink_floor1(r, g, b):
        return "floor1", True
    if is_gray_fill(r, g, b):
        return "floor2", False
    if is_blue_floor1(r, g, b):
        return "floor1", True

    return "floor2", False


def ota_stroke_team_rects(page: fitz.Page, pw: float, ph: float) -> list[fitz.Rect]:
    """大田 PDF: 右端チーム券は枠線だけで席矩形が無いブロック"""
    rects: list[fitz.Rect] = []
    for d in page.get_drawings():
        if d.get("type") != "s" or d.get("fill") is not None:
            continue
        r = d.get("rect")
        if not r:
            continue
        w, h = r.width, r.height
        if not (35 <= w <= 70 and 25 <= h <= 90):
            continue
        cx = (r.x0 + r.x1) / 2 / pw
        cy = (r.y0 + r.y1) / 2 / ph
        if cx < 0.80 or not (0.275 <= cy <= 0.785):
            continue
        rects.append(fitz.Rect(r))
    return rects


def ota_seat_dims_norm(page: fitz.Page, pw: float, ph: float) -> tuple[float, float]:
    for d in page.get_drawings():
        if d.get("type") != "f":
            continue
        r = d.get("rect")
        if not r:
            continue
        if abs(r.width - 8.6) <= 0.6 and abs(r.height - 8.6) <= 0.6:
            return r.width / pw, r.height / ph
    return 8.6 / pw, 8.6 / ph


def _seat_overlaps(seats: list[dict], x: float, y: float, w: float, h: float) -> bool:
    for s in seats:
        if x + w <= s["x"] + 0.0005 or s["x"] + s["w"] <= x + 0.0005:
            continue
        if y + h <= s["y"] + 0.0005 or s["y"] + s["h"] <= y + 0.0005:
            continue
        return True
    return False


def add_ota_team_row_gaps(
    page: fitz.Page, seats: list[dict], slug: str, pw: float, ph: float
) -> int:
    """チーム券列の欠け行（PDFに矩形が無い横帯）を補完"""
    team = [s for s in seats if s["zone"] == "team_ticket"]
    if len(team) < 20:
        return 0
    w_n, h_n = ota_seat_dims_norm(page, pw, ph)
    row_ys = sorted({round(s["y"] + s["h"] / 2, 4) for s in team})
    dys = [
        row_ys[i + 1] - row_ys[i]
        for i in range(len(row_ys) - 1)
        if row_ys[i + 1] - row_ys[i] < 0.014
    ]
    if not dys:
        return 0
    dy = statistics.median(dys)
    cols = sorted({round(s["x"], 5) for s in team})
    added = 0
    seq = len(seats) + 5000
    for i in range(len(row_ys) - 1):
        y_lo, y_hi = row_ys[i], row_ys[i + 1]
        if y_hi - y_lo <= 0.025:
            continue
        cy = y_lo + dy
        while cy < y_hi - dy * 0.45:
            for x in cols:
                y = cy - h_n / 2
                if _seat_overlaps(seats, x, y, w_n, h_n):
                    continue
                cx = x + w_n / 2
                if not is_ota_team_zone(cx, cy):
                    continue
                seats.append(
                    {
                        "id": str(
                            uuid.uuid5(
                                uuid.NAMESPACE_URL,
                                f"{slug}-gap-{cy:.4f}-{x:.5f}",
                            )
                        ),
                        "label": str(seq),
                        "section": None,
                        "zone": "team_ticket",
                        "sellable": False,
                        "x": x,
                        "y": y,
                        "w": w_n,
                        "h": h_n,
                    }
                )
                seq += 1
                added += 1
            cy += dy
    return added


def add_ota_stroke_box_seats(
    page: fitz.Page, seats: list[dict], slug: str, pw: float, ph: float
) -> int:
    """枠だけのチーム券ブロック内に席グリッドを補完"""
    w_n, h_n = ota_seat_dims_norm(page, pw, ph)
    seat_w, seat_h = w_n * pw, h_n * ph
    added = 0
    seq = len(seats) + 1
    for r in ota_stroke_team_rects(page, pw, ph):
        pad = 1.2
        inner = fitz.Rect(r.x0 + pad, r.y0 + pad, r.x1 - pad, r.y1 - pad)
        cols = max(1, int(inner.width // seat_w))
        rows = max(1, int(inner.height // seat_h))
        grid_w = cols * seat_w
        grid_h = rows * seat_h
        x_start = inner.x0 + (inner.width - grid_w) / 2
        y_start = inner.y0 + (inner.height - grid_h) / 2
        for row in range(rows):
            for col in range(cols):
                x0 = x_start + col * seat_w
                y0 = y_start + row * seat_h
                x, y = x0 / pw, y0 / ph
                if _seat_overlaps(seats, x, y, w_n, h_n):
                    continue
                seats.append(
                    {
                        "id": str(
                            uuid.uuid5(
                                uuid.NAMESPACE_URL,
                                f"{slug}-stroke-{r.x0}-{r.y0}-{row}-{col}",
                            )
                        ),
                        "label": str(seq),
                        "section": None,
                        "zone": "team_ticket",
                        "sellable": False,
                        "x": x,
                        "y": y,
                        "w": w_n,
                        "h": h_n,
                    }
                )
                seq += 1
                added += 1
    return added


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
        apply_komori_seat_labels(seats)
    elif slug in ("2025-12-12", "2025-12-13"):
        refine_ota_team_zones(seats)
        # 大田会場に 2 階自由席はない — 灰色の誤分類席はデータから除外
        seats = [s for s in seats if s["zone"] != "floor2"]
        apply_ota_seat_labels(seats)
    doc.close()
    rev_src = json.dumps(
        [(s["id"], s.get("label"), s.get("zone")) for s in seats],
        ensure_ascii=False,
    )
    catalog_revision = hashlib.sha256(rev_src.encode()).hexdigest()[:16]
    return {
        "slug": slug,
        "map_width": int(pw),
        "map_height": int(ph),
        "seat_count": len(seats),
        "catalog_revision": catalog_revision,
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
