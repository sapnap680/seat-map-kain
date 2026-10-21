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
        # 通常PDF (~8.6pt) / 横_拡大 (~12.2pt) / 横_拡大最新 (~14pt)
        if 7.5 <= w <= 10.5 and 7.5 <= h <= 10.5:
            return True
        if 13.4 <= w <= 13.85 and 13.4 <= h <= 13.85:
            return True
        if 13.9 <= w <= 14.5 and 13.9 <= h <= 14.5:
            return False
        if 11 <= w <= 19 and 11 <= h <= 23:
            return False
        if 24 <= w <= 42 and 24 <= h <= 42:
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


def dedupe_ota_items(
    items: list[tuple[fitz.Rect, tuple]], pw: float, ph: float
) -> list[tuple[fitz.Rect, tuple]]:
    """拡大PDFなど: 同じ位置の多重矩形を格子で1席にまとめる"""
    cell_x = max(13.6 / pw, 0.003)
    cell_y = max(13.6 / ph, 0.003)
    cells: dict[tuple[int, int], tuple[fitz.Rect, tuple]] = {}
    for r, fill in sorted(items, key=lambda x: x[0].width * x[0].height, reverse=True):
        cx = (r.x0 + r.x1) / 2 / pw
        cy = (r.y0 + r.y1) / 2 / ph
        key = (round(cx / cell_x), round(cy / cell_y))
        if key not in cells:
            cells[key] = (r, fill)
    return list(cells.values())


def _pix_rgb(pix: fitz.Pixmap, x: int, y: int) -> tuple[int, int, int]:
    x = max(0, min(pix.width - 1, x))
    y = max(0, min(pix.height - 1, y))
    i = (y * pix.width + x) * pix.n
    s = pix.samples
    return s[i], s[i + 1], s[i + 2]


def is_display_gray(r8: int, g8: int, b8: int) -> bool:
    spread = max(r8, g8, b8) - min(r8, g8, b8)
    avg = (r8 + g8 + b8) / 3
    return spread <= 28 and 145 <= avg <= 215


def is_display_pink(r8: int, g8: int, b8: int) -> bool:
    return r8 >= 195 and g8 >= 115 and g8 <= 195 and b8 >= 150 and b8 <= 220


def is_display_ota_floor1_blue(r8: int, g8: int, b8: int) -> bool:
    """convert_pdfs と同じ水色 1階席（PDF そのまま PNG）"""
    if b8 < 200 or g8 < 165:
        return False
    if r8 > 200:
        return False
    return b8 >= g8 >= r8


def is_display_ota_magenta(r8: int, g8: int, b8: int) -> bool:
    """拡大PDF 1階 #CC4990 系（G が低いマゼンタ）"""
    if r8 >= 175 and b8 >= 110 and g8 <= 135 and r8 > g8 + 35:
        return True
    return r8 >= 185 and 60 <= g8 <= 105 and b8 >= 125


def is_display_courtside(r8: int, g8: int, b8: int) -> bool:
    return b8 >= 130 and r8 <= 140 and b8 > g8 + 15


def is_display_gold(r8: int, g8: int, b8: int) -> bool:
    return r8 >= 215 and g8 >= 150 and b8 <= 90


def is_display_team_green(r8: int, g8: int, b8: int) -> bool:
    return g8 >= 165 and 90 <= r8 <= 220 and b8 <= 130 and g8 >= r8 + 20


def is_display_ota_sellable_pixel(r8: int, g8: int, b8: int) -> bool:
    if is_display_gray(r8, g8, b8) or is_display_team_green(r8, g8, b8):
        return False
    return (
        is_display_pink(r8, g8, b8)
        or is_display_ota_magenta(r8, g8, b8)
        or is_display_ota_floor1_blue(r8, g8, b8)
        or is_display_courtside(r8, g8, b8)
        or is_display_gold(r8, g8, b8)
    )


_OTA_SAMPLE_FRAC = (
    (0.5, 0.5),
    (0.4, 0.5),
    (0.6, 0.5),
    (0.5, 0.4),
    (0.5, 0.6),
    (0.42, 0.42),
    (0.58, 0.58),
)


