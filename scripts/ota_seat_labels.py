"""大田 12/12・12/13: ota-seat-view.html と同じブロック・列・番号"""
from __future__ import annotations

import statistics
from typing import Callable

SeatDict = dict


def _cx(s: SeatDict) -> float:
    return s["x"] + s["w"] / 2


def _cy(s: SeatDict) -> float:
    return s["y"] + s["h"] / 2


def cluster_1d(values: list[float], tol: float) -> list[float]:
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


def assign_row_clusters(seats: list[SeatDict], axis: str, tol: float) -> dict[str, int]:
    """axis 'x': 列1=コート側（x大）。axis 'y': 列1=上端。"""
    if axis == "x":
        vals = [_cx(s) for s in seats]
        centers = cluster_1d(vals, tol)
        centers.sort(reverse=True)
    else:
        vals = [_cy(s) for s in seats]
        centers = cluster_1d(vals, tol)
        centers.sort()

    out: dict[str, int] = {}
    for s in seats:
        v = _cx(s) if axis == "x" else _cy(s)
        best_i, best_d = 0, 1e9
        for i, c in enumerate(centers):
            d = abs(v - c)
            if d < best_d:
                best_d, best_i = d, i
        out[s["id"]] = best_i + 1
    return out


def split_segments(
    ordered: list[SeatDict], block_widths: list[tuple[str, int]], along: str
) -> list[tuple[SeatDict, str, int]]:
    if not ordered:
        return []

    key = _cy if along == "y" else _cx
    coords = [key(s) for s in ordered]
    dys = [coords[i + 1] - coords[i] for i in range(len(coords) - 1)]
    med = statistics.median(dys) if dys else 0.01
    segments: list[list[SeatDict]] = []
    start = 0
    for i, d in enumerate(dys):
        if d > med * 1.75:
            segments.append(ordered[start : i + 1])
            start = i + 1
    segments.append(ordered[start:])

    if len(segments) != len(block_widths):
        segments = []
        idx = 0
        for _name, n in block_widths:
            segments.append(ordered[idx : idx + n])
            idx += n

    result: list[tuple[SeatDict, str, int]] = []
    for seg, (name, _n) in zip(segments, block_widths):
        for i, s in enumerate(seg):
            result.append((s, name, i))
    return result


def label_stand_rows(
    seats: list[SeatDict],
    block_widths: list[tuple[str, int]],
    row_axis: str,
    row_tol: float,
    along_axis: str,
    cat: str,
    num_fn: Callable[[int, int], int] | None = None,
) -> None:
    if not seats:
        return
    rows = assign_row_clusters(seats, row_axis, row_tol)
    by_row: dict[int, list[SeatDict]] = {}
    for s in seats:
        by_row.setdefault(rows[s["id"]], []).append(s)

    sort_key = _cy if along_axis == "y" else _cx
    for row_num in sorted(by_row):
        row_seats = sorted(by_row[row_num], key=sort_key)
        triples = split_segments(row_seats, block_widths, along_axis)
        by_block: dict[str, list[tuple[SeatDict, int]]] = {}
        for s, block, i in triples:
            by_block.setdefault(block, []).append((s, i))
        for block, items in by_block.items():
            n = len(items)
            for s, i in items:
                num = num_fn(i, n) if num_fn else i + 1
                s["section"] = block
                s["label"] = f"{block}{row_num}列{num}番"
                s["category"] = cat


def label_courtside(seats: list[SeatDict]) -> None:
    for s in seats:
        s["_cs"] = "B" if _cx(s) < 0.36 else "A"

    group_a = sorted([s for s in seats if s["_cs"] == "A"], key=_cy)
    group_b = sorted([s for s in seats if s["_cs"] == "B"], key=_cy)

    cat_a, cat_b = "コートサイドA", "コートサイドB"
    if group_a:
        mid = statistics.median([_cy(s) for s in group_a])
        for band in (
            [s for s in group_a if _cy(s) < mid],
            [s for s in group_a if _cy(s) >= mid],
        ):
            for i, s in enumerate(sorted(band, key=_cy)):
                s["section"] = cat_a
                s["label"] = f"A{i + 1}番"
                s["category"] = cat_a

    sizes = [11, 12, 11]
    idx = 0
    for size in sizes:
        band = group_b[idx : idx + size]
        idx += size
        for i, s in enumerate(band):
            s["section"] = cat_b
            s["label"] = f"B{i + 1}番"
            s["category"] = cat_b
    for s in group_b[idx:]:
        s["section"] = cat_b
        s["label"] = "—"
        s["category"] = cat_b

    for s in seats:
        s.pop("_cs", None)


def label_end(seats: list[SeatDict]) -> None:
    cat = "コートエンド"
    top = sorted([s for s in seats if _cy(s) < 0.5], key=_cx)
    bot = sorted([s for s in seats if _cy(s) >= 0.5], key=_cx)
    for band, start in ((top, 1), (bot, 11)):
        left = [s for s in band if _cx(s) < 0.5]
        right = [s for s in band if _cx(s) >= 0.5]
        k = start
        for s in left:
            s["section"] = cat
            s["label"] = f"{k}番"
            s["category"] = cat
            k += 1
        for s in right:
            s["section"] = cat
            s["label"] = f"{k}番"
            s["category"] = cat
            k += 1


def label_special(seats: list[SeatDict]) -> None:
    cat = "スペシャルシート"
    main = sorted(
        [s for s in seats if s["w"] >= 0.018 and (_cy(s) < 0.25 or _cy(s) > 0.75)],
        key=lambda s: (_cy(s) > 0.5, _cx(s)),
    )
    for i, s in enumerate(main[:6]):
        s["section"] = cat
        s["label"] = f"{i + 1}番"
        s["category"] = cat
    for s in seats:
        if "label" not in s or s.get("category") != cat:
            s["section"] = cat
            s["label"] = "—"
            s["category"] = cat


def apply_ota_seat_labels(seats: list[SeatDict]) -> None:
    left = [s for s in seats if s["zone"] == "floor1" and _cx(s) < 0.28]
    top_goal = [
        s for s in seats if s["zone"] == "floor1" and _cx(s) >= 0.28 and _cy(s) < 0.32
    ]
    bot_goal = [s for s in seats if s["zone"] == "floor1" and _cy(s) > 0.68]

    label_stand_rows(
        left,
        [("I", 3), ("H", 17), ("G", 17), ("F", 17), ("E", 3)],
        row_axis="x",
        row_tol=0.004,
        along_axis="y",
        cat="1階指定席",
    )
    label_stand_rows(
        top_goal,
        [("K", 12), ("M", 12)],
        row_axis="y",
        row_tol=0.004,
        along_axis="x",
        cat="1階指定席（ゴール裏）",
        num_fn=lambda i, n: n - i,
    )
    label_stand_rows(
        bot_goal,
        [("C", 12)],
        row_axis="y",
        row_tol=0.004,
        along_axis="x",
        cat="1階指定席（ゴール裏）",
    )

    label_courtside([s for s in seats if s["zone"] == "courtside"])
    label_end([s for s in seats if s["zone"] == "end"])
    label_special([s for s in seats if s["zone"] == "special"])

    for s in seats:
        if s["zone"] == "team_ticket":
            s["section"] = None
            s["label"] = "—"
