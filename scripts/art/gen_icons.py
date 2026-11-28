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
from lib import Grid, RAMPS, SHOTS, outline, shade_edges, emit_ts, save_sheet_png  # noqa: E402

# Evolutionen eine Rampe heller als ihre Basiswaffen (#320: "deutlich kraeftiger").
EVO_BOOST = {
    "evo_phoenix": {18: 19, 19: 20, 20: 21, 21: 22},
    "evo_thunder_seal": {15: 16, 16: 17, 17: 18, 18: 19, 19: 20, 20: 21, 21: 22},
    "evo_soul_beacon": {5: 6, 6: 7, 7: 8, 8: 10, 12: 13},
}

# Icons, die FINAL gezeichnet sind (eigene Licht-/Schattenkanten, keine
# normalize()-Neuberechnung): normalize/shade_edges legte sonst an JEDER
# Materialregion ein uniformes 1-px-Rampenband an — die "vereiste" Lichtkante
# aus #320. Die 6 Muss-Icons des art-director-Berichts (Vorher-Scan,
# shots/m10-icons-consistency-before.json) setzen Kanten gezielt selbst.
FINAL_DRAWN = {
    "evo_thorn_storm",     # M1: Kontrast 2.32:1, 3 Toene, Eis-Band an jedem Arm
    "evo_eternal_winter",  # M2: 6 Toene, Silhouette = Zwillings-Schneeflocke zu weapon_frost
    "passive_hourglass",   # M3: 5 Komponenten, groesste 39%
    "weapon_flail",        # M4: kein Lichtton, Kette abgerissen
    "passive_whetstone",   # M5: Lichtband ueber die gesamte Breite ("Schneekappe")
    "evo_wrath_pendulum",  # M6: 7 Toene, 0 Akzente, Kontrast 3.02:1 grenzwertig
}


