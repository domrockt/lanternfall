#!/usr/bin/env python3
"""M9-Lane m9-art-heroes-bosses: Kontaktboegen fuer Helden + Bosse.

Erzeugt shots/m9-art-heroes-bosses-<tag>-heroes.png und
shots/m9-art-heroes-bosses-<tag>-bosses.png (2x nearest, beschriftet,
dunkler Moorboden). Liest dieselben Generatoren wie das Spiel.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import SHOTS  # noqa: E402
import gen_chars  # noqa: E402
import gen_bosses  # noqa: E402

SCALE = 2


def heroes(tag: str) -> str:
    data = gen_chars.build()
    dirs = (("down", "UNTEN"), ("side", "SEITE"), ("up", "OBEN"))
    cell_w, cell_h = 150, 120
    extra_w = 270
    cols = 3 * 4 + 1
    sw, sh = 20 + (cols - 1) * cell_w + extra_w + 20, 2 * cell_h + 130
    sheet = Sheet(sw, sh)
    sheet.text(20, 16, "LANTERNFALL  M9  -  HELDEN (32PX, 2X)", TITLE, 3)
    sheet.text(20, 52, "LAUF 4 POSES / IDLE / HIT / PORTRAIT 48  -  KONTUR 1PX INK 0", LABEL, 2)
    y = 88
    for name, pretty in (("mira", "MIRA ASHWICK"), ("kael", "BRUDER KAEL")):
        sheet.text(20, y - 16, pretty, LABEL_HI, 2)
        x = 20
        for d, dl in dirs:
            for f in range(4):
                sheet.cell(x, y, cell_w - 8, cell_h - 10, (f % 2 == 1))
                sheet.blit(data[f"player_{name}_{d}"][f], x + 28, y + 14, SCALE)
                sheet.text(x + 4, y + cell_h - 30, f"{dl} {f}", LABEL, 1)
                x += cell_w
        sheet.cell(x, y, extra_w, cell_h - 10, True)
        sheet.blit(data[f"player_{name}_down_idle"][0], x + 8, y + 14, SCALE)
        sheet.blit(data[f"player_{name}_down"][0], x + 76, y + 14, SCALE)
        sheet.blit(data[f"portrait_{name}"][0], x + 146, y + 20, SCALE)
        sheet.text(x + 4, y + cell_h - 30, "IDLE / HIT / PORTRAIT 48", LABEL, 1)
        y += cell_h
    sheet.text(20, sh - 30, "KONTUR 1PX INK 0  -  HAUT-RAMPE 16/27/21  -  LICHT OBEN-LINKS", LABEL, 2)
    path = os.path.join(SHOTS, f"m9-art-heroes-bosses-{tag}-heroes.png")
    sheet.save(path)
    return path


def bosses(tag: str) -> str:
    data = gen_bosses.build()
    keys = [f"boss_{bid}" for bid in gen_bosses.DRAW]
    cell_w, cell_h = 260, 290
    sw, sh = len(keys) * cell_w + 40, 3 * cell_h + 130
    sheet = Sheet(sw, sh)
    sheet.text(20, 16, "LANTERNFALL  M9  -  BOSSE (48-96 PX, 2X)", TITLE, 3)
    sheet.text(20, 52, "F0 RUHE / F1 ATEM / F2 WIND-UP  -  JEDE EIGENE SILHOUETTE", LABEL, 2)
    y = 90
    for f in range(3):
        x = 20
        for key in keys:
            sheet.cell(x, y, cell_w - 10, cell_h - 14, f % 2 == 1)
            grid = data[key][f]
            sheet.blit(grid, x + (cell_w - 10 - grid.w * SCALE) // 2, y + 8, SCALE)
            sheet.text(x + 6, y + cell_h - 34, f"{key.replace('boss_', '').upper()}  F{f}", LABEL, 1)
            x += cell_w
        y += cell_h
    sheet.text(20, sh - 30, "KONTUR 1PX  -  RAMPEN AUS PALETTE  -  LICHT OBEN-LINKS", LABEL, 2)
    path = os.path.join(SHOTS, f"m9-art-heroes-bosses-{tag}-bosses.png")
    sheet.save(path)
    return path


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "before"
    print(heroes(tag))
    print(bosses(tag))


if __name__ == "__main__":
    main()
