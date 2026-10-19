"""駒沢 12/11: PDF 上の列・番号表記に合わせる"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from ota_seat_labels import SeatDict, _cx, _cy, assign_row_clusters

if TYPE_CHECKING:
    import fitz


def _pdf_number_words(page: fitz.Page, pw: float, ph: float) -> list[dict]:
    out: list[dict] = []
    for w in page.get_text("words"):
        t = w[4].strip()
        if not re.fullmatch(r"\d+", t):
            continue
        out.append(
            {
                "n": int(t),
                "cx": (w[0] + w[2]) / 2 / pw,
                "cy": (w[1] + w[3]) / 2 / ph,
            }
        )
    return out


def _ban_at(
    cx: float,
    cy: float,
    nums: list[dict],
    *,
    cx_lo: float,
    cx_hi: float,
) -> int | None:
    band = [
        n
        for n in nums
        if abs(n["cy"] - cy) < 0.006 and cx_lo <= n["cx"] <= cx_hi
    ]
    if not band:
        band = [n for n in nums if abs(n["cy"] - cy) < 0.008]
    if not band:
        return None
    return min(band, key=lambda n: abs(n["cx"] - cx))["n"]


def _label_zone_from_pdf(
    seats: list[SeatDict],
    nums: list[dict],
    category: str,
    *,
    cx_lo: float = 0.05,
    cx_hi: float = 0.95,
    row_tol: float = 0.004,
) -> None:
    if not seats:
        return
    rows = assign_row_clusters(seats, "y", row_tol)
    for s in seats:
        cx, cy = _cx(s), _cy(s)
        row = rows[s["id"]]
        ban = _ban_at(cx, cy, nums, cx_lo=cx_lo, cx_hi=cx_hi)
        if ban is None:
            s["label"] = f"{row}列?"
            s["category"] = category
            continue
        s["section"] = None
        s["label"] = f"{row}列{ban}番"
        s["category"] = category


def apply_komori_seat_labels(
    seats: list[SeatDict],
    page: fitz.Page,
    pw: float,
    ph: float,
) -> None:
    nums = _pdf_number_words(page, pw, ph)
    _label_zone_from_pdf(
        [s for s in seats if s["zone"] == "floor1"],
        nums,
        "1階指定席",
        cx_lo=0.29,
        cx_hi=0.71,
    )
    _label_zone_from_pdf(
        [s for s in seats if s["zone"] == "floor2"],
        nums,
        "2階自由席",
        row_tol=0.003,
    )
