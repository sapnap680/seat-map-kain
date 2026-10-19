"""PNG のチーム券列付近の色分布を計測（debug session 0c7e1f）"""
from __future__ import annotations

import json
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT.parent / "debug-0c7e1f.log"
PINK = (227, 138, 178)
GREEN = (146, 208, 80)
SESSION = "0c7e1f"


def _log(hypothesis_id: str, message: str, data: dict) -> None:
    line = json.dumps(
        {
            "sessionId": SESSION,
            "hypothesisId": hypothesis_id,
            "location": "audit_map_colors.py",
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
            "runId": data.get("runId", "audit-post"),
        },
        ensure_ascii=False,
    )
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def is_pink(r: int, g: int, b: int) -> bool:
    return abs(r - PINK[0]) <= 12 and abs(g - PINK[1]) <= 12 and abs(b - PINK[2]) <= 12


def is_green(r: int, g: int, b: int) -> bool:
    return abs(r - GREEN[0]) <= 12 and abs(g - GREEN[1]) <= 12 and abs(b - GREEN[2]) <= 12


def is_blue(r: int, g: int, b: int) -> bool:
    return b >= 200 and g >= 165 and r <= 200 and b >= g >= r


def is_gray(r: int, g: int, b: int) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return spread < 25 and 140 <= avg <= 220


def audit_slug(slug: str) -> None:
    png = ROOT / "public" / "backgrounds" / f"{slug}.png"
    seats_path = ROOT / "public" / "seats" / f"{slug}.json"
    if not png.exists() or not seats_path.exists():
        _log("H0", "missing files", {"slug": slug, "runId": "audit-pre"})
        return
    data = json.loads(seats_path.read_text(encoding="utf-8"))
    team = [s for s in data["seats"] if s.get("zone") == "team_ticket"]
    if not team:
        return
    im = Image.open(png).convert("RGB")
    w, h = im.size
    px = im.load()
    counts = {"pink": 0, "blue": 0, "green": 0, "gray": 0, "other": 0}
    # チーム券矩形内をサンプル（席の中心点）
    seat_hits = {"pink": 0, "blue": 0, "green": 0, "gray": 0, "other": 0}
    for s in team:
        cx = int((s["x"] + s["w"] / 2) * w)
        cy = int((s["y"] + s["h"] / 2) * h)
        r, g, b = px[cx, cy]
        if is_pink(r, g, b):
            seat_hits["pink"] += 1
        elif is_blue(r, g, b):
            seat_hits["blue"] += 1
        elif is_green(r, g, b):
            seat_hits["green"] += 1
        elif is_gray(r, g, b):
            seat_hits["gray"] += 1
        else:
            seat_hits["other"] += 1
    # チーム列の帯域 nx>=0.62, ny 0.28-0.78
    for y in range(int(0.28 * h), int(0.78 * h), 3):
        for x in range(int(0.62 * w), w, 3):
            r, g, b = px[x, y]
            if is_pink(r, g, b):
                counts["pink"] += 1
            elif is_blue(r, g, b):
                counts["blue"] += 1
            elif is_green(r, g, b):
                counts["green"] += 1
            elif is_gray(r, g, b):
                counts["gray"] += 1
            else:
                counts["other"] += 1
    mis_f1 = sum(
        1
        for s in data["seats"]
        if s.get("zone") == "floor1"
        and s["x"] + s["w"] / 2 >= 0.62
        and 0.275 <= s["y"] + s["h"] / 2 <= 0.785
    )
    _log(
        "H1",
        "team band color counts",
        {"slug": slug, "bandCounts": counts, "teamSeats": len(team), "runId": "audit-pre"},
    )
    _log(
        "H2",
        "team seat center colors",
        {"slug": slug, "seatCenterHits": seat_hits, "runId": "audit-pre"},
    )
    _log(
        "H3",
        "floor1 in ota team zone",
        {"slug": slug, "misclassifiedFloor1": mis_f1, "runId": "audit-pre"},
    )


if __name__ == "__main__":
    for s in ("2025-12-12", "2025-12-13", "2025-12-11"):
        audit_slug(s)
