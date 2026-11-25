#!/usr/bin/env python3
"""M4b-Hautbeleg: warme Rampe 16/27/21 an Mira, Kael, Kultist, Witchling und Coven."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import PAL, SHOTS  # noqa: E402
import gen_bosses  # noqa: E402
import gen_chars  # noqa: E402
import gen_enemies  # noqa: E402


def main() -> None:
    chars = gen_chars.build()
    enemies = gen_enemies.build()
    bosses = gen_bosses.build()
    items = [
        ("MIRA PORTRAIT 48", chars["portrait_mira"][0], 5),
        ("KAEL PORTRAIT 48", chars["portrait_kael"][0], 5),
        ("KULTIST 20", enemies["enemy_cultist"][0], 8),
        ("WITCHLING 20", enemies["enemy_witchling"][0], 8),
        ("COVEN 96 (MITTE)", bosses["boss_coven"][0], 3),
    ]
    cell_w, cell_h = 330, 430
    sheet = Sheet(len(items) * cell_w + 40, cell_h + 210)
    sheet.text(20, 14, "LANTERNFALL  M4B  -  WARME HAUT-RAMPE FUER ALLE MENSCHEN", TITLE, 2)
    sheet.text(20, 52, "SCHATTEN 16 EMBERBROWN  /  BASIS 27 FLESHWARM  /  LICHTKANTE 21 LANTERN (1 PX)", LABEL, 1)
    # Rampe als große Swatches.
    for i, (idx, name) in enumerate(((16, "16 SCHATTEN"), (27, "27 BASIS"), (21, "21 LICHT"))):
        sheet.rect(20 + i * 190, 78, 180, 54, PAL[idx])
        sheet.text(28 + i * 190, 140, name, LABEL_HI, 2)
    for i, (label, g, scale) in enumerate(items):
        x = 20 + i * cell_w
        y = 190
        sheet.cell(x, y, cell_w - 10, cell_h - 10, i % 2 == 1)
        sheet.blit(g, x + (cell_w - 10 - g.w * scale) // 2, y + (cell_h - 20 - g.h * scale) // 2, scale)
        sheet.text(x + 4, y + cell_h - 34, label, LABEL_HI, 2)
    sheet.text(20, sheet.h - 26, "KEINE GRAUE HAUT 9/11/12  -  21 NUR ALS 1-PX-LICHTKANTE  -  HANDSCHUHE DUERFEN 8/10/11 BLEIBEN", LABEL, 1)
    path = os.path.join(SHOTS, "m4b-sheet-skin.png")
    sheet.save(path)
    print(path)


if __name__ == "__main__":
    main()