def _ota_seat_render_votes(
    s: dict, pix: fitz.Pixmap
) -> tuple[int, int, int]:
    """席矩形内を複数点サンプル（枠の白抜け対策）"""
    gray = pink = white = 0
    for fx, fy in (
        (0.5, 0.5),
        (0.35, 0.5),
        (0.65, 0.5),
        (0.5, 0.35),
        (0.5, 0.65),
    ):
        px = int((s["x"] + s["w"] * fx) * pix.width)
        py = int((s["y"] + s["h"] * fy) * pix.height)
        r8, g8, b8 = _pix_rgb(pix, px, py)
        if r8 >= 250 and g8 >= 250 and b8 >= 250:
            white += 1
        elif is_display_gray(r8, g8, b8):
            gray += 1
        elif is_display_pink(r8, g8, b8):
            pink += 1
    return gray, pink, white


def _ota_sample_rgb(
    im, s: dict
) -> tuple[int, int, int, int, int]:
    """public/backgrounds PNG 上で複数点サンプル → gray,sell,team,white 票数"""
    w, h = im.size
    gray = sell = team = white = 0
    for fx, fy in _OTA_SAMPLE_FRAC:
        px = max(0, min(w - 1, int((s["x"] + s["w"] * fx) * w)))
        py = max(0, min(h - 1, int((s["y"] + s["h"] * fy) * h)))
        r8, g8, b8 = im.getpixel((px, py))
        if r8 >= 250 and g8 >= 250 and b8 >= 250:
            white += 1
        elif is_display_team_green(r8, g8, b8):
            team += 1
        elif is_display_gray(r8, g8, b8):
            gray += 1
        elif is_display_ota_sellable_pixel(r8, g8, b8):
            sell += 1
    return gray, sell, team, white, w, h


def refine_ota_sellable_from_png(
    seats: list[dict], slug: str, pw: float, ph: float
) -> None:
    """会場PNG（アプリ表示と同一）で灰色=販売なし / ピンク=販売可 に補正"""
    try:
        from PIL import Image
    except ImportError:
        return
    png = ROOT / "public" / "backgrounds" / f"{slug}.png"
    if not png.is_file():
        return
    im = Image.open(png).convert("RGB")
    for s in seats:
        cx = s["x"] + s["w"] / 2
        cy = s["y"] + s["h"] / 2
        gray, sell, team, white, _, _ = _ota_sample_rgb(im, s)
        if white >= 5 and sell == 0 and gray == 0 and team == 0:
            continue
        if is_ota_team_zone(cx, cy, page_w=pw, page_h=ph):
            s["zone"] = "team_ticket"
            s["sellable"] = False
            continue
        if team >= 2 and team >= sell:
            s["zone"] = "team_ticket"
            s["sellable"] = False
            continue
        if sell >= 1 and sell >= gray:
            if s["zone"] in ("floor2", None):
                s["zone"] = "floor1"
            s["sellable"] = True
        elif not s["sellable"] and gray >= 2 and sell == 0:
            s["zone"] = "floor2"
            s["sellable"] = False
    im.close()


# 座席表公式: ゴール裏 L・B・C は灰色非販売（K/M/A は前売り）
OTA_GRAY_GOAL_BLOCKS = frozenset({"L", "B", "C"})


def refine_ota_gray_goal_blocks(seats: list[dict]) -> None:
    for s in seats:
        sec = (s.get("section") or "").strip()
        if sec not in OTA_GRAY_GOAL_BLOCKS:
            continue
        s["zone"] = "floor2"
        s["sellable"] = False
        s["category"] = "1階（販売なし・灰色）"


def _ota_q_seat_num(label: str | None) -> int | None:
    if not label:
        return None
    m = re.match(r"Q\d+列(\d+)番", label.strip())
    return int(m.group(1)) if m else None


def refine_ota_q_team_gray(seats: list[dict]) -> None:
    """Q列 1–4番・14番以降＝通路わき灰色（56席）"""
    for s in seats:
        if (s.get("section") or "").strip() != "Q":
            continue
        num = _ota_q_seat_num(s.get("label"))
        if num is None:
            continue
        if num <= 4 or num >= 14:
            s["zone"] = "floor2"
            s["sellable"] = False
            s["category"] = "チーム券席（非販売・灰色）"


def refine_ota_team_presale(seats: list[dict]) -> None:
    """緑チーム券＝当日販売対象（在庫カウント用）"""
    for s in seats:
        if s["zone"] != "team_ticket":
            continue
        s["sellable"] = True


