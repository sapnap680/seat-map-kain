"""親フォルダの PDF を public/pdfs/{slug}.pdf にコピー"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT.parent
OUT_DIR = ROOT / "public" / "pdfs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATE_MAP = {"12.11": "2025-12-11", "12.12": "2025-12-12", "12.13": "2025-12-13"}


def slug_from_name(name: str) -> str | None:
    for key, slug in DATE_MAP.items():
        if key in name:
            return slug
    m = re.search(r"(\d{1,2})\.(\d{1,2})", name)
    if m:
        return f"2025-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


def main() -> None:
    for pdf in sorted(PDF_DIR.glob("*.pdf")):
        slug = slug_from_name(pdf.stem)
        if not slug:
            print(f"skip {pdf.name}")
            continue
        dest = OUT_DIR / f"{slug}.pdf"
        shutil.copy2(pdf, dest)
        print(f"Copied -> {dest.name}")


if __name__ == "__main__":
    main()
