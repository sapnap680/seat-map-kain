"""PDF 矩形 ↔ 定義席: スタンド分割 + 行クラスタ + ブロック幅"""
from __future__ import annotations

from collections import defaultdict
from typing import Callable

from ota_seat_definition import load_definition

ROW_TOL = 0.004
ROWS = 7


def _cx(g: dict) -> float:
    return g["x"] + g["w"] / 2


def _cy(g: dict) -> float:
    return g["y"] + g["h"] / 2


def _partition_geom(geom: list[dict]) -> dict[str, list[dict]]:
    used: set[int] = set()
    out: dict[str, list[dict]] = {
        "team": [],
        "left": [],
        "topGoal": [],
        "botGoal": [],
        "premium": [],
    }

    for i, g in enumerate(geom):
        if _cx(g) > 0.78:
            used.add(i)
            out["team"].append(g)

    for i, g in enumerate(geom):
        if i in used:
            continue
        if _cx(g) < 0.22 and 0.12 < _cy(g) < 0.98:
            used.add(i)
            out["left"].append(g)

    for i, g in enumerate(geom):
        if i in used:
            continue
        if _cy(g) < 0.17 and 0.21 <= _cx(g) <= 0.80:
            used.add(i)
            out["topGoal"].append(g)

    for i, g in enumerate(geom):
        if i in used:
            continue
        if _cy(g) > 0.88 and 0.28 <= _cx(g) <= 0.78:
            used.add(i)
            out["botGoal"].append(g)

    for i, g in enumerate(geom):
        if i not in used:
            out["premium"].append(g)
    return out


def _cluster_rows(values: list[float], tol: float) -> list[float]:
    if not values:
        return []
    vals = sorted(values)
    groups: list[list[float]] = [[vals[0]]]
    for v in vals[1:]:
        if v - groups[-1][-1] <= tol:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [sum(g) / len(g) for g in groups]


def _force_n_row_centers(geom: list[dict], row_axis: str, n: int = ROWS) -> list[float]:
    """拡大PDFの重なりで行クラスタが割れるのを防ぎ、定義どおり n 行に固定"""
    if not geom:
        return [0.5] * n
    vals = sorted(_cy(g) if row_axis == "y" else _cx(g) for g in geom)
    if len(vals) <= n:
        centers = vals[:]
        while len(centers) < n:
            centers.append(centers[-1] if centers else 0.5)
        return centers
    centers: list[float] = []
    for i in range(n):
        lo = int(i * len(vals) / n)
        hi = int((i + 1) * len(vals) / n)
        chunk = vals[lo:hi] or [vals[min(lo, len(vals) - 1)]]
        centers.append(sum(chunk) / len(chunk))
    if row_axis == "x":
        centers.sort(reverse=True)
    else:
        centers.sort()
    return centers


def _row_num(v: float, centers: list[float]) -> int:
    best_i, best_d = 0, 1e9
    for i, c in enumerate(centers):
        d = abs(v - c)
        if d < best_d:
            best_d, best_i = d, i
    return best_i + 1


def _trim_row(seats: list[dict], target: int, sort_key: Callable[[dict], tuple]) -> list[dict]:
    if len(seats) <= target:
        return sorted(seats, key=sort_key)
    ordered = sorted(seats, key=sort_key)
    if target <= 0:
        return []
    if target == len(ordered):
        return ordered
    # 等間隔に間引き（重複アートボード対策）
    idxs = [round(i * (len(ordered) - 1) / (target - 1)) for i in range(target)]
    return [ordered[i] for i in idxs]


def _split_blocks(
    ordered: list[dict], block_widths: list[tuple[str, int]], along: str
) -> list[tuple[dict, str, int]]:
    if not ordered:
        return []
    width_sum = sum(w for _, w in block_widths)
    if len(ordered) != width_sum:
        ordered = _trim_row(ordered, width_sum, lambda g: g["_sort"])
    idx = 0
    out: list[tuple[dict, str, int]] = []
    for name, w in block_widths:
        seg = ordered[idx : idx + w]
        idx += w
        for i, s in enumerate(seg):
            out.append((s, name, i))
    return out


def _logical_key(log: dict) -> tuple:
    if log["stand"] == "premium":
        return (log["section"], 0, log["num"])
    return (log["section"], log["row"], log["num"])


def _assign_stand(
    geom: list[dict],
    logical: list[dict],
    block_widths: list[tuple[str, int]],
    row_axis: str,
    along: str,
    sort_geo: Callable[[dict], tuple],
) -> dict[tuple, dict]:
    if not logical:
        return {}
    width_sum = sum(w for _, w in block_widths)
    centers = _force_n_row_centers(geom, row_axis, ROWS)

    by_row_geom: dict[int, list[dict]] = defaultdict(list)
    for g in geom:
        v = _cx(g) if row_axis == "x" else _cy(g)
        rn = _row_num(v, centers)
        g2 = {**g, "_sort": sort_geo(g)}
        by_row_geom[rn].append(g2)

    log_by_row: dict[int, list[dict]] = defaultdict(list)
    for L in logical:
        log_by_row[L["row"]].append(L)

    merged: dict[tuple, dict] = {}
    for row in range(1, ROWS + 1):
        g_row = by_row_geom.get(row, [])
        l_row = sorted(
            log_by_row.get(row, []),
            key=lambda L: (L["section"], L["slotIndex"]),
        )
        if not l_row:
            continue
        triples = _split_blocks(g_row, block_widths, along)
        geo_map: dict[tuple[str, int], dict] = {}
        for g, block, slot in triples:
            geo_map[(block, slot)] = g
        for L in l_row:
            g = geo_map.get((L["section"], L["slotIndex"]))
            if g:
                merged[_logical_key(L)] = {k: g[k] for k in ("x", "y", "w", "h")}
    return merged