def normalize(g: Grid, boost: dict[int, int] | None = None) -> Grid:
    """Eine gemeinsame Lichtlogik fuer alle 18 Icons.

    1. vorhandene (ggf. 2-3 px dicke) Ink-Rahmen entfernen,
    2. Materialfarben auf ihre Rampe-Basis zuruecksetzen (optional vorher
       eine Rampe aufhellen), damit Licht/Schatten neu berechnet werden,
    3. shade_edges (Licht oben-links, Schatten unten-rechts),
    4. exact 1-px-Aussenkontur.
    """
    base = Grid(g.w, g.h)
    for y in range(g.h):
        for x in range(g.w):
            c = g.px[y][x]
            if c is None or c == 0:
                continue
            if boost and c in boost:
                c = boost[c]
            found = c
            for mid, (sh, _base, li) in RAMPS.items():
                if c in (mid, sh, li):
                    found = mid
                    break
            base.px[y][x] = found
    shaded = shade_edges(base, band=1, region_aware=True)
    return outline(shaded, diagonal=True)


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
    from lib import from_rows
    from icons_src import ICON_REDRAW_ROWS

    out: dict[str, Grid] = {}

    # #7149: Herz/Stiefel/Gluecksbringer sind als handgezeichnete ASCII-Raster
    # (icons_src.ICON_REDRAW_ROWS) neu gefasst; normalize() schattiert/konturiert.
    # passive_tome: Drift-Fix, siehe Kommentar in icons_src.py.
    for key in ("passive_heart", "passive_charm", "passive_boots", "passive_tome"):
        out[key] = from_rows(ICON_REDRAW_ROWS[key])

    # Wetzstein: keilfoermiger Stein mit Funken. Lichtkante nur auf der
    # oberen Schliffflaeche (#320/M5: kein durchgehendes "Schneekappen"-Band).
    g = Grid(16, 16)
    for i, (x, w) in enumerate(((3, 10), (2, 12), (2, 12), (3, 10), (4, 9), (4, 9), (5, 8), (5, 8))):
        y = 3 + i
        g.rect(x, y, w, 1, 11)
        if i < 3:
            g.rect(x, y, 3, 1, 12)     # Licht nur obere Flaeche (2 Ebenen: 12/11)
        g.rect(x + w - 3, y, 3, 1, 5)  # Schatten rechts
    g.rect(12, 1, 2, 2, 13)         # Funken
    g.put(14, 3, 13)
    g.rect(11, 12, 2, 2, 17)
    out["passive_whetstone"] = outline(g, diagonal=True)

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
    out["evo_phoenix"] = outline(g, diagonal=True)

    # Flegel: Stiel, durchgehende Kette, Metallkugel mit Licht/Schatten und
    # silbernem Spike-Burst (#320/M4: vorher kein Lichtton, Kette abgerissen).
    g = Grid(16, 16)
    g.rect(1, 1, 3, 2, 15)          # Stiel
    g.rect(1, 1, 3, 1, 16)          # Stiel-Licht
    # Kette als 4-connectes Treppenband mit Glanzpixeln (10).
    chain = [(3, 3), (4, 3), (4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (7, 6)]
    for i, (x, y) in enumerate(chain):
        g.put(x, y, 8 if i % 2 else 5)
    for x, y in ((4, 3), (6, 5)):
        g.put(x, y, 10)             # Kettenglanz
    g.ellipse(10, 10, 3, 3, 8)      # Kugel (x7..13, y7..13)
    g.rect(8, 8, 2, 1, 10)          # Kugel-Licht oben-links
    g.put(8, 9, 10)
    g.put(9, 8, 11)                 # hellster Glanz
    g.rect(11, 11, 2, 2, 5)         # Kugel-Schatten unten-rechts
    g.put(12, 10, 5)
    # Spikes als silberner Burst (an der Kugel angesetzt)
    g.rect(9, 5, 2, 2, 11)
    g.rect(9, 14, 2, 2, 11)
    g.rect(5, 9, 2, 2, 11)
    g.rect(14, 9, 2, 2, 11)
    out["weapon_flail"] = outline(g, diagonal=True)

    # Dornenranke: 2-px-Zweig diagonal + 2x2-Knochendornen.
    g = Grid(16, 16)
    for i in range(11):
        g.rect(2 + i, 13 - i, 2, 2, 30)
    for i in range(11):
        g.put(2 + i, 13 - i, 31)
    for x, y in ((4, 11), (7, 8), (10, 5), (12, 3)):
        g.rect(x, y - 2, 2, 2, 11)
        g.rect(x + 1, y + 2, 2, 2, 10)
    out["weapon_thorn"] = outline(g, diagonal=True)

    # Ewiger Winter: zentrale Eis-Edelstein-Bluete mit Goldkern und Glow-Spitzen
    # (#320/M2: vorher 6 Toene, Silhouette = Zwillings-Schneeflocke zu weapon_frost).
    g = Grid(16, 16)
    # Rauten-Koerper (Eis 8/9/10, Kante 12)
    g.rect(7, 3, 2, 1, 12)
    g.rect(6, 4, 4, 1, 10)
    g.rect(5, 5, 6, 1, 9)
    g.rect(4, 6, 8, 1, 8)
    g.rect(4, 7, 8, 1, 8)
    g.rect(5, 8, 6, 1, 9)
    g.rect(6, 9, 4, 1, 10)
    g.rect(7, 10, 2, 1, 12)
    # Facetten: Licht oben-links, Schatten unten-rechts (unterbrochen, kein Band)
    g.rect(5, 5, 2, 1, 12)
    g.rect(4, 6, 3, 1, 9)
    g.put(11, 6, 10)
    g.put(11, 7, 10)
    g.put(10, 8, 10)
    # Goldkern + Glow (praechtiger als die graue Basis-Frost-Flocke)
    g.rect(7, 6, 2, 2, 20)
    g.put(7, 6, 21)
    g.put(8, 7, 13)
    # Arme N/S/W/E mit Glow-Spitzen
    g.rect(7, 1, 2, 2, 10)
    g.rect(7, 1, 2, 1, 13)
    g.rect(7, 11, 2, 2, 10)
    g.put(7, 12, 13)
    g.put(8, 12, 13)
    g.rect(1, 6, 3, 2, 10)
    g.put(1, 6, 13)
    g.put(1, 7, 13)
    g.rect(12, 6, 3, 2, 10)
    g.rect(14, 6, 1, 2, 13)
    # diagonale Eis-Splitter (2x2, am Koerper angesetzt)
    g.rect(5, 3, 2, 2, 11)
    g.put(5, 3, 12)
    g.rect(9, 3, 2, 2, 11)
    g.put(10, 3, 12)
    g.rect(5, 9, 2, 2, 11)
    g.put(5, 10, 12)
    g.rect(9, 9, 2, 2, 11)
    g.put(10, 10, 12)
    out["evo_eternal_winter"] = outline(g, diagonal=True)

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
    out["evo_soul_beacon"] = outline(g, diagonal=True)

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
    out["evo_thunder_seal"] = outline(g, diagonal=True)

    # Zornpendel: goldene Kette, Karmesin-Kugel mit Licht/Glow und Stacheln
    # (#320/M6: vorher 7 Toene, 0 Akzente, Kontrast 3.02:1 grenzwertig).
    g = Grid(16, 16)
    for y, c in ((1, 20), (2, 21), (3, 20), (4, 21)):
        g.rect(7, y, 2, 1, c)        # goldene Kettenglieder
    g.put(7, 1, 13)                  # Kettenglanz
    g.rect(7, 5, 2, 2, 26)           # Stachel oben (an Kette + Kugel)
    g.ellipse(7, 10, 3, 3, 25)       # Kugel (Karmesin, x4..10 / y7..13)
    g.rect(5, 8, 2, 1, 26)           # Kugel-Licht oben-links
    g.put(5, 9, 26)
    g.put(5, 8, 27)                  # hellste Kante
    g.put(6, 9, 22)                  # Glow auf der Schulter
    g.put(9, 12, 24)                 # Schatten unten-rechts
    g.put(10, 11, 24)
    g.put(10, 10, 24)
    # Stacheln seitlich/unten (an der Kugel angesetzt)
    g.rect(2, 9, 2, 2, 26)
    g.rect(11, 9, 2, 2, 26)
    g.rect(7, 13, 2, 2, 26)
    out["evo_wrath_pendulum"] = outline(g, diagonal=True)

    # Dornensturm: unregelmaessiger Dornball mit Gold-Beeren, Knochen-Splittern
    # und Glow-Kern (#320/M1: vorher Kontrast 2.32:1, 3 Toene, Eis-Band an jedem Arm).
    g = Grid(16, 16)
    # Kern
    g.rect(6, 6, 4, 4, 31)
    g.rect(6, 6, 4, 1, 31)          # Kern-Oberkante hell
    g.rect(6, 9, 4, 1, 30)          # Kern-Unterkante Schatten
    g.rect(7, 7, 2, 2, 20)          # Gold-Beeren-Kern
    g.put(7, 7, 21)
    g.put(8, 8, 13)                 # Glow
    # Arme: unregelmaessige Laengen, Licht nur an Oberkanten (kein Band)
    g.rect(7, 2, 2, 4, 31)          # Nord (lang)
    g.rect(7, 2, 2, 1, 31)
    g.rect(7, 1, 2, 1, 20)          # Beere Nord
    g.put(8, 1, 21)
    g.rect(10, 7, 4, 2, 31)         # Ost
    g.put(13, 7, 31)
    g.put(14, 7, 10)                # Knochen-Splitter Ost
    g.put(14, 8, 10)
    g.rect(7, 10, 2, 3, 31)         # Sued (kuerzer)
    g.rect(7, 13, 2, 1, 20)         # Beere Sued
    g.rect(2, 7, 4, 2, 31)          # West
    g.rect(2, 7, 1, 2, 31)
    # Diagonal-Splitter (Sturm-Debris, 1 px)
    for x, y, c in ((10, 6, 31), (11, 5, 31), (12, 4, 10), (11, 11, 31), (12, 12, 31)):
        g.put(x, y, c)
    out["evo_thorn_storm"] = outline(g, diagonal=True)

    # Sanduhr: durchgehende Silhouette — Rahmen (Deckel/Pfosten/Fuß) und Sand
    # verbunden (#320/M3: vorher 5 Komponenten, groesste nur 39%). Rahmen in
    # Fog 7 (16px-lesbar auf Panel), Licht 8 / Schatten 4.
    g = Grid(16, 16)
    g.rect(2, 2, 12, 1, 7)           # Deckel
    g.rect(3, 2, 4, 1, 8)            # Deckel-Licht links
    g.rect(11, 2, 2, 1, 4)           # Deckel-Schatten rechts
    g.rect(2, 13, 12, 1, 7)          # Fuß
    g.rect(11, 13, 2, 1, 4)          # Fuß-Schatten rechts
    g.rect(2, 3, 1, 10, 8)           # Pfosten links (Lichtseite)
    g.rect(13, 3, 1, 10, 4)          # Pfosten rechts (Schattenseite)
    # Oberer Sand (Trichter), Oberflaeche als Lichtkante
    g.rect(4, 3, 8, 1, 21)
    g.rect(5, 4, 6, 1, 20)
    g.rect(6, 5, 4, 1, 20)
    g.rect(7, 6, 2, 1, 16)           # Trichter-Schatten
    # Strom
    g.rect(7, 7, 2, 2, 20)
    g.put(7, 8, 13)                  # funkelndes Korn
    # Unterer Sand (Huegel), bis auf die Pfosten reichend
    g.rect(7, 9, 2, 1, 20)
    g.rect(6, 10, 4, 1, 20)
    g.rect(5, 11, 6, 1, 20)
    g.rect(3, 12, 10, 1, 20)
    out["passive_hourglass"] = outline(g, diagonal=True)

    return out


def build() -> dict[str, list[Grid]]:
    data: dict[str, list[Grid]] = {}
    for key, rects in read_rects().items():
        g = Grid(16, 16)
        for x, y, w, h, c in rects:
            g.rect(x, y, w, h, c)
        g = shade_edges(g, band=1, region_aware=False)
        data[key] = [outline(g, diagonal=True)]
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
        data[key] = [outline(g, diagonal=True)]
        if key not in read_rects():
            raise SystemExit(f"handdrawn icon {key} hat keine Rechteck-Vorlage")
    ordered = {k: data[k] for k in read_rects()}
    for key in ordered:
        if key in FINAL_DRAWN:
            continue  # final gezeichnet: eigene Kanten, kein normalize()-Re-Banding
        ordered[key] = [normalize(ordered[key][0], EVO_BOOST.get(key))]
    return ordered


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-icons.ts", "GEN_ICONS", data,
                   "UI-Icons 16x16 (6 Waffen, 6 Powerups, 6 Evolutionen)")
    print("wrote", path, len(data), "keys")
    sheet = [data[k][0] for k in data]
    save_sheet_png(sheet, os.path.join(SHOTS, "m4-sheet-icons.png"), scale=6, gap=4,
                   bg=(18, 18, 26))
    print("icon sheet written")
