"""otaBlockMap.ts / ota-seat-view.html と同じブロック当たり判定（viewBox 1080×1072）"""
from __future__ import annotations

MAP_W = 1080.0
MAP_H = 1072.0

# (x, y, w, h) in viewBox px
BLOCKS: dict[str, list[tuple[float, float, float, float]]] = {
    "I": [(193, 200, 69, 28)],
    "H": [(193, 246, 69, 169)],
    "G": [(193, 433, 69, 168)],
    "F": [(193, 619, 69, 169)],
    "E": [(193, 806, 69, 29)],
    "K": [(324, 62, 119, 69)],
    "L": [(461, 62, 169, 69)],
    "M": [(648, 62, 118, 69)],
    "C": [(324, 904, 119, 68)],
    "B": [(461, 904, 169, 68)],
    "A": [(648, 904, 118, 68)],
}

PAD: dict[str, tuple[float, float, float, float]] = {
    "I": (10, 10, 14, 14),
    "H": (10, 10, 14, 14),
    "G": (10, 10, 14, 14),
    "F": (10, 10, 14, 14),
    "E": (10, 10, 14, 14),
    "K": (10, 10, 14, 14),
    "M": (10, 10, 14, 14),
    "A": (10, 10, 14, 14),
    "L": (10, 10, 14, 14),
    "B": (10, 10, 14, 14),
    "C": (10, 10, 14, 14),
}


def block_at_norm(nx: float, ny: float) -> str | None:
    px, py = nx * MAP_W, ny * MAP_H
    for key, rects in BLOCKS.items():
        pt, pb, pl, pr = PAD.get(key, (0, 0, 0, 0))
        for x, y, w, h in rects:
            if (
                px >= x - pl
                and px <= x + w + pr
                and py >= y - pt
                and py <= y + h + pb
            ):
                return key
    return None


def assign_stand_blocks(seats: list[dict]) -> None:
    """I–E / K–L–M / C–B–A を会場図矩形で付与"""
    for s in seats:
        cx = s["x"] + s["w"] / 2
        cy = s["y"] + s["h"] / 2
        block = block_at_norm(cx, cy)
        if not block:
            continue
        if block in ("I", "H", "G", "F", "E"):
            s["section"] = block
            s["category"] = "1階指定席"
        elif block in ("K", "L", "M", "C", "B", "A"):
            s["section"] = block
            s["category"] = "1階指定席（ゴール裏）"
