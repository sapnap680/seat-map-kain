"""横向き拡大PDF: ブロック帯ごとに矩形を定義席へ割当"""
from __future__ import annotations

import statistics
from typing import Callable

from ota_seat_definition import load_definition, q_skip_seat_nums, seat_num_for_block


def _cx(g: dict) -> float:
    return g["x"] + g["w"] / 2


def _cy(g: dict) -> float:
    return g["y"] + g["h"] / 2


# 横向き PDF 上のおおよそのブロック（正規化 0–1）
BLOCK_CX: dict[str, tuple[float, float]] = {
    "I": (0.06, 0.11),
    "H": (0.09, 0.14),
    "G": (0.11, 0.16),
    "F": (0.13, 0.18),
    "E": (0.15, 0.21),
    "K": (0.28, 0.40),
    "L": (0.40, 0.56),
    "M": (0.56, 0.72),
    "C": (0.30, 0.42),
    "B": (0.42, 0.58),
    "A": (0.58, 0.74),
    "O": (0.80, 0.86),
    "P": (0.84, 0.89),
    "Q": (0.87, 0.92),
    "R": (0.90, 0.95),
    "S": (0.93, 0.99),
}


def _cluster_rows(ys: list[float], rows: int) -> list[float]:
    if not ys:
        return []
    ys = sorted(ys)
    if len(ys) <= rows:
        return ys
    step = len(ys) / rows
    centers: list[float] = []
    for i in range(rows):
        chunk = ys[int(i * step) : int((i + 1) * step)] or [ys[min(int(i * step), len(ys) - 1)]]
        centers.append(statistics.mean(chunk))
    return sorted(centers)


def _row_tol(centers: list[float]) -> float:
    if len(centers) < 2:
        return 0.012
    gaps = [centers[i + 1] - centers[i] for i in range(len(centers) - 1)]
    return max(0.008, statistics.median(gaps) * 0.45)


def _pick_row(cy: float, centers: list[float], tol: float) -> int | None:
    best, best_d = None, 1e9
    for i, c in enumerate(centers):
        d = abs(cy - c)
        if d < best_d:
            best_d, best = d, i + 1
    return best if best_d <= tol else None


def assign_block(
    geom: list[dict],
    used: set[int],
    block: str,
    width: int,
    rows: int,
    *,
    cx_range: tuple[float, float],
    cy_range: tuple[float, float] | None = None,
    sort_along: Callable[[dict], float] = _cx,
    numbering: str = "asc",
) -> dict[tuple[str, int, int], dict]:
    lo, hi = cx_range
    pool: list[tuple[int, dict]] = []
    for i, g in enumerate(geom):
        if i in used:
            continue
        cx, cy = _cx(g), _cy(g)
        if not (lo <= cx <= hi):
            continue
        if cy_range and not (cy_range[0] <= cy <= cy_range[1]):
            continue
        pool.append((i, g))
    if not pool:
        return {}

    row_centers = _cluster_rows([_cy(g) for _, g in pool], rows)
    tol = _row_tol(row_centers)
    out: dict[tuple[str, int, int], dict] = {}

    for ri in range(1, rows + 1):
        row_seats = [
            (i, g)
            for i, g in pool
            if _pick_row(_cy(g), row_centers, tol) == ri
        ]
        row_seats.sort(key=lambda t: sort_along(t[1]))
        if len(row_seats) > width:
            row_seats = row_seats[:width]
        for slot, (i, g) in enumerate(row_seats):
            spec = load_definition()["blocks"][block]
            num = seat_num_for_block(block, spec, slot, width)
            if block == "Q" and num in q_skip_seat_nums(load_definition()):
                continue
            key = (block, ri, num)
            if key not in out:
                out[key] = g
                used.add(i)
    return out


def assign_left_ie(
    geom: list[dict], used: set[int], rows: int
) -> dict[tuple[str, int, int], dict]:
    """I–H–G–F–E を左スタンド1本で x 分割（列幅定義どおり）"""
    defn = load_definition()
    blocks = [("I", 3), ("H", 17), ("G", 17), ("F", 17), ("E", 3)]
    pool = [
        (i, g)
        for i, g in enumerate(geom)
        if i not in used and _cx(g) < 0.22 and 0.12 <= _cy(g) <= 0.92
    ]
    if not pool:
        return {}
    row_centers = _cluster_rows([_cy(g) for _, g in pool], rows)
    tol = _row_tol(row_centers)
    out: dict[tuple[str, int, int], dict] = {}
    for ri in range(1, rows + 1):
        row_seats = [
            (i, g)
            for i, g in pool
            if i not in used and _pick_row(_cy(g), row_centers, tol) == ri
        ]
        row_seats.sort(key=lambda t: _cx(t[1]), reverse=True)
        idx = 0
        for block, width in blocks:
            spec = defn["blocks"][block]
            for slot in range(width):
                if idx >= len(row_seats):
                    break
                i, g = row_seats[idx]
                idx += 1
                num = seat_num_for_block(block, spec, slot, width)
                key = (block, ri, num)
                if key not in out:
                    out[key] = g
                    used.add(i)
    return out


def assign_all_geometry(geom: list[dict], logical: list[dict]) -> dict[tuple, dict]:
    defn = load_definition()
    rows = defn["rows"]
    used: set[int] = set()
    merged: dict[tuple, dict] = {}

    merged.update(assign_left_ie(geom, used, rows))

    stands: list[tuple[str, tuple[float, float] | None, Callable, str]] = [
        ("K", BLOCK_CX["K"], _cx, "desc"),
        ("L", BLOCK_CX["L"], _cx, "asc"),
        ("M", BLOCK_CX["M"], _cx, "desc"),
        ("C", BLOCK_CX["C"], _cx, "asc"),
        ("B", BLOCK_CX["B"], _cx, "asc"),
        ("A", BLOCK_CX["A"], _cx, "asc"),
        ("O", BLOCK_CX["O"], _cx, "asc"),
        ("P", BLOCK_CX["P"], _cx, "asc"),
        ("Q", BLOCK_CX["Q"], _cx, "asc"),
        ("R", BLOCK_CX["R"], _cx, "asc"),
        ("S", BLOCK_CX["S"], _cx, "asc"),
    ]

    cy_top = (0.04, 0.17)
    cy_bot = (0.88, 0.99)
    cy_left = (0.12, 0.92)
    cy_team = (0.04, 0.99)

    for block, cxr, sort_fn, num in stands:
        spec = defn["blocks"][block]
        w = spec["width"]
        if block in ("K", "L", "M"):
            cy_r = cy_top
        elif block in ("C", "B", "A"):
            cy_r = cy_bot
        elif block in ("I", "H", "G", "F", "E"):
            cy_r = cy_left
        else:
            cy_r = cy_team
        chunk = assign_block(
            geom,
            used,
            block,
            w,
            rows,
            cx_range=cxr,
            cy_range=cy_r,
            sort_along=sort_fn,
            numbering=spec.get("numbering", "asc"),
        )
        merged.update(chunk)

    return merged
