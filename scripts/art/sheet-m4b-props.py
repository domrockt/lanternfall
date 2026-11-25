#!/usr/bin/env python3
"""M4b-Requisitenbeleg: 15 Sprites 5x mit Labels, Schatten auf Gras/Wasser sichtbar."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import PAL, SHOTS  # noqa: E402
import gen_props  # noqa: E402

LAND = ["prop_tree_a", "prop_tree_b", "prop_stump", "prop_boulder", "prop_grave",
        "prop_cross", "prop_ruin", "prop_column", "prop_post", "prop_mushroom_ring", "prop_bones"]
WATER = ["prop_reeds", "prop_lilypad", "water_ripple_0", "water_ripple_1"]
SCALE = 5


def main() -> None:
    data = gen_props.build()
    cols, cell_w, cell_h = 5, 210, 340
    rows = (len(LAND) + cols - 1) // cols
    water_rows = 1
    sheet = Sheet(cols * cell_w + 40, (rows + water_rows) * cell_h + 150)
    sheet.text(20, 14, "LANTERNFALL  M4B  -  MOOR-REQUISITEN MIT BODENSCHATTEN (5X NEAREST)", TITLE, 2)
    sheet.text(20, 52, "SCHATTEN 28/29 MIT 2-3-PX-SO-VERSATZ AUF MOOSGRAS  -  WASSERDETAILS AUF SCHIEFER 4  -  KONTUR 0", LABEL, 1)
    for i, key in enumerate(LAND):
        g = data[key][0]
        x = 20 + (i % cols) * cell_w
        y = 88 + (i // cols) * cell_h
        sheet.cell(x, y, cell_w - 8, cell_h - 12, False)
        # Grasfläche als Hintergrund in der Zelle, damit Schatten lesbar sind.
        sheet.rect(x + 1, y + 1, cell_w - 10, cell_h - 14, PAL[30])
        sheet.blit(g, x + (cell_w - 8 - g.w * SCALE) // 2, y + cell_h - 50 - g.h * SCALE, SCALE)
        sheet.text(x + 4, y + cell_h - 34, key.replace("prop_", "").upper(), LABEL_HI, 2)
    wy = 88 + rows * cell_h
    for i, key in enumerate(WATER):
        g = data[key][0]
        x = 20 + i * cell_w
        sheet.cell(x, wy, cell_w - 8, cell_h - 12, True)
        sheet.rect(x + 1, wy + 1, cell_w - 10, cell_h - 14, PAL[4])
        sheet.blit(g, x + (cell_w - 8 - g.w * SCALE) // 2, wy + (cell_h - 14 - g.h * SCALE) // 2, SCALE)
        sheet.text(x + 4, wy + cell_h - 34, key.replace("prop_", "").replace("water_", "WAVE ").upper(), LABEL_HI, 2)
    sheet.text(20, sheet.h - 26, "BÄUME 34/40 PX HOCH  -  ALLE LAND-REQUISITEN MIT 2-STUFEN-SCHATTEN  -  5X, DUNKLER MOORGRUND", LABEL, 1)
    path = os.path.join(SHOTS, "m4b-sheet-props.png")
    sheet.save(path)
    print(path)


if __name__ == "__main__":
    main()
