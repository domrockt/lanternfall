#!/usr/bin/env python3
"""M4b-Terrainbeleg: 6 echte Kartenausschnitte statt eines Rohstreifens.

Quelle sind die drei frischen In-Game-Shots ohne Spielerlicht (Ufer/Weg/See).
Aus jedem werden zwei Ausschnitte geschnitten (Rand + Detail),
so sind Kanten, Wellen und Requisiten an mehreren Stellen pruefbar.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import ROOT, SHOTS, read_rgba_png  # noqa: E402

# (Label, Datei, Crop x/y/w/h im 960x540-Screenshot, Beschreibung)
ITEMS = [
    ("UFER WEST", "shots/tmp/m4b/nolight/shore.png", (390, 150, 240, 150),
     "Torfkante 14, Moos 28/29, Schaum 8/7 mit Luecken, Schilf-Clustern"),
    ("UFER OST", "shots/tmp/m4b/nolight/shore.png", (580, 260, 240, 150),
     "Seerosen + Ripples, Uferbank ohne geschlossenen Braunring"),
    ("WEG GERADE", "shots/tmp/m4b/nolight/path.png", (350, 100, 240, 150),
     "Kies 2x2-Gruppen 14/8/6/5, Licht16, Moos kriecht ueber den Rand"),
    ("WEG KURVE", "shots/tmp/m4b/nolight/path.png", (400, 110, 240, 150),
     "Breite variiert +-2 px, ausgefranste Kanten, kein glattes Band"),
    ("SEE MITTE", "shots/tmp/m4b/nolight/water.png", (360, 190, 240, 150),
     "Tiefen 2/3, Wellengruppen 5/6/7, heller Kamm oben-links"),
    ("SEE ENGE", "shots/tmp/m4b/nolight/water.png", (520, 300, 240, 150),
     "Bucht/Engstelle, Sued/Ost 3 px dunkler, Ripples im Verbund"),
]
SCALE = 3


def main() -> None:
    cw, ch = 240 * SCALE, 150 * SCALE
    cols, rows = 3, 2
    sheet = Sheet(cols * cw + 80, rows * (ch + 46) + 120)
    sheet.text(20, 14, "LANTERNFALL  M4b  -  TERRAIN / AUTOTILING / UFER (3X NEAREST, OHNE SPIELERLICHT)", TITLE, 2)
    sheet.text(20, 52, "BLOB-47-KANTEN  -  NOISE-REGIONEN  -  6 ECHTE KARTENAUSSCHNITTE AUS DEM LAUF", LABEL, 2)
    for i, (name, path, crop, desc) in enumerate(ITEMS):
        w, h, pix = read_rgba_png(os.path.join(ROOT, path))
        cx, cy, sw, sh = crop
        out = []
        for y in range(cy, cy + sh):
            for x in range(cx, cx + sw):
                out.append(pix[y * w + x])
        x = 20 + (i % cols) * cw
        y = 88 + (i // cols) * (ch + 46)
        sheet.cell(x, y, cw + 4, ch + 4, i % 2 == 1)
        sheet.blit_pix(sw, sh, out, x + 2, y + 2, SCALE)
        sheet.text(x + 2, y + ch + 10, name, LABEL_HI, 2)
        sheet.text(x + 2, y + ch + 30, desc, LABEL, 1)
    path = os.path.join(SHOTS, "m4b-sheet-tiles.png")
    sheet.save(path)
    print(path)


if __name__ == "__main__":
    main()
