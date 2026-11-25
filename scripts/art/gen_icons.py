#!/usr/bin/env python3
"""18 UI-Icons (16x16) aus den Paletten-Rechtecken in src/gfx/icons.ts.

Die Silhouetten bleiben handgesetzt; die Pipeline ergänzt echte Flächen-
Schattierung (3 Töne pro Material) und die 1-px-Außenkontur. Dadurch sind die
Icons in HUD und Level-up auch bei 16 px lesbar.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, SHOTS, outline, shade_edges, emit_ts, save_sheet_png  # noqa: E402


def read_rects() -> dict[str, list[tuple[int, int, int, int, int]]]:
    from icons_src import ICON_RECTS
    return ICON_RECTS


def handdrawn() -> dict[str, Grid]:
    """Icons, die als Rechteck-Komposition unlesbar waren (volles ASCII-Art)."""
    from icons_src import ICON_ROWS
    from lib import from_rows
    return {key: from_rows(rows) for key, rows in ICON_ROWS.items()}


def special() -> dict[str, Grid]:
    """Icons mit eindeutiger Silhouette, per Primitiven gesetzt (vor-schattiert)."""
    out: dict[str, Grid] = {}

    # Herz: zwei Ohren, Kerbe in der Mitte, Spitze unten.
    g = Grid(16, 16)
    g.ellipse(5, 5, 3, 3, 25)
    g.ellipse(10, 5, 3, 3, 25)
    for i in range(8):
        y = 7 + i
        w = 12 - int(i * 1.4)
        g.rect(8 - w // 2, y, w, 1, 25)
    g.rect(3, 3, 2, 2, 26)          # Licht links
    g.rect(4, 2, 4, 1, 26)
    g.rect(9, 2, 2, 2, 26)
    g.rect(11, 4, 2, 3, 24)         # Schatten rechts
    g.rect(9, 9, 3, 5, 24)
    g.rect(4, 3, 2, 2, 12)          # Glanz
    out["passive_heart"] = outline(g)

    # Stiefel: Schaft, Ferse, Fuß, Sohle, Schnürung.
    g = Grid(16, 16)
    g.rect(3, 2, 5, 9, 16)          # Schaft
    g.rect(3, 2, 2, 9, 17)          # Lichtkante
    g.rect(6, 5, 2, 5, 15)
    g.rect(3, 10, 10, 4, 16)        # Fuß
    g.rect(3, 10, 10, 1, 17)
    g.rect(8, 10, 2, 3, 15)         # Knöchel
    g.rect(12, 12, 2, 2, 15)        # Zeh
    g.rect(3, 13, 11, 2, 5)         # Sohle
    g.rect(3, 13, 11, 1, 4)
    for y in (5, 7, 9):
        g.rect(4, y, 2, 1, 11)      # Schnürsenkel 2x1
    out["passive_boots"] = outline(g)

    # Wetzstein: keilförmiger Stein mit Funken.
    g = Grid(16, 16)
    for i, (x, w) in enumerate(((3, 10), (2, 12), (2, 12), (3, 10), (4, 9), (4, 9), (5, 8), (5, 8))):
        y = 3 + i
        g.rect(x, y, w, 1, 11)
        g.rect(x, y, 3, 1, 12)      # Licht oben-links
        g.rect(x + w - 3, y, 3, 1, 5)  # Schatten rechts
    g.rect(3, 3, 8, 1, 12)
    g.rect(3, 10, 8, 1, 5)
    g.rect(12, 1, 2, 2, 13)         # Funken
    g.put(14, 3, 13)
    g.rect(11, 12, 2, 2, 17)
    out["passive_whetstone"] = outline(g)

    # Gluecksbringer: eisernes U (4/5/6/7) mit 2x2-Amberkern.
    g = Grid(16, 16)
    g.rect(4, 3, 3, 8, 5)            # linke Schenkel
    g.rect(4, 3, 1, 8, 7)            # Lichtkante links
    g.rect(10, 3, 3, 8, 5)           # rechter Schenkel
    g.rect(12, 3, 1, 8, 4)           # Schatten rechts
    g.rect(4, 10, 9, 3, 5)           # Bogen unten
    g.rect(4, 10, 3, 1, 7)
    g.rect(10, 12, 3, 1, 4)
    g.rect(6, 6, 4, 4, 20)           # Kern
    g.rect(7, 6, 2, 2, 21)
    g.rect(7, 10, 2, 2, 22)          # Glanz am Bogen
    g.put(5, 4, 7)
    g.put(11, 5, 6)
    out["passive_charm"] = outline(g)

    # Phoenix: Fluegel/Flammen-Silhouette ohne Blob.
    g = Grid(16, 16)
    # Grosser Fluegel oben-links als 2-px-Federboegen.
    for i, (x, y, w) in enumerate(((2, 4, 5), (2, 6, 7), (2, 8, 9), (2, 10, 10))):
        g.rect(x, y + i, w, 2, 20 if i < 2 else 19)
        g.rect(x, y + i, w, 1, 21 if i < 2 else 20)
    # Koerper rechts mit Hals + Schnabel.
    g.rect(9, 7, 4, 7, 19)
    g.rect(9, 7, 2, 7, 20)
    g.rect(12, 5, 2, 3, 20)          # Hals
    g.rect(13, 4, 3, 2, 21)          # Kopf
    g.rect(14, 3, 2, 2, 22)          # Schnabelspitze
    g.put(15, 4, 13)                 # Auge/Glanz
    # Schwanzfedern 2 px nach unten-links.
    g.rect(6, 11, 3, 3, 19)
    g.rect(4, 12, 3, 3, 18)
    g.rect(7, 12, 2, 2, 21)
    g.rect(5, 13, 2, 2, 20)
    out["evo_phoenix"] = outline(g)

    # Flegel: Kette oben-links, Metallkugel mit 2-px-Spikes unten-rechts.
    g = Grid(16, 16)
    for i in range(5):
        g.rect(2 + i, 2 + i, 2, 2, 5 if i % 2 else 8)
    g.ellipse(10, 11, 3, 3, 8)
    g.ellipse(9, 10, 2, 2, 9)
    g.rect(10, 11, 2, 2, 5)
    for dx, dy in ((10, 5), (10, 16), (4, 11), (16, 11)):
        pass
    g.rect(9, 6, 2, 2, 9)           # Spikes
    g.rect(9, 14, 2, 2, 9)
    g.rect(4, 10, 2, 2, 9)
    g.rect(14, 10, 2, 2, 9)
    out["weapon_flail"] = outline(g)

    # Dornenranke: 2-px-Zweig diagonal + 2x2-Knochendornen.
    g = Grid(16, 16)
    for i in range(11):
        g.rect(2 + i, 13 - i, 2, 2, 30)
    for i in range(11):
        g.put(2 + i, 13 - i, 31)
    for x, y in ((4, 11), (7, 8), (10, 5), (12, 3)):
        g.rect(x, y - 2, 2, 2, 11)
        g.rect(x + 1, y + 2, 2, 2, 10)
    out["weapon_thorn"] = outline(g)

    # Ewiger Winter: Schneekristall mit sechs 2-px-Armen + 2x2-Kern (13).
    g = Grid(16, 16)
    g.rect(7, 1, 2, 14, 10)          # senkrechter Arm 2 px
    g.rect(1, 7, 14, 2, 10)          # waagerechter Arm 2 px
    for t in range(6):
        g.rect(2 + t, 2 + t, 2, 1, 9)  # Diagonale 1: 2 px breit
        g.rect(3 + t, 2 + t, 1, 2, 9)
        g.rect(13 - t, 2 + t, 2, 1, 9)  # Diagonale 2
        g.rect(12 - t, 2 + t, 1, 2, 9)
    g.rect(7, 1, 2, 2, 12)           # Armspitzen heller
    g.rect(1, 7, 2, 2, 12)
    g.rect(13, 7, 2, 2, 12)
    g.rect(7, 13, 2, 2, 12)
    g.rect(6, 6, 4, 4, 9)            # Kern
    g.rect(7, 7, 2, 2, 13)           # Glow-Kern 2x2
    out["evo_eternal_winter"] = outline(g)

    # Seelenleuchte: Laterne mit Flamme, Eisenrahmen 5/7/8, Glas 12/13.
    g = Grid(16, 16)
    g.rect(4, 2, 8, 3, 5)            # Deckel
    g.rect(4, 2, 8, 1, 7)
    g.rect(5, 1, 6, 1, 8)            # Ring
    g.rect(3, 5, 2, 8, 5)            # Rahmen links
    g.rect(11, 5, 2, 8, 5)           # Rahmen rechts
    g.rect(3, 5, 1, 8, 7)
    g.rect(12, 6, 1, 7, 4)
    g.rect(5, 5, 6, 8, 12)           # Glas
    g.rect(6, 6, 4, 6, 13)           # Glow
    g.rect(7, 7, 2, 4, 22)           # Flamme
    g.rect(7, 7, 1, 2, 13)
    g.rect(3, 13, 10, 2, 6)          # Sockel
    g.rect(3, 13, 10, 1, 7)
    out["evo_soul_beacon"] = outline(g)

    # Donnersiegel: geschlossene Goldscheibe (19/20/17) mit dunklem Blitz.
    g = Grid(16, 16)
    g.rect(3, 3, 10, 10, 19)         # Scheibe
    g.rect(3, 3, 10, 2, 20)          # Licht oben
    g.rect(3, 3, 2, 10, 20)          # Licht links
    g.rect(11, 5, 2, 9, 18)          # Schatten rechts
    g.rect(4, 11, 9, 2, 17)          # Schatten unten
    for x, y in ((4, 4), (10, 4), (4, 10), (10, 10)):
        g.rect(x, y, 2, 2, 21)       # Ecken
    # Blitz: 3 px breit, dunkle Rampe 17/15, Kern 22.
    bolt = [(8, 4), (7, 4), (6, 4), (5, 4), (6, 4), (7, 4), (8, 4)]
    for i, (x, w) in enumerate([(8, 3), (7, 3), (6, 3), (6, 2), (7, 2)]):
        g.rect(x, 4 + i, w, 1, 17)
    g.rect(7, 5, 2, 1, 15)
    g.rect(7, 9, 2, 1, 15)
    g.put(7, 4, 22)
    g.put(6, 8, 22)
    out["evo_thunder_seal"] = outline(g)

    # Zornpendel: Kette + Stachelkugel (bleibt).
    g = Grid(16, 16)
    for i in range(4):
        g.rect(7, 1 + i * 2, 2, 1, 5)
    g.ellipse(8, 11, 4, 3, 24)
    g.ellipse(7, 10, 2, 2, 26)
    g.rect(8, 11, 2, 2, 23)
    for x, y in ((8, 6), (8, 16), (2, 11), (14, 11)):
        pass
    g.rect(7, 6, 2, 2, 26)          # Stacheln
    g.rect(7, 14, 2, 2, 26)
    g.rect(2, 10, 2, 2, 26)
    g.rect(12, 10, 2, 2, 26)
    out["evo_wrath_pendulum"] = outline(g)

    # Dornensturm: acht 2-px-Dornen strahlen aus einem 4x4-Kern.
    g = Grid(16, 16)
    dirs = [(0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)]
    for k, (dx, dy) in enumerate(dirs):
        for r in range(2, 7):
            x = 8 + dx * r
            y = 8 + dy * r
            w = 2 if dx == 0 else 1
            h = 2 if dy == 0 else 1
            g.rect(x - (1 if dx == 0 else 0), y - (1 if dy == 0 else 0), w + (1 if dx else 0), h + (1 if dy else 0), 30)
            if r >= 5:
                g.put(x, y, 31)
    g.rect(6, 6, 4, 4, 31)           # Kern 4x4
    g.rect(7, 7, 2, 2, 30)
    g.put(6, 6, 31)
    out["evo_thorn_storm"] = outline(g)

    return out


def build() -> dict[str, list[Grid]]:
    data: dict[str, list[Grid]] = {}
    for key, rects in read_rects().items():
        g = Grid(16, 16)
        for x, y, w, h, c in rects:
            g.rect(x, y, w, h, c)
        g = shade_edges(g, band=1, region_aware=False)
        data[key] = [outline(g)]
    # Sturm-Blitz bolder als die Rechteck-Vorlage (16 px lesbar).
    from lib import from_rows as _fr
    data["weapon_storm"] = [outline(_fr([
        "................",
        ".......ddd......",
        "......ddkkd.....",
        ".....ddkkd......",
        "....ddkkd.......",
        "...ddkkkkkkkk...",
        "...dkkkkkkkkd...",
        ".......dkkk.....",
        "......dkkk......",
        ".....dkkk.......",
        "....dkkk........",
        "...dkkk.........",
        "..dkkk..........",
        "..dk............",
        "................",
        "................",
    ]))]
    for key, g in special().items():
        data[key] = [g]
    for key, g in handdrawn().items():
        # Handgezeichnete Icons bringen Schattierung mit; nur Außenkontur ergänzen.
        if key in data:
            continue
        data[key] = [outline(g)]
        if key not in read_rects():
            raise SystemExit(f"handdrawn icon {key} hat keine Rechteck-Vorlage")
    ordered = {k: data[k] for k in read_rects()}
    return ordered
    return data


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-icons.ts", "GEN_ICONS", data,
                   "UI-Icons 16x16 (6 Waffen, 6 Powerups, 6 Evolutionen)")
    print("wrote", path, len(data), "keys")
    sheet = [data[k][0] for k in data]
    save_sheet_png(sheet, os.path.join(SHOTS, "m4-sheet-icons.png"), scale=6, gap=4,
                   bg=(18, 18, 26))
    print("icon sheet written")
