"""大田 12/12–13: 公式席数表との照合（1階1533＋2階1952）"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEATS = ROOT / "public" / "seats"

# ユーザー提供の公式（1階座席表）
TARGET = {
    "1階指定席（I〜E）": 399,
    "ゴール裏（M・K・A）": 252,
    "コートサイドA": 24,
    "コートサイドB": 34,
    "コートエンド": 20,
    "スペシャルシート": 6,
    "前売り小計": 735,
    "チーム券席（緑）": 420,
    "販売合計1階": 1155,
    "非販売 L": 119,
    "非販売 B": 119,
    "非販売 C": 84,
    "非販売 LBC計": 322,
    "非販売 Q灰色": 56,
    "1階座席表計": 1533,
    "2階自由席": 1952,
    "会場販売席計": 3107,
}


def count_slug(path: Path) -> dict[str, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    seats = data["seats"]
    out: dict[str, int] = {}

    def inc(key: str, n: int = 1) -> None:
        out[key] = out.get(key, 0) + n

    for s in seats:
        cat = s.get("category") or ""
        sec = (s.get("section") or "").strip()
        zone = s["zone"]
        sell = bool(s.get("sellable"))

        if cat == "1階指定席" and sec in ("I", "H", "G", "F", "E", None):
            if sec in ("I", "H", "G", "F", "E"):
                inc("1階指定席（I〜E）")
            continue
        if cat == "1階指定席（ゴール裏）" and sec in ("K", "M", "A") and sell:
            inc("ゴール裏（M・K・A）")
        elif sec in ("K", "M", "A") and sell and zone == "floor1":
            inc("ゴール裏（M・K・A）")
        if sec == "L" and (not sell or "非販売" in cat or "灰色" in cat):
            inc("非販売 L")
        if sec == "B" and (not sell or "非販売" in cat or "灰色" in cat):
            inc("非販売 B")
        if sec == "C" and (not sell or "非販売" in cat or "灰色" in cat):
            inc("非販売 C")
        if cat == "チーム券席（非販売・灰色）":
            inc("非販売 Q灰色")
        if zone == "team_ticket" and sell:
            inc("チーム券席（緑）")
        if cat == "コートサイドA":
            inc("コートサイドA")
        if cat == "コートサイドB":
            inc("コートサイドB")
        if cat == "コートエンド":
            inc("コートエンド")
        if cat == "スペシャルシート" and s.get("label", "") != "—":
            inc("スペシャルシート")
        if cat == "2階自由席" and sell:
            inc("2階自由席")

    out["前売り小計"] = (
        out.get("1階指定席（I〜E）", 0)
        + out.get("ゴール裏（M・K・A）", 0)
        + out.get("コートサイドA", 0)
        + out.get("コートサイドB", 0)
        + out.get("コートエンド", 0)
        + out.get("スペシャルシート", 0)
    )
    out["非販売 LBC計"] = (
        out.get("非販売 L", 0) + out.get("非販売 B", 0) + out.get("非販売 C", 0)
    )
    out["販売合計1階"] = out.get("前売り小計", 0) + out.get("チーム券席（緑）", 0)
    out["1階座席表計"] = (
        out.get("販売合計1階", 0)
        + out.get("非販売 LBC計", 0)
        + out.get("非販売 Q灰色", 0)
    )
    out["会場販売席計"] = out.get("販売合計1階", 0) + out.get("2階自由席", 0)
    out["総席数"] = len(seats)
    return out


def main() -> None:
    slug = sys.argv[1] if len(sys.argv) > 1 else "2025-12-13"
    path = SEATS / f"{slug}.json"
    if not path.is_file():
        print(f"Missing {path}", file=sys.stderr)
        sys.exit(1)
    got = count_slug(path)
    print(f"=== {slug} vs 公式 ===")
    for key, target in TARGET.items():
        g = got.get(key, 0)
        mark = "OK" if g == target else f"Δ{g - target:+d}"
        print(f"  {key}: {g} / {target}  {mark}")
    print(f"  （PDF矩形 総席数）: {got.get('総席数', 0)}")


if __name__ == "__main__":
    main()