def refine_ota_floor2_free(seats: list[dict]) -> None:
    """2階自由席（灰色＝当日自由席販売）"""
    for s in seats:
        if s["zone"] != "floor2":
            continue
        cat = s.get("category") or ""
        if "非販売" in cat or "販売なし" in cat:
            continue
        s["sellable"] = True
        if not cat or cat == "1階指定席":
            s["category"] = "2階自由席"


def is_gray_fill(r: float, g: float, b: float) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return spread < 0.12 and 0.5 <= avg <= 0.88


def is_pink_floor1_komori(r: float, g: float, b: float) -> bool:
    """駒オリ 1階席（料金表 #E38AB2 および PDF ピンク）"""
    if r >= 0.85 and 0.48 <= g <= 0.58 and 0.65 <= b <= 0.72:
        return True
    return r >= 0.9 and 0.65 <= g <= 0.78 and b >= 0.75


def is_pink_floor1(r: float, g: float, b: float) -> bool:
    """料金表 1階指定席 #E38AB2"""
    return is_pink_floor1_komori(r, g, b)


def is_team_green_fill(r: float, g: float, b: float) -> bool:
    """料金表 チーム券席 #92D050 / 拡大PDFの緑"""
    if r >= 0.48 and g >= 0.72 and b <= 0.45 and g >= r + 0.08:
        return True
    return (
        g >= 0.78
        and 0.45 <= r <= 0.65
        and 0.25 <= b <= 0.42
        and g >= r + 0.12
    )


def is_ota_team_zone(
    cx: float,
    cy: float,
    *,
    page_w: float = 0,
    page_h: float = 0,
) -> bool:
    """大田区 PDF: チーム券（縦PDF=東側、横PDF=上側）"""
    landscape = page_w > page_h if page_w and page_h else False
    if landscape:
        if cy > 0.38:
            return False
        return 0.12 <= cx <= 0.95
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
    if is_ota_goal_magenta(r, g, b):
        return "floor1", True
    if is_pink_floor1(r, g, b):
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
        if pw > ph:
            if cy > 0.38 or not (0.12 <= cx <= 0.95):
                continue
        elif cx < 0.80 or not (0.275 <= cy <= 0.785):
            continue
        rects.append(fitz.Rect(r))
    return rects


def ota_seat_dims_norm(page: fitz.Page, pw: float, ph: float) -> tuple[float, float]:
    for target in (14.0, 12.2, 8.6, 4.7):
        for d in page.get_drawings():
            if d.get("type") != "f":
                continue
            r = d.get("rect")
            if not r:
                continue
            if abs(r.width - target) <= 0.8 and abs(r.height - target) <= 0.8:
                return r.width / pw, r.height / ph
    return 12.2 / pw, 12.2 / ph


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
                if not is_ota_team_zone(cx, cy, page_w=pw, page_h=ph):
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


def refine_ota_team_zones(seats: list[dict], pw: float, ph: float) -> None:
    """チーム券は灰色席のみ（ピンク1階は触らない）"""
    for s in seats:
        if s["zone"] == "floor1":
            continue
        cx = s["x"] + s["w"] / 2
        cy = s["y"] + s["h"] / 2
        in_team = is_ota_team_zone(cx, cy, page_w=pw, page_h=ph)
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

    if slug in ("2025-12-12", "2025-12-13"):
        # 14pt 外枠のみ（内側 ~11pt は重複レイヤー）
        # 拡大PDF: 内側 ~13.6pt が表示色と一致（外側 ~14pt は白枠）
        raw = [
            (r, fill)
            for r, fill in raw
            if 13.4 <= r.width <= 13.85 and 13.4 <= r.height <= 13.85
        ]
        items = dedupe_ota_items(raw, pw, ph)
    else:
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
        apply_komori_seat_labels(seats, page, pw, ph)
    elif slug in ("2025-12-12", "2025-12-13"):
        raise RuntimeError(
            "大田 12/12–13 は拡大PDFから席数を取らない。"
            " python scripts/generate_ota_seats.py を使う"
        )
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
        if slug in ("2025-12-12", "2025-12-13"):
            print(f"skip Ota (use generate_ota_seats.py): {pdf.name}")
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
