#!/usr/bin/env python3
"""M4b-Belegbogen: Spielfiguren mit warmer Haut und Kaels neuer Silhouette."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import SHOTS  # noqa: E402
import gen_chars  # noqa: E402


def main() -> None:
    data = gen_chars.build()
    cols = 13
    cell_w, cell_h = 184, 210
    sw, sh = cols * cell_w + 128, 2 * cell_h + 118
    sheet = Sheet(sw, sh)
    sheet.text(20, 16, "LANTERNFALL  M4b  -  SPIELFIGUREN (32PX)", TITLE, 3)
    sheet.text(20, 52, "LAUF 4 FRAMES  /  IDLE 2  /  TREFFER  /  PORTRAIT 48  -  HAUT-RAMPE 16/27/21", LABEL, 2)
    y = 92
    for name, pretty in (("mira", "MIRA ASHWICK"), ("kael", "BRUDER KAEL")):
        sheet.text(20, y - 20, pretty, LABEL_HI, 2)
        x = 20
        for d, dl in (("down", "UNTEN"), ("side", "SEITE"), ("up", "OBEN")):
            for f in range(4):
                sheet.cell(x, y, 176, 168, (f % 2 == 1))
                sheet.blit(data[f"player_{name}_{d}"][f], x + 24, y + 16, 4)
                sheet.text(x + 4, y + 152, f"{dl} {f}", LABEL, 1)
                x += cell_w
        sheet.cell(x, y, 260, 168, True)
        sheet.blit(data[f"player_{name}_down_idle"][0], x + 4, y + 18, 2)
        sheet.blit(data[f"player_{name}_hit"][0], x + 72, y + 18, 2)
        sheet.blit(data[f"portrait_{name}"][0], x + 142, y + 14, 2)
        sheet.text(x + 4, y + 152, "IDLE / HIT / PORTRAIT 48", LABEL, 1)
        y += cell_h
    sheet.text(20, sh - 30, "KONTUR 1PX INK 0  -  HAUT 16 SCHATTEN / 27 BASIS / 21 LICHTKANTE  -  LICHT OBEN-LINKS", LABEL, 2)
    path = os.path.join(SHOTS, "m4b-sheet-chars.png")
    sheet.save(path)
    print(path)

    # Einzelbeleg Kael 6x auf dunklem Grund (Lauf unten 0-3 + Porträt).
    g = Sheet(4 * 32 * 6 + 48 * 6 + 90, 48 * 6 + 110)
    g.text(20, 14, "BRUDER KAEL  -  6X AUF NIGHTDEEP (INDEX 1)", TITLE, 2)
    for f in range(4):
        g.cell(20 + f * 32 * 6 + 6, 50, 32 * 6 + 4, 32 * 6 + 4, f % 2 == 1)
        g.blit(data["player_kael_down"][f], 20 + f * 32 * 6 + 10, 54, 6)
        g.text(20 + f * 32 * 6 + 12, 54 + 32 * 6 + 10, f"LAUF {f}", LABEL, 1)
    g.cell(20 + 4 * 32 * 6 + 6, 50, 48 * 6 + 6, 48 * 6 + 4, True)
    g.blit(data["portrait_kael"][0], 20 + 4 * 32 * 6 + 12, 56, 6)
    g.text(20 + 4 * 32 * 6 + 12, 54 + 48 * 6 + 10, "PORTRAIT 48", LABEL, 1)
    p2 = os.path.join(SHOTS, "m4b-kael-dark-6x.png")
    g.save(p2)
    print(p2)


if __name__ == "__main__":
    main()
