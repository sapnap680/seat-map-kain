"""Convert parent-folder venue PDFs to public/backgrounds/*.png"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import fitz
except ImportError:
    print("PyMuPDF が必要です: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT.parent
OUT_DIR = ROOT / "public" / "backgrounds"
META_DIR = ROOT / "public" / "backgrounds"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATE_MAP = {
    "12.11": "2025-12-11",
    "12.12": "2025-12-12",
    "12.13": "2025-12-13",
}

from incare_palette import FLOOR1_PINK, TEAM_GREEN  # noqa: E402
from extract_seats_from_pdf import is_ota_team_zone, ota_stroke_team_rects  # noqa: E402

DEBUG_LOG = ROOT.parent / "debug-0c7e1f.log"
DEBUG_SESSION = "0c7e1f"


def _agent_log(hypothesis_id: str, message: str, data: dict) -> None:
    # #region agent log
    payload = {
        "sessionId": DEBUG_SESSION,
        "hypothesisId": hypothesis_id,
        "location": "convert_pdfs.py",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
    with DEBUG_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    # #endregion

# 説明ラベルだけ消す（ベンチ表記は残す）
REDACT_TEXT_PARTS = ("ベンチ外", "メンバー", "チーム券")


def is_ota_floor1_blue(r: int, g: int, b: int) -> bool:
    """大田 1階席の水色系（複数トーン）"""
    if b < 200 or g < 165:
        return False
    if r > 200:
        return False
    return b >= g >= r


def is_pdf_floor1_pink(r: int, g: int, b: int) -> bool:
    if abs(r - FLOOR1_PINK[0]) <= 10 and abs(g - FLOOR1_PINK[1]) <= 10 and abs(b - FLOOR1_PINK[2]) <= 10:
        return True
    return r >= 200 and 130 <= g <= 200 and b >= 160


def is_seat_gray(r: int, g: int, b: int) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return spread < 25 and 140 <= avg <= 220


def _sample_fill(im, px0: int, py0: int) -> tuple[int, int, int]:
    w, h = im.size
    sx = min(w - 1, max(0, px0))
    sy = min(h - 1, max(0, py0 - 3))
    return im.getpixel((sx, sy))


def redact_map_labels(page: fitz.Page, path: Path, scale: float = 2.0) -> None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            line_text = "".join(s.get("text", "") for s in line.get("spans", []))
            if not any(part in line_text for part in REDACT_TEXT_PARTS):
                continue
            x0, y0, x1, y1 = line["bbox"]
            px0 = max(0, int(x0 * scale) - 6)
            py0 = max(0, int(y0 * scale) - 4)
            px1 = min(im.size[0], int(x1 * scale) + 6)
            py1 = min(im.size[1], int(y1 * scale) + 4)
            fill = _sample_fill(im, px0, py0)
            draw.rectangle([px0, py0, px1, py1], fill=fill)
    im.save(path)


def fill_ota_stroke_team_boxes(
    page: fitz.Page, path: Path, pw: float, ph: float, scale: float = 2.0
) -> None:
    """枠だけブロックを灰色で塗り、中抜けと赤枠を消す"""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    rects = ota_stroke_team_rects(page, pw, ph)
    if not rects:
        return
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    fill = TEAM_GREEN
    for r in rects:
        x0 = max(0, int(r.x0 * scale))
        y0 = max(0, int(r.y0 * scale))
        x1 = min(im.size[0], int(r.x1 * scale))
        y1 = min(im.size[1], int(r.y1 * scale))
        draw.rectangle([x0, y0, x1, y1], fill=fill)
    im.save(path)
    print(f"  filled {len(rects)} Ota stroke team boxes on {path.name}")


def paint_nonsellable_seats(path: Path, slug: str) -> None:
    """チーム券席を料金表の緑 #92D050 で塗る（2階灰色は PNG そのまま）"""
    seat_path = ROOT / "public" / "seats" / f"{slug}.json"
    if not seat_path.exists():
        print(f"  skip seat paint (no {seat_path.name})", file=sys.stderr)
        return
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    data = json.loads(seat_path.read_text(encoding="utf-8"))
    im = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(im)
    w, h = im.size
    painted = 0
    team_outline = (
        max(0, TEAM_GREEN[0] - 25),
        max(0, TEAM_GREEN[1] - 25),
        max(0, TEAM_GREEN[2] - 25),
    )
    for s in data.get("seats", []):
        if s.get("zone") != "team_ticket":
            continue
        x0 = int(s["x"] * w)
        y0 = int(s["y"] * h)
        x1 = int((s["x"] + s["w"]) * w)
        y1 = int((s["y"] + s["h"]) * h)
        if x1 <= x0 or y1 <= y0:
            continue
        draw.rectangle([x0, y0, x1, y1], fill=TEAM_GREEN, outline=team_outline)
        painted += 1
    im.save(path)
    print(f"  painted {painted} nonsellable seats on {path.name}")


def recolor_floor1_to_pptx_pink(path: Path, slug: str) -> None:
    """1階席だけピンクに。灰色席は触らない。"""
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        ny = y / h
        for x in range(w):
            nx = x / w
            r, g, b = px[x, y]
            if is_seat_gray(r, g, b):
                continue
            if slug in ("2025-12-12", "2025-12-13"):
                if is_ota_team_zone(nx, ny):
                    continue
                if not is_ota_floor1_blue(r, g, b):
                    continue
            elif not is_pdf_floor1_pink(r, g, b):
                continue
            px[x, y] = FLOOR1_PINK
            changed += 1
    if changed:
        im.save(path)
        print(f"  recolored {changed} px to #E38AB2 on {path.name}")


