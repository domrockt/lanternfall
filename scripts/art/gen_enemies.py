#!/usr/bin/env python3
"""Alle 30 Gegner-Sprites, 16–32 px nach Tier, 2–4 Lauf-Frames.

Jeder Gegner hat eine eigene, an seiner Gestalt orientierte Silhouette (Ratte,
Vogel, Schleim, Humanoid, Spinne, Baum …), Tier-Akzent an Augen/Glow, Rampen-
Shading (Licht oben-links), 1-px-Kontur. Keine Rauschflächen.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, emit_ts, pad_grid, save_grid_png, save_sheet_png, SHOTS  # noqa: E402

INK = 0
EYE = 13
TIER_ACCENT = [31, 11, 20, 26, 13]
TIER_SIZE = [16, 20, 24, 28, 32]

# Rampen: (Schatten, Basis, Licht)
R = {
    "ember": (14, 16, 17),
    "marsh": (28, 30, 31),
    "mossD": (28, 29, 30),
    "fog": (4, 7, 8),
    "night": (2, 4, 6),
    "slate": (2, 4, 6),
    "blood": (23, 24, 25),
    "crim": (23, 25, 26),
    "bone": (5, 10, 11),
    "fogBlue": (3, 5, 9),
    "steel": (4, 5, 8),
    "stone": (5, 7, 9),
    "mist": (5, 8, 11),
    "pale": (6, 9, 11),
    "gold": (16, 20, 21),
    "flame": (15, 18, 19),
    "flameHi": (17, 19, 22),
    "flesh": (23, 26, 27),
    "void": (3, 5, 8),
    "fur": (4, 8, 11),
    "wood": (14, 16, 17),
    "lantern": (17, 20, 22),
}


def finish(g: Grid, details: list[tuple[int, int, int]] | None = None,
           allow_highlight: bool = True, shade: bool = True,
           dark_edge: int | None = None) -> Grid:
    # Augen-Akzente (Tier-Akzent auf Höhle 2) werden vor dem Shading
    # gezeichnet. shade_edges darf sie nicht zu 1-px-Resten umfärben, sonst
    # verliert das Auge seine 2-px-Breite. Daher werden Akzentpixel, die an
    # eine 2er-Höhle grenzen, nach dem Shading wiederhergestellt.
    pre = g.copy()
    ACCENTS = (31, 11, 20, 26, 13)
    # Kleine Sprites (16/20 px) werden silhouette-basiert schattiert, damit
    # Innen-Details (Augen, Mund, Akzente) nicht von Kantenbändern überschrieben
    # werden. Ab 24 px bleibt das flächenbewusste Shading.
    if shade:
        g = shade_edges(g, band=1, region_aware=g.w >= 24)
    if details:
        for x, y, c in details:
            g.put(x, y, c)
    for y in range(g.h):
        for x in range(g.w):
            c = pre.px[y][x]
            if c is None or c not in ACCENTS or g.px[y][x] is None:
                continue
            if any(pre.get(x + dx, y + dy) == 2
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                g.px[y][x] = c
    # Nur für sehr dunkle Gegner (Spinne, Krähe, Wolf, Leerenrufer): die
    # oberste bzw. linke Silhouettenkante bekommt zusätzlich eine 1-px-helle
    # Lichtkante, damit die Form auf Index-1-Hintergrund lesbar bleibt.
    # Es werden ausschließlich bereits gefüllte Pixel umgefärbt; die Silhouette
    # (und damit der Eindeutigkeits-Maskentest) bleibt unverändert.
    if dark_edge is not None:
        occ = g.occupied()
        for y in range(g.h):
            xs = [x for x in range(g.w) if occ[y][x]]
            if xs and g.px[y][xs[0]] not in (INK, 2):
                g.px[y][xs[0]] = dark_edge
        for x in range(g.w):
            ys = [y for y in range(g.h) if occ[y][x]]
            if ys and g.px[ys[0]][x] not in (INK, 2):
                g.px[ys[0]][x] = dark_edge
    # Innen-Tinte: 0 gehört nur an die Außenkontur, innen wird sie zu 2.
    occ = g.occupied()
    for y in range(g.h):
        for x in range(g.w):
            if g.px[y][x] != INK:
                continue
            n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                    if 0 <= x + dx < g.w and 0 <= y + dy < g.h and occ[y + dy][x + dx])
            if n >= 3:
                g.px[y][x] = 2
    return outline(g)


def eye_pair(g: Grid, cx: int, y: int, gap: int, accent: int, socket: bool = True):
    """Augenpaar: dunkle Höhle (2) mit 2×1-Tier-Akzent, bei 1× lesbar."""
    for dx in (-gap, gap):
        if socket:
            g.rect(cx + dx - 1, y - 1, 3, 2, 2)
        g.rect(cx + dx, y, 2, 1, accent)


# ── Stufe 0 (16 px) ─────────────────────────────────────────────────────────
def bog_rat(f: int) -> Grid:
    g = Grid(16, 16)
    d, b, l = R["ember"]
    bob = [0, 1, 0, 1][f % 4]
    cy = 10 - bob
    # Schwanz: 3-px-Kurve nach hinten oben.
    g.line(11, cy + 1, 14, cy - 3, 15, 3)
    g.put(14, cy - 4, 14)
    # Rumpf mit Buckel.
    g.ellipse(8, cy, 4, 3, b)
    g.ellipse(7, cy - 1, 3, 2, l)
    # Kopf hochgestellt, Schnauze spitz nach links.
    g.ellipse(4, cy - 3, 2, 2, b)
    g.ellipse(3, cy - 4, 1, 1, l)
    g.rect(1, cy - 2, 3, 2, b)
    g.put(1, cy - 1, 15)
    # Ohrmuschel 2x2.
    g.rect(4, cy - 6, 2, 2, b)
    g.rect(4, cy - 6, 1, 1, l)
    # Auge: 3x3-Sockel mit 2x2-Tier-Akzent.
    g.rect(2, cy - 4, 3, 3, 2)
    g.rect(6, cy + 1, 4, 2, 15)         # Bauch
    # Läufe 2 px, wechselnd.
    g.rect(6, cy + 3, 2, 3, d)
    g.rect(10, cy + 2 + bob, 2, 3, d)
    g.rect(6, cy + 5, 2, 1, 15)
    g.rect(10, cy + 4 + bob, 2, 1, 15)
    return finish(g, [(3, cy - 4, 31), (4, cy - 4, 31), (3, cy - 3, 31), (4, cy - 3, 31), (1, cy - 1, 15)])


def wisp(f: int) -> Grid:
    g = Grid(16, 16)
    bob = 1 if f == 1 else 0
    cy = 10 - bob
    # Irrlicht: Tropfenform (breite Basis, schmaler Hals, Flammenspitze).
    g.ellipse(8, cy, 4, 4, 5)
    g.rect(6, cy - 6, 4, 3, 5)
    g.rect(7, cy - 8, 2, 4, 5)
    # Lichtkante oben-links in 2-px-Blöcken.
    g.rect(4, cy - 3, 2, 3, 9)
    g.rect(5, cy - 6, 2, 2, 9)
    g.rect(7, cy - 8, 1, 3, 9)
    g.rect(4, cy, 2, 2, 9)
    # Schatten unten-rechts.
    g.rect(10, cy + 1, 2, 3, 3)
    g.rect(8, cy + 3, 3, 1, 3)
    # Glutkern.
    g.rect(7, cy - 4, 3, 2, 11)
    g.put(8, cy - 3, 13)
    # Augen: 2x2 Höhle + 2x1 Tier-Akzent 31.
    g.rect(5, cy - 2, 2, 2, 2)
    g.rect(9, cy - 2, 2, 2, 2)
    g.rect(5, cy - 2, 2, 1, 31)
    g.rect(9, cy - 2, 2, 1, 31)
    # Schweif: gestaffelte 2-px-Bahnen statt Einzelpixel.
    g.rect(6, cy + 4, 3, 1, 7)
    g.rect(7, cy + 5, 2, 2, 5)
    g.put(7, cy + 7, 3)
    g.rect(9, cy + 4, 2, 1, 7)
    return finish(g, [(5, cy - 2, 31), (6, cy - 2, 31),
                      (9, cy - 2, 31), (10, cy - 2, 31)], shade=False)


def mudling(f: int) -> Grid:
    g = Grid(16, 16)
    d, b, l = 29, 30, 31
    bob = 1 if f % 2 else 0
    cy = 10 - bob
    g.rect(3, cy + 4, 10, 1, d)
    g.rect(2, cy + 3, 12, 1, 29)
    g.ellipse(8, cy, 5, 4, b)
    g.rect(3, cy - 6, 2, 4, b)
    g.rect(11, cy - 6, 2, 4, b)
    g.put(3, cy - 7, l)
    g.put(11, cy - 7, l)
    g.rect(3, cy - 6, 1, 3, l)
    g.rect(11, cy - 6, 1, 3, l)
    g.rect(4, cy - 4, 3, 1, l)
    g.rect(3, cy - 3, 2, 1, l)
    g.rect(11, cy + 3, 2, 1, d)
    g.rect(1, cy + 2, 2, 2, b)
    g.put(1, cy + 3, d)
    g.rect(13, cy + 1, 2, 3, b)
    g.put(13, cy + 3, d)
    for sx in (5, 9):
        g.rect(sx, cy - 2, 2, 2, 2)
    g.rect(6, cy + 2, 5, 2, 2)
    g.put(7, cy + 2, l)
    g.put(9, cy + 2, l)
    # 2x1-Tier-Akzent in der 2x2-Augenhoehlung (ART.md: Akzent mind. 2 px breit).
    return finish(g, [(5, cy - 2, 31), (6, cy - 2, 31),
                      (9, cy - 2, 31), (10, cy - 2, 31)], shade=False)

def crow(f: int) -> Grid:
    g = Grid(16, 16)
    d, b, l = R["mist"]
    bob = 1 if f % 2 else 0
    cy = 9 - bob
    # Rumpf + Kopf im Profil nach rechts.
    g.ellipse(7, cy, 4, 3, b)
    g.ellipse(6, cy - 1, 3, 2, l)
    g.ellipse(11, cy - 2, 2, 2, b)
    g.rect(13, cy - 2, 2, 1, 20)        # Schnabel
    g.put(13, cy - 1, 17)
    g.rect(10, cy - 2, 2, 2, 2)         # Augenhöhle
    # Flügel: drei 2-px-Federlappen, hoch bei Frame 1.
    if f % 2:
        g.rect(3, cy - 5, 5, 2, 8)
        g.rect(1, cy - 3, 4, 2, 8)
        g.rect(2, cy - 1, 3, 2, d)
        g.put(1, cy - 4, 9)
    else:
        g.ellipse(5, cy, 3, 2, d)
        g.rect(3, cy + 1, 4, 2, d)
        g.put(2, cy + 2, 5)
    g.rect(1, cy + 1, 3, 2, 8)          # Schwanz
    # Beine 2 px + Füße.
    g.rect(7, cy + 3, 2, 2, 16)
    g.rect(9, cy + 3, 2, 2, 16)
    g.rect(6, cy + 5, 3, 1, 20)
    g.rect(9, cy + 5, 3, 1, 20)
    return finish(g, [(10, cy - 2, 31), (11, cy - 2, 31), (13, cy - 2, 20)],
                  dark_edge=9)


def bogzombie(f: int) -> Grid:
    g = Grid(16, 16)
    d, b, l = R["marsh"]
    bob = 0 if f % 2 else 1
    sway = 1 if f % 2 else 0
    # Kopf + Hals, ausgefranste Robe. Kopf-Grundton 30, Licht 31 nur als
    # Oberkante: so heben sich die 2x1-Tier-Akzente (31) von der Flaeche ab.
    g.ellipse(8, 4 - bob, 4, 3, b)
    g.put(6, 1 - bob, l)
    g.put(7, 1 - bob, l)
    g.put(8, 1 - bob, l)
    g.rect(6, 7 - bob, 5, 1, b)
    for i, w in enumerate((6, 7, 8)):
        g.rect(8 - w // 2, 8 + i - bob, w, 1, b)
    g.rect(5, 8 - bob, 2, 4, l)
    g.rect(11, 9 - bob, 2, 3, d)
    # Augen 2x1-Akzent 31, Mundnaht.
    # Mundnaht zuerst, dann Augen: sonst ueberschreibt die Naht die untere
    # Augenzeile und die Hoehle wirkt angeschnitten.
    g.rect(7, 5 - bob, 4, 1, d)
    g.put(8, 6 - bob, d)
    g.rect(6, 4 - bob, 2, 2, 2)
    g.rect(10, 4 - bob, 2, 2, 2)
    # Arme 2 px: einer erhoben, einer hängt.
    g.rect(2 + sway, 7 - bob, 2, 4, l)
    g.rect(1 + sway, 6 - bob, 2, 1, l)
    g.rect(12, 9 - bob, 2, 4, l)
    # Beine + Fetzen.
    g.rect(5, 12, 2, 3, d)
    g.rect(9, 12 - (1 if f % 2 else 0), 2, 3, d)
    g.rect(3, 11, 2, 1, d)
    g.rect(12, 11 - bob, 2, 1, 31)
    # Akzent als untere Augenzeile (dunkle Hoehle oben, heller Blick unten),
    # damit der 2x1-Streifen nicht als Braue ueber der Hoehle liest.
    return finish(g, [(6, 4 - bob, 31), (7, 4 - bob, 31),
                      (10, 4 - bob, 31), (11, 4 - bob, 31),
                      (5, 4 - bob, 30),   # Kopfkante neben dem Auge neutral halten
                      (1 + sway, 6 - bob, 31)])


def toad(f: int) -> Grid:
    g = Grid(16, 16)
    d, b, l = R["mossD"]
    bob = 1 if f == 1 else 0
    cy = 11 - bob
    g.ellipse(8, cy, 6, 3, b)          # Körper
    g.ellipse(8, cy - 1, 5, 3, l)
    g.put(2, cy + 1, 28)
    g.put(4, cy + 2, 28)
    g.put(11, cy + 1, 28)
    g.put(13, cy + 2, 28)
    g.put(10, cy - 2, 28)              # Warzen
    g.put(6, cy - 3, 28)
    for cx0 in (4, 12):                 # Augenhügel 2x2
        g.ellipse(cx0, cy - 4, 2, 2, l)
        g.rect(cx0 - 1, cy - 4, 2, 2, 2)
        g.rect(cx0 - 1, cy - 4, 2, 1, 31)
    g.rect(5, cy + 1, 7, 1, INK)       # Mund
    g.put(6, cy + 2, INK)
    g.rect(2, cy + 2, 2, 2, d)         # Vorderbeine
    g.rect(13, cy + 2, 2, 2, d)
    return finish(g)


# ── Stufe 1 (20 px) ─────────────────────────────────────────────────────────
def skeleton(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = R["bone"]
    bob = 1 if f == 1 else 0
    cx = 10
    g.ellipse(cx, 5 - bob, 4, 4, b)    # Schädel
    g.rect(cx - 3, 8 - bob, 7, 1, b)   # Kiefer
    g.rect(cx - 3, 5 - bob, 2, 2, 2)   # Augenhöhlen 2x2
    g.rect(cx + 2, 5 - bob, 2, 2, 2)
    g.rect(cx - 3, 5 - bob, 2, 1, 11)  # Akzent 2x1
    g.rect(cx + 2, 5 - bob, 2, 1, 11)
    g.put(cx, 8 - bob, INK)
    g.put(cx - 2, 9 - bob, INK)
    g.put(cx + 2, 9 - bob, INK)
    g.vline(cx, 10 - bob, 14 - bob, b)  # Wirbelsäule
    for y in (10, 12, 14):              # Rippen
        g.hline(cx - 3, cx + 3, y - bob, b)
        g.put(cx - 3, y - bob, 11)
    g.rect(cx - 5, 11 - bob, 2, 4, b)  # Arme
    g.rect(cx + 4, 10 - bob, 2, 5, b)
    g.put(cx + 5, 14 - bob, 11)
    g.rect(cx - 3, 16, 2, 3, b)        # Beine
    g.rect(cx + 2, 16 - (1 if f else 0), 2, 3, b)
    g.rect(cx - 4, 15, 2, 3, 10)       # Lendenknochen statt Rot
    g.rect(cx + 3, 15, 2, 3, 10)
    g.put(cx - 2, 12 - bob, 11)
    return finish(g, [(cx - 3, 5 - bob, 11), (cx + 2, 5 - bob, 11)])


def bat(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = R["crim"]
    bob = 1 if f == 1 else 0
    cy = 11 - bob
    ws = -2 if f == 1 else 1              # Flügelschlag
    # Membranflügel als geschlossene 4x3-Loben in zwei Rottönen.
    g.ellipse(5, cy - 2 + ws, 4, 3, 23)
    g.ellipse(15, cy - 2 + ws, 4, 3, 23)
    g.ellipse(5, cy - 3 + ws, 3, 2, 24)
    g.ellipse(15, cy - 3 + ws, 3, 2, 24)
    # Flügelknochen als 2-px-Bahnen nach außen.
    g.rect(1, cy - 3 + ws, 3, 2, 25)
    g.rect(16, cy - 3 + ws, 3, 2, 25)
    # Körper + Kopf.
    g.ellipse(10, cy, 2, 4, b)
    g.ellipse(10, cy - 5, 2, 2, b)
    g.rect(7, cy - 7, 2, 2, b)             # Ohren 2x2
    g.rect(11, cy - 6, 2, 3, b)
    # Augen: 2x1-Akzent 11 auf dunkler Höhle.
    g.rect(8, cy - 5, 2, 2, 2)
    g.rect(11, cy - 5, 2, 2, 2)
    g.rect(8, cy - 5, 2, 1, 11)
    g.rect(11, cy - 5, 2, 1, 11)
    g.rect(9, cy - 2, 1, 1, 12)            # Fangzähne
    g.rect(11, cy - 2, 1, 1, 12)
    g.rect(9, cy + 3, 1, 2, 24)            # Beine
    g.rect(10, cy + 3, 1, 2, 24)
    return finish(g, [(8, cy - 5, 11), (11, cy - 5, 11)], shade=False)


def ghoul(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = R["mossD"]
    bob = 1 if f == 1 else 0
    cy = 12 - bob
    g.ellipse(9, cy, 5, 5, b)          # gebe gebe
    g.ellipse(9, cy - 1, 4, 4, l)
    g.ellipse(12, 6 - bob, 3, 3, b)    # Kopf vorgestreckt
    g.put(15, 6 - bob, l)              # Schnauze
    g.rect(13, 5 - bob, 2, 2, 2)       # Augenhöhle
    g.put(13, 5 - bob, 11)
    g.put(14, 5 - bob, 11)
    g.put(15, 7 - bob, INK)
    g.put(11, 8 - bob, 11)             # Zähne
    g.put(13, 8 - bob, 11)
    for i, x in enumerate((14, 16, 17)):  # Rückenstacheln
        g.put(x, 8 - bob + i, 28)
    g.rect(4, cy + 1, 2, 5, b)         # langer Arm
    g.rect(5, cy + 5, 2, 2, b)
    g.put(4, cy + 7, 11)               # Kralle
    g.put(6, cy + 7, 11)
    g.rect(13, cy + 1, 2, 4, b)
    g.put(14, cy + 5, 11)
    g.rect(6, 16, 2, 3, b)             # Beine
    g.rect(10, 16 - (1 if f else 0), 2, 3, b)
    g.put(7, cy + 2, 28)
    return finish(g, [(13, 5 - bob, 11), (14, 5 - bob, 11)])


def witchling(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = R["crim"]
    bob = [0, 1, 2, 1][f % 4]
    sway = [0, 1, 0, -1][f % 4]
    # Robe: Trapez mit 3 Tonbändern und ausgefranstem Saum.
    for i, w in enumerate((9, 10, 11, 12, 13)):
        g.rect(10 - w // 2 + (sway if i > 2 else 0), 11 + i - bob, w, 1,
               25 if i < 2 else b)
    g.rect(4 + sway, 15 - bob, 2, 2, d)
    g.rect(8 + sway, 15 - bob, 2, 1, d)
    g.rect(14 + sway, 15 - bob, 2, 2, d)
    g.rect(5, 10 - bob, 10, 1, d)        # Kragen-Schatten
    # Warmes Gesicht (Haut-Rampe 16 / 27 / 21), Kapuze bleibt.
    g.rect(7, 7 - bob, 6, 5, 27)
    g.rect(11, 7 - bob, 2, 5, 16)        # rechte Schattenseite
    g.rect(8, 11 - bob, 4, 1, 16)        # Kinnschatten
    g.vline(7, 7 - bob, 11 - bob, 21)    # 1-px-Lichtkante links
    # Augen 2x2-Höhle + 2x1 Tier-Akzent 11.
    g.rect(8, 8 - bob, 2, 2, 2)
    g.rect(11, 8 - bob, 2, 2, 2)
    # Hexenhut: breite Krempe + spitzer Kegel.
    g.rect(3, 6 - bob, 14, 2, 23)
    g.rect(3, 6 - bob, 14, 1, 24)
    for i, w in enumerate((7, 6, 5, 4, 3, 2)):
        g.rect(10 - w // 2, 5 - i - bob, w, 1, 25 if i < 2 else 24)
    g.rect(9, 7 - bob, 2, 1, 20)         # Hutband
    # Besen diagonal, 2 px, Borsten unten-links.
    g.line(15, 6 - bob, 11, 14 - bob, 16, 2)
    g.line(9, 15 - bob, 13, 17 - bob, 21, 2)
    g.rect(8, 16 - bob, 3, 2, 20)
    g.rect(9, 5 - bob, 2, 2, 11)         # Hutspitzen-Akzent
    # Warme Hand am Besenstiel.
    g.rect(12, 11 - bob, 2, 2, 27)
    g.put(12, 11 - bob, 21)
    g.put(13, 12 - bob, 16)
    return finish(g, [(8, 8 - bob, 11), (9, 8 - bob, 11), (11, 8 - bob, 11), (12, 8 - bob, 11)])

def slime(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = 8, 9, 10
    bob = 1 if f == 1 else 0
    cy = 12 - bob
    g.rect(8, cy - 6, 2, 3, l)
    g.put(8, cy - 6, 11)
    g.put(9, cy - 6, 10)
    g.rect(5, cy - 4, 2, 2, b)
    g.rect(13, cy - 4, 2, 2, b)
    g.ellipse(10, cy, 7, 4, b)
    g.rect(3, cy + 3, 15, 2, b)
    g.rect(4, cy - 4, 4, 2, l)
    g.put(4, cy - 5, 11)
    g.rect(15, cy, 2, 4, d)
    g.rect(5, cy + 3, 13, 1, d)
    g.rect(7, cy - 1, 2, 2, INK)
    g.rect(12, cy - 1, 2, 2, INK)
    g.rect(9, cy + 2, 3, 1, INK)
    g.put(11, cy + 3, INK)
    # Markenzeichen: Schleimtropfen an der Seite, 2-px-Zahnreihe im Mund.
    g.rect(17, cy, 2, 4, b)
    g.put(17, cy + 4, l)
    g.put(18, cy + 4, l)
    g.rect(9, cy + 2, 2, 1, 11)
    g.rect(11, cy + 2, 2, 1, 11)
    g.rect(5, cy + 1, 2, 2, d)
    g.put(5, cy + 1, l)
    g.rect(14, cy - 2, 2, 2, d)
    return finish(g, [(7, cy - 1, 11), (8, cy - 1, 11),
                      (12, cy - 1, 11), (13, cy - 1, 11), (8, cy - 6, 11)])

def scarecrow(f: int) -> Grid:
    g = Grid(20, 20)
    d, b, l = R["gold"]
    bob = [0, 1, 2, 1][f % 4]
    sway = [0, 1, 0, -1][f % 4]
    # Kreuzpfahl, 2 px.
    g.rect(9, 8, 2, 12, 14)
    g.rect(9, 8, 1, 12, 15)
    g.rect(2, 11 - bob, 16, 2, 16)      # Querbalken
    g.rect(2, 11 - bob, 16, 1, 17)
    # Stroh an den Enden (2-px-Büschel).
    g.rect(1, 10 - bob, 2, 1, 21)
    g.rect(1, 13 - bob, 2, 1, 20)
    g.rect(17, 10 - bob, 2, 1, 21)
    g.rect(17, 13 - bob, 2, 1, 20)
    # Sackkörper mit Flicken.
    g.rect(5 + sway, 12 - bob, 10, 6, 20)
    g.rect(5 + sway, 12 - bob, 2, 6, 21)
    g.rect(13 + sway, 13 - bob, 2, 5, 16)
    g.rect(6 + sway, 17 - bob, 2, 1, 16)
    g.rect(11 + sway, 15 - bob, 3, 1, 16)
    # Kopf (Sack) + Hut.
    g.ellipse(10, 8 - bob, 4, 3, 20)
    g.ellipse(10, 7 - bob, 3, 2, 21)
    g.rect(3, 5 - bob, 14, 2, 14)       # Krempe
    g.rect(3, 5 - bob, 14, 1, 15)
    g.rect(7, 2 - bob, 6, 3, 16)        # Hutkegel
    g.rect(7, 2 - bob, 6, 1, 17)
    # Genähtes Gesicht: 2x2-Knopfaugen in 11 auf 2-Sockel, Kreuzmund.
    g.rect(7, 7 - bob, 2, 2, 2)
    g.rect(11, 7 - bob, 2, 2, 2)
    g.rect(8, 10 - bob, 4, 1, 2)
    g.put(9, 9 - bob, 2)
    g.put(11, 9 - bob, 2)
    g.rect(3, 10 - bob, 2, 1, 15)       # Stroh unter Ärmeln
    g.rect(15, 12 - bob, 2, 1, 15)
    return finish(g, [(7, 7 - bob, 11), (8, 7 - bob, 11), (7, 8 - bob, 11), (8, 8 - bob, 11), (11, 7 - bob, 11), (12, 7 - bob, 11), (11, 8 - bob, 11), (12, 8 - bob, 11)])

# ── Stufe 2 (24 px, 4 Frames) ───────────────────────────────────────────────
def wolf(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["fur"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 15 - bob
    # Rumpf mit 3 Fellstufen (Schatten unten, Lichtrücken oben-links).
    g.ellipse(10, cy, 6, 4, b)
    g.rect(5, cy - 4, 7, 2, l)             # Rückenlicht
    g.rect(6, cy + 2, 8, 2, d)             # Bauchschatten
    g.ellipse(17, cy - 3, 3, 3, b)         # Kopf
    g.rect(16, cy - 7, 2, 2, b)            # Ohren 2x2
    g.rect(19, cy - 7, 2, 2, b)
    g.rect(20, cy - 3, 2, 2, b)            # Schnauze
    g.rect(20, cy - 1, 2, 1, d)
    # Auge: 2x2 Höhle + 2x1 Tier-Akzent 20.
    g.rect(16, cy - 4, 2, 2, 2)
    g.rect(16, cy - 4, 2, 1, 20)
    g.put(21, cy - 3, 2)                   # Nase
    g.rect(18, cy - 1, 2, 1, 11)           # Fangzahn
    # Schwanz 2 px breit, buschig.
    g.line(4, cy - 1, 1, cy - 4, d, 2)
    g.rect(2, cy - 5, 2, 2, l)
    g.rect(6, cy + 1, 3, 1, 5)             # Bauchfell
    # Vier deutlich verschiedene Laufposen (Trab/Galopp).
    a, c = [(0, 2), (1, 1), (2, 0), (1, 2)][f % 4]
    for x, o in ((5, a), (8, c), (13, c), (16, a)):
        g.rect(x, 18 - bob, 2, 2 + o, d)
        g.rect(x, 20 - bob + o, 3, 1, d)
    return finish(g, [(16, cy - 4, 20)], shade=False, dark_edge=11)


def banshee(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["pale"]
    bob = [0, 1, 2, 1][f % 4]
    top = 5 - bob
    # Zerfledderte Robe, unten in Fetzen.
    sway = [0, 1, 0, -1][f % 4]
    for i, w in enumerate((6, 8, 10, 11, 12, 12, 11)):
        g.rect(12 - w // 2 + (sway if i > 3 else 0), top + 7 + i, w, 1, 8)
    g.rect(5 + sway, 19, 3, 1, 9)
    g.rect(10 + sway, 19, 2, 2, 9)
    g.rect(16 + sway, 18, 2, 2, 9)
    g.rect(7, top + 6, 10, 1, 9)
    # Kopf mit langem Haar.
    g.ellipse(12, top + 3, 4, 4, 9)
    g.rect(7, top + 2, 2, 7, 4)         # Haar
    g.rect(15, top + 1, 2, 7, 4)
    g.rect(8, top, 8, 1, 4)
    g.rect(9, top + 3, 2, 2, 2)         # Augenhöhlen
    g.rect(13, top + 3, 2, 2, 2)
    g.rect(9, top + 3, 2, 1, 20)        # Tier-Akzent (Stufe 2)
    g.rect(13, top + 3, 2, 1, 20)
    g.rect(11, top + 6, 3, 1, 2)        # offener Mund
    # Arme mit Krallen.
    g.line(7, top + 7, 3 - sway, top + 10, 9, 2)
    g.line(17, top + 7, 21 + sway, top + 9, 9, 2)
    g.put(2 - sway, top + 11, 11)
    g.put(4 - sway, top + 11, 11)
    g.put(22 + sway, top + 10, 11)
    g.put(20 + sway, top + 10, 11)
    return finish(g, [(9, top + 3, 20), (13, top + 3, 20)])


def golem(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["ember"]
    bob = [0, 1, 2, 1][f % 4]
    # Füße + Beine (breite Torfstempel).
    g.rect(5, 20, 5, 3, 15)
    g.rect(14, 20, 5, 3, 15)
    g.rect(5, 22, 5, 1, 14)
    g.rect(14, 22, 5, 1, 14)
    g.rect(6, 16 - bob, 4, 5, 16)
    g.rect(14, 16 - bob, 4, 5, 16)
    # Rumpf mit Lichtkante und Schattenseite.
    g.rect(7, 10 - bob, 10, 7, 15)
    g.rect(7, 10 - bob, 2, 7, 16)
    g.rect(15, 10 - bob, 2, 7, 14)
    g.rect(8, 10 - bob, 8, 1, 17)
    # Schulterblöcke breiter als der Rumpf.
    g.rect(2, 9 - bob, 5, 4, 16)
    g.rect(2, 9 - bob, 5, 1, 17)
    g.rect(17, 9 - bob, 5, 4, 16)
    g.rect(17, 9 - bob, 5, 1, 17)
    # Arme 3 px + große Fäuste, Frame-Wechsel.
    off = [0, 2, 1, 1][f % 4]
    g.rect(2, 12 - bob + off, 3, 5, 15)
    g.rect(1, 17 - bob + off, 4, 4, 16)
    g.rect(1, 17 - bob + off, 4, 1, 17)
    g.rect(19, 12 - bob + (2 - off), 3, 5, 15)
    g.rect(19, 17 - bob + (2 - off), 4, 4, 16)
    # Kopf rund auf kurzem Hals.
    g.rect(10, 8 - bob, 4, 2, 16)
    g.ellipse(12, 6 - bob, 4, 3, 16)
    g.rect(8, 4 - bob, 8, 4, 16)
    g.rect(8, 4 - bob, 8, 1, 17)
    g.rect(8, 7 - bob, 8, 1, 14)
    # Glutaugen + Mundschlitz.
    g.rect(9, 5 - bob, 2, 2, 2)
    g.rect(13, 5 - bob, 2, 2, 2)
    g.rect(9, 8 - bob, 6, 1, 14)
    # Moos auf Schultern und Kopf.
    g.rect(2, 8 - bob, 4, 2, 30)
    g.rect(17, 9 - bob, 3, 2, 29)
    g.rect(9, 3 - bob, 3, 1, 30)
    return finish(g, [(9, 5 - bob, 20), (10, 5 - bob, 20), (13, 5 - bob, 20), (14, 5 - bob, 20)])

def spider(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["slate"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 14 - bob
    # Acht Beine zuerst (hinter dem Körper), 2-px-Segmente mit Knick.
    lift = [0, 1, 2, 3][f % 4]
    legs = [
        (7, cy - 1, 4, cy - 4 + lift, 1, cy + 1),
        (7, cy, 3, cy - 1, 1, cy + 3),
        (7, cy + 1, 4, cy + 2, 2, cy + 5),
        (8, cy + 2, 5, cy + 4, 4, cy + 6),
        (18, cy - 1, 20, cy - 4 + (3 - lift), 22, cy + 1),
        (18, cy, 21, cy - 1, 22, cy + 3),
        (17, cy + 1, 20, cy + 2, 21, cy + 5),
        (16, cy + 2, 19, cy + 4, 20, cy + 6),
    ]
    for bx, by, ex, ey, fx, fy in legs:
        g.line(bx, by, ex, ey, 8, 2)
        g.line(ex, ey, fx, fy, 8, 2)
        g.rect(ex, ey, 2, 2, 9)
        g.put(fx, fy + 1, 9)
    # Hinterleib groß hinten rechts, Kopf vorn links.
    g.ellipse(16, cy + 1, 5, 4, b)
    g.ellipse(15, cy, 4, 3, l)
    g.rect(14, cy - 2, 3, 1, 9)
    g.rect(18, cy + 1, 2, 1, 5)
    g.ellipse(8, cy, 3, 3, b)
    g.ellipse(8, cy - 1, 2, 2, l)
    # Vier Augen 2x2-Höhlen mit Akzent 20, Beißzangen.
    g.rect(6, cy - 1, 2, 2, 2)
    g.rect(10, cy - 1, 2, 2, 2)
    g.rect(5, cy + 1, 2, 1, 5)
    g.rect(10, cy + 1, 2, 1, 5)
    return finish(g, [(6, cy - 1, 20), (7, cy - 1, 20), (10, cy - 1, 20), (11, cy - 1, 20)],
                  dark_edge=8)

def cultist(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["blood"]
    bob = [0, 1, 2, 1][f % 4]
    # Robe mit per-Frame schwingendem Saum.
    sway = [0, 1, 0, -1][f % 4]
    for i, w in enumerate((10, 11, 12, 13, 14, 15)):
        g.rect(12 - w // 2 + (sway if i > 2 else 0), 13 + i - bob, w, 1, b)
    g.rect(5 + sway, 18, 2, 2, d)
    g.rect(11 + sway, 18, 2, 1, d)
    g.rect(16 + sway, 18, 3, 1, d)
    g.rect(6, 14 - bob, 12, 1, 25)      # Gürtel
    g.rect(9, 14 - bob, 3, 1, 20)       # Schnalle
    # Kapuze + warmes Gesicht (Haut-Rampe 16 / 27 / 21).
    g.ellipse(12, 9 - bob, 4, 5, b)
    g.rect(8, 6 - bob, 8, 4, 27)
    g.rect(9, 10 - bob, 6, 3, 27)
    # Schatten unten-rechts, 1-px-Lichtkante oben-links.
    g.rect(13, 8 - bob, 3, 2, 16)
    g.rect(10, 12 - bob, 5, 1, 16)
    g.vline(8, 6 - bob, 12 - bob, 21)
    g.hline(8, 12, 6 - bob, 21)
    # Augen: 2x2-Höhle (2) mit 2x1-Akzent 20.
    g.rect(9, 8 - bob, 2, 2, 2)
    g.rect(13, 8 - bob, 2, 2, 2)
    g.put(12, 11 - bob, 0)              # Mundnaht
    g.put(8, 6 - bob, 26)               # Kapuzensaum
    g.put(15, 6 - bob, 26)
    # Dolch.
    g.vline(19, 10 - bob, 16, 8)
    g.rect(18, 15 - bob, 3, 1, 20)
    g.put(19, 9 - bob, 13)
    g.rect(8, 16 - bob, 2, 2, 20)       # Amulett
    # Warme Hand am Dolchgriff.
    g.rect(17, 14 - bob, 2, 2, 27)
    g.put(17, 14 - bob, 21)
    g.put(18, 15 - bob, 16)
    return finish(g, [(9, 8 - bob, 20), (10, 8 - bob, 20),
                      (13, 8 - bob, 20), (14, 8 - bob, 20),
                      (19, 9 - bob, 13)])


def bomber(f: int) -> Grid:
    g = Grid(24, 24)
    d, b, l = R["steel"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 14 - bob
    # Kugeliger Eisenkörper mit 3 Tonlagen.
    g.ellipse(12, cy, 7, 6, b)
    g.ellipse(11, cy - 1, 5, 4, l)
    g.ellipse(14, cy + 2, 5, 3, 4)
    g.rect(6, cy - 2, 2, 3, 8)
    g.rect(8, cy - 4, 4, 2, 8)
    # Zündschnur 2 px + flackernder Funke.
    g.line(12, cy - 6, 15, cy - 9, 10, 2)
    spark = [0, 1, 0, 1][f % 4]
    g.rect(14, cy - 12 - spark, 2, 2, 22)
    g.put(15, cy - 13 - spark, 13)
    g.put(13, cy - 10, 19)
    # Gesicht: 2x2-Augen (Tier-Akzent 20), Zündermund.
    g.rect(9, cy - 2, 2, 2, 2)
    g.rect(14, cy - 2, 2, 2, 2)
    g.rect(10, cy + 2, 4, 1, 2)
    g.put(11, cy + 3, 2)
    # Kurze Beine 2 px, Stampfen.
    off = [0, 1, 2, 2][f % 4]
    g.rect(9, cy + 6, 3, 2, 5)
    g.rect(13, cy + 6 + off, 3, 2, 5)
    g.rect(8, cy + 8, 4, 1, 10)
    g.rect(12, cy + 8 + off, 4, 1, 10)
    return finish(g, [(9, cy - 2, 20), (10, cy - 2, 20),
                      (14, cy - 2, 20), (15, cy - 2, 20)])

def knight(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = R["mist"]
    bob = [0, 1, 2, 1][f % 4]
    off = [0, 2, 1, 1][f % 4]
    # Beine mit vier Ständen.
    g.rect(9, 20 + off, 4, 5, d)
    g.rect(15, 20 + (2 - off), 4, 5, d)
    g.rect(8, 24 + off, 5, 2, 4)
    g.rect(15, 24 + (2 - off), 5, 2, 4)
    # Torso 12x11 mit Lichtkante links, Schatten rechts.
    g.rect(8, 10 - bob, 12, 11, b)
    g.rect(8, 10 - bob, 3, 11, l)
    g.rect(17, 10 - bob, 3, 11, d)
    g.rect(9, 14 - bob, 10, 1, 7)
    g.rect(13, 16 - bob, 2, 2, 26)
    g.rect(9, 19 - bob, 10, 1, 4)
    # Schultern.
    g.ellipse(7, 11 - bob, 3, 2, 7)
    g.ellipse(21, 11 - bob, 3, 2, 7)
    g.rect(5, 11 - bob, 2, 1, 11)
    g.rect(21, 11 - bob, 2, 1, 11)
    # Helm 10x7, Visier, roter Federbusch.
    g.rect(9, 3 - bob, 10, 7, 7)
    g.rect(9, 3 - bob, 10, 1, 9)
    g.rect(9, 4 - bob, 2, 6, 5)
    g.rect(12, 6 - bob, 5, 2, 2)        # Visierhöhle
    g.rect(13, 8 - bob, 2, 1, 4)
    g.rect(12, 0 - bob, 4, 3, 26)
    g.rect(12, 0 - bob, 2, 1, 25)
    g.rect(16, 1 - bob, 2, 1, 23)
    # Schild links, Schwert rechts in der Faust.
    g.rect(1, 12 - bob, 5, 8, 7)
    g.rect(1, 12 - bob, 5, 1, 9)
    g.rect(2, 13 - bob, 3, 6, 5)
    g.rect(3, 15 - bob, 1, 2, 26)
    g.rect(22, 12 - bob, 2, 8, 5)
    g.rect(24, 10 - bob, 2, 13, 8)
    g.rect(24, 10 - bob, 1, 13, 9)
    g.rect(23, 19 - bob, 4, 2, 20)
    g.rect(23, 21 - bob, 4, 2, 16)
    return finish(g, [(13, 6 - bob, 26), (14, 6 - bob, 26)])


def harpy(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = R["bone"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 14 - bob
    # Flügel weit gespreizt (Federfinger).
    if f % 4 in (1, 2):
        for i in range(4):
            x0 = 10 - i * 3
            g.line(x0, cy - 2, x0 - 3, cy - 6 + i, d, 2)
            g.line(x0 - 3, cy - 6 + i, x0 - 1, cy - 1, 11)
        for i in range(4):
            x0 = 18 + i * 3
            g.line(x0, cy - 2, x0 + 3, cy - 6 + i, d, 2)
            g.line(x0 + 3, cy - 6 + i, x0 + 1, cy - 1, 11)
    else:
        for i in range(3):
            g.line(11 - i * 2, cy + 1, 4 - i * 2, cy + 3 + i, d, 2)
            g.line(17 + i * 2, cy + 1, 24 + i * 2, cy + 3 + i, d, 2)
    # Körper + Kopf.
    g.ellipse(14, cy + 1, 4, 5, b)
    g.rect(12, cy - 3, 4, 4, l)
    g.ellipse(14, cy - 5, 3, 3, b)
    g.rect(13, cy - 6, 2, 2, 2)         # Augenhöhlen
    g.rect(16, cy - 6, 2, 2, 2)
    g.rect(13, cy - 6, 2, 1, 26)
    g.rect(16, cy - 6, 2, 1, 26)
    g.put(14, cy - 3, 20)               # Schnabel
    g.put(15, cy - 3, 17)
    g.put(14, cy - 2, INK)
    g.rect(12, cy - 8, 2, 2, 9)         # Federkrone
    g.put(17, cy - 9, 9)
    g.put(14, cy - 9, 9)
    # Vogelbeine mit Krallen.
    off = [0, 1, 2, 1][f]
    g.line(12, cy + 5, 11, cy + 9 + off, 16, 1)
    g.line(16, cy + 5, 17, cy + 9 + (1 - off), 16, 1)
    g.put(10, cy + 10 + off, 20)
    g.put(12, cy + 10 + off, 20)
    g.put(16, cy + 10 + (1 - off), 20)
    g.put(18, cy + 10 + (1 - off), 20)
    g.put(14, cy + 2, 11)               # Brustgefieder
    return finish(g, [(13, cy - 6, 26), (14, cy - 6, 26),
                      (16, cy - 6, 26), (17, cy - 6, 26)])


def lich(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = R["bone"]
    bob = [0, 1, 2, 1][f % 4]
    # Robe: dunkles Nachtblau mit 2-px-Falten (kein roter Balken).
    sway = [0, 1, 0, -1][f % 4]
    for i, w in enumerate((10, 11, 12, 13, 14, 15, 16)):
        y = 13 + i - bob
        g.rect(13 - w // 2 + (sway if i > 2 else 0), y, w, 1, 3 if i % 4 else 4)
    for lx in (8, 16):
        g.rect(lx + sway, 16 - bob, 2, 9, 2)
    g.rect(6, 12 - bob, 15, 2, 2)      # Schultern
    g.rect(7, 12 - bob, 5, 1, 4)
    # Schädel 8x8 mit 2x2-Augen auf Socket.
    g.ellipse(13, 8 - bob, 5, 4, 10)
    g.rect(9, 11 - bob, 9, 2, 10)
    g.rect(9, 13 - bob, 9, 1, 9)
    g.rect(9, 7 - bob, 2, 2, 2)
    g.rect(16, 7 - bob, 2, 2, 2)
    g.rect(9, 7 - bob, 2, 1, 26)       # Tier-Akzent Rot
    g.rect(16, 7 - bob, 2, 1, 26)
    g.rect(13, 9 - bob, 2, 2, 2)       # Nasenhöhle
    for x in (10, 12, 14, 16):         # Zähne 1-px-Reihe im Kiefer
        g.put(x, 12 - bob, 8)
    # Krone aus Gold, aufgesetzt (2 px tief, Nieten 2x2).
    g.rect(8, 2 - bob, 11, 2, 20)
    g.rect(8, 2 - bob, 11, 1, 21)
    for x in (8, 13, 18):
        g.rect(x, 0 - bob, 2, 2, 20)
        g.put(x, 0 - bob, 22)
    # Knochenarme 2 px + rote Magiehände.
    g.line(7, 13 - bob, 4, 18 - bob, 11, 2)
    g.line(19, 13 - bob, 22, 18 - bob, 11, 2)
    g.rect(3, 19 - bob, 3, 2, 26)
    g.rect(22, 19 - bob, 3, 2, 26)
    g.put(4, 18 - bob, 13)
    g.put(23, 18 - bob, 13)
    # Stab 2 px mit Glutkern.
    g.rect(25, 5 - bob, 2, 17, 16)
    g.rect(25, 5 - bob, 1, 17, 17)
    g.rect(23, 3 - bob, 6, 3, 14)
    g.rect(24, 3 - bob, 4, 2, 20)
    g.put(25, 3 - bob, 22)
    return finish(g, [(9, 7 - bob, 26), (16, 7 - bob, 26), (3, 19 - bob, 26), (22, 19 - bob, 26)])

def wraith(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = 3, 4, 5
    bob = [0, 1, 2, 1][f % 4]
    top = 7 - bob
    sway = [0, 1, 0, -1][f % 4]
    for i, w in enumerate((12, 13, 14, 14, 13, 12, 10, 7, 4, 2)):
        y = top + 5 + i
        x0 = 14 - w // 2 + (sway if i > 4 else 0)
        g.rect(x0, y, w, 1, 6 if i % 2 else 5)
        g.rect(x0, y, 3, 1, 7)
        g.put(x0, y, 8)
        g.put(x0 + w - 1, y, 4)
    g.rect(9, top + 12, 10, 1, 6)
    g.rect(8, top + 3, 12, 2, 7)
    g.rect(8, top + 3, 3, 2, 8)
    g.ellipse(14, top + 1, 6, 4, 6)
    g.rect(9, top, 11, 5, 5)
    g.rect(9, top, 3, 5, 7)
    g.put(9, top, 8)
    g.rect(11, top + 2, 2, 2, 2)
    g.rect(16, top + 2, 2, 2, 2)
    g.rect(11, top + 2, 2, 1, 26)
    g.rect(16, top + 2, 2, 1, 26)
    g.rect(11, top - 3, 7, 2, 5)
    g.rect(11, top - 3, 3, 1, 6)
    g.put(14, top - 4, 6)
    g.line(7, top + 6, 2 - sway * 2, top + 10, 9, 2)
    g.line(21, top + 6, 26 + sway * 2, top + 10, 9, 2)
    g.rect(1 - sway * 2, top + 10, 2, 2, 11)
    g.rect(2 - sway, top + 12, 2, 2, 10)
    g.rect(25 + sway * 2, top + 10, 2, 2, 11)
    g.rect(24 + sway, top + 12, 2, 2, 10)
    return finish(g, [(11, top + 2, 26), (16, top + 2, 26)])

def treant(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = 14, 16, 17
    bob = [0, 1, 2, 1][f % 4]
    step = [0, 1, 0, -1][f % 4]
    g.line(10, 25, 4 + step, 27, 14, 2)
    g.line(11, 25, 9 + step, 27, 15, 2)
    g.line(18, 25, 23 - step, 27, 14, 2)
    g.line(16, 25, 18 - step, 27, 15, 2)
    g.rect(10, 10 - bob, 8, 16, 16)
    g.rect(10, 10 - bob, 2, 16, 14)
    g.rect(16, 10 - bob, 2, 16, 15)
    g.rect(12, 14 - bob, 2, 8, 14)
    g.rect(12, 14 - bob, 1, 4, 15)
    g.rect(4, 8 - bob, 6, 2, 16)
    g.rect(2, 6 - bob, 4, 2, 15)
    g.rect(2, 9 - bob, 3, 2, 14)
    g.rect(18, 11 - bob, 7, 2, 16)
    g.rect(23, 8 - bob, 3, 2, 15)
    # Blattkronen: 2x2-Cluster, mindestens 2 px Innenabstand zur Canvas-Kante.
    g.rect(4, 3 - bob, 4, 2, 30)
    g.rect(2, 2 - bob, 3, 2, 31)
    g.rect(8, 5 - bob, 2, 2, 29)
    g.rect(2, 5 - bob, 2, 2, 28)
    g.rect(20, 4 - bob, 4, 2, 30)
    g.rect(23, 3 - bob, 3, 2, 31)
    g.rect(18, 6 - bob, 2, 2, 29)
    g.rect(24, 6 - bob, 2, 2, 28)
    g.rect(11, 12 - bob, 7, 5, 14)
    g.rect(12, 12 - bob, 3, 1, 16)
    g.rect(16, 12 - bob, 2, 1, 16)
    g.rect(11, 13 - bob, 2, 2, 2)
    g.rect(16, 13 - bob, 2, 2, 2)
    g.rect(13, 16 - bob, 3, 2, INK)
    g.put(14, 17 - bob, 26)
    return finish(g, [(11, 13 - bob, 26), (12, 13 - bob, 26),
                      (16, 13 - bob, 26), (17, 13 - bob, 26), (14, 17 - bob, 26)])

def imp(f: int) -> Grid:
    g = Grid(28, 28)
    d, b, l = R["ember"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 14 - bob
    # Flügelchen.
    if f % 4 in (1, 2):
        g.line(10, cy - 1, 3, cy - 5, 15, 2)
        g.line(3, cy - 5, 6, cy + 2, 17)
        g.line(18, cy - 1, 25, cy - 5, 15, 2)
        g.line(25, cy - 5, 22, cy + 2, 17)
    else:
        g.line(10, cy, 5, cy + 3, 15, 2)
        g.line(18, cy, 23, cy + 3, 15, 2)
    g.ellipse(14, cy + 1, 4, 4, b)      # Körper
    g.ellipse(13, cy, 3, 3, l)
    g.put(12, cy - 2, 28)               # Glutadern
    g.put(16, cy + 2, 28)
    g.ellipse(14, cy - 4, 3, 3, b)      # Kopf
    g.put(11, cy - 6, 0)                # Hörner
    g.put(10, cy - 7, 0)
    g.put(17, cy - 6, 0)
    g.put(18, cy - 7, 0)
    g.rect(12, cy - 5, 2, 2, 2)         # Augenhöhlen
    g.rect(15, cy - 5, 2, 2, 2)
    g.rect(12, cy - 5, 2, 1, 26)
    g.rect(15, cy - 5, 2, 1, 26)
    g.rect(13, cy - 2, 3, 1, INK)       # Grinsen
    g.put(13, cy - 1, 13)
    g.put(15, cy - 1, 13)
    g.line(18, cy + 2, 21, cy + 5, 17, 1)  # Schwanz
    g.put(22, cy + 5, 20)
    g.put(23, cy + 4, 22)
    g.rect(11, cy + 5, 2, 3, d)         # Beine
    g.rect(16, cy + 5, 2, 3, d)
    g.put(10, cy + 8, 0)
    g.put(18, cy + 8, 0)
    return finish(g, [(12, cy - 5, 26), (13, cy - 5, 26),
                      (15, cy - 5, 26), (16, cy - 5, 26)])


# ── Stufe 4 (32 px, 4 Frames) ───────────────────────────────────────────────
def horror(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = R["flesh"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 15 - bob
    # Tentakel/Beine.
    wave = [0, 1, 0, -1][f % 4]
    for i, (x0, x1) in enumerate(((8, 3), (11, 7), (16, 16), (20, 24), (23, 28))):
        g.line(x0, cy + 5, x1, cy + 11 + (i % 2) + wave, 24, 2)
    # Fleischkörper.
    g.ellipse(16, cy, 8, 7, b)
    g.ellipse(15, cy - 2, 6, 5, l)
    # Großes Auge.
    g.ellipse(16, cy - 1, 6, 4, 12)
    g.ellipse(16, cy - 1, 4, 3, 24)
    g.ellipse(16, cy - 1, 2, 2, 0)
    g.put(15, cy - 2, 13)
    g.put(14, cy - 2, 13)
    # Lidfalten + kleine Augen am Rand.
    g.hline(9, 23, cy + 3, 26)
    for x, y in ((7, cy - 3), (24, cy - 4)):
        g.rect(x - 1, y - 1, 2, 2, 2)
        g.put(x, y - 1, 13)
    # Narben + Adern.
    g.line(18, cy - 6, 22, cy - 4, 26, 1)
    g.line(20, cy + 4, 24, cy + 5, 26, 1)
    g.put(9, cy + 5, 23)
    g.put(12, cy + 6, 23)
    return finish(g, [(14, cy - 2, 13), (15, cy - 2, 13), (10, cy - 3, 13), (23, cy - 2, 13)])


def centipede(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = R["bone"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 17 - bob
    # Segmentkette von links (Schwanz) nach rechts (Kopf).
    for i in range(6):
        x = 6 + i * 4
        y = cy - (0 if (i + f) % 2 == 0 else 1)
        g.ellipse(x, y, 3, 3, b)
        g.ellipse(x, y - 1, 2, 2, l)
        g.put(x - 1, y + 2, 10)
        g.put(x + 1, y + 2, 10)
    # Kopf mit Mandibeln.
    g.ellipse(27, cy - 2, 4, 4, b)
    g.rect(25, cy - 4, 2, 2, 2)         # Augenhöhlen
    g.rect(28, cy - 4, 2, 2, 2)
    g.rect(25, cy - 4, 2, 1, 13)
    g.rect(28, cy - 4, 2, 1, 13)
    g.put(30, cy - 2, 10)
    g.put(31, cy - 1, 10)
    g.put(31, cy, 10)
    g.put(26, cy + 1, 24)               # Mund
    # Beinpaare, Frame-wechselnd.
    phase = [0, 1, 2, 0][f % 4]
    for i in range(6):
        x = 6 + i * 4
        swing = 1 if (i + phase) % 2 else 0
        g.line(x - 1, cy + 2, x - 3 - swing, cy + 6, 10, 1)
        g.line(x + 1, cy + 2, x + 3 - swing, cy + 6, 10, 1)
    # Hinterleibsschwanz.
    g.line(3, cy - 1, 1, cy - 3, 10, 1)
    return finish(g, [(25, cy - 4, 13), (26, cy - 4, 13),
                      (28, cy - 4, 13), (29, cy - 4, 13)])


def gargoyle(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = R["stone"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 17 - bob
    ws = -2 if f % 4 in (1, 2) else 1
    # Flügel: gestufte Stein-Federlappen, 2 px, hoch/tief.
    for side, sx in ((-1, 1), (1, -1)):
        for i in range(3):
            x = 16 + side * (7 + i * 2)
            g.rect(min(x, x + sx * 4), cy - 10 + ws + i * 2, 4, 2, 5 if i % 2 else 6)
            g.line(16 + side * 5, cy - 5 + ws, x + sx * 2, cy - 10 + ws + i * 2, 8, 2)
    # Körper 12x10 + Kopf mit Hörnern.
    g.ellipse(16, cy, 6, 5, b)
    g.ellipse(15, cy - 1, 5, 4, l)
    g.rect(13, cy - 4, 2, 2, 6)
    g.rect(19, cy + 2, 2, 3, 4)
    g.rect(11, cy - 8, 10, 5, b)
    g.rect(11, cy - 8, 10, 1, 8)
    g.rect(10, cy - 10, 2, 2, 5)
    g.rect(20, cy - 10, 2, 2, 5)
    g.rect(13, cy - 6, 2, 2, 2)
    g.rect(17, cy - 6, 2, 2, 2)
    g.rect(14, cy - 4, 4, 1, 6)
    g.rect(14, cy - 3, 1, 1, 10)
    g.rect(17, cy - 3, 1, 1, 10)
    # Klauenfüße + Krallen, Schwanz.
    g.rect(11, cy + 5, 4, 4, d)
    g.rect(17, cy + 5, 4, 4, d)
    g.rect(10, cy + 9, 5, 1, 10)
    g.rect(17, cy + 9, 5, 1, 10)
    g.line(20, cy + 3, 26, cy + 6, 5, 2)
    g.rect(26, cy + 5, 2, 2, 6)
    return finish(g, [(13, cy - 6, 13), (14, cy - 6, 13),
                      (17, cy - 6, 13), (18, cy - 6, 13)])

def reaper_bat(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = R["void"]
    bob = [0, 1, 2, 1][f % 4]
    cy = 16 - bob
    ws = -2 if f % 4 in (1, 2) else 1
    # Sichelflügel: gestufte Membranfinger + Knochenkante.
    for side, sx in ((-1, 1), (1, -1)):
        for i in range(4):
            x = 16 + side * (5 + i * 2)
            g.rect(min(x, x + sx * 4), cy - 8 + ws + i * 2, 4, 2, 5 if i % 2 else 6)
        g.line(16 + side * 4, cy - 4 + ws, 16 + side * 13, cy - 12 + ws, 8, 2)
        g.put(16 + side * 13, cy - 13 + ws, 6)
    # Körper + Kopf mit Ohren.
    g.ellipse(16, cy + 2, 3, 5, b)
    g.rect(14, cy - 2, 2, 4, d)
    g.ellipse(16, cy - 5, 3, 3, b)
    g.rect(12, cy - 8, 2, 3, b)
    g.rect(19, cy - 8, 2, 3, b)
    g.rect(14, cy - 6, 2, 2, 2)
    g.rect(18, cy - 6, 2, 2, 2)
    g.rect(15, cy - 3, 1, 1, 11)
    g.rect(17, cy - 3, 1, 1, 11)
    # Gegabelter Schwanz.
    g.rect(15, cy + 7, 2, 3, d)
    g.rect(14, cy + 10, 2, 2, 5)
    g.rect(17, cy + 10, 2, 2, 5)
    return finish(g, [(14, cy - 6, 13), (15, cy - 6, 13),
                      (18, cy - 6, 13), (19, cy - 6, 13)], shade=False)

def abom(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = 23, 26, 27
    bob = [0, 1, 2, 1][f % 4]
    cy = 18 - bob
    g.ellipse(16, cy - 1, 9, 6, b)
    g.ellipse(9, cy - 6, 5, 3, 25)
    g.ellipse(23, cy - 6, 4, 3, 23)
    g.ellipse(16, cy - 8, 4, 3, b)
    g.rect(14, cy - 5, 6, 3, b)
    g.rect(10, cy - 4, 5, 3, l)
    g.rect(9, cy - 7, 3, 1, l)
    g.rect(16, cy - 10, 4, 1, l)
    g.rect(23, cy - 1, 3, 3, d)
    g.rect(14, cy + 3, 8, 1, 24)
    g.line(7, cy - 3, 2, cy + 5, 24, 3)
    g.line(26, cy - 3, 31, cy + 4, 24, 3)
    g.rect(1, cy + 6, 4, 3, 25)
    g.rect(2, cy + 8, 2, 1, 23)
    g.rect(29, cy + 5, 4, 3, 25)
    g.rect(30, cy + 7, 2, 1, 23)
    g.rect(19, cy - 3, 3, 1, 23)
    for yy in range(cy - 1, cy + 4, 2):
        g.rect(19, yy, 2, 1, 23)
    g.line(8, cy + 1, 11, cy + 3, 23, 1)
    for ex in (13, 16, 19):
        g.rect(ex, cy - 8, 2, 2, 2)
    g.rect(12, cy - 3, 9, 3, INK)
    for x in (13, 16, 19):
        g.rect(x, cy - 3, 2, 2, 11)
    off = [0, 2, 1, 0][f % 4]
    g.rect(8, cy + 5 + off, 4, 4, 24)
    g.rect(8, cy + 5 + off, 1, 4, 26)
    g.rect(20, cy + 5 + (2 - off), 4, 4, 24)
    g.rect(20, cy + 5 + (2 - off), 1, 4, 26)
    return finish(g, [(13, cy - 8, 13), (14, cy - 8, 13),
                      (16, cy - 8, 13), (17, cy - 8, 13),
                      (19, cy - 8, 13), (20, cy - 8, 13)])

def voidcaller(f: int) -> Grid:
    g = Grid(32, 32)
    d, b, l = 4, 6, 8
    bob = [0, 1, 2, 1][f % 4]
    top = 7 - bob
    sway = [0, 1, 0, -1][f % 4]
    for i, w in enumerate((9, 10, 12, 13, 15, 16, 17, 18, 18, 19, 19)):
        y = top + 8 + i
        sx = 16 - w // 2 + (sway if i > 4 else 0)
        g.rect(sx, y, w, 1, b)
        g.rect(sx, y, 3, 1, l)
        g.put(sx + 3, y, 8)
        g.put(sx, y, 9)
        g.rect(sx + w - 3, y, 3, 1, d)
    for x in (8, 13, 19, 24):
        g.rect(x, top + 15, 2, 3, 4)
        g.rect(x, top + 15, 1, 3, 7)
    g.ellipse(16, top + 3, 6, 5, b)
    g.rect(12, top + 6, 9, 2, d)
    g.rect(11, top + 1, 3, 4, l)
    g.rect(13, top + 1, 8, 1, 9)
    g.rect(11, top + 1, 1, 4, 9)
    g.ellipse(16, top + 4, 4, 3, 2)
    g.rect(13, top + 3, 2, 2, 9)
    g.rect(18, top + 2, 2, 2, 9)
    g.put(13, top + 3, 13)
    g.put(18, top + 2, 13)
    g.rect(14, top + 4, 2, 2, 2)
    g.rect(18, top + 4, 2, 2, 2)
    g.rect(14, top + 4, 2, 1, 13)
    g.rect(18, top + 4, 2, 1, 13)
    g.ellipse_ring(16, top - 2, 6, 3, 7)
    g.rect(13, top - 2, 3, 1, 9)
    g.line(11, top + 10, 4, top + 14, 6, 2)
    g.line(21, top + 10, 28, top + 14, 6, 2)
    g.rect(2, top + 14, 3, 3, 9)
    g.rect(27, top + 14, 3, 3, 9)
    g.put(3, top + 14, 13)
    g.put(28, top + 14, 13)
    g.rect(10, top + 12, 13, 1, 4)
    g.rect(15, top + 11, 2, 2, 20)
    return finish(g, [(14, top + 4, 13), (18, top + 4, 13), (3, top + 14, 13), (28, top + 14, 13)],
                  shade=False, dark_edge=9)

# ── Registry ────────────────────────────────────────────────────────────────
TIER = {
    "bog_rat": 0, "wisp": 0, "mudling": 0, "crow": 0, "bogzombie": 0, "toad": 0,
    "skeleton": 1, "bat": 1, "ghoul": 1, "witchling": 1, "slime": 1, "scarecrow": 1,
    "wolf": 2, "banshee": 2, "golem": 2, "spider": 2, "cultist": 2, "bomber": 2,
    "knight": 3, "harpy": 3, "lich": 3, "wraith": 3, "treant": 3, "imp": 3,
    "horror": 4, "centipede": 4, "gargoyle": 4, "reaper_bat": 4, "abom": 4, "voidcaller": 4,
}

DRAW = {
    "bog_rat": bog_rat, "wisp": wisp, "mudling": mudling, "crow": crow,
    "bogzombie": bogzombie, "toad": toad, "skeleton": skeleton, "bat": bat,
    "ghoul": ghoul, "witchling": witchling, "slime": slime, "scarecrow": scarecrow,
    "wolf": wolf, "banshee": banshee, "golem": golem, "spider": spider,
    "cultist": cultist, "bomber": bomber, "knight": knight, "harpy": harpy,
    "lich": lich, "wraith": wraith, "treant": treant, "imp": imp,
    "horror": horror, "centipede": centipede, "gargoyle": gargoyle,
    "reaper_bat": reaper_bat, "abom": abom, "voidcaller": voidcaller,
}


def frames_for(eid: str) -> int:
    return 2 if TIER[eid] <= 1 else 4


def build() -> dict[str, list[Grid]]:
    sprites: dict[str, list[Grid]] = {}
    for eid, fn in DRAW.items():
        size = TIER_SIZE[TIER[eid]]
        frames = [pad_grid(fn(i), size, size) for i in range(frames_for(eid))]
        sprites[f"enemy_{eid}"] = frames
    return sprites


def build_reference() -> dict[str, list[Grid]]:
    return {"enemy_wisp": build()["enemy_wisp"]}


if __name__ == "__main__":
    data = build()
    path = emit_ts(
        "gen-enemies.ts", "GEN_ENEMIES", data,
        "30 Gegner (16–32 px nach Tier, 2–4 Lauf-Frames)",
    )
    print("wrote", path, len(data), "keys")
    for eid in DRAW:
        key = f"enemy_{eid}"
        save_grid_png(data[key][0], os.path.join(SHOTS, f"m4-enemy-{eid}.png"), scale=8)
    # Übersichten pro Tier (alle Frames nebeneinander).
    for tier in range(5):
        keys = [f"enemy_{e}" for e, t in TIER.items() if t == tier]
        grids = []
        for k in keys:
            grids.extend(data[k])
        save_sheet_png(grids, os.path.join(SHOTS, f"m4-sheet-enemies-t{tier}.png"), scale=6)
    print("sheets + single shots written")
