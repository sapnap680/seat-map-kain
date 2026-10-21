"""大田: 座席定義（data/ota-seat-definition.json）と生成 JSON の照合"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEATS = ROOT / "public" / "seats"

from ota_seat_definition import inventory_counts, load_definition  # noqa: E402

TARGET = inventory_counts()


def count_json(path: Path) -> dict[str, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    seats = data["seats"]
    out: dict[str, int] = {}

    def inc(k: str, n: int = 1) -> None:
        out[k] = out.get(k, 0) + n

    for s in seats:
        sec = (s.get("section") or "").strip()
        cat = s.get("category") or ""
        zone = s["zone"]
        sell = bool(s.get("sellable"))

        if cat == "1階指定席":
            inc("1階指定席（I〜E）")
        elif cat == "1階指定席（ゴール裏）" and sec in ("K", "M", "A"):
            inc("ゴール裏（M・K・A）")
        elif sec == "L" and not sell:
            inc("非販売 L")
        elif sec == "B" and not sell:
            inc("非販売 B")
        elif sec == "C" and not sell:
            inc("非販売 C")
        elif cat == "チーム券席（非販売・灰色）":
            inc("非販売 Q灰色")
        elif cat == "チーム券席" and zone == "team_ticket":
            inc("チーム券席（緑）")
        elif cat == "コートサイドA":
            inc("コートサイドA")
        elif cat == "コートサイドB":
            inc("コートサイドB")
        elif cat == "コートエンド":
            inc("コートエンド")
        elif cat == "スペシャルシート":
            inc("スペシャルシート")

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
    out["2階自由席"] = data.get("floor2_free_capacity") or 0
    out["会場販売席計"] = out.get("販売合計1階", 0) + out["2階自由席"]
    out["総席数（1階マップ）"] = len(seats)
    return out


def main() -> None:
    slug = sys.argv[1] if len(sys.argv) > 1 else "2025-12-13"
    defn = load_definition()
    print(
        f"=== 公式定義（{defn.get('eventDisplayYear')}年12月 / slug={slug}） ==="
    )
    for key, target in TARGET.items():
        if key == "総席数（1階座席表）":
            continue
        print(f"  {key}: {target}")

    path = SEATS / f"{slug}.json"
    if not path.is_file():
        print(f"\nMissing {path} — run: python scripts/generate_ota_seats.py", file=sys.stderr)
        sys.exit(1)
    got = count_json(path)
    print(f"\n=== 生成 JSON ({slug}.json) vs 定義 ===")
    for key, target in TARGET.items():
        if key == "総席数（1階座席表）":
            continue
        g = got.get(key, 0)
        mark = "OK" if g == target else f"Δ{g - target:+d}"
        print(f"  {key}: {g} / {target}  {mark}")
    print(f"  1階マップ上の席矩形: {got.get('総席数（1階マップ）', 0)}（定義 1533）")


if __name__ == "__main__":
    main()
