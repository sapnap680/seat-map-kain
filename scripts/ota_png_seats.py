"""大田: 背景PNGの色マスを席矩形にする（駒沢と同じく図の位置＝タップ位置）"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SEAT_W = 13.6 / 1583
SEAT_H = 13.6 / 1199

# 拡大図の向き（3D会場図とは 90° 違う）
# 下: I–E / 左: M–L–K / 右: A–B–C / 上: チーム O–S


def _detect_squares(png_path: Path) -> list[dict]:
    im = np.array(Image.open(png_path).convert("RGB"))
    im2 = im[::2, ::2]
    r = im2[:, :, 0].astype(np.int16)
    g = im2[:, :, 1].astype(np.int16)
    b = im2[:, :, 2].astype(np.int16)
    sat = np.maximum(np.maximum(np.abs(r - g), np.abs(g - b)), np.abs(r - b))
    white = (r > 230) & (g > 215) & (b > 195)
    gray = (sat < 32) & (r > 70) & (r < 210)
    mask = ((sat > 36) | gray) & (~white)
    m = mask.copy()
    m[1:, :] &= mask[:-1, :]
    m[:-1, :] &= mask[1:, :]
    m[:, 1:] &= mask[:, :-1]
    m[:, :-1] &= mask[:, 1:]

    ys, xs = np.where(m)
    height, width = m.shape
    lab = np.full((height, width), -1, np.int32)
    parent: list[int] = []

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    nid = 0
    for y, x in zip(ys.tolist(), xs.tolist()):
        left = int(lab[y, x - 1]) if x else -1
        up = int(lab[y - 1, x]) if y else -1
        if left < 0 and up < 0:
            parent.append(nid)
            lab[y, x] = nid
            nid += 1
        elif left >= 0 and up < 0:
            lab[y, x] = find(left)
        elif up >= 0 and left < 0:
            lab[y, x] = find(up)
        else:
            a, bv = find(left), find(up)
            if a != bv:
                parent[bv] = a
            lab[y, x] = a

    acc: dict[int, list[int]] = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        a = find(int(lab[y, x]))
        t = acc.get(a)
        if t is None:
            acc[a] = [1, x, y, x, x, y, y]
        else:
            t[0] += 1
            t[1] += x
            t[2] += y
            if x < t[3]:
                t[3] = x
            if x > t[4]:
                t[4] = x
            if y < t[5]:
                t[5] = y
            if y > t[6]:
                t[6] = y

    seats: list[dict] = []
    for t in acc.values():
        n, _sx, _sy, minx, maxx, miny, maxy = t
        bw = maxx - minx + 1
        bh = maxy - miny + 1
        if not (5 <= bw <= 16 and 5 <= bh <= 16 and 15 <= n <= 260 and abs(bw - bh) <= 4):
            continue
        cx = (minx + maxx) / 2 / width
        cy = (miny + maxy) / 2 / height
        seats.append(
            {
                "cx": cx,
                "cy": cy,
                "x": cx - SEAT_W / 2,
                "y": cy - SEAT_H / 2,
                "w": SEAT_W,
                "h": SEAT_H,
                "num": None,
            }
        )
    return seats


def _glyphs(pdf_path: Path) -> list[tuple[int, float, float]]:
    import fitz

    page = fitz.open(pdf_path)[0]
    pw, ph = page.rect.width, page.rect.height
    out = []
    for w in page.get_text("words"):
        t = w[4].strip()
        if re.fullmatch(r"\d+", t) and 1 <= int(t) <= 40:
            out.append((int(t), (w[0] + w[2]) / 2 / pw, (w[1] + w[3]) / 2 / ph))
    return out


def _attach_nums(seats: list[dict], glyphs: list[tuple[int, float, float]]) -> None:
    if not glyphs:
        return
    for s in seats:
        best = None
        bestd = 0.012**2
        for n, x, y in glyphs:
            d = (x - s["cx"]) ** 2 + (y - s["cy"]) ** 2
            if d < bestd:
                bestd = d
                best = n
        s["num"] = best


def _cluster_rows(seats: list[dict], axis: str, gap: float) -> list[list[dict]]:
    key = "cy" if axis == "y" else "cx"
    ordered = sorted(seats, key=lambda s: s[key])
    if not ordered:
        return []
    rows: list[list[dict]] = [[ordered[0]]]
    for s in ordered[1:]:
        if s[key] - rows[-1][-1][key] > gap:
            rows.append([s])
        else:
            rows[-1].append(s)
    return rows


def _split_gaps(ordered: list[dict], axis: str, gap: float) -> list[list[dict]]:
    if not ordered:
        return []
    key = "cx" if axis == "x" else "cy"
    parts: list[list[dict]] = [[ordered[0]]]
    for s in ordered[1:]:
        if s[key] - parts[-1][-1][key] > gap:
            parts.append([s])
        else:
            parts[-1].append(s)
    return parts


def _trim_to(row: list[dict], width: int, axis: str) -> list[dict]:
    key = "cx" if axis == "x" else "cy"
    row = sorted(row, key=lambda s: s[key])
    while len(row) > width and len(row) > 1:
        gaps = [row[i + 1][key] - row[i][key] for i in range(len(row) - 1)]
        i = min(range(len(gaps)), key=lambda k: gaps[k])
        row.pop(i + 1)
    return row


def _emit(block: str, row: int, num: int, seat: dict, spec: dict) -> dict:
    zone = spec["zone"]
    sellable = bool(spec.get("sellable", True))
    cat = spec["category"]
    if block == "Q":
        if num in range(5, 14):
            return {}
        zone = "floor2"
        sellable = False
        cat = "チーム券席（非販売・灰色）"
    label = f"{block}{row}列{num}番"
    box = seat
    return {
        "id": str(
            uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"ota-{block}-{row}-{num}-{box['x']:.5f}-{box['y']:.5f}",
            )
        ),
        "label": label,
        "section": block,
        "category": cat,
        "zone": zone,
        "sellable": sellable,
        "x": box["x"],
        "y": box["y"],
        "w": box["w"],
        "h": box["h"],
    }


def _nums_along(seats: list[dict], axis: str, desc_fallback: bool) -> list[tuple[dict, int]]:
    key = "cx" if axis == "x" else "cy"
    ordered = sorted(seats, key=lambda s: s[key])
    out = []
    for i, s in enumerate(ordered):
        if s.get("num"):
            num = int(s["num"])
        elif desc_fallback:
            num = len(ordered) - i
        else:
            num = i + 1
        out.append((s, num))
    return out


def _label_sideline(seats: list[dict], blocks: list[tuple[str, int, bool]], specs: dict) -> list[dict]:
    """番は横、列は縦。列1はコート側（小さい y）。"""
    rows = _cluster_rows(seats, "y", 0.008)
    out: list[dict] = []
    for ri, row in enumerate(rows[:7], start=1):
        parts = _split_gaps(sorted(row, key=lambda s: s["cx"]), "x", 0.018)
        # 幅が合うセグメントだけ採用。余った細片は隣に吸収しない
        used = []
        bi = 0
        for part in parts:
            if bi >= len(blocks):
                break
            name, width, desc = blocks[bi]
            if len(part) < width - 1:
                continue
            trimmed = _trim_to(part, width, "x")
            if len(trimmed) < width:
                bi += 1
                continue
            for s, num in _nums_along(trimmed, "x", desc):
                rec = _emit(name, ri, num, s, specs[name])
                if rec:
                    out.append(rec)
                    used.append(s)
            bi += 1
    return out


def _label_goal_stack(
    seats: list[dict],
    blocks_top_to_bottom: list[tuple[str, int, bool]],
    specs: dict,
    *,
    row_from_left: bool,
) -> list[dict]:
    """番は縦、列は横（7列）。"""
    cols = _cluster_rows(seats, "x", 0.006)
    # 7列に揃える
    if len(cols) > 7:
        cols = sorted(cols, key=len, reverse=True)[:7]
        cols = sorted(cols, key=lambda c: c[0]["cx"])
    out: list[dict] = []
    for ci, col in enumerate(cols):
        row = (ci + 1) if row_from_left else (len(cols) - ci)
        parts = _split_gaps(sorted(col, key=lambda s: s["cy"]), "y", 0.02)
        bi = 0
        for part in parts:
            if bi >= len(blocks_top_to_bottom):
                break
            name, width, desc = blocks_top_to_bottom[bi]
            if len(part) < max(3, width // 3):
                continue
            trimmed = _trim_to(part, width, "y")
            if len(trimmed) < width - 2:
                bi += 1
                continue
            for s, num in _nums_along(trimmed, "y", desc):
                rec = _emit(name, row, num, s, specs[name])
                if rec:
                    out.append(rec)
            bi += 1
    return out


def _team_block(cx: float) -> str:
    """上段は左から O / P / Q（通路で二分） / R / S。看板で欠けても x で決める。"""
    if cx < 0.30:
        return "O"
    if cx < 0.425:
        return "P"
    if cx < 0.57:
        return "Q"
    if cx < 0.72:
        return "R"
    return "S"


def _label_team(seats: list[dict], specs: dict) -> list[dict]:
    """上端チーム席。列1はコート側（大きい y）。番号は図面の数字。"""
    seats = [s for s in seats if 0.07 < s["cy"] < 0.18 and 0.10 < s["cx"] < 0.92]
    rows = _cluster_rows(seats, "y", 0.005)
    # 小さい y が列7、大きい y（コート側）が列1
    out: list[dict] = []
    n_rows = len(rows)
    for idx, row in enumerate(rows):
        ri = n_rows - idx
        for s in row:
            num = int(s["num"]) if s.get("num") else None
            if not num:
                continue
            name = _team_block(s["cx"])
            rec = _emit(name, ri, num, s, specs[name])
            if rec:
                out.append(rec)
    return out


def _premium_hit(name: str, num: int, cx: float, cy: float, bw: float, bh: float, zone: str) -> dict:
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"ota-{name}-{num}-{cx:.4f}-{cy:.4f}")),
        "label": f"{num}番" if name == "スペシャルシート" else f"{name}{num}番",
        "section": name,
        "category": name,
        "zone": zone,
        "sellable": True,
        "x": cx - bw / 2,
        "y": cy - bh / 2,
        "w": bw,
        "h": bh,
    }


def _premium_from_glyphs(pdf_path: Path, defn: dict) -> list[dict]:
    """コートサイド・コートエンド・スペシャルは通常席より大きく、数字の位置が席そのもの。"""
    specs = defn["premium"]
    glyphs = _glyphs(pdf_path)
    out: list[dict] = []

    def add(pred, name: str, bw: float, bh: float) -> None:
        spec = specs[name]
        seen: set[int] = set()
        for n, x, y in glyphs:
            if n in seen or not pred(n, x, y):
                continue
            if n < 1 or n > spec["count"]:
                continue
            seen.add(n)
            out.append(_premium_hit(name, n, x, y, bw, bh, spec["zone"]))

    # 青の縦列（左 1–10、右 11–20）
    add(
        lambda n, x, y: 0.30 < y < 0.72 and (0.18 < x < 0.26 or 0.74 < x < 0.84),
        "コートエンド",
        28 / 1584,
        21 / 1200,
    )
    # コート下の濃い紫（VIP の左右）
    add(
        lambda n, x, y: 0.725 < y < 0.750 and 0.18 < x < 0.85,
        "コートサイドA",
        0.014,
        0.018,
    )
    # その下の薄い紫
    add(
        lambda n, x, y: 0.750 < y < 0.785 and 0.18 < x < 0.85,
        "コートサイドB",
        0.014,
        0.018,
    )
    # ベンチ間の金
    add(
        lambda n, x, y: 0.27 < y < 0.33 and 0.35 < x < 0.70,
        "スペシャルシート",
        22 / 1584,
        22 / 1200,
    )
    return out


def _snap_to_pdf_rects(seats: list[dict], pdf_path: Path) -> None:
    """PNG で見つけた中心を、図面に描かれた矩形へ寄せる（半マス分のずれを消す）"""
    import fitz

    page = fitz.open(pdf_path)[0]
    pw, ph = page.rect.width, page.rect.height
    rects: list[tuple[float, float, float, float]] = []
    for d in page.get_drawings():
        if d.get("type") != "f" or d.get("fill") is None:
            continue
        r = d["rect"]
        if 13.4 <= r.width <= 14.2 and 13.4 <= r.height <= 14.2:
            rects.append((r.x0 / pw, r.y0 / ph, r.width / pw, r.height / ph))
    page.parent.close()
    if not rects:
        return
    pts = np.array([(x + w / 2, y + h / 2) for x, y, w, h in rects])
    limit = 0.005 ** 2
    for s in seats:
        cx = s["x"] + s["w"] / 2
        cy = s["y"] + s["h"] / 2
        d2 = (pts[:, 0] - cx) ** 2 + (pts[:, 1] - cy) ** 2
        i = int(d2.argmin())
        if d2[i] < limit:
            s["x"], s["y"], s["w"], s["h"] = rects[i]


def build_png_seats(slug: str, pdf_path: Path | None, defn: dict) -> list[dict]:
    png = ROOT / "public" / "backgrounds" / f"{slug}.png"
    if not png.is_file():
        return []
    seats = _detect_squares(png)
    if pdf_path and pdf_path.is_file():
        _attach_nums(seats, _glyphs(pdf_path))
    specs = defn["blocks"]

    bottom = [s for s in seats if s["cy"] > 0.80 and 0.15 < s["cx"] < 0.86]
    top = [s for s in seats if 0.07 < s["cy"] < 0.18 and 0.10 < s["cx"] < 0.92]
    left = [s for s in seats if s["cx"] < 0.18 and 0.18 < s["cy"] < 0.84]
    right = [s for s in seats if s["cx"] > 0.82 and 0.18 < s["cy"] < 0.84]
    out: list[dict] = []
    out += _label_sideline(
        bottom,
        [
            ("I", 3, False),
            ("H", 17, False),
            ("G", 17, False),
            ("F", 17, False),
            ("E", 3, False),
        ],
        specs,
    )
    # 左は上から M, L, K。列1はコート側（右）
    out += _label_goal_stack(
        left,
        [("M", 12, True), ("L", 17, False), ("K", 12, True)],
        specs,
        row_from_left=False,
    )
    # 右は上から A, B, C。列1はコート側（左）
    out += _label_goal_stack(
        right,
        [("A", 12, False), ("B", 17, False), ("C", 12, False)],
        specs,
        row_from_left=True,
    )
    out += _label_team(top, specs)
    if pdf_path and pdf_path.is_file():
        _snap_to_pdf_rects(out, pdf_path)
        out += _premium_from_glyphs(pdf_path, defn)
    return out
