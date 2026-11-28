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


def eye_glow(ex: int, ey: int, f: int):
    """Glut-Auge: F0 gedämpft (2x2 Bernstein 20), F1/F2 13-Kern + 22-Rand.

    Wird als Detail nach dem Shading aufgetragen, damit 13/22/20 exakte
    Palettenwerte bleiben.
    """
    if f >= 1:
        return [
            (ex, ey, 13), (ex + 1, ey, 13), (ex, ey + 1, 13), (ex + 1, ey + 1, 13),
            (ex - 1, ey, 22), (ex - 1, ey + 1, 22), (ex + 2, ey, 22), (ex + 2, ey + 1, 22),
            (ex, ey - 1, 22), (ex + 1, ey - 1, 22), (ex, ey + 2, 22), (ex + 1, ey + 2, 22),
        ]
    return [(ex, ey, 20), (ex + 1, ey, 20), (ex, ey + 1, 20), (ex + 1, ey + 1, 20), (ex, ey, 22)]


# ── 1 Moorkönigin (Riesenkröte, 56) ─────────────────────────────────────────
def moor_queen(f: int) -> Grid:
    g = Grid(56, 56)
    S = 56
    cx = 28
    squash = 6 if f == 2 else 0
    bob = 2 if f == 1 else 0
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
    # Augen: dunkle Höhle 2; Glut-Auge als Detail nach dem Shading.
    for ex in (16, 40):
        g.ellipse(ex, 22 - bob, 3, 3, 2)
    # Mund, breit und zahnig — Zaehne als unregelmaessige Bloecke mit Luecke.
    g.rect(13, 29 - bob, 30, 2, 2)
    for x, w in ((15, 2), (19, 3), (25, 2), (29, 3), (34, 2), (38, 2)):
        g.rect(x, 29 - bob, w, 2, 11)
    g.put(13, 28 - bob, 28)
    g.put(42, 28 - bob, 28)
    # Krone: sitzt MIT Kontakt auf dem Kopf — Band läuft bis in die
    # Kopf-Huegel, Bruecke ueber der Schaedelmitte schliesst die Luecke.
    crown_y = 13  # fix am Kopf (nicht am Atem-Bob) — Idle-Versatz-Kontrakt
    g.rect(17, crown_y + 4, 22, 3, 20)
    g.rect(17, crown_y + 4, 22, 1, 21)
    g.rect(22, crown_y + 7, 13, 2, 30)      # Schaedel-Bruecke (Kontaktband)
    g.put(22, crown_y + 7, 29)
    g.put(34, crown_y + 8, 29)
    for x in (17, 24, 31):
        g.rect(x, crown_y - 1, 4, 6, 20)
        g.put(x, crown_y - 1, 21)
        g.put(x + 2, crown_y - 1, 22)
    g.put(27, crown_y + 4, 13)   # Juwel der Krone
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
    details = []
    for ex in (16, 40):
        details += eye_glow(ex - 1, 21 - bob, f)
    return finish(g, details)


# ── 2 Knochenfürst (64) ─────────────────────────────────────────────────────
def bone_lord(f: int) -> Grid:
    g = Grid(64, 64)
    cx = 32
    bob = 2 if f == 1 else 0
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
    # Rippen: unregelmaessige Bandrasten mit Bruechen (keine Candy-Stripes).
    for y, w in ((34, 11), (36, 8), (40, 12), (44, 7)):
        g.hline(cx - w, cx + w, y - bob, 10)
        g.put(cx - w, y - bob, 11)
        g.put(cx + w - 2, y - bob, 24)        # Bruch: Cape scheint durch
    g.put(cx - 3, 38 - bob, 25)               # Schattenfleck zwischen Bändern
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
    # Schulterpanzer: hell genug, um gegen Nachthintergrund zu stehen.
    g.ellipse(cx - 16, 28 - bob, 6, 4, 6)
    g.ellipse(cx + 16, 28 - bob, 6, 4, 6)
    g.put(cx - 20, 27 - bob, 8)
    g.put(cx + 13, 27 - bob, 8)
    g.put(cx - 16, 26 - bob, 8)
    g.put(cx + 16, 26 - bob, 8)
    g.put(cx - 19, 26 - bob, 9)               # Rim oben links
    g.put(cx + 13, 26 - bob, 9)
    # Schädel.
    g.ellipse(cx, 17 - bob, 9, 8, 10)
    g.rect(cx - 7, 24 - bob, 14, 4, 10)
    g.rect(cx - 7, 27 - bob, 14, 1, 5)
    g.rect(cx - 6, 19 - bob, 4, 4, 2)         # Augenhöhlen (kein Innen-Ink)
    g.rect(cx + 2, 19 - bob, 4, 4, 2)
    g.put(cx - 2, 23 - bob, 2)                # Nase
    g.rect(cx - 4, 25 - bob, 8, 1, 2)         # Zähne
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
    # Gürtel/Knochen: ein Knochen-Nop, keine helles Punkte-Reihe.
    g.rect(cx - 7, 44 - bob, 14, 2, 4)
    g.put(cx, 45 - bob, 11)
    g.put(cx + 3, 44 - bob, 7)
    details = [(cx - 4, 25 - bob, 11), (cx - 1, 25 - bob, 11), (cx + 2, 25 - bob, 11)]
    details += eye_glow(cx - 5, 20 - bob, f)
    details += eye_glow(cx + 3, 20 - bob, f)
    return finish(g, details)


