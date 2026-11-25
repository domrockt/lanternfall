#!/usr/bin/env python3
"""Spieler-Sprites: Mira Ashwick + Bruder Kael.

32x32, 4-Dir-Lauf (unten/oben/seite-rechts, links per Spiegelung), Idle 2,
Treffer-Pose, Portrait 48x48. Nur Palettenfarben, 1-px-Kontur, Rampen-Shading,
Licht von oben-links, keine Einzelpixel-Rauschflächen.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, emit_ts, pad_grid, save_grid_png, save_sheet_png, SHOTS  # noqa: E402

SIZE = 32

INK = 0
SKIN, SKIN_D, SKIN_L = 11, 9, 12
HAND, HAND_S = 10, 8
BLUSH = 27
HAIR, HAIR_D = 24, 23
CLOTH, CLOTH_S, CLOTH_L, CLOTH_H = 25, 23, 26, 27
BOOT, BOOT_D = 16, 14
BELT, BELT_D = 16, 14
GOLD, GOLD_L = 20, 21
GLOW, GLOW_H = 22, 13
IRON, IRON_D, IRON_L = 5, 4, 7
CHAIN, CHAIN_L = 4, 6
ROBE, ROBE_D, ROBE_L = 3, 2, 5
SCARF = 26
EYE = 1
BONE = 11


def _cone(g: Grid, cx: int, tip_y: int, base_y: int, half_base: int, lean: int, col: int, dark: int):
    """Spitzhut-Kegel mit leichter Knick-Neigung nach rechts."""
    height = max(1, base_y - tip_y)
    for i in range(height + 1):
        t = i / height
        w = max(1, round(half_base * 2 * t)) + 1
        x = cx + round(lean * (1 - t))
        y = tip_y + i
        g.rect(x - w // 2, y, w, 1, col)
        if t < 0.65:
            g.put(x - w // 2, y, dark)
        else:
            g.put(x + w // 2 - 1, y, dark)
    # Untere Kante des Kegels: 1 px dunkler Saum.
    g.rect(cx - half_base, base_y, half_base * 2, 1, dark)


def mira_pose(direction: str, frame: int = 0, idle: bool = False, hit: bool = False) -> Grid:
    g = Grid(SIZE, SIZE)
    side = direction == "side"
    up = direction == "up"
    step = 0 if idle else [0, 1, 2, 3][frame]
    bob = 0 if idle else [0, -1, 0, -1][frame]
    if idle and frame == 1:
        bob = -1
    recoil = 3 if hit else 0
    cx = 16
    ox = 1 if side else 0           # Profil leicht nach vorn versetzt
    bw = 2 if side else 0           # Profil schmaler

    body_y = 16 + bob - recoil
    # ── Rock/Cloak ──
    rock_w = [12 - bw, 13 - bw, 14 - bw, 14 - bw, 15 - bw, 15 - bw, 16 - bw]
    hem = 26 + bob - recoil
    for i, w in enumerate(rock_w):
        g.rect(cx + ox - w // 2, 22 + bob - recoil + i, w, 1, CLOTH if i < 5 else CLOTH_S)
    g.rect(cx + ox - (8 - bw), hem, 17 - bw, 1, CLOTH_S)
    for fold in (-5, -2, 2, 5):
        if side and fold < 0:
            continue
        g.vline(cx + ox + fold, 24 + bob - recoil, hem - 1, CLOTH_S)
    # Lichtkante links am Rock.
    g.vline(cx + ox - (8 - bw), 23 + bob - recoil, hem - 1, CLOTH_L)

    # ── Beine / Stiefel (Boden bleibt fest) ──
    lift_l = 2 if (not idle and step == 1) else 0
    lift_r = 2 if (not idle and step == 3) else 0
    if side:
        # Vier klar verschiedene Phasen: Kontakt A, Durchschwung vorn, Kontakt B,
        # Durchschwung hinten. Fuesse 2 px vor/zurueck, angehobenes Bein 2 px hoch.
        fwd_arr  = [2, 1, -2, -1]
        back_arr = [-2, -1, 2, 1]
        lift_f_arr = [0, 2, 0, 0]
        lift_b_arr = [0, 0, 0, 2]
        fwd, back = fwd_arr[step], back_arr[step]
        lift_f, lift_b = lift_f_arr[step], lift_b_arr[step]
        fx = cx + 2 + fwd
        g.rect(fx - 2, 28 - lift_f, 4, 4 + lift_f, BOOT_D)
        g.rect(fx - 1, 28 - lift_f, 3, 3 + lift_f, BOOT)
        g.put(fx + 1, 28 - lift_f, BOOT_D)  # Stiefelspitze vorn
        bx = cx - 4 + back
        g.rect(bx, 28 - lift_b, 4, 4 + lift_b, BOOT_D)
        g.rect(bx + 1, 28 - lift_b, 3, 3 + lift_b, BOOT)
    else:
        for side_i, lift in ((-1, lift_l), (1, lift_r)):
            lx = cx + (-5 if side_i < 0 else 2) + (step - 1) * side_i
            ly = 28 - lift
            g.rect(lx, ly, 4, 4 + lift, BOOT_D)
            g.rect(lx, ly, 3, 3, BOOT)
            g.put(lx + 1, ly, 17)
            g.put(lx + 1, 31, BOOT_D)


    # ── Gurt + Schnalle ──
    gy = 21 + bob - recoil
    g.rect(cx + ox - (6 - bw // 2), gy, 13 - bw, 2, BELT_D)
    g.rect(cx + ox - (6 - bw // 2), gy, 13 - bw, 1, BELT)
    g.rect(cx + ox - 1, gy, 3, 2, GOLD)
    g.put(cx + ox, gy, GOLD_L)

    # ── Rumpf ──
    tw = 13 - bw
    g.rect(cx + ox - tw // 2, body_y + 1, tw, 6, CLOTH)
    g.rect(cx + ox - tw // 2, body_y + 1, 2, 6, CLOTH_S)
    g.rect(cx + ox + tw // 2 - 2, body_y + 1, 2, 6, CLOTH_S)
    if up:
        g.vline(cx + ox, body_y + 1, body_y + 6, CLOTH_S)   # Rückennaht
        g.rect(cx + ox - 3, body_y + 4, 6, 1, CLOTH_S)
    else:
        g.rect(cx + ox - 4, body_y + 3, 9, 1, CLOTH_S)      # Brustfalte
    # Kragen/Schal.
    g.rect(cx + ox - tw // 2, body_y, tw, 2, SCARF)
    g.rect(cx + ox - (tw // 2 - 1), body_y - 1, tw - 2, 1, CLOTH_H)
    g.put(cx + ox - tw // 2, body_y, CLOTH_L)
    g.put(cx + ox + tw // 2 - 1, body_y, CLOTH_S)

    # ── Arme ──
    swing = 0 if idle else [1, 0, -1, 0][frame]
    if side:
        g.rect(cx + 5 + swing, body_y + 1, 2, 6, CLOTH)      # vorderer Arm
        g.rect(cx + 6 + swing, body_y + 1, 1, 5, CLOTH_S)
        g.rect(cx + 5 + swing, body_y + 7, 2, 2, HAND)
        g.put(cx + 6 + swing, body_y + 8, HAND_S)
        g.rect(cx - 6 - swing, body_y + 2, 2, 6, CLOTH_S)    # hinterer Arm
        g.put(cx - 6 - swing, body_y + 7, HAND)
        g.put(cx - 6 - swing, body_y + 8, HAND_S)
    else:
        for side_i in (-1, 1):
            ax = cx + ox + (5 - bw // 2 if side_i > 0 else -(7 - bw // 2))
            if hit:
                ax += 1 if side_i > 0 else -1
            g.rect(ax, body_y + 2, 2, 6, CLOTH_S)
            g.rect(ax, body_y + 2, 2, 4, CLOTH)
            g.rect(ax, body_y + 8, 2, 2, HAND)
            g.put(ax, body_y + 9, HAND_S)

    # ── Kopf (Treffer: Oberkoerper 2 px zur Seite geneigt) ──
    hy = 13 + bob - recoil
    hcx = cx + ox + (2 if hit and not side else 0)
    if hit and not side:
        # Schultern/Arme ziehen 1 px nach aussen zurueck -> breitere Silhouette.
        pass
    if side:
        g.ellipse(hcx, hy, 4, 4, SKIN)
        g.rect(hcx - 2, hy + 3, 5, 2, SKIN)
        g.put(hcx + 4, hy - 1, SKIN)     # Nasenrücken
        g.put(hcx + 5, hy, SKIN)         # Nasenspitze (Silhouette)
        g.put(hcx + 5, hy + 1, SKIN_D)
        g.put(hcx + 4, hy + 2, SKIN_D)   # Mundwinkel
        g.put(hcx - 3, hy - 1, HAIR_D)   # Nackensträhne
        g.rect(hcx - 4, hy - 2, 2, 4, HAIR_D)
        g.put(hcx + 2, hy + 2, BLUSH)
    else:
        g.ellipse(hcx, hy, 5, 4, SKIN)
        g.rect(hcx - 3, hy + 3, 7, 2, SKIN)
        g.put(hcx - 4, hy + 2, SKIN_D)
        g.put(hcx + 4, hy + 2, SKIN_D)
        if up:
            # Hinterkopf: Haar bedeckt den Nacken (kein Haut-Rechteck).
            g.rect(hcx - 4, hy - 3, 9, 6, HAIR_D)
            g.rect(hcx - 3, hy - 2, 7, 4, HAIR)
            g.put(hcx - 4, hy - 3, HAIR)
            g.put(hcx + 4, hy - 3, HAIR)
            g.rect(hcx - 2, hy + 3, 5, 1, HAIR_D)
        else:
            g.rect(hcx - 5, hy - 2, 2, 5, HAIR_D)
            g.rect(hcx + 4, hy - 2, 2, 5, HAIR_D)
            g.put(hcx - 5, hy - 3, HAIR)
            g.put(hcx + 5, hy - 3, HAIR)
            g.put(hcx - 5, hy + 3, HAIR_D)
            g.put(hcx + 4, hy + 3, HAIR_D)
            g.put(hcx - 3, hy + 1, BLUSH)
            g.put(hcx + 3, hy + 1, BLUSH)

    # ── Hexenhut ──
    brim_y = hy - 5
    if side:
        g.rect(hcx - 8, brim_y + 1, 17, 2, CLOTH_S)
        g.rect(hcx - 7, brim_y, 15, 2, CLOTH)
        g.put(hcx - 8, brim_y + 1, CLOTH_S)
        g.put(hcx + 8, brim_y + 1, CLOTH_S)
        g.put(hcx - 7, brim_y, CLOTH_L)
        _cone(g, hcx + 1, brim_y - 6, brim_y - 1, 5, 4, CLOTH, CLOTH_S)
    else:
        g.rect(hcx - 10, brim_y + 1, 21, 2, CLOTH_S)
        g.rect(hcx - 9, brim_y, 19, 2, CLOTH)
        g.put(hcx - 10, brim_y + 1, CLOTH_S)
        g.put(hcx + 10, brim_y + 1, CLOTH_S)
        g.put(hcx - 9, brim_y, CLOTH_L)
        g.put(hcx - 8, brim_y, CLOTH_L)
        g.put(hcx + 8, brim_y + 1, CLOTH_S)
        g.put(hcx + 9, brim_y + 1, CLOTH_S)
        _cone(g, hcx, brim_y - 6, brim_y - 1, 6, 3, CLOTH, CLOTH_S)
    g.rect(hcx - 5, brim_y - 1, 11, 1, CLOTH_H)
    g.put(hcx - 5, brim_y - 1, 26)
    g.put(hcx - 4, brim_y - 1, 26)
    g.put(hcx + 5, brim_y - 1, 23)

    # ── Laterne schwingt mit dem vorderen Arm (Seitenprofil) ──
    lx = hcx + 9 + (swing * 2 if side else 0)
    ly = body_y + 8 + (1 if side and not idle and step % 2 == 1 else 0)
    g.rect(lx, ly - 2, 2, 2, GOLD)
    g.put(lx - 1, ly - 2, GOLD)
    g.rect(lx - 2, ly - 1, 6, 1, 17)
    g.rect(lx - 2, ly, 6, 5, 17)
    g.rect(lx - 1, ly, 4, 5, GOLD)
    g.rect(lx - 1, ly + 1, 4, 3, GLOW)
    g.rect(lx, ly + 1, 2, 3, GLOW_H)
    g.rect(lx - 2, ly + 5, 6, 1, 16)
    g.put(lx - 3, ly + 1, GOLD_L)
    g.put(lx + 3, ly + 1, GOLD_L)
    g.put(lx, ly + 2, 13)

    # ── Gesicht ──
    face = []
    if direction == "down":
        if hit:
            g.rect(hcx - 4, hy - 2, 2, 2, INK)
            g.rect(hcx + 2, hy - 2, 2, 2, INK)
            face += [(hcx - 1, hy + 2, INK), (hcx, hy + 2, INK), (hcx + 1, hy + 2, INK)]
        else:
            g.rect(hcx - 4, hy - 1, 2, 2, EYE)
            g.rect(hcx + 2, hy - 1, 2, 2, EYE)
            face += [(hcx - 4, hy - 1, SKIN_L), (hcx + 2, hy - 1, SKIN_L)]
            face += [(hcx, hy, SKIN_D)]
            face += [(hcx - 1, hy + 2, 24), (hcx, hy + 2, 24), (hcx + 1, hy + 2, 24)]
            face += [(hcx - 4, hy - 3, HAIR_D), (hcx - 3, hy - 3, HAIR_D),
                     (hcx + 2, hy - 3, HAIR_D), (hcx + 3, hy - 3, HAIR_D)]
    elif direction == "side":
        g.rect(hcx + 2, hy - 1, 2, 2, EYE)
        face += [(hcx + 2, hy - 1, SKIN_L)]
        face += [(hcx + 4, hy + 1, SKIN_D)]
        face += [(hcx + 1, hy + 2, 24), (hcx + 2, hy + 2, 24), (hcx + 3, hy + 2, 24)]

    g = shade_edges(g, band=1)
    for x, y, c in face:
        g.put(x, y, c)
    g = outline(g)
    return g


def kael_pose(direction: str, frame: int = 0, idle: bool = False, hit: bool = False) -> Grid:
    g = Grid(SIZE, SIZE)
    side = direction == "side"
    up = direction == "up"
    step = 0 if idle else [0, 1, 2, 3][frame]
    bob = 0 if idle else [0, -1, 0, -1][frame]
    if idle and frame == 1:
        bob = -1
    recoil = 3 if hit else 0
    cx = 16
    ox = 1 if side else 0
    bw = 2 if side else 0

    body_y = 15 + bob - recoil
    # ── Kettenrock ──
    rock_w = [14 - bw, 15 - bw, 15 - bw, 16 - bw, 16 - bw, 17 - bw, 17 - bw, 18 - bw]
    for i, w in enumerate(rock_w):
        g.rect(cx + ox - w // 2, 21 + bob - recoil + i, w, 1, ROBE if i < 5 else ROBE_D)
    for i in range(0, 7, 2):
        y = 22 + bob - recoil + i
        for x in range(cx + ox - 6, cx + ox + 7, 4):
            g.rect(x, y, 2, 2, CHAIN)
            g.put(x, y, CHAIN_L)
    g.rect(cx + ox - 8, 21 + bob - recoil, 15, 2, IRON_D)
    g.rect(cx + ox - 8, 21 + bob - recoil, 15, 1, IRON)
    for x in range(cx + ox - 5, cx + ox + 6, 3):
        g.put(x, 22 + bob - recoil, GOLD)

    # ── Schwere Stiefel ──
    lift_l = 2 if (not idle and step == 1) else 0
    lift_r = 2 if (not idle and step == 3) else 0
    if side:
        fwd_arr  = [2, 1, -2, -1]
        back_arr = [-2, -1, 2, 1]
        lift_f_arr = [0, 2, 0, 0]
        lift_b_arr = [0, 0, 0, 2]
        fwd, back = fwd_arr[step], back_arr[step]
        lift_f, lift_b = lift_f_arr[step], lift_b_arr[step]
        fx = cx + 3 + fwd
        g.rect(fx - 2, 28 - lift_f, 5, 4 + lift_f, BOOT_D)
        g.rect(fx - 1, 28 - lift_f, 4, 3 + lift_f, BOOT)
        g.put(fx + 1, 28 - lift_f, BOOT_D)
        bx = cx - 5 + back
        g.rect(bx, 28 - lift_b, 4, 4 + lift_b, BOOT_D)
    else:
        for side_i, lift in ((-1, lift_l), (1, lift_r)):
            lx = cx + (-6 if side_i < 0 else 2) + (step - 1) * side_i
            ly = 28 - lift
            g.rect(lx, ly, 5, 4 + lift, BOOT_D)
            g.rect(lx + 1, ly, 4, 3, BOOT)
            g.put(lx + 2, ly, BELT)


    # ── Brust ──
    tw = 13 - bw
    g.rect(cx + ox - tw // 2, body_y + 2, tw, 4, ROBE)
    for y in range(body_y + 2, body_y + 6, 2):
        for x in range(cx + ox - 5, cx + ox + 6, 3):
            g.rect(x, y, 2, 1, CHAIN)
            g.put(x, y, CHAIN_L)
    if up:
        g.vline(cx + ox, body_y + 2, body_y + 5, CHAIN_L)  # Rückennaht
    else:
        for x in range(cx + ox - 5, cx + ox + 4, 3):
            g.rect(x, body_y + 1, 2, 1, IRON)
            g.put(x, body_y + 1, IRON_L)
        g.rect(cx + ox - 1, body_y + 2, 3, 2, GOLD)
        g.put(cx + ox, body_y + 2, GOLD_L)

    # ── Schulterplatten (abgerundet, mit Nieten) ──
    for side_i in (-1, 1):
        if side and side_i < 0:
            continue
        if side:
            sx = cx + ox + 3
            g.rect(sx, body_y, 4, 4, IRON_D)
            g.rect(sx, body_y, 4, 3, IRON)
            g.put(sx + 1, body_y, IRON_L)
            g.put(sx + 2, body_y, IRON_L)
            g.put(sx + 1, body_y + 2, GOLD)
            g.put(sx, body_y + 3, None)
            g.put(sx + 3, body_y + 3, None)
            continue
        sx = cx + ox + (6 if side_i > 0 else -11)
        g.rect(sx, body_y - 1, 5, 4, IRON_D)
        g.rect(sx, body_y - 1, 5, 3, IRON)
        g.rect(sx - 1, body_y + 2, 6, 1, IRON_D)
        g.put(sx + 1, body_y - 1, IRON_L)
        g.put(sx + 2, body_y - 1, IRON_L)
        g.put(sx + 3, body_y, IRON_L)
        g.put(sx, body_y - 1, None)
        g.put(sx + 4, body_y - 1, None)
        g.put(sx - 1, body_y + 2, None)
        g.put(sx + 4, body_y + 2, None)
        g.put(sx + 2, body_y + 1, GOLD)  # Niete

    # ── Arme / Fäuste ──
    swing = 0 if idle else [1, 0, -1, 0][frame]
    if side:
        # Vorderarm mit gewickelter Faust, hinten ein angedeuteter Arm.
        g.rect(cx + 4 + swing, body_y + 2, 3, 4, ROBE)
        g.rect(cx + 4 + swing, body_y + 6, 3, 2, 12)      # Bandage
        g.rect(cx + 3 + swing, body_y + 8, 5, 4, HAND)
        g.rect(cx + 3 + swing, body_y + 8, 5, 1, SKIN_L)
        g.rect(cx + 3 + swing, body_y + 10, 5, 1, HAND_S)
        g.put(cx + 4 + swing, body_y + 9, HAND)
        g.put(cx + 6 + swing, body_y + 9, HAND_S)
        g.put(cx + 3 + swing, body_y + 11, HAND_S)
        g.rect(cx - 6 - swing, body_y + 3, 2, 5, ROBE_D)
        g.put(cx - 6 - swing, body_y + 7, SKIN_D)
    else:
        for side_i in (-1, 1):
            ax = cx + ox + (7 - bw // 2 if side_i > 0 else -(10 - bw // 2))
            if hit:
                ax += 1 if side_i > 0 else -1
            g.rect(ax, body_y + 3, 2, 6, ROBE_D)
            fx = ax + (4 if side_i < 0 else -1)
            g.rect(fx, body_y + 8, 5, 4, HAND)
            g.rect(fx, body_y + 8, 5, 1, SKIN_L)
            g.rect(fx, body_y + 10, 5, 1, HAND_S)
            g.put(fx, body_y + 9, HAND)
            g.put(fx + 2, body_y + 9, HAND_S)
            g.put(fx + 4, body_y + 9, HAND_S)
            g.put(fx, body_y + 11, HAND_S)

    # ── Kopf: kahl, breite Kiefer, eiserner Stirnreif, Narbe ──
    hy = 13 + bob - recoil
    hcx = cx + ox + (2 if hit and not side else 0)
    if side:
        g.ellipse(hcx, hy, 4, 4, SKIN)
        g.rect(hcx - 3, hy + 3, 6, 2, SKIN)
        g.put(hcx + 4, hy - 1, SKIN_D)   # Brauenwulst
        g.put(hcx + 5, hy + 1, SKIN)     # Nase
        g.put(hcx + 5, hy + 2, SKIN_D)
        g.put(hcx + 4, hy + 3, HAIR_D)   # Bart
        g.put(hcx - 3, hy - 1, IRON_D)
        g.put(hcx - 4, hy + 1, SKIN_D)
    else:
        g.rect(hcx - 4, hy - 4, 9, 3, 10)
        g.ellipse(hcx, hy, 5, 4, SKIN)
        g.rect(hcx - 4, hy + 3, 9, 2, SKIN)
        g.rect(hcx - 3, hy - 4, 7, 1, 11)
        g.put(hcx - 5, hy, SKIN)
        g.put(hcx + 5, hy, SKIN)
        g.put(hcx - 5, hy + 1, SKIN_D)
        g.put(hcx + 5, hy + 1, SKIN_D)
    # Stirnreif.
    g.rect(hcx - 5, hy - 2, 11, 2, IRON_D)
    g.rect(hcx - 5, hy - 2, 11, 1, IRON)
    g.put(hcx - 4, hy - 2, IRON_L)
    g.put(hcx + 4, hy - 2, GOLD)
    g.put(hcx - 4, hy, GOLD)
    # Narbe auf der Wange (rechts).
    g.put(hcx + 3, hy - 4, 25)
    g.put(hcx + 4, hy - 3, 24)
    # Wangen-Schatten + Bartansatz.
    g.put(hcx - 4, hy + 2, SKIN_D)
    g.put(hcx + 4, hy + 2, SKIN_D)
    g.rect(hcx - 3, hy + 4, 7, 1, HAIR_D)
    g.put(hcx - 2, hy + 4, HAIR)

    face = []
    if direction == "down":
        if hit:
            g.rect(hcx - 3, hy, 2, 2, INK)
            g.rect(hcx + 2, hy, 2, 2, INK)
            face += [(hcx - 1, hy + 3, INK), (hcx, hy + 3, INK), (hcx + 1, hy + 3, INK)]
        else:
            g.rect(hcx - 3, hy + 1, 2, 2, EYE)
            g.rect(hcx + 2, hy + 1, 2, 2, EYE)
            face += [(hcx - 3, hy + 1, SKIN_L), (hcx + 2, hy + 1, SKIN_L)]
            face += [(hcx - 3, hy - 1, HAIR_D), (hcx - 2, hy - 1, HAIR_D),
                     (hcx + 2, hy - 1, HAIR_D), (hcx + 3, hy - 1, HAIR_D)]
            face += [(hcx, hy + 2, SKIN_D)]
            face += [(hcx - 1, hy + 3, 24), (hcx, hy + 3, 24), (hcx + 1, hy + 3, 24)]
    elif direction == "side":
        g.rect(hcx + 2, hy, 2, 2, EYE)
        face += [(hcx + 2, hy, SKIN_L)]
        face += [(hcx + 2, hy + 2, 24), (hcx + 3, hy + 2, 24), (hcx + 4, hy + 2, 24)]

    g = shade_edges(g, band=1)
    for x, y, c in face:
        g.put(x, y, c)
    g = outline(g)
    return g


def _bust_base(g: Grid):
    """Gemeinsame Büste: Augenlinie y=24, Kopf 22 px hoch, Schulter ab y=37."""
    cx = 24
    # Hals.
    g.rect(21, 31, 6, 7, SKIN)
    g.put(21, 31, SKIN_D)
    # Kopf + Kiefer.
    g.ellipse(cx, 24, 10, 10, SKIN)
    g.rect(17, 32, 15, 2, SKIN)
    g.put(16, 27, SKIN_D)
    g.put(31, 27, SKIN_D)
    g.put(17, 31, SKIN_D)
    g.put(30, 31, SKIN_D)
    # Augen: 3x2-Sockel, 2x2-Pupille, 1 px Glanz oben-links.
    for ex in (17, 28):
        g.rect(ex, 23, 3, 2, 12)
        g.rect(ex, 23, 2, 2, EYE)
        g.put(ex, 23, SKIN_L)
    # Brauen.
    g.rect(16, 21, 5, 1, HAIR_D)
    g.rect(27, 21, 5, 1, HAIR_D)
    # Nase 2 px, Mund.
    g.rect(23, 27, 2, 2, SKIN_D)
    g.line(21, 32, 26, 32, 24)
    return cx


def portrait(kind: str) -> Grid:
    """48x48-Büste für CharSelect — beide Figuren mit gleicher Augenlinie."""
    g = Grid(48, 48)
    cx = _bust_base(g)
    if kind == "mira":
        # Schultern + Rock, eine Fläche mit Falten.
        g.rect(4, 37, 40, 11, CLOTH_S)
        g.rect(6, 36, 36, 6, CLOTH)
        for x in range(9, 40, 7):
            g.vline(x, 39, 46, CLOTH_S)
        g.rect(9, 33, 31, 4, SCARF)
        g.rect(10, 32, 29, 1, CLOTH_H)
        # Wangen-Rouge (gruppiert).
        g.rect(16, 28, 4, 2, BLUSH)
        g.rect(28, 28, 4, 2, BLUSH)
        # Haar: oben breiter Rahmen, Seitenlocken wellig bis auf die Schultern.
        g.rect(13, 16, 23, 2, HAIR_D)
        g.rect(12, 18, 2, 12, HAIR)
        g.rect(34, 18, 2, 12, HAIR)
        g.rect(11, 21, 2, 8, HAIR_D)
        g.rect(35, 21, 2, 8, HAIR_D)
        g.rect(11, 27, 3, 3, HAIR)
        g.rect(34, 27, 3, 3, HAIR)
        g.rect(12, 30, 2, 5, HAIR_D)
        g.rect(34, 30, 2, 5, HAIR_D)
        g.put(13, 18, 26)
        g.put(34, 18, 26)
        # Hexenhut: Krempe + Kegel, rote Rampe, 1 px Kontur oben.
        g.rect(3, 12, 42, 3, CLOTH_S)
        g.rect(5, 11, 38, 2, CLOTH)
        g.rect(5, 11, 8, 1, CLOTH_L)
        g.put(3, 12, CLOTH_L)
        _cone(g, cx, 3, 10, 13, 5, CLOTH, CLOTH_S)
        g.rect(15, 10, 19, 2, CLOTH_H)
        g.put(16, 10, 26)
        g.put(31, 10, 23)
        # Laterne, vollständig im Bild und getrennt vom Körper.
        g.rect(37, 34, 2, 3, GOLD)
        g.rect(35, 35, 10, 2, GOLD)
        g.rect(36, 37, 8, 9, 17)
        g.rect(37, 37, 6, 9, GOLD)
        g.rect(38, 39, 4, 6, GLOW)
        g.rect(39, 39, 2, 4, GLOW_H)
        g.rect(36, 46, 8, 1, 16)
        g.put(34, 38, GOLD_L)
        g.put(44, 38, GOLD_L)
    else:
        # Kettengewand + Eisenplatten.
        g.rect(2, 38, 44, 10, ROBE_D)
        g.rect(4, 37, 40, 5, ROBE)
        for y in range(39, 47, 3):
            for x in range(6, 42, 6):
                g.rect(x, y, 3, 1, CHAIN)
                g.put(x, y, CHAIN_L)
                g.put(x + 2, y, 2)
                g.put(x + 1, y + 1, CHAIN)
        for sx in (4, 30):
            g.rect(sx, 32, 14, 6, IRON_D)
            g.rect(sx + 1, 32, 12, 4, IRON)
            g.rect(sx + 2, 32, 7, 1, IRON_L)
            g.put(sx, 32, None)
            g.put(sx + 13, 32, None)
            g.put(sx, 37, None)
            g.put(sx + 13, 37, None)
            g.rect(sx + 3, 34, 2, 2, GOLD)
            g.rect(sx + 9, 34, 2, 2, GOLD)
        # Kahl rasierter Schädel: Haut-Rampe mit Schattenkante, kein Weißblock.
        g.rect(14, 14, 21, 3, SKIN)
        g.rect(15, 14, 19, 1, SKIN_L)
        g.rect(14, 16, 21, 1, SKIN_D)
        g.put(13, 20, SKIN_D)
        g.put(34, 20, SKIN_D)
        # Stirnreif mit 2x2-Goldnieten.
        g.rect(13, 18, 23, 3, IRON_D)
        g.rect(13, 18, 23, 2, IRON)
        g.rect(14, 18, 8, 1, IRON_L)
        for nx in (15, 25, 31):
            g.rect(nx, 18, 2, 2, GOLD)
            g.put(nx, 18, GOLD_L)
        # Narbe; Brauen werden erst nach dem Shading grau gesetzt.
        g.rect(31, 20, 2, 2, 25)
        g.put(33, 22, 24)
        # Grauer Bart: Kinnkante in Haut-Schatten, darunter 2-px-Cluster 8/9/10.
        g.rect(19, 31, 13, 1, SKIN_D)                 # 2-px-Kinnkante zum Gesicht
        g.put(22, 31, SKIN_D)
        g.put(27, 31, SKIN_D)
        g.rect(17, 32, 15, 4, 8)                      # Bartgrund dunkel
        g.rect(19, 32, 3, 2, 10)                      # Licht-Cluster oben links
        g.rect(24, 33, 3, 1, 10)
        g.rect(18, 33, 2, 2, 9)                       # Mittel-Cluster seitlich
        g.rect(27, 32, 3, 2, 9)
        g.rect(21, 34, 2, 1, 10)
        g.put(19, 35, 5)
        g.put(22, 35, 6)
        g.put(25, 35, 5)
        g.put(28, 35, 6)
        # Gebetskette, 2-px-Perlen.
        for x in range(13, 35, 4):
            g.rect(x, 36, 2, 2, GOLD)
            g.put(x, 36, GOLD_L)

    g = shade_edges(g, band=2)
    # Gesichtsdetails nach dem Shading scharf setzen (keine Glow-Flächen).
    # Beide Augen identisch: 3x2-Sockel, 2x2-Pupille, 1 px Glanz oben-links.
    for socket in (17, 29):
        g.rect(socket, 23, 3, 2, SKIN_L)
        g.rect(socket + 1, 23, 2, 2, EYE)
        g.put(socket + 1, 23, SKIN_L)
        g.rect(socket - 1, 22, 4, 1, HAIR_D if kind == "mira" else 8)  # Braue
    g.put(23, 27, SKIN_D)
    g.put(24, 27, SKIN_D)
    if kind == "mira":
        g.rect(23, 31, 3, 1, 24)                  # kleiner Mund (3 px)
        g.put(22, 31, 25)
        g.put(26, 31, 23)
    else:
        g.rect(23, 31, 3, 1, 23)                  # Mund im grauen Bart
        g.put(22, 31, 25)
        g.put(26, 31, 23)
    g = outline(g)
    return g


def build() -> dict:
    sprites: dict[str, list[Grid]] = {}

    def add(key: str, frames: list[Grid]):
        sprites[key] = [pad_grid(f, SIZE, SIZE) for f in frames]

    for name, fn in (("mira", mira_pose), ("kael", kael_pose)):
        add(f"player_{name}", [fn("down", 0, idle=True)])
        for d in ("down", "up", "side"):
            add(f"player_{name}_{d}", [fn(d, i) for i in range(4)])
            add(f"player_{name}_{d}_idle", [fn(d, i, idle=True) for i in range(2)])
        add(f"player_{name}_hit", [fn("down", 0, hit=True)])
        sprites[f"portrait_{name}"] = [portrait(name)]
    return sprites


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-chars.ts", "GEN_CHARS", data, "Spieler Mira/Kael (32x32, 4-Dir-Lauf, Idle, Hit, Portrait 48)")
    print("wrote", path, len(data), "keys")
    save_sheet_png(data["player_mira_down"] + data["player_mira_side"] + data["player_mira_up"],
                   os.path.join(SHOTS, "m4-ref-mira-walk.png"), scale=6)
    save_sheet_png(data["player_kael_down"] + data["player_kael_side"] + data["player_kael_up"],
                   os.path.join(SHOTS, "m4-ref-kael-walk.png"), scale=6)
    save_grid_png(data["portrait_mira"][0], os.path.join(SHOTS, "m4-ref-portrait-mira.png"), scale=6)
    save_grid_png(data["portrait_kael"][0], os.path.join(SHOTS, "m4-ref-portrait-kael.png"), scale=6)
