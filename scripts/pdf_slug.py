"""PDF ファイル名 → event slug（12.12 / 12_12 どちらも可）"""
from __future__ import annotations

import re

DATE_MAP = {"12.11": "2025-12-11", "12.12": "2025-12-12", "12.13": "2025-12-13"}


def slug_from_pdf_stem(stem: str) -> str | None:
    for key, slug in DATE_MAP.items():
        if key in stem or key.replace(".", "_") in stem:
            return slug
    m = re.search(r"12[\-._](\d{2})", stem)
    if m:
        return f"2025-12-{m.group(1)}"
    normalized = stem.replace("_", ".")
    m = re.search(r"(\d{1,2})\.(\d{1,2})", normalized)
    if m:
        return f"2025-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None
