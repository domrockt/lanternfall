#!/usr/bin/env python3
"""UI-Assets: Titel-Emblem (Laterne an Dornenranken) und 9-Slice-Rahmen.

Beides Paletten-Pixelart: 1-px-Kontur (0), Eisen-Rampe 2/5/7, Glut 17–22,
13 nur als Glow-Kern. Texturen werden im Spiel zur Bootzeit erzeugt.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, emit_ts, save_grid_png, save_sheet_png, SHOTS  # noqa: E402

INK = 0
IRON, IRON_D, IRON_L = 5, 2, 7


def title_logo() -> Grid:
    """96x56-Emblem: gotischer Haken, Ketten, große Laterne, Dornenflügel."""
    g = Grid(96, 56)
    cx = 48
    # Dornenranken links/rechts (gruppierte 2-px-Äste mit Stacheln).
    for side in (-1, 1):
        base_x = cx + side * 22
        pts = [(base_x, 18), (base_x + side * 10, 14), (base_x + side * 16, 22),
               (base_x + side * 22, 30), (base_x + side * 26, 38)]
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            g.line(x0, y0, x1, y1, IRON, 3)           # 3-px-Ast
            g.line(x0, y0 - 1, x1, y1 - 1, IRON_L, 1)  # Lichtkante oben
            g.line(x0, y0 + 1, x1, y1 + 1, IRON_D, 1)  # Schatten unten
        for x, y in pts[1:]:
            g.rect(x, y - 4, 3, 3, IRON_D)   # 3x3-Stachel sitzt auf dem Ast
            g.put(x, y - 4, IRON_L)
            g.put(x + 1, y - 4, IRON_L)
    # Aufhängehaken + Kette (2 px).
    g.rect(cx - 10, 4, 21, 3, IRON)
    g.rect(cx - 10, 4, 21, 1, IRON_L)
    g.rect(cx - 10, 6, 21, 1, IRON_D)
    g.rect(cx - 2, 7, 4, 2, IRON_D)
    for y in range(7, 13, 2):
        g.rect(cx - 1, y, 2, 2, IRON)
        g.put(cx - 1, y, IRON_L)
    # Laternenkrone.
    g.rect(cx - 13, 13, 27, 3, IRON)
    g.rect(cx - 13, 13, 27, 1, IRON_L)
    g.rect(cx - 13, 15, 27, 1, IRON_D)
    g.rect(cx - 10, 10, 3, 3, IRON_D)
    g.rect(cx + 7, 10, 3, 3, IRON_D)
    # Glaskörper: Goldrahmen, Glut, 2x2-Kern 13.
    g.rect(cx - 11, 16, 23, 26, IRON_D)
    g.rect(cx - 10, 17, 21, 24, 17)
    g.rect(cx - 8, 18, 17, 22, 20)
    g.rect(cx - 8, 18, 2, 22, 21)
    g.rect(cx + 3, 19, 4, 20, 16)  # rechte Schattenseite
    g.rect(cx - 8, 18, 17, 4, 22)
    g.rect(cx - 6, 22, 13, 14, 18)
    g.rect(cx - 5, 26, 11, 8, 20)
    g.rect(cx - 2, 28, 4, 4, 22)
    g.rect(cx - 1, 29, 2, 2, 13)
    # Rahmenstreben (Eisen).
    g.rect(cx - 8, 18, 2, 22, IRON)
    g.rect(cx + 6, 18, 2, 22, IRON)
    g.rect(cx - 10, 18, 21, 2, IRON)
    g.rect(cx - 10, 40, 21, 2, IRON)
    g.rect(cx - 10, 40, 21, 1, IRON_L)
    # Sockel/Tropfschale.
    g.rect(cx - 12, 42, 25, 4, IRON_D)
    g.rect(cx - 12, 42, 25, 1, IRON)
    g.rect(cx - 9, 46, 19, 2, IRON_D)
    g.rect(cx - 9, 46, 6, 1, IRON_L)
    return outline(shade_edges(g, band=1))


def ui_frame() -> Grid:
    """24x24-Neun-Slice-Rahmen: Stein/Eisen, Goldnieten in den Ecken."""
    g = Grid(24, 24)
    g.rect(1, 1, 22, 22, 3)
    g.rect(2, 2, 20, 20, 2)
    # Aussenband aus Eisen mit Lichtkante oben-links: obere und linke Kante
    # bekommen eine 2-px-Aufhellung. m10-font-ui-frame-polish #8080 (F1): die
    # alte Stufung 7/6 lag mit 2.72:1 unter der 3:1-Grenze gegen die
    # Innenflaeche (2) -> neue Stufung 8/7 (mist/fog), aeusserste Kante 4.1:1.
    g.rect(0, 0, 24, 2, 7)
    g.rect(0, 0, 24, 1, 8)
    g.rect(0, 0, 2, 24, 7)
    g.rect(0, 0, 1, 24, 8)
    # Schattenkanten unten/rechts. Malreihenfolge #8080 (F3): erst die dunklen
    # 2er-Baender, DANACH die 1-px-Ink-Linien — vorher blieb ein Stoerpixel 2
    # bei (22,23) in der unteren Ink-Kante.
    g.rect(0, 22, 24, 2, 2)
    g.rect(22, 0, 2, 24, 2)
    g.rect(0, 23, 24, 1, 0)
    g.rect(23, 0, 1, 24, 0)
    # Innenfase: 2 px dunkler + 1 px Licht, lichtlogisch symmetrisch
    # (#8080 F2): oben UND links eine 1-px-Lichtlinie (6), rechte und untere
    # Fase beide 4 (vorher rechts 2 vs unten 4 bei gleicher Schattenrolle).
    g.rect(2, 2, 20, 2, 4)
    g.rect(2, 20, 20, 2, 4)
    g.rect(2, 2, 2, 20, 4)
    g.rect(20, 2, 2, 20, 4)
    g.rect(2, 2, 20, 1, 6)
    g.rect(2, 2, 1, 20, 6)
    # Goldnieten 3x3 in allen vier Ecken: Glanz (22) oben-links, Schatten (0) unten-rechts.
    # Hoeherer Eckenkontrast, damit der Rahmen nicht oben flach wirkt (#321).
    for x, y in ((3, 3), (18, 3), (3, 18), (18, 18)):
        # Globale Lichtrichtung oben-links: obere Nieter glänzen oben, untere
        # liegen im Schatten. Unten-rechts nie 22, sonst kippt die Lichtlogik (#321).
        top = y < 12
        left = x < 12
        g.rect(x, y, 3, 3, 20 if top else 17)
        g.put(x, y, 22 if top else 20)
        g.put(x + 1, y, 21 if top else 18)
        g.put(x, y + 1, 21 if left else 18)
        g.put(x + 2, y + 2, 0)
    # Aussenecken hart mit Ink absetzen.
    for x, y in ((0, 0), (23, 0), (0, 23), (23, 23)):
        g.put(x, y, 0)
    return outline(g)


def build() -> dict[str, list[Grid]]:
    return {
        "title_logo": [title_logo()],
        "ui_frame": [ui_frame()],
    }


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-ui.ts", "GEN_UI", data, "UI: Titel-Emblem 96x56, 9-Slice-Rahmen 24x24")
    print("wrote", path, len(data), "keys")
    for key, grids in data.items():
        save_grid_png(grids[0], os.path.join(SHOTS, f"m4-{key}.png"), scale=4)
    save_sheet_png([data["title_logo"][0], data["ui_frame"][0]],
                   os.path.join(SHOTS, "m4-sheet-ui.png"), scale=5)
    print("ui shots written")
