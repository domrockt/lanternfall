#!/usr/bin/env python3
"""M4b-Bossbeleg: 6 Bosse x F0 Ruhe / F1 Atmen / F2 Wind-up, 4x, dunkler Grund."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import SHOTS  # noqa: E402
import gen_bosses  # noqa: E402

ORDER = ["moor_queen", "bone_lord", "pale_shepherd", "bell_golem", "coven", "hollow_king"]
FRAMES = ["F0 RUHE", "F1 ATMEN", "F2 WIND-UP"]


def main() -> None:
    data = gen_bosses.build()
    cell_w, cell_h = 96 * 4 + 24, 96 * 4 + 56
    sheet = Sheet(6 * cell_w + 40, 3 * cell_h + 130)
    sheet.text(20, 14, "LANTERNFALL  M4b  -  BOSSE  F0 RUHE / F1 ATMEN / F2 WIND-UP (4X)", TITLE, 2)
    sheet.text(20, 52, "RUMPF +2 PX ATMEN  -  AUGEN/GLUT PULSIEREN (F1 2X2 HELLER)  -  KONTUR 0  -  32 PALETTENFARBEN", LABEL, 1)
    for row, frame in enumerate(FRAMES):
        for col, bid in enumerate(ORDER):
            g = data[f"boss_{bid}"][row]
            x = 20 + col * cell_w
            y = 86 + row * cell_h
            sheet.cell(x, y, cell_w - 4, cell_h - 8, (row + col) % 2 == 1)
            # Sprites sind unten links im Grid verankert; zentriert bei 4x.
            ox = x + (cell_w - 4 - g.w * 4) // 2
            sheet.blit(g, ox, y + 4, 4)
            sheet.text(x + 2, y + cell_h - 26, f"{bid.upper()}  {frame}  ({g.w} PX)", LABEL, 1)
    sheet.text(20, sheet.h - 26, "VOLLE SPRITE-GROESSE 48/56/64/72/80/96 PX  -  4X NEAREST  -  DUNKLER MOORGRUND", LABEL, 1)
    path = os.path.join(SHOTS, "m4b-sheet-bosses.png")
    sheet.save(path)
    print(path)

    # Einzelbelege Fahler Hirte/Hohler Koenig F0/F1 6x.
    for bid in ("pale_shepherd", "hollow_king"):
        gs = data[f"boss_{bid}"]
        s = Sheet(2 * 96 * 6 + 60, 96 * 6 + 100)
        s.text(16, 12, f"{bid.replace('_', ' ').upper()}  -  F0/F1 6X AUF NIGHTDEEP", TITLE, 2)
        for i in range(2):
            s.cell(20 + i * 96 * 6 + 4, 46, 96 * 6 + 4, 96 * 6 + 4, i == 1)
            s.blit(gs[i], 22 + i * 96 * 6 + (96 - gs[i].w) * 3, 48, 6)
            s.text(22 + i * 96 * 6, 52 + 96 * 6, f"F{i}", LABEL, 1)
        p = os.path.join(SHOTS, f"m4b-{bid.replace('_', '-')}-f0f1-6x.png")
        s.save(p)
        print(p)


if __name__ == "__main__":
    main()
