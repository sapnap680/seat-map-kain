"""大田 12/12–13 座席定義（拡大PDFに依存しない）"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEF_PATH = ROOT / "data" / "ota-seat-definition.json"


def load_definition(path: Path | None = None) -> dict[str, Any]:
    p = path or DEF_PATH
    return json.loads(p.read_text(encoding="utf-8"))


def block_spec(defn: dict, block: str) -> dict[str, Any]:
    return defn["blocks"][block]


def q_nonsell_nums(defn: dict) -> frozenset[int]:
    spec = defn["blocks"]["Q"]
    return frozenset(spec.get("nonsellNums") or [])


def q_skip_seat_nums(defn: dict) -> frozenset[int]:
    """Q列：通路（5–13番）— 席レコード自体を作らない"""
    w = defn["blocks"]["Q"]["width"]
    return frozenset(range(5, 14))


def seat_num_for_block(block: str, spec: dict, index: int, width: int) -> int:
    if spec.get("numbering") == "desc":
        return width - index
    return index + 1


def is_q_nonsell(defn: dict, num: int) -> bool:
    return num in q_nonsell_nums(defn)


def expand_stand_slots(defn: dict, stand_key: str) -> list[dict]:
    """1席=1レコードの論理席（位置なし）"""
    stand = defn["stands"][stand_key]
    rows = defn["rows"]
    out: list[dict] = []
    for block in stand["blocks"]:
        spec = block_spec(defn, block)
        width = spec["width"]
        for row in range(1, rows + 1):
            for i in range(width):
                num = seat_num_for_block(block, spec, i, width)
                if block == "Q" and num in q_skip_seat_nums(defn):
                    continue
                zone = spec["zone"]
                sellable = spec.get("sellable", True)
                cat = spec["category"]
                if block == "Q" and is_q_nonsell(defn, num):
                    zone = "floor2"
                    sellable = False
                    cat = "チーム券席（非販売・灰色）"
                elif block in ("O", "P", "R", "S"):
                    sellable = False
                out.append(
                    {
                        "section": block,
                        "row": row,
                        "num": num,
                        "label": f"{block}{row}列{num}番",
                        "category": cat,
                        "zone": zone,
                        "sellable": sellable,
                        "stand": stand_key,
                        "slotIndex": i,
                    }
                )
    return out


def expand_premium(defn: dict) -> list[dict]:
    out: list[dict] = []
    for name, spec in defn["premium"].items():
        for n in range(1, spec["count"] + 1):
            out.append(
                {
                    "section": name,
                    "row": 0,
                    "num": n,
                    "label": f"{name}{n}番" if name != "スペシャルシート" else f"{n}番",
                    "category": name,
                    "zone": spec["zone"],
                    "sellable": spec.get("sellable", True),
                    "stand": "premium",
                    "slotIndex": n - 1,
                }
            )
    return out


def expand_all_logical(defn: dict | None = None) -> list[dict]:
    d = defn or load_definition()
    seats: list[dict] = []
    for key in ("left", "topGoal", "botGoal", "team"):
        seats.extend(expand_stand_slots(d, key))
    seats.extend(expand_premium(d))
    return seats


def inventory_counts(defn: dict | None = None) -> dict[str, int]:
    d = defn or load_definition()
    logical = expand_all_logical(d)
    counts: dict[str, int] = {}

    def inc(k: str, n: int = 1) -> None:
        counts[k] = counts.get(k, 0) + n

    for s in logical:
        sec = s["section"]
        cat = s["category"]
        if cat == "1階指定席":
            inc("1階指定席（I〜E）")
        elif cat == "1階指定席（ゴール裏）" and sec in ("K", "M", "A"):
            inc("ゴール裏（M・K・A）")
        elif sec == "L":
            inc("非販売 L")
        elif sec == "B":
            inc("非販売 B")
        elif sec == "C":
            inc("非販売 C")
        elif cat == "チーム券席（非販売・灰色）":
            inc("非販売 Q灰色")
        elif cat == "チーム券席" and s["zone"] == "team_ticket":
            inc("チーム券席（緑）")
        elif cat == "コートサイドA":
            inc("コートサイドA")
        elif cat == "コートサイドB":
            inc("コートサイドB")
        elif cat == "コートエンド":
            inc("コートエンド")
        elif cat == "スペシャルシート":
            inc("スペシャルシート")

    counts["前売り小計"] = (
        counts.get("1階指定席（I〜E）", 0)
        + counts.get("ゴール裏（M・K・A）", 0)
        + counts.get("コートサイドA", 0)
        + counts.get("コートサイドB", 0)
        + counts.get("コートエンド", 0)
        + counts.get("スペシャルシート", 0)
    )
    counts["非販売 LBC計"] = (
        counts.get("非販売 L", 0)
        + counts.get("非販売 B", 0)
        + counts.get("非販売 C", 0)
    )
    counts["販売合計1階"] = counts.get("前売り小計", 0) + counts.get("チーム券席（緑）", 0)
    counts["1階座席表計"] = (
        counts.get("販売合計1階", 0)
        + counts.get("非販売 LBC計", 0)
        + counts.get("非販売 Q灰色", 0)
    )
    counts["2階自由席"] = d["free2F"]
    counts["会場販売席計"] = counts.get("販売合計1階", 0) + d["free2F"]
    counts["総席数（1階座席表）"] = len(logical)
    return counts