def scrub_ota_team_zone_pink_blue(path: Path, slug: str) -> None:
    """チーム券列に残った水色・ピンク（1階色）を緑に統一。灰色は触らない。"""
    if slug not in ("2025-12-12", "2025-12-13"):
        return
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        ny = y / h
        for x in range(w):
            nx = x / w
            if not is_ota_team_zone(nx, ny):
                continue
            r, g, b = px[x, y]
            if is_seat_gray(r, g, b):
                continue
            if is_ota_floor1_blue(r, g, b) or is_pdf_floor1_pink(r, g, b):
                px[x, y] = TEAM_GREEN
                changed += 1
    if changed:
        im.save(path)
        print(f"  scrubbed {changed} pink/blue px in team zone on {path.name}")


def _team_band_color_sample(path: Path, slug: str) -> dict[str, int]:
    try:
        from PIL import Image
    except ImportError:
        return {}
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    counts = {"pink": 0, "blue": 0, "green": 0, "gray": 0}
    if slug not in ("2025-12-12", "2025-12-13"):
        return counts
    for y in range(int(0.28 * h), int(0.78 * h), 4):
        for x in range(int(0.62 * w), w, 4):
            r, g, b = px[x, y]
            if is_seat_gray(r, g, b):
                counts["gray"] += 1
            elif is_ota_floor1_blue(r, g, b) or is_pdf_floor1_pink(r, g, b):
                if abs(r - TEAM_GREEN[0]) <= 12 and abs(g - TEAM_GREEN[1]) <= 12:
                    counts["green"] += 1
                elif is_ota_floor1_blue(r, g, b):
                    counts["blue"] += 1
                else:
                    counts["pink"] += 1
            elif abs(r - TEAM_GREEN[0]) <= 15 and abs(g - TEAM_GREEN[1]) <= 15:
                counts["green"] += 1
    return counts


def _pixmap_vs_file_diff(pdf: Path, png: Path, mat: fitz.Matrix) -> int:
    """PNG が PDF ラスタライズのみか（色加工なし）を検証。0 なら完全一致。"""
    try:
        from PIL import Image
    except ImportError:
        return -1
    doc = fitz.open(pdf)
    pix = doc[0].get_pixmap(
        matrix=mat, alpha=False, annots=False, colorspace=fitz.csRGB
    )
    doc.close()
    fresh = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    saved = Image.open(png).convert("RGB")
    if fresh.size != saved.size:
        return -2
    if fresh.tobytes() == saved.tobytes():
        return 0
    fp, sp = fresh.tobytes(), saved.tobytes()
    return sum(1 for a, b in zip(fp, sp, strict=True) if a != b) // 3


def slug_from_name(name: str) -> str | None:
    for key, slug in DATE_MAP.items():
        if key in name:
            return slug
    m = re.search(r"(\d{1,2})\.(\d{1,2})", name)
    if m:
        return f"2025-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


def main() -> None:
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"PDF が見つかりません: {PDF_DIR}")
        return

    for pdf in pdfs:
        slug = slug_from_name(pdf.stem)
        if not slug:
            print(f"スキップ（日付不明）: {pdf.name}")
            continue
        out = OUT_DIR / f"{slug}.png"
        doc = fitz.open(pdf)
        page = doc[0]
        pw, ph = page.rect.width, page.rect.height
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(
            matrix=mat,
            alpha=False,
            annots=False,
            colorspace=fitz.csRGB,
        )
        pix.save(out)
        doc.close()
        legacy = os.environ.get("SEAT_MAP_LEGACY_CONVERT", "").lower() in (
            "1",
            "true",
            "yes",
        )
        if legacy:
            recolor_floor1_to_pptx_pink(out, slug)
            doc = fitz.open(pdf)
            page = doc[0]
            redact_map_labels(page, out, scale=2.0)
            if slug in ("2025-12-12", "2025-12-13"):
                fill_ota_stroke_team_boxes(page, out, pw, ph, scale=2.0)
            doc.close()
            paint_nonsellable_seats(out, slug)
            scrub_ota_team_zone_pink_blue(out, slug)
        else:
            print(f"  as-is: PDF の色そのまま ({out.name})")
        pixel_diff = _pixmap_vs_file_diff(pdf, out, mat) if not legacy else None
        band = _team_band_color_sample(out, slug)
        _agent_log(
            "H5",
            "convert mode",
            {
                "slug": slug,
                "runId": "convert-post",
                "asIs": not legacy,
                "legacyConvert": legacy,
                "pixelDiffFromPdf": pixel_diff,
            },
        )
        _agent_log(
            "H4",
            "post-convert team band colors",
            {
                "slug": slug,
                "bandCounts": band,
                "runId": "convert-post",
                "asIs": not legacy,
            },
        )
        asset_sha = hashlib.sha256(out.read_bytes()).hexdigest()[:16]
        meta = {
            "slug": slug,
            "page_width": pw,
            "page_height": ph,
            "image_width": pix.width,
            "image_height": pix.height,
            "asset_sha": asset_sha,
        }
        _agent_log(
            "H6",
            "asset published",
            {"slug": slug, "assetSha": asset_sha, "bytes": out.stat().st_size},
        )
        (META_DIR / f"{slug}.meta.json").write_text(
            json.dumps(meta, indent=2), encoding="utf-8"
        )
        print(f"Wrote {out} from {pdf.name}")


if __name__ == "__main__":
    main()
