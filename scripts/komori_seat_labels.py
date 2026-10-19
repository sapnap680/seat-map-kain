"""駒沢 12/11: 列・番号表記"""
from __future__ import annotations

from ota_seat_labels import SeatDict, _cx, assign_row_clusters


def _label_rows(
    seats: list[SeatDict],
    category: str,
    row_axis: str = "y",
    row_tol: float = 0.004,
) -> None:
    if not seats:
        return
    rows = assign_row_clusters(seats, row_axis, row_tol)
    by_row: dict[int, list[SeatDict]] = {}
    for s in seats:
        by_row.setdefault(rows[s["id"]], []).append(s)
    for row_num in sorted(by_row):
        for i, s in enumerate(sorted(by_row[row_num], key=_cx)):
            s["section"] = None
            s["label"] = f"{row_num}列 {i + 1}番"
            s["category"] = category


def apply_komori_seat_labels(seats: list[SeatDict]) -> None:
    _label_rows(
        [s for s in seats if s["zone"] == "floor1"],
        "1階指定席",
    )
    _label_rows(
        [s for s in seats if s["zone"] == "floor2"],
        "2階自由席",
        row_tol=0.003,
    )
