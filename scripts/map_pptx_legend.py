import re
import zipfile
from pathlib import Path

PPTX = Path(r"c:\Users\cinco\OneDrive\画像\デスクトップ\78thインカレ料金表_座席図について.pptx")
PATTERN = re.compile(r'srgbClr val="([0-9A-Fa-f]{6})"')
z = zipfile.ZipFile(PPTX)
for name in z.namelist():
    if not name.endswith(".xml"):
        continue
    t = z.read(name).decode("utf-8")
    if "1階指定席" not in t and "2階自由席" not in t:
        continue
    print("===", name, "===")
    for label in ["1階指定席", "2階自由席", "チーム券席", "スペシャル", "コート"]:
        i = t.find(label)
        if i < 0:
            continue
        chunk = t[max(0, i - 2000) : i + 800]
        cols = list(dict.fromkeys(PATTERN.findall(chunk)))
        print(f"  {label}: {cols[-6:]}")