def _premium_from_svg(defn: dict) -> dict[tuple, dict]:
    """3D会場図 viewBox(1080×1072) → PDF 正規化 (1583×1199)"""
    svg_w, svg_h = 1080.0, 1072.0
    pdf_w, pdf_h = 1583.0, 1199.0
    sx, sy = pdf_w / svg_w, pdf_h / svg_h
    seat_w, seat_h = 14.0 * sx / pdf_w, 14.0 * sy / pdf_h

    reg: dict[str, list[tuple[float, float, float, float]]] = {
        "コートサイドA": [(374, 229, 14, 183), (374, 622, 14, 183)],
        "コートサイドB": [
            (355, 244, 14, 168),
            (355, 425, 14, 184),
            (355, 622, 14, 168),
        ],
        "コートエンド": [
            (403, 223, 81, 18),
            (606, 223, 81, 18),
            (403, 794, 81, 18),
            (606, 794, 81, 18),
        ],
        "スペシャルシート": [(710, 419, 14, 51), (710, 564, 14, 51)],
    }

    merged: dict[tuple, dict] = {}
    for name, spec in defn["premium"].items():
        rects = reg.get(name, [])
        count = spec["count"]
        if name == "コートサイドA":
            slots = list(range(1, 13)) + list(range(13, 25))
        elif name == "コートサイドB":
            slots = list(range(1, 12)) + list(range(12, 24)) + list(range(24, 35))
        elif name == "コートエンド":
            slots = list(range(1, 21))
        else:
            slots = list(range(1, count + 1))

        for n in range(1, count + 1):
            slot_idx = n - 1
            if not rects:
                continue
            ri = min(slot_idx * len(rects) // count, len(rects) - 1)
            rx, ry, rw, rh = rects[ri]
            t = (slot_idx % (count // len(rects) + 1)) / max(
                count // len(rects) + 1, 1
            )
            px = rx + rw * 0.35
            py = ry + rh * t
            merged[(name, 0, n)] = {
                "x": px * sx / pdf_w,
                "y": py * sy / pdf_h,
                "w": seat_w,
                "h": seat_h,
            }
    return merged


def _assign_premium(geom: list[dict], logical: list[dict], defn: dict) -> dict[tuple, dict]:
    """PDF 矩形があれば優先、なければ SVG レイアウト"""
    from ota_seat_labels import label_courtside, label_end, label_special
    import re

    seats: list[dict] = []
    for i, g in enumerate(geom):
        cx, cy = _cx(g), _cy(g)
        if 0.22 <= cx <= 0.45 and 0.24 < cy < 0.76:
            zone = "courtside"
        elif cy < 0.28 and 0.38 < cx < 0.72:
            zone = "end"
        elif 0.66 <= cx <= 0.78 and 0.35 < cy < 0.65:
            zone = "special"
        else:
            zone = "end"
        seats.append(
            {
                **g,
                "id": f"p{i}",
                "zone": zone,
                "section": None,
                "label": None,
                "category": None,
            }
        )
    label_courtside([s for s in seats if s["zone"] == "courtside"])
    label_end([s for s in seats if s["zone"] == "end"])
    label_special([s for s in seats if s["zone"] == "special"])

    by_label: dict[tuple, dict] = {}
    for s in seats:
        sec = (s.get("section") or "").strip()
        lab = (s.get("label") or "").strip()
        if not lab or lab == "—":
            continue
        m = re.search(r"(\d+)番", lab)
        if sec in ("コートサイドA", "コートサイドB", "コートエンド", "スペシャルシート") and m:
            by_label[(sec, 0, int(m.group(1)))] = s

    svg = _premium_from_svg(defn)
    merged: dict[tuple, dict] = {}
    for L in logical:
        key = (L["section"], 0, L["num"])
        src = by_label.get(key) or svg.get(key)
        if src:
            merged[key] = {k: src[k] for k in ("x", "y", "w", "h")}
    return merged


def assign_all_geometry(geom: list[dict], logical: list[dict]) -> dict[tuple, dict]:
    defn = load_definition()
    parts = _partition_geom(geom)
    by_stand: dict[str, list[dict]] = defaultdict(list)
    for L in logical:
        by_stand[L["stand"]].append(L)

    merged: dict[tuple, dict] = {}
    stand_cfg = {
        "left": (
            [("I", 3), ("H", 17), ("G", 17), ("F", 17), ("E", 3)],
            "y",
            "x",
            lambda g: (round(_cx(g), 5), round(_cy(g), 5)),
        ),
        "topGoal": (
            [("K", 12), ("L", 17), ("M", 12)],
            "y",
            "x",
            lambda g: (round(_cy(g), 5), round(_cx(g), 5)),
        ),
        "botGoal": (
            [("C", 12), ("B", 17), ("A", 12)],
            "y",
            "x",
            lambda g: (round(_cy(g), 5), round(_cx(g), 5)),
        ),
        "team": (
            [("O", 13), ("P", 17), ("Q", 17), ("R", 17), ("S", 13)],
            "y",
            "x",
            lambda g: (round(_cy(g), 5), round(_cx(g), 5)),
        ),
    }
    for stand, (widths, row_axis, along, sort_geo) in stand_cfg.items():
        merged.update(
            _assign_stand(
                parts[stand],
                by_stand[stand],
                widths,
                row_axis,
                along,
                sort_geo,
            )
        )
    merged.update(_assign_premium(parts["premium"], by_stand["premium"], defn))
    return merged


def assign_block(*_a, **_k):
    return {}


def assign_left_ie(*_a, **_k):
    return {}
