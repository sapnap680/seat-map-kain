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

from pdf_slug import slug_from_pdf_stem  # noqa: E402


def slug_from_name(name: str) -> str | None:
    return slug_from_pdf_stem(name)


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
