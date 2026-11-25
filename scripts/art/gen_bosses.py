#!/usr/bin/env python3
"""6 Boss-Sprites (48–96 px), je 3 Frames: Ruhe, Atmen, Wind-up.

Wind-up passt zu den Mechaniken aus src/logic/bosses.ts (Sprung, Beschwörung,
Sichel, Stampfer, Feuerkreuz, Dornenring). Paletten-Rampen, 1-px-Kontur,
Licht oben-links, gruppierte Details.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, emit_ts, save_grid_png, save_sheet_png, SHOTS  # noqa: E402

INK = 0
EYE = 13

BOSS_SIZE = {
    "moor_queen": 56,
    "bone_lord": 64,
    "pale_shepherd": 72,
    "bell_golem": 80,
    "coven": 96,
    "hollow_king": 96,
}


def finish(g: Grid, details=None, band=2) -> Grid:
    g = shade_edges(g, band=band)
    if details:
        for x, y, c in details:
            g.put(x, y, c)
    return outline(g)


# ── 1 Moorkönigin (Riesenkröte, 56) ─────────────────────────────────────────
def moor_queen(f: int) -> Grid:
    g = Grid(56, 56)
    S = 56
    cx = 28
    squash = 3 if f == 2 else 0
    bob = 1 if f == 1 else 0
    cy = 36 + squash - bob
    # Hinterbeine (Schenkel).
    g.ellipse(11, 44 + squash, 9, 7, 29)
    g.ellipse(45, 44 + squash, 9, 7, 29)
    g.rect(8, 48 + squash, 4, 2, 30)
    g.rect(44, 48 + squash, 4, 2, 30)
    # Körper.
    g.ellipse(cx, cy, 20, 13, 30)
    g.ellipse(cx, cy - 2, 17, 10, 31)
    g.ellipse(cx, cy + 4, 13, 6, 31)      # Bauch
    # Warzen (2x2 gruppiert).
    for x, y in ((14, 28), (39, 27), (18, 34), (43, 35), (24, 24), (34, 24)):
        g.rect(x, y - bob, 2, 2, 28)
        g.put(x, y - bob, 29)
    # Kopfbereich: Augen-Hügel.
    g.ellipse(16, 24 - bob, 6, 5, 30)
    g.ellipse(40, 24 - bob, 6, 5, 30)
    g.ellipse(16, 23 - bob, 4, 3, 31)
    g.ellipse(40, 23 - bob, 4, 3, 31)
    # Augen (groß, golden).
    for ex in (16, 40):
        g.ellipse(ex, 22 - bob, 3, 3, INK)
        g.ellipse(ex, 22 - bob, 2, 2, 20)
        g.put(ex, 22 - bob, 0)
        g.put(ex - 1, 21 - bob, 22)
    # Mund, breit und zahnig.
    g.rect(13, 29 - bob, 30, 2, INK)
    for x in range(15, 42, 5):
        g.rect(x, 29 - bob, 2, 2, 11)
    g.put(13, 28 - bob, 28)
    g.put(42, 28 - bob, 28)
    # Krone.
    crown_y = 12 - bob + squash
    g.rect(19, crown_y + 3, 18, 2, 20)
    g.rect(19, crown_y + 3, 18, 1, 21)
    for x in (19, 26, 33):
        g.rect(x, crown_y, 3, 4, 20)
        g.put(x, crown_y, 21)
    g.put(21, crown_y + 4, 22)
    g.put(30, crown_y + 4, 22)
    # Vorderfüße.
    g.rect(9, 50 + squash, 5, 3, 29)
    g.rect(42, 50 + squash, 5, 3, 29)
    g.put(9, 52 + squash, 28)
    g.put(46, 52 + squash, 28)
    # Gift-Tropfen an der Wange.
    g.put(11, 30 - bob, 17)
    g.put(45, 31 - bob, 17)
    return finish(g, [(ex, 22 - bob, 0) for ex in (16, 40)] +
                  [(16, 21 - bob, 22), (40, 21 - bob, 22)])


# ── 2 Knochenfürst (64) ─────────────────────────────────────────────────────
def bone_lord(f: int) -> Grid:
    g = Grid(64, 64)
    cx = 32
    bob = 1 if f == 1 else 0
    arm_up = 10 if f == 2 else 0
    # Cape als eine rote Fläche, Saum ausgefranst.
    for i, w in enumerate((30, 32, 34, 36, 38, 40, 40)):
        g.rect(cx - w // 2, 30 + i - bob, w, 1, 24)
    for x in range(cx - 19, cx + 20, 9):
        g.rect(x, 36 - bob, 2, 2, None)
    g.put(cx - 19, 31 - bob, 25)
    g.put(cx + 17, 33 - bob, 23)
    # Beine (Knochen).
    g.rect(cx - 9, 48, 4, 12, 10)
    g.rect(cx + 5, 48, 4, 12, 10)
    g.rect(cx - 10, 58, 7, 3, 10)
    g.rect(cx + 3, 58, 7, 3, 10)
    # Becken + Wirbelsäule.
    g.ellipse(cx, 47, 9, 4, 10)
    g.vline(cx, 32 - bob, 45, 11)
    # Rippen.
    for i, y in enumerate(range(34, 45, 3)):
        w = 11 - i
        g.hline(cx - w, cx + w, y - bob, 10)
        g.put(cx - w, y - bob, 11)
    # Arme.
    g.rect(cx - 18, 30 - bob, 5, 13, 10)      # Arm mit Bumerang
    g.rect(cx + 13, 30 - bob - arm_up, 5, 13 + (arm_up // 2), 10)
    g.put(cx - 18, 30 - bob, 11)
    g.put(cx + 14, 30 - bob - arm_up, 11)
    if f == 2:                          # Wind-up: 2x2-Glut in der erhobenen Hand
        g.rect(cx + 14, 28 - bob - arm_up, 3, 3, 20)
        g.rect(cx + 15, 28 - bob - arm_up, 2, 2, 13)
    # Knochen-Bumerang (linke Hand).
    g.line(cx - 26, 40 - bob, cx - 22, 33 - bob, 11, 2)
    g.line(cx - 22, 33 - bob, cx - 18, 39 - bob, 11, 2)
    g.put(cx - 26, 41 - bob, 10)
    g.put(cx - 19, 40 - bob, 10)
    # Schulterpanzer.
    g.ellipse(cx - 16, 28 - bob, 6, 4, 5)
    g.ellipse(cx + 16, 28 - bob, 6, 4, 5)
    g.put(cx - 20, 27 - bob, 7)
    g.put(cx + 13, 27 - bob, 7)
    g.put(cx - 16, 26 - bob, 7)
    g.put(cx + 16, 26 - bob, 7)
    # Schädel.
    g.ellipse(cx, 17 - bob, 9, 8, 10)
    g.rect(cx - 7, 24 - bob, 14, 4, 10)
    g.rect(cx - 7, 27 - bob, 14, 1, 5)
    g.rect(cx - 6, 19 - bob, 4, 4, INK)       # Augenhöhlen
    g.rect(cx + 2, 19 - bob, 4, 4, INK)
    g.put(cx - 5, 19 - bob, 25)
    g.put(cx + 3, 19 - bob, 25)
    g.put(cx - 2, 23 - bob, INK)              # Nase
    g.rect(cx - 4, 25 - bob, 8, 1, INK)       # Zähne
    for x in (cx - 4, cx - 1, cx + 2):
        g.put(x, 25 - bob, 11)
    # Krone.
    g.rect(cx - 8, 9 - bob, 16, 3, 20)
    g.rect(cx - 8, 9 - bob, 16, 1, 21)
    for x in (cx - 8, cx - 3, cx + 2, cx + 5):
        g.rect(x, 5 - bob, 3, 4, 20)
        g.put(x, 5 - bob, 21)
    g.put(cx - 7, 10 - bob, 22)
    g.put(cx, 10 - bob, 22)
    # Gürtel/Knochen.
    g.rect(cx - 7, 44 - bob, 14, 2, 4)
    g.put(cx - 3, 45 - bob, 20)
    g.put(cx, 45 - bob, 21)
    return finish(g, [(cx - 5, 19 - bob, 25), (cx + 3, 19 - bob, 25),
                      (cx - 4, 25 - bob, 11), (cx - 1, 25 - bob, 11), (cx + 2, 25 - bob, 11)])


# ── 3 Der Fahle Hirte (72) ─────────────────────────────────────────────────
def pale_shepherd(f: int) -> Grid:
    g = Grid(72, 72)
    cx = 36
    bob = 1 if f == 1 else 0
    raise_scythe = 14 if f == 2 else 0
    # Robe: langes Trapez vom Umhang bis zum Saum (30..63) mit drei echten
    # Nacht-Bändern (10/9 Licht links, 8 Basis, 6/5 Schatten rechts).
    for i in range(34):
        y = 30 + i - bob
        w = 26 + int(i * 0.45)
        if w % 2:
            w += 1
        x0 = cx - w // 2
        g.rect(x0, y, w, 1, 8)
        g.rect(x0, y, 3, 1, 10)          # Licht nur auf den linken 3 px
        g.rect(cx + w // 2 - 3, y, 3, 1, 6)
        g.rect(cx + w // 2 - 1, y, 1, 1, 5)
    # Nur drei ausgestellte Keilfalten im Unterteil (oben 1 px, unten 3 px):
    # sie laufen mit der Trapezform nach aussen, keine Full-height-Streifen.
    for fx, drift, top, length in ((-13, -2, 40, 23), (0, 0, 38, 25), (12, 2, 43, 20)):
        for j in range(length):
            y = top + j - bob
            wid = 1 + (2 * j) // (length - 1)
            xx = cx + fx + (drift * j) // (length - 1)
            g.rect(xx, y, wid, 1, 6)
            g.put(xx - 1, y, 9)
            g.put(xx + wid, y, 5)
    # Kurze Nachtfalte rechts als Tiefe.
    g.rect(cx + 6, 48 - bob, 2, 15, 3)
    g.put(cx + 6, 48 - bob, 4)
    # Ausgefranster Saum (2–3 px Zacken, keine gerade Kante).
    for x in range(cx - 19, cx + 20, 3):
        g.rect(x, 63 - bob, 2, 2, 8)
        g.put(x, 64 - bob, 5)
    # Schulterumhang mit Lichtkante.
    g.rect(cx - 14, 30 - bob, 29, 3, 8)
    g.rect(cx - 14, 30 - bob, 29, 1, 10)
    g.rect(cx + 10, 31 - bob, 6, 1, 6)
    # Kapuze: Randlicht links, Gesichtsleere 2, Glutaugen.
    g.ellipse(cx, 24 - bob, 11, 10, 6)
    g.ellipse(cx - 2, 23 - bob, 9, 8, 8)
    g.rect(cx - 9, 20 - bob, 3, 7, 10)
    g.rect(cx - 6, 17 - bob, 6, 1, 9)
    g.ellipse(cx, 26 - bob, 7, 6, 3)
    g.ellipse(cx, 27 - bob, 5, 4, 2)         # Tiefe 2, kein schwarzes Loch
    g.rect(cx - 6, 23 - bob, 2, 2, 13)       # Glutaugen 2x2
    g.rect(cx + 4, 23 - bob, 2, 2, 13)
    g.rect(cx - 7, 23 - bob, 1, 2, 2)        # Sockel
    g.rect(cx + 6, 23 - bob, 1, 2, 2)
    # Breitkrempiger Hut (3 Bänder).
    g.rect(cx - 20, 12 - bob, 40, 3, 5)
    g.rect(cx - 20, 12 - bob, 40, 1, 7)
    g.rect(cx - 20, 14 - bob, 40, 1, 3)
    g.rect(cx - 8, 4 - bob, 17, 9, 5)
    g.rect(cx - 8, 4 - bob, 5, 9, 6)
    g.rect(cx - 8, 4 - bob, 2, 2, 8)
    g.rect(cx + 5, 6 - bob, 4, 7, 3)
    g.rect(cx - 11, 15 - bob, 22, 1, 1)      # Krempenschatten
    # Linker Arm hängt.
    g.rect(cx - 18, 34 - bob, 5, 16, 8)
    g.rect(cx - 18, 34 - bob, 2, 16, 10)
    g.rect(cx - 19, 50 - bob, 7, 4, 6)
    g.rect(cx - 19, 50 - bob, 7, 1, 8)
    if raise_scythe:
        # Wind-up: Arm angewinkelt (Schulter -> Ellbogen -> Hand) und Sichel
        # quer ueber dem Kopf. Klar andere Silhouette als Ruheframe.
        g.line(cx + 13, 32 - bob, cx + 24, 24 - bob, 8, 3)
        g.line(cx + 13, 32 - bob, cx + 23, 25 - bob, 10, 1)
        g.line(cx + 24, 24 - bob, cx + 27, 19 - bob, 8, 3)
        g.rect(cx + 25, 18 - bob, 5, 5, 8)
        g.rect(cx + 25, 18 - bob, 2, 5, 10)
        g.put(cx + 28, 20 - bob, 14)                 # Handschatten
        # Schaft senkrecht, Klinge nach links ueber den Hut.
        g.rect(cx + 26, 7 - bob, 2, 14, 16)
        g.rect(cx + 26, 7 - bob, 1, 14, 17)
        g.rect(cx + 25, 19 - bob, 4, 3, 17)
        g.line(cx + 26, 8 - bob, cx + 14, 4 - bob, 11, 3)
        g.line(cx + 14, 4 - bob, cx + 7, 9 - bob, 11, 3)
        g.line(cx + 7, 9 - bob, cx + 6, 16 - bob, 10, 3)
        g.line(cx + 25, 7 - bob, cx + 14, 3 - bob, 12, 1)
        g.line(cx + 13, 3 - bob, cx + 7, 8 - bob, 12, 1)
        g.rect(cx + 4, 11 - bob, 3, 2, 12)
        # Windstriche hinter der Klinge (2 px, Palette 10/12).
        g.rect(cx + 30, 10 - bob, 4, 2, 10)
        g.rect(cx + 31, 13 - bob, 3, 2, 9)
    else:
        g.rect(cx + 16, 32 - bob, 5, 14, 8)
        g.rect(cx + 16, 32 - bob, 2, 14, 10)
        g.rect(cx + 17, 45 - bob, 7, 4, 6)
        g.rect(cx + 17, 45 - bob, 7, 1, 8)
        # Sichel: 2-px-Schaft MIT Handkontakt, dreistufige 2-px-Klinge.
        sx = cx + 19
        sy = 8 - bob
        g.rect(sx, sy, 2, 54, 16)
        g.rect(sx, sy, 1, 54, 17)
        g.rect(sx - 1, sy + 48, 4, 3, 17)
        ty = sy + 3
        # Gefuellter Halbmond: 3-px-Band in 11, helle Aussenkante 12,
        # dunkle Innenkante 5 -> 3 Schattierungsstufen, kein 1-px-Haken.
        g.line(sx - 1, ty, sx - 10, ty + 3, 11, 2)
        g.line(sx - 10, ty + 3, sx - 15, ty + 10, 11, 2)
        g.line(sx - 15, ty + 10, sx - 14, ty + 17, 11, 2)
        g.line(sx - 3, ty + 2, sx - 11, ty + 5, 5, 1)   # dunkle Innenseite
        g.line(sx - 11, ty + 5, sx - 14, ty + 12, 5, 1)
        g.line(sx - 2, ty - 1, sx - 10, ty + 2, 12, 1)  # Aussenkante Licht
        g.line(sx - 10, ty + 2, sx - 15, ty + 9, 12, 1)
        g.rect(sx - 16, ty + 12, 2, 3, 12)
    # Füße (2 px Kontur, 3 Stufen).
    g.rect(cx - 10, 66 - bob, 8, 4, 6)
    g.rect(cx - 10, 66 - bob, 8, 1, 8)
    g.rect(cx + 2, 66 - bob, 8, 4, 6)
    g.rect(cx + 2, 66 - bob, 8, 1, 8)
    return finish(g, [(cx - 6, 23 - bob, 13), (cx - 5, 23 - bob, 13), (cx - 6, 24 - bob, 13), (cx - 5, 24 - bob, 13), (cx + 4, 23 - bob, 13), (cx + 5, 23 - bob, 13), (cx + 4, 24 - bob, 13), (cx + 5, 24 - bob, 13)])


def bell_golem(f: int) -> Grid:
    g = Grid(80, 80)
    cx = 40
    bob = 1 if f == 1 else 0
    arms_up = 12 if f == 2 else 0
    # Beine + Füße (Stein, Basis 6 statt fast-schwarz).
    g.rect(cx - 17, 60, 10, 14, 6)
    g.rect(cx + 7, 60, 10, 14, 6)
    g.rect(cx - 20, 70, 14, 6, 6)
    g.rect(cx + 6, 70, 14, 6, 6)
    g.rect(cx - 20, 70, 14, 1, 8)
    g.put(cx - 17, 60, 8)
    g.put(cx + 7, 60, 8)
    # Steinkörper (Hüfte/Bauch) unter der Glocke.
    g.ellipse(cx, 56 - bob, 18, 8, 6)
    g.ellipse(cx - 8, 53 - bob, 9, 5, 8)
    g.put(cx + 8, 54 - bob, 7)
    # Glocke als Brustkorb: schmale Krone, 18 Reihen Aufweitung, dunkler Saum.
    by = 24 - bob
    g.rect(cx - 9, by, 19, 2, 5)
    g.rect(cx - 9, by, 19, 1, 7)
    widths = (11, 13, 16, 19, 22, 24, 26, 28, 29, 30, 31, 31, 32, 32, 32, 32, 32, 32)
    for i, w in enumerate(widths):
        y = by + 2 + i
        g.rect(cx - w // 2, y, w, 1, 20)
        for x in range(cx - w // 2, cx + w // 2):
            if x < cx - 9:
                g.put(x, y, 22)
            elif x < cx - 5:
                g.put(x, y, 21)
            elif x > cx + 9:
                g.put(x, y, 16)
            elif x > cx + 5:
                g.put(x, y, 17)
    g.rect(cx - 12, by + 3, 25, 2, 17)        # Messingband
    g.rect(cx - 12, by + 3, 25, 1, 20)
    g.rect(cx - 16, by + 20, 33, 2, 20)       # Saum
    g.rect(cx - 16, by + 20, 33, 1, 22)
    g.rect(cx - 17, by + 22, 35, 3, 17)       # Lippe dunkel
    g.rect(cx - 17, by + 24, 35, 1, 16)
    g.rect(cx - 2, by + 22, 5, 4, 5)          # Klöppel
    g.ellipse(cx, by + 27, 3, 3, 6)
    g.put(cx - 1, by + 26, 8)
    # Risse / Moos.
    g.line(cx - 8, by + 6, cx - 4, by + 13, 17)
    g.line(cx + 7, by + 7, cx + 10, by + 14, 17)
    g.rect(cx - 14, by + 8, 2, 2, 30)
    g.rect(cx + 12, by + 9, 2, 2, 31)
    g.rect(cx - 18, 52 - bob, 3, 2, 30)
    g.rect(cx + 15, 55 - bob, 3, 2, 31)
    # Arme + Fäuste.
    g.rect(cx - 30, 36 - bob - arms_up, 9, 24, 6)
    g.rect(cx + 21, 36 - bob - arms_up, 9, 24, 6)
    g.rect(cx - 30, 36 - bob - arms_up, 3, 24, 8)
    g.rect(cx + 21, 36 - bob - arms_up, 3, 24, 8)
    g.ellipse(cx - 26, 60 - bob - arms_up, 8, 7, 6)
    g.ellipse(cx + 26, 60 - bob - arms_up, 8, 7, 6)
    g.put(cx - 32, 58 - bob - arms_up, 8)
    g.put(cx + 23, 58 - bob - arms_up, 8)
    # Hals: verbindet Kopf und Glockenkrone.
    g.rect(cx - 4, 20 - bob, 8, 8, 6)
    g.rect(cx - 4, 20 - bob, 2, 8, 8)
    # Kopf (steinern) mit Glutaugen.
    g.ellipse(cx, 15 - bob, 8, 7, 6)
    g.rect(cx - 6, 18 - bob, 13, 3, 5)
    g.put(cx - 4, 14 - bob, 13)
    g.put(cx + 3, 14 - bob, 13)
    g.put(cx - 4, 13 - bob, 12)
    g.put(cx + 3, 13 - bob, 12)
    g.put(cx, 17 - bob, 4)
    return finish(g, [(cx - 4, 14 - bob, 13), (cx + 3, 14 - bob, 13)])



def _witch(g: Grid, cx: int, base_y: int, h: float, raise_arms: bool):
    """Eine Hexe: eine Robe-Fläche, Kapuze, Hut, Arme, Feuer in der Hand."""
    bw = max(8, int(14 * h))
    top = base_y - int(36 * h)
    # Robe als zusammenhängende Fläche.
    for y in range(top + 14, base_y):
        t = (y - top - 14) / max(1, base_y - top - 14)
        w = int(bw * (0.75 + 0.55 * t))
        g.rect(cx - w // 2, y, w, 1, 25)
    # Kragen.
    g.rect(cx - bw // 2, top + 12, bw, 3, 26)
    g.put(cx - bw // 2, top + 12, 27)
    # Kapuze + Gesicht.
    g.ellipse(cx, top + 8, max(3, int(4.5 * h)), max(3, int(4.5 * h)), 9)
    g.rect(cx - int(5 * h), top + 4, int(10 * h), 3, 23)
    g.put(cx - 2, top + 8, 20)
    g.put(cx + 2, top + 8, 20)
    # Hut.
    g.rect(cx - int(8 * h), top + 2, int(17 * h), 2, 24)
    g.put(cx - int(8 * h), top + 2, 26)
    g.rect(cx - int(5 * h), top - 4, int(10 * h), 4, 25)
    g.put(cx - int(5 * h), top - 4, 26)
    g.put(cx + int(4 * h), top - 3, 23)
    g.put(cx, top - 5, 27)
    # Arme.
    arm_y = top + 12
    if raise_arms:
        g.line(cx - bw // 2, arm_y, cx - bw - 5, top + 2, 23, 2)
        g.line(cx + bw // 2, arm_y, cx + bw + 4, top + 2, 23, 2)
        hand_l = (cx - bw - 6, top + 1)
        hand_r = (cx + bw + 4, top + 1)
    else:
        g.line(cx - bw // 2, arm_y, cx - bw - 4, top + 20, 23, 2)
        g.line(cx + bw // 2, arm_y, cx + bw + 3, top + 20, 23, 2)
        hand_l = (cx - bw - 4, top + 20)
        hand_r = (cx + bw + 2, top + 20)
    for hx, hy in (hand_l, hand_r):
        g.rect(hx, hy, 3, 3, 9)
    # Flamme in einer Hand.
    fx, fy = hand_r
    g.ellipse(fx, fy - 4, 3, 3, 18)
    g.ellipse(fx, fy - 4, 2, 2, 20)
    g.put(fx, fy - 4, 22)
    g.put(fx, fy - 5, 13)
    # Besenstiel am Rücken.
    g.vline(cx + bw + 7, top + 10, base_y - 4, 5)


def coven(f: int) -> Grid:
    g = Grid(96, 96)
    bob = 1 if f == 1 else 0
    raise_arms = f == 2
    _witch(g, 24, 88 - bob, 0.9, raise_arms)
    _witch(g, 72, 88 - bob, 0.9, raise_arms)
    _witch(g, 48, 80 - bob, 1.15, raise_arms)
    # Feuerkreis: gruppierte 2x2-Kerne.
    for x, y in ((48, 30), (18, 52), (78, 52)):
        g.ellipse(x, y - bob, 4, 4, 18)
        g.ellipse(x, y - bob, 2, 2, 21)
        g.rect(x - 1, y - 1 - bob, 2, 2, 22)
        g.put(x - 1, y - 1 - bob, 13)
    if raise_arms:
        # Kreuzende Feuerstrahlen (nur Wirkphase).
        g.line(18, 50 - bob, 78, 62 - bob, 26, 2)
        g.line(78, 50 - bob, 18, 62 - bob, 26, 2)
    return finish(g, [(48, 30 - bob, 13), (18, 52 - bob, 13), (78, 52 - bob, 13)])



def hollow_king(f: int) -> Grid:
    g = Grid(96, 96)
    cx = 48
    bob = 1 if f == 1 else 0
    phase2 = f == 2
    # Cape als eine Fläche.
    for y in range(40, 82):
        t = (y - 40) / 42
        w = int(40 + t * 22)
        g.rect(cx - w // 2, y - bob, w, 1, 24)
    # Rüstungsbeine (Basis 6, nicht near-black).
    g.rect(cx - 15, 66, 11, 18, 6)
    g.rect(cx + 4, 66, 11, 18, 6)
    g.rect(cx - 17, 80, 15, 5, 5)
    g.rect(cx + 2, 80, 15, 5, 5)
    g.put(cx - 17, 80, 7)
    g.put(cx + 3, 80, 7)
    # Rüstungstorso.
    g.rect(cx - 20, 34 - bob, 41, 32, 6)
    g.rect(cx - 20, 34 - bob, 6, 32, 7)
    g.rect(cx + 15, 34 - bob, 6, 32, 4)
    g.rect(cx - 20, 34 - bob, 41, 2, 7)
    g.rect(cx - 14, 62 - bob, 29, 3, 5)      # Gürtel
    g.put(cx - 14, 62 - bob, 20)
    # Hohlraum mit Rippen + Glut (Herz).
    g.rect(cx - 9, 42 - bob, 19, 17, 4)
    g.rect(cx - 9, 42 - bob, 19, 2, 5)
    g.rect(cx - 9, 57 - bob, 19, 2, 3)
    for y in range(45, 58, 3):
        g.hline(cx - 8, cx + 8, y - bob, 6)
        g.hline(cx - 8, cx + 8, y + 1 - bob, 3)
        g.put(cx - 8, y - bob, 7)
        g.put(cx + 8, y - bob, 7)
    g.put(cx, 51 - bob, 13)
    g.put(cx - 1, 53 - bob, 13)
    g.put(cx + 1, 53 - bob, 13)
    g.put(cx - 4, 55 - bob, 9)
    # Schulterplatten + Spikes.
    g.ellipse(cx - 24, 34 - bob, 9, 6, 6)
    g.ellipse(cx + 24, 34 - bob, 9, 6, 6)
    g.put(cx - 30, 33 - bob, 7)
    g.put(cx + 22, 33 - bob, 7)
    for x in (cx - 31, cx - 27, cx + 23, cx + 27):
        g.rect(x, 27 - bob, 3, 6, 5)
        g.put(x, 27 - bob, 7)
    # Arme.
    g.rect(cx - 30, 38 - bob, 8, 24, 6)
    g.rect(cx + 22, 38 - bob, 8, 24, 6)
    g.rect(cx - 30, 38 - bob, 3, 24, 7)
    g.rect(cx + 22, 38 - bob, 3, 24, 7)
    g.rect(cx - 30, 61 - bob, 8, 5, 5)
    g.rect(cx + 22, 61 - bob, 8, 5, 5)
    # Helm.
    g.ellipse(cx, 22 - bob, 13, 11, 6)
    g.rect(cx - 13, 26 - bob, 27, 8, 6)
    g.rect(cx - 9, 22 - bob, 19, 8, 2)
    g.put(cx - 6, 25 - bob, 13)
    g.put(cx + 5, 25 - bob, 13)
    g.put(cx - 6, 26 - bob, 9)
    g.put(cx + 5, 26 - bob, 9)
    g.rect(cx - 13, 26 - bob, 27, 1, 7)
    # Dornenkrone.
    g.rect(cx - 12, 10 - bob, 25, 3, 20)
    g.rect(cx - 12, 10 - bob, 25, 1, 21)
    for x in (cx - 12, cx - 6, cx + 3, cx + 9):
        g.rect(x, 5 - bob, 3, 5, 20)
        g.put(x, 5 - bob, 21)
    # Schwert: 3-px-Klinge mit Lichtkante, Griff sitzt in der Faust.
    g.rect(cx + 25, 14 - bob, 3, 44, 8)      # Klinge
    g.rect(cx + 25, 14 - bob, 1, 44, 9)      # Lichtkante links
    g.rect(cx + 27, 14 - bob, 1, 44, 6)      # Schatten rechts
    g.rect(cx + 21, 55 - bob, 11, 3, 20)     # Parierstange
    g.rect(cx + 25, 58 - bob, 3, 9, 16)      # Griff (in der Faust)
    g.rect(cx + 24, 66 - bob, 5, 2, 20)      # Knauf
    g.rect(cx + 26, 13 - bob, 1, 2, 13)      # Spitzen-Glut
    # Phase 2: Dornenring-Andeutung um den König.
    if phase2:
        g.ellipse_ring(cx, 56 - bob, 36, 16, 24)
        for i in range(12):
            import math
            a = i / 12 * math.pi * 2
            x = int(cx + math.cos(a) * 36)
            y = int(56 - bob + math.sin(a) * 16)
            g.put(x, y - 1, 26)
    return finish(g, [(cx, 51 - bob, 13), (cx - 1, 53 - bob, 13), (cx + 1, 53 - bob, 13),
                      (cx - 6, 25 - bob, 13), (cx + 5, 25 - bob, 13)])



DRAW = {
    "moor_queen": moor_queen,
    "bone_lord": bone_lord,
    "pale_shepherd": pale_shepherd,
    "bell_golem": bell_golem,
    "coven": coven,
    "hollow_king": hollow_king,
}


def build() -> dict[str, list[Grid]]:
    out: dict[str, list[Grid]] = {}
    for bid, fn in DRAW.items():
        out[f"boss_{bid}"] = [fn(i) for i in range(3)]
    return out


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-bosses.ts", "GEN_BOSSES", data, "6 Bosse (48–96 px, Ruhe/Atmen/Wind-up)")
    print("wrote", path, len(data), "keys")
    for bid in DRAW:
        save_grid_png(data[f"boss_{bid}"][0], os.path.join(SHOTS, f"m4-boss-{bid}.png"), scale=4)
    save_sheet_png([data[f"boss_{bid}"][0] for bid in DRAW],
                   os.path.join(SHOTS, "m4-sheet-bosses.png"), scale=3)
    print("boss shots written")