# ── 3 Der Fahle Hirte (72) ─────────────────────────────────────────────────
def _sickle(g: Grid, hx: int, hy: int, tipx: int, tipy: int):
    """Sichel: 2-px-Stahlband (10), Lichtkante 12 oben, Schatten 6 innen."""
    g.line(hx, hy, tipx, tipy, 10, 2)
    g.line(tipx, tipy, tipx - 3, tipy + 6, 10, 2)
    g.line(tipx - 3, tipy + 6, tipx - 1, tipy + 9, 9, 1)
    g.line(hx, hy - 1, tipx, tipy - 1, 12, 1)
    g.line(tipx, tipy - 1, tipx - 3, tipy + 5, 11, 1)
    g.line(hx + 1, hy + 1, tipx + 1, tipy + 1, 6, 1)
    g.put(tipx - 1, tipy + 8, 12)


def pale_shepherd(f: int) -> Grid:
    """Hagerer Hirte: langer zerschlissener Umhang, Kapuze mit Kragen,
    Wangenknochen + langer Kinnbart, Wolfsfell ueber einer Schulter und ein
    Stab, dessen Sichel frei neben dem Koerper steht (kein breiter Hut)."""
    g = Grid(72, 72)
    cx = 36
    bob = 2 if f == 1 else 0
    wind = f == 2

    # ── Umhang: langes Trapez, drei Nachtbaender, gerissener Saum ──
    top, bot = 24, 63
    for i in range(bot - top + 1):
        y = top + i - bob
        w = 24 + int(i * 0.32)
        if w % 2:
            w += 1
        x0 = cx - w // 2
        g.rect(x0, y, w, 1, 8)
        g.rect(x0, y, 3, 1, 10)              # Licht links
        g.rect(cx + w // 2 - 3, y, 3, 1, 6)  # Schatten rechts
        g.rect(cx + w // 2 - 1, y, 1, 1, 5)
    # Zwei lange Keilfalten, die mit dem Trapez nach aussen laufen.
    for fx, drift, t0 in ((-10, -3, 42), (8, 2, 46)):
        for j in range(bot - t0):
            y = t0 + j - bob
            xx = cx + fx + (drift * j) // max(1, bot - t0 - 1)
            g.rect(xx, y, 2, 1, 6)
            g.put(xx - 1, y, 9)
    # Zerschlissener Saum: unregelmaessige Zipfel mit echten Luecken.
    for x, length in ((-18, 6), (-14, 2), (-11, 8), (-6, 4), (-3, 9),
                      (3, 3), (6, 7), (11, 4), (14, 8)):
        g.rect(cx + x, bot - bob, 2, length, 8)
        g.put(cx + x, bot - bob, 6)
        g.put(cx + x + 1, bot - bob + length - 1, 5)

    # ── Wolfsfell ueber der linken Schulter (braun, 3 Fellzacken) ──
    px0 = cx - 15
    for i in range(18):
        y = 24 + i - bob
        w = 17 - int(i * 0.55)
        x0 = px0 + int(i * 0.22)
        g.rect(x0, y, w, 1, 16)
        g.rect(x0, y, 2, 1, 17)
        g.rect(x0 + w - 2, y, 2, 1, 15)
    # Drei Fellzacken unter dem Fell, klar gegen den Umhang.
    for sx, sy, hh in ((px0 + 1, 42, 5), (px0 + 6, 43, 4), (px0 + 11, 42, 6)):
        for j in range(hh):
            wid = 2 if j < hh - 2 else 1
            g.rect(sx + (j // 2), sy + j - bob, wid, 1, 16)
            g.put(sx + (j // 2), sy + j - bob, 17 if j == 0 else 15)
    # Fellzeichnung: Striche + Kralle, damit das Fell nicht als Blob liest.
    g.line(px0 + 3, 30 - bob, px0 + 12, 32 - bob, 15)
    g.line(px0 + 5, 35 - bob, px0 + 13, 37 - bob, 15)
    g.put(px0 + 2, 28 - bob, 17)
    g.put(px0 + 4, 41 - bob, 10)              # Kralle
    g.put(px0 + 9, 42 - bob, 10)
    # Fellklammer (Knochen) an der Schulter.
    g.rect(px0 + 8, 26 - bob, 3, 3, 10)
    g.put(px0 + 8, 26 - bob, 11)

    # ── Kragen mit zwei Spitzen ──
    g.rect(cx - 13, 22 - bob, 26, 4, 6)
    g.rect(cx - 13, 22 - bob, 26, 1, 8)
    g.rect(cx - 15, 19 - bob, 3, 5, 6)
    g.rect(cx + 12, 20 - bob, 3, 4, 6)
    g.put(cx - 15, 19 - bob, 8)
    g.put(cx + 12, 20 - bob, 8)

    # ── Kapuze mit Randlicht, darin das hage Gesicht ──
    g.ellipse(cx, 16 - bob, 10, 10, 6)
    g.ellipse(cx - 1, 15 - bob, 8, 8, 8)
    g.rect(cx - 9, 12 - bob, 2, 8, 10)
    g.ellipse(cx, 20 - bob, 6, 7, 2)         # Gesichtshoehle
    # Wangenknochen: schmal, unten spitz zulaufend.
    g.rect(cx - 4, 18 - bob, 9, 6, 9)
    g.rect(cx - 3, 24 - bob, 7, 4, 9)
    g.rect(cx - 2, 28 - bob, 5, 2, 9)
    g.rect(cx - 4, 18 - bob, 2, 2, 11)       # Stirnlicht
    g.put(cx - 4, 21 - bob, 11)
    g.put(cx + 3, 21 - bob, 11)              # Wangenknochen-Kante
    g.put(cx - 1, 23 - bob, 3)               # eingefallene Wange
    g.put(cx + 2, 23 - bob, 3)
    g.put(cx, 23 - bob, 8)                   # Nase
    # Leere Augenhoehlen, Glut als Detail nach dem Shading.
    g.rect(cx - 4, 20 - bob, 3, 3, 2)
    g.rect(cx + 2, 20 - bob, 3, 3, 2)
    # Langer, spitzer Kinnbart (oben breit, unten 1 px).
    for j, bw in enumerate((7, 7, 6, 6, 5, 5, 4, 3, 2, 2, 1, 1)):
        y = 26 + j - bob
        x0 = cx - bw // 2
        g.rect(x0, y, bw, 1, 10)
        g.put(x0, y, 11)
        g.put(x0 + bw - 1, y, 8)
    g.put(cx, 38 - bob, 11)

    # ── Linker Arm haengt am Umhang ──
    g.rect(cx - 18, 32 - bob, 5, 15, 8)
    g.rect(cx - 18, 32 - bob, 2, 15, 10)
    g.rect(cx - 19, 46 - bob, 7, 4, 6)
    g.rect(cx - 19, 46 - bob, 7, 1, 8)
    g.rect(cx - 18, 49 - bob, 4, 3, 9)       # Hand
    g.put(cx - 18, 49 - bob, 11)

    # ── Stab: steht neben dem Koerper, Sichel frei oben ──
    if wind:
        # Wind-up: Arm hoch, Stab diagonal nach rechts oben, Sichel ueber
        # dem Kopf. Voellig andere Silhouette als der senkrechte Ruhestab.
        g.line(cx + 9, 30 - bob, cx + 14, 20 - bob, 8, 3)
        g.line(cx + 9, 30 - bob, cx + 14, 20 - bob, 10, 1)
        hand = (cx + 13, 21 - bob)
    else:
        g.line(cx + 11, 30 - bob, cx + 19, 43 - bob, 8, 3)
        g.line(cx + 11, 30 - bob, cx + 19, 43 - bob, 10, 1)
        hand = (cx + 18, 44 - bob)
    hx, hy = hand
    g.rect(hx + 1, hy, 4, 3, 9)              # Hand
    g.put(hx + 1, hy, 11)
    g.put(hx + 2, hy + 2, 8)
    if wind:
        # Schaft: Hand -> rechts oben.
        g.line(hx + 2, hy, cx + 31, 5, 16, 2)
        g.line(hx + 2, hy - 1, cx + 31, 4, 17, 1)
        g.rect(cx + 29, 3, 3, 3, 17)
        _sickle(g, cx + 30, 5, cx + 19, 4)   # Klinge biegt nach links
        g.rect(cx + 34, 9, 4, 2, 10)         # Windstrich
        g.rect(cx + 35, 13, 3, 2, 9)
    else:
        sx = cx + 21
        g.rect(sx, 8, 2, 59, 16)             # senkrechter Schaft bis zum Boden
        g.rect(sx, 8, 1, 59, 17)
        g.rect(sx - 1, 64, 4, 3, 17)         # Fusskappe auf Bodenkante
        _sickle(g, sx, 9, sx - 8, 9)         # Klinge nach links, frei
        g.put(sx - 9, 16, 11)                # Sichelspitze
        # Griff: Hand greift VOR den Schaft (nachgezeichnet, 1 px Überlapp).
        g.rect(hx + 1, hy, 4, 3, 9)
        g.put(hx + 1, hy, 11)
        g.put(hx + 2, hy + 2, 8)

    # ── Fuesse unter dem Saum ──
    g.rect(cx - 11, 66, 8, 3, 6)
    g.rect(cx - 11, 66, 8, 1, 8)
    g.rect(cx + 3, 66, 8, 3, 6)
    g.rect(cx + 3, 66, 8, 1, 8)

    details = []
    details += eye_glow(cx - 3, 21 - bob, f)
    details += eye_glow(cx + 2, 21 - bob, f)
    details += [(px0 + 8, 26 - bob, 11)]
    return finish(g, details)


def bell_golem(f: int) -> Grid:
    g = Grid(80, 80)
    cx = 40
    bob = 2 if f == 1 else 0
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
    # Arme + Fäuste: Ellbogen-Kerbe bricht den Säulen-Look, Fäuste mit
    # Lichtkante oben-links + Kernbruch.
    g.rect(cx - 30, 36 - bob - arms_up, 9, 24, 6)
    g.rect(cx + 21, 36 - bob - arms_up, 9, 24, 6)
    g.rect(cx - 30, 36 - bob - arms_up, 3, 24, 8)
    g.rect(cx + 21, 36 - bob - arms_up, 3, 24, 8)
    g.rect(cx - 30, 46 - bob - arms_up, 9, 1, 4)   # Ellbogen-Kerbe links
    g.rect(cx + 21, 48 - bob - arms_up, 9, 1, 4)   # Ellbogen-Kerbe rechts
    g.ellipse(cx - 26, 60 - bob - arms_up, 8, 7, 6)
    g.ellipse(cx + 26, 60 - bob - arms_up, 8, 7, 6)
    g.rect(cx - 31, 56 - bob - arms_up, 5, 2, 8)   # Lichtkante Faust links
    g.rect(cx + 21, 56 - bob - arms_up, 5, 2, 8)   # Lichtkante Faust rechts
    g.put(cx - 27, 61 - bob - arms_up, 4)          # Kernbruch
    g.put(cx + 25, 63 - bob - arms_up, 4)
    g.put(cx - 29, 64 - bob - arms_up, 7)          # Fingerbruch
    g.put(cx + 23, 66 - bob - arms_up, 7)
    # Beinspalte: asymmetrisch brechen + Moos/Bruchkante.
    g.rect(cx - 6, 66, 3, 1, 6)                    # Spalt oben teilweise geschlossen
    g.line(cx + 10, 62, cx + 12, 70, 4)            # Riss im rechten Bein
    g.rect(cx - 19, 71, 3, 2, 30)                  # Moos links
    g.put(cx + 16, 68, 31)
    # Hals: verbindet Kopf und Glockenkrone.
    g.rect(cx - 4, 20 - bob, 8, 8, 6)
    g.rect(cx - 4, 20 - bob, 2, 8, 8)
    # Kopf (steinern) mit leeren Augenhoehlen und pulsierender Glut.
    g.ellipse(cx, 15 - bob, 8, 7, 6)
    g.rect(cx - 6, 18 - bob, 13, 3, 5)
    g.rect(cx - 6, 12 - bob, 4, 4, 2)
    g.rect(cx + 3, 12 - bob, 4, 4, 2)
    g.put(cx, 17 - bob, 4)
    details = []
    details += eye_glow(cx - 5, 13 - bob, f)
    details += eye_glow(cx + 3, 13 - bob, f)
    return finish(g, details)



def _witch(g: Grid, cx: int, base_y: int, h: float, raise_arms: bool, f: int,
           robe: int = 25, variant: str = "caster"):
    """Eine Hexe: eine Robe-Flaeche, Kapuze, Hut, warmes Gesicht MIT Augen,
    Rolle ueber Props (links Stab mit Glutknauf, rechts gebeugt mit
    Feuerball, Mitte zaubert ohne Requisit)."""
    bw = max(8, int(14 * h))
    top = base_y - int(36 * h)
    # Robe als zusammenhaengende Flaeche.
    for y in range(top + 14, base_y):
        t = (y - top - 14) / max(1, base_y - top - 14)
        w = int(bw * (0.75 + 0.55 * t))
        g.rect(cx - w // 2, y, w, 1, robe)
    # Kragen.
    g.rect(cx - bw // 2, top + 12, bw, 3, 26)
    g.put(cx - bw // 2, top + 12, 27)
    # Kapuze + warmes Gesicht (27 Basis, 16 Schatten, 21 nur 1-px-Kante).
    # hd: gebeugte Hexen lassen den Kopf in die Schultern sinken.
    hd = top + (2 if variant == "orb" else 0)
    g.ellipse(cx, hd + 7, max(3, int(4.5 * h)), max(3, int(3.5 * h)), 9)
    fw = max(4, int(8 * h))
    g.rect(cx - fw // 2, hd + 4, fw, 5, 27)
    g.rect(cx - fw // 2, hd + 8, fw, 1, 16)        # Kinnschatten
    g.rect(cx - fw // 2, hd + 9, fw, 2, robe)      # Robe statt grauem Kinn-Keil
    g.put(cx - fw // 2, hd + 9, 9)                 # Kapuzenrim bleibt stehen
    g.put(cx + fw // 2 - 1, hd + 9, 9)
    g.rect(cx - fw // 2, hd + 4, 1, 5, 21)         # 1-px-Lichtkante links
    # Augen: F0 2x2 Bernstein, F1 2x2 Laternenweiss (pulsiert).
    ey = hd + 6
    if f >= 1:
        g.rect(cx - 3, ey, 2, 2, 13)
        g.rect(cx + 1, ey, 2, 2, 13)
        g.put(cx - 4, ey + 1, 22)
        g.put(cx + 3, ey + 1, 22)
    else:
        g.rect(cx - 3, ey, 2, 2, 20)
        g.rect(cx + 1, ey, 2, 2, 20)
    # Hut.
    g.rect(cx - int(8 * h), hd + 2, int(17 * h), 2, 24)
    g.put(cx - int(8 * h), hd + 2, 26)
    g.rect(cx - int(5 * h), hd - 4, int(10 * h), 4, 25)
    g.put(cx - int(5 * h), hd - 4, 26)
    g.put(cx + int(4 * h), hd - 3, 23)
    g.put(cx, hd - 5, 27)
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
        g.rect(hx, hy, 3, 3, 27)                   # warme Haut
        g.rect(hx, hy + 2, 3, 1, 16)
        g.put(hx, hy, 21)                          # 1-px-Kante
    # Flamme in einer Hand: F0 ruhig, F1/F2 groesser + heller Kern.
    fx, fy = hand_r
    if f >= 1:
        g.ellipse(fx + 1, fy - 5, 4, 4, 18)
        g.rect(fx, fy - 6, 2, 2, 13)
        g.put(fx - 2, fy - 4, 22)
        g.put(fx + 3, fy - 4, 22)
        g.put(fx, fy - 7, 22)
    else:
        g.ellipse(fx + 1, fy - 4, 3, 3, 18)
        g.ellipse(fx + 1, fy - 4, 2, 2, 20)
        g.put(fx, fy - 5, 22)
    # Besenstiel am Ruecken.
    g.vline(cx + bw + 7, top + 10, base_y - 4, 5)


def coven(f: int) -> Grid:
    g = Grid(96, 96)
    bob = 2 if f == 1 else 0
    raise_arms = f == 2
    _witch(g, 24, 88 - bob, 0.9, raise_arms, f)
    _witch(g, 72, 88 - bob, 0.9, raise_arms, f)
    _witch(g, 48, 80 - bob, 1.15, raise_arms, f)
    # Feuerkreis: gruppierte Kerne, F1/F2 pulsierend groesser.
    for x, y in ((48, 30), (18, 52), (78, 52)):
        if f >= 1:
            g.ellipse(x, y - bob, 5, 5, 18)
            g.rect(x - 1, y - 1 - bob, 2, 2, 13)
            g.put(x - 3, y - bob, 22)
            g.put(x + 3, y - bob, 22)
        else:
            g.ellipse(x, y - bob, 4, 4, 18)
            g.ellipse(x, y - bob, 2, 2, 20)
            g.put(x - 1, y - 1 - bob, 22)
    if raise_arms:
        # Kreuzende Feuerstrahlen (nur Wirkphase).
        g.line(18, 50 - bob, 78, 62 - bob, 26, 2)
        g.line(78, 50 - bob, 18, 62 - bob, 26, 2)
    return finish(g, [])



def hollow_king(f: int) -> Grid:
    """Untoter Koenig: zerschlissener Umhang, schiefe Krone, leere Glut-
    hoehlen, schmale verwitterte Ruestung, duennes Schwert und gebrochene
    Thronfragmente mit Dornen am Boden."""
    g = Grid(96, 96)
    cx = 48
    bob = 2 if f == 1 else 0
    wind = f == 2

    # ── Gebrochene Thronfragmente hinter dem Koenig ──
    for tx, tw_, th_ in ((12, 9, 22), (76, 8, 17)):
        g.rect(tx, 90 - th_, tw_, th_, 5)
        g.rect(tx, 90 - th_, 2, th_, 7)
        g.rect(tx + tw_ - 1, 90 - th_, 1, th_, 4)
        # Abgebrochene Oberkante (Stufen).
        g.rect(tx, 90 - th_, tw_ - 2, 3, None)
        g.rect(tx - 1, 84, tw_ + 1, 6, 5)
        g.put(tx - 1, 84, 7)
        g.put(tx + tw_, 86, 4)

    # ── Umhang: dunkles Blutrot, unten breiter und ausgefranst ──
    top, bot = 31, 84
    for i in range(bot - top + 1):
        y = top + i - bob
        w = 30 + int(i * 0.34)
        if w % 2:
            w += 1
        x0 = cx - w // 2
        g.rect(x0, y, w, 1, 24)
        g.rect(x0, y, 3, 1, 25)
        g.rect(cx + w // 2 - 3, y, 3, 1, 23)
        g.rect(cx + w // 2 - 1, y, 1, 1, 14)
    # Links weht ein zerrissener Zipfel heraus, rechts ist der Saum kuerzer.
    for i in range(26):
        y = 58 + i
        g.rect(cx - 24 - (i // 8), y, 3, 1, 24)
        g.put(cx - 24 - (i // 8), y, 25)
    # Ausgefranster Saum: ungleiche Streifen mit Luecken.
    for i, x in enumerate(range(cx - 22, cx + 22, 3)):
        length = (3, 6, 4, 7, 3, 6, 8, 3, 5, 6, 4, 7)[i % 12]
        g.rect(x, bot - bob, 2, length, 24)
        g.put(x, bot - bob, 23)
        g.put(x + 1, bot - bob + length - 1, 14)
    # Zwei Risse im Umhang (dunkle Schlitze).
    g.rect(cx + 16, 52 - bob, 1, 9, 14)
    g.rect(cx - 19, 64 - bob, 1, 7, 14)

    # ── Beine: schmal, verwittert, Fuesse fest am Boden ──
    g.rect(cx - 11, 68, 8, 17, 6)
    g.rect(cx + 3, 68, 8, 17, 6)
    g.rect(cx - 11, 68, 2, 17, 7)
    g.rect(cx + 3, 68, 2, 17, 7)
    g.rect(cx - 9, 74, 4, 1, 4)
    g.rect(cx + 5, 77, 4, 1, 4)
    g.rect(cx - 13, 83, 10, 5, 5)
    g.rect(cx + 3, 83, 10, 5, 5)
    g.rect(cx - 13, 83, 10, 1, 7)
    g.rect(cx + 3, 83, 10, 1, 7)
    g.put(cx - 13, 87, 4)
    g.put(cx + 12, 87, 4)

    # ── Schmale Ruestung (Rumpf), verwittert ──
    g.rect(cx - 15, 35 - bob, 30, 30, 5)
    g.rect(cx - 15, 35 - bob, 3, 30, 7)
    g.rect(cx + 12, 35 - bob, 3, 30, 4)
    g.rect(cx - 15, 35 - bob, 30, 2, 7)
    g.rect(cx - 13, 46 - bob, 26, 2, 4)      # Segmentnaht
    g.rect(cx - 13, 46 - bob, 26, 1, 7)
    g.rect(cx - 13, 58 - bob, 26, 3, 5)      # Guertel
    g.put(cx - 13, 58 - bob, 20)
    g.put(cx - 11, 58 - bob, 21)
    # Rost und Dellen, kein Roboter-Look.
    g.rect(cx + 6, 39 - bob, 3, 2, 6)
    g.rect(cx - 12, 52 - bob, 2, 3, 6)
    g.line(cx + 9, 43 - bob, cx + 11, 52 - bob, 4)
    g.line(cx - 13, 61 - bob, cx - 10, 64 - bob, 4)

    # ── Hohler Brustkorb mit Rippen und Glutherz ──
    g.rect(cx - 6, 41 - bob, 12, 14, 2)
    g.rect(cx - 6, 41 - bob, 12, 1, 5)
    for ry in (44, 48, 52):
        g.rect(cx - 5, ry - bob, 10, 1, 6)
        g.put(cx - 5, ry - bob, 7)
        g.put(cx + 4, ry - bob, 7)
    g.rect(cx - 4, 54 - bob, 8, 1, 3)        # Zwerchfell-Schatten

    # ── Asymmetrische Schulterplatten ──
    g.ellipse(cx - 20, 36 - bob, 9, 5, 5)    # links gross
    g.ellipse(cx + 20, 37 - bob, 7, 4, 5)    # rechts klein
    g.put(cx - 26, 33 - bob, 7)
    g.put(cx + 16, 35 - bob, 7)
    g.rect(cx - 27, 29 - bob, 2, 5, 5)       # abgebrochener Spike links
    g.put(cx - 27, 29 - bob, 7)
    g.rect(cx + 23, 33 - bob, 2, 3, 5)
    g.put(cx + 23, 33 - bob, 7)
    # Riss in der linken Platte.
    g.put(cx - 22, 33 - bob, 4)

    # ── Arme ──
    g.rect(cx - 26, 39 - bob, 6, 21, 5)
    g.rect(cx - 26, 39 - bob, 2, 21, 7)
    g.rect(cx - 26, 57 - bob, 5, 4, 10)      # Knochenhand
    g.put(cx - 26, 57 - bob, 11)
    if wind:
        # Wind-up: Schwertarm hoch, Klinge diagonal nach rechts oben.
        g.line(cx + 19, 38 - bob, cx + 24, 27 - bob, 5, 3)
        g.line(cx + 19, 38 - bob, cx + 24, 27 - bob, 7, 1)
        g.rect(cx + 22, 25 - bob, 5, 4, 10)  # Hand
        g.put(cx + 22, 25 - bob, 11)
        g.line(cx + 24, 26 - bob, cx + 38, 3, 8, 2)
        g.line(cx + 24, 25 - bob, cx + 38, 2, 9, 1)
        g.put(cx + 39, 2, 13)                # Spitzenglut
        g.rect(cx + 19, 27 - bob, 10, 2, 20) # Parierstange
        g.put(cx + 19, 27 - bob, 21)
    else:
        g.rect(cx + 19, 39 - bob, 6, 19, 5)
        g.rect(cx + 19, 39 - bob, 2, 19, 7)
        g.rect(cx + 21, 55 - bob, 5, 4, 10)  # Hand am Griff
        g.put(cx + 21, 55 - bob, 11)
        # Duennes Schwert: 2-px-Klinge mit Lichtkante, senkrecht.
        g.rect(cx + 23, 24 - bob, 2, 33, 8)
        g.rect(cx + 23, 24 - bob, 1, 33, 9)
        g.put(cx + 24, 24 - bob, 6)
        g.rect(cx + 20, 56 - bob, 8, 2, 20)  # Parierstange
        g.put(cx + 20, 56 - bob, 21)
        g.rect(cx + 23, 58 - bob, 2, 8, 16)  # Griff
        g.rect(cx + 21, 66 - bob, 6, 2, 20)  # Knauf
        g.put(cx + 26, 66 - bob, 21)
        g.put(cx + 24, 23 - bob, 13)         # Spitzenglut

    # ── Hals + Schaedel ──
    g.rect(cx - 4, 29 - bob, 8, 7, 10)
    g.rect(cx - 4, 29 - bob, 2, 7, 11)
    g.ellipse(cx, 22 - bob, 8, 9, 10)
    g.rect(cx - 5, 27 - bob, 10, 5, 10)      # Kiefer
    g.rect(cx - 5, 27 - bob, 10, 1, 11)
    g.rect(cx - 4, 30 - bob, 8, 1, 2)        # Zahnreihe
    g.put(cx - 3, 30 - bob, 11)
    g.put(cx, 30 - bob, 11)
    g.put(cx + 3, 30 - bob, 11)
    g.put(cx - 7, 24 - bob, 11)              # Wangenknochen
    g.put(cx + 6, 24 - bob, 11)
    g.rect(cx - 1, 25 - bob, 2, 2, 2)        # Nasenhoehle
    # Leere Augenhoehlen (2), Glut als Detail nach dem Shading.
    g.rect(cx - 6, 19 - bob, 4, 4, 2)
    g.rect(cx + 2, 19 - bob, 4, 4, 2)
    g.put(cx - 5, 18 - bob, 9)
    g.put(cx + 3, 18 - bob, 9)

    # ── Schiefe, asymmetrische Krone ──
    g.rect(cx - 10, 13 - bob, 7, 3, 20)      # links tiefer
    g.rect(cx - 4, 11 - bob, 12, 3, 20)      # rechts hoeher
    g.rect(cx + 7, 10 - bob, 3, 3, 20)
    g.rect(cx - 8, 14 - bob, 16, 2, 10)      # Kontaktband: Krone sitzt auf
    g.put(cx - 8, 14 - bob, 11)              # dem Schädel, kein Spalt rechts
    g.rect(cx - 10, 13 - bob, 7, 1, 21)
    g.put(cx - 5, 11 - bob, 21)
    g.put(cx + 7, 10 - bob, 21)
    g.rect(cx - 11, 15 - bob, 9, 1, 16)      # Rostkante
    # Zacken ungleich hoch, einer abgebrochen.
    for sx, sy, hh in ((cx - 10, 8, 5), (cx - 6, 10, 3), (cx - 1, 5, 6),
                       (cx + 7, 8, 3)):
        g.rect(sx, sy - bob, 2, hh, 20)
        g.put(sx, sy - bob, 21)
    # Abgebrochener Zackenstumpf + fehlender Zacken.
    g.rect(cx + 3, 9 - bob, 2, 2, 20)
    g.put(cx + 3, 9 - bob, 16)
    g.put(cx + 2, 13 - bob, 16)
    g.put(cx - 4, 5 - bob, 22)               # Glanzpunkt

    # ── Dornen / Thronfragmente im Vordergrund ──
    for ox, oy, dx, dy in ((-34, 92, -27, 80), (-29, 93, -22, 84),
                           (27, 92, 21, 82), (33, 93, 36, 85)):
        g.line(cx + ox, oy, cx + dx, dy, 26, 2)
        g.line(cx + ox, oy, cx + dx, dy + 1, 24, 1)
        g.put(cx + dx, dy, 25)
    g.rect(cx - 38, 88, 8, 4, 5)
    g.rect(cx - 38, 88, 8, 1, 7)
    g.rect(cx + 30, 89, 7, 3, 5)
    g.rect(cx + 30, 89, 7, 1, 7)
    if wind:
        # Wind-up: Umhangbausch + gluehende Dornenspitzen.
        for i in range(8):
            g.put(cx - 35 + i * 2, 86 - (i % 3), 26)
            g.put(cx + 30 - i, 86 - (i % 2), 26)

    details = [(cx - 7, 24 - bob, 11), (cx + 6, 24 - bob, 11)]
    details += eye_glow(cx - 5, 20 - bob, f)
    details += eye_glow(cx + 3, 20 - bob, f)
    details += eye_glow(cx - 1, 50 - bob, f)
    details += [(cx + 20, 56 - bob, 21), (cx - 27, 29 - bob, 7)]
    return finish(g, details)



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
