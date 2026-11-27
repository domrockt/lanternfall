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
# Warme Haut-Rampe (M4b): Schatten emberBrown 16, Basis fleshWarm 27,
# Licht lantern 21 nur als 1-px-Kante. Hands warm, keine graue Haut.
SKIN, SKIN_D, SKIN_L = 27, 16, 21
HAND, HAND_S, HAND_L = 27, 16, 21
BLUSH = 26
HAIR, HAIR_D = 24, 23
CLOTH, CLOTH_S, CLOTH_L, CLOTH_H = 25, 23, 26, 27
BOOT, BOOT_D = 16, 14
BELT, BELT_D = 16, 14
GOLD, GOLD_L = 20, 21
GLOW, GLOW_H = 22, 13
IRON, IRON_D, IRON_L = 5, 4, 7
STEEL_L = 6
RUST, RUST_D, RUST_L = 17, 15, 18
CHAIN, CHAIN_L = 4, 6
ROBE, ROBE_D, ROBE_L = 3, 2, 4
SCARF = 20
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


RIM_BODY = {ROBE, ROBE_D, ROBE_L, IRON, IRON_D, IRON_L, STEEL_L, CHAIN, CHAIN_L,
            CLOTH, CLOTH_S, CLOTH_L, CLOTH_H, HAIR, HAIR_D, BOOT, BOOT_D,
            BELT, BELT_D, 8, 10, 11}


def warm_rim(g: Grid, col: int = 22):
    """1-px-warme Lichtkante oben-links (Spieler-Leseszeichen).

    Setzt koerpliche Pixel (RIM_BODY), die nach oben oder links an Transparenz
    grenzen, auf warme Laterne-Farbe. Helden tragen Licht -> hellere Kontur
    ohne die dunkle Kontur zu ersetzen; Gegner bleiben unangetastet.
    """
    pts = []
    for y in range(g.h):
        for x in range(g.w):
            if g.px[y][x] in RIM_BODY and (not g.filled(x, y - 1) or not g.filled(x - 1, y)):
                pts.append((x, y))
    for x, y in pts:
        g.put(x, y, col)


def mira_pose(direction: str, frame: int = 0, idle: bool = False, hit: bool = False) -> Grid:
    g = Grid(SIZE, SIZE)
    side = direction == "side"
    up = direction == "up"
    step = 0 if idle else [0, 1, 2, 3][frame]
    bob = 0 if idle else [0, 1, 0, 1][frame]
    if idle and frame == 1:
        bob = 1
    recoil = 3 if hit else 0
    cx = 16
    ox = 1 if side else 0           # Profil leicht nach vorn versetzt
    bw = 2 if side else 0           # Profil schmaler

    body_y = 16 + bob - recoil
    # ── Rock/Cloak: schmaler Umhang (Mira-Silhouette), Saum mit Goldborte ──
    rock_w = [12 - bw, 13 - bw, 14 - bw, 15 - bw, 16 - bw, 17 - bw, 17 - bw]
    hem = 26 + bob - recoil
    for i, w in enumerate(rock_w):
        g.rect(cx + ox - w // 2, 22 + bob - recoil + i, w, 1, CLOTH if i < 5 else CLOTH_S)
    g.rect(cx + ox - (8 - bw), hem, 17 - bw, 1, CLOTH_S)
    # Goldene Saumborte: nur 9 px in der Mitte, damit der Akzent sitzt.
    g.rect(cx + ox - 4, hem, 9, 1, GOLD)
    g.put(cx + ox - 4, hem, GOLD_L)
    g.put(cx + ox + 4, hem, GOLD_L)
    for fold in (-4, -1, 1, 4):
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
        g.rect(hcx - 6, brim_y - 1, 13, 1, GOLD)
        g.put(hcx - 6, brim_y - 1, GOLD_L)
    else:
        # Breitere Krempe und hoeherer Kegel fuer eine klare Hut-Silhouette.
        g.rect(hcx - 12, brim_y + 1, 25, 2, CLOTH_S)
        g.rect(hcx - 11, brim_y, 23, 2, CLOTH)
        g.put(hcx - 12, brim_y + 1, CLOTH_S)
        g.put(hcx + 12, brim_y + 1, CLOTH_S)
        g.put(hcx - 11, brim_y, CLOTH_L)
        g.put(hcx - 10, brim_y, CLOTH_L)
        g.put(hcx + 10, brim_y + 1, CLOTH_S)
        g.put(hcx + 11, brim_y + 1, CLOTH_S)
        _cone(g, hcx, brim_y - 8, brim_y - 1, 7, 4, CLOTH, CLOTH_S)
        g.rect(hcx - 5, brim_y - 1, 11, 1, CLOTH_H)
        g.put(hcx - 5, brim_y - 1, 26)
        g.put(hcx - 4, brim_y - 1, 26)
        g.put(hcx + 5, brim_y - 1, 23)
        # Goldene Hutborte als warme Mitte zweiter Akzent (GOLD-Rampe).
        g.rect(hcx - 7, brim_y - 1, 15  , 1, GOLD)
        g.put(hcx - 7, brim_y - 1, GOLD_L)
        g.put(hcx + 7, brim_y - 1, GOLD_L)

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
    # Warmes Lichtkreuz um die Laterne hebt Mira im Gedraenge heraus.
    g.put(lx - 4, ly + 2, GOLD_L)
    g.put(lx + 4, ly + 2, GOLD_L)
    g.put(lx - 1, ly - 3, GLOW)
    g.put(lx + 2, ly - 3, GLOW_H)
    g.put(lx - 3, ly - 1, GOLD)
    g.put(lx + 4, ly - 1, GOLD)


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
    warm_rim(g)
    g = outline(g)
    return g


def kael_pose(direction: str, frame: int = 0, idle: bool = False, hit: bool = False) -> Grid:
    """Bruder Kael: breite Schultern, Tonsur mit Eisenreif, Kettengewand als
    drei klare Eisenbaender, warme Haut, dunkelroter Bart."""
    g = Grid(SIZE, SIZE)
    side = direction == "side"
    up = direction == "up"
    step = 0 if idle else [0, 1, 2, 3][frame]
    bob = 0 if idle else [0, 1, 0, 1][frame]
    if idle and frame == 1:
        bob = 1
    recoil = 3 if hit else 0
    cx = 16
    ox = 1 if side else 0
    bw = 2 if side else 0

    body_y = 16 + bob - recoil
    # ── Gewand-Silhouette: breite Schulter, Taille, ausgestellter Saum ──
    widths = [23, 23, 17, 16, 16, 16, 17, 17, 18, 18, 20, 20]
    for i, w in enumerate(widths):
        w -= bw
        y = body_y + i
        x = cx + ox - w // 2
        g.rect(x, y, w, 1, ROBE)
        g.put(x, y, ROBE_L)
        g.put(x + w - 1, y, ROBE_D)

    # ── Schwere Stiefel: kurze, stampfende Schritte (Kael wirkt schwerer) ──
    lift_l = 1 if (not idle and step == 1) else 0
    lift_r = 1 if (not idle and step == 3) else 0
    if side:
        fwd_arr  = [1, 0, -2, -1]
        back_arr = [-1, 0, 2, 1]
        lift_f_arr = [0, 1, 0, 0]
        lift_b_arr = [0, 0, 0, 1]
        fwd, back = fwd_arr[step], back_arr[step]
        lift_f, lift_b = lift_f_arr[step], lift_b_arr[step]
        fx = cx + 3 + fwd
        g.rect(fx - 2, 28 - lift_f, 5, 4 + lift_f, BOOT_D)
        g.rect(fx - 1, 28 - lift_f, 4, 3 + lift_f, BOOT)
        g.rect(fx - 1, 28 - lift_f, 2, 1, BELT)
        bx = cx - 5 + back
        g.rect(bx, 28 - lift_b, 4, 4 + lift_b, BOOT_D)
        g.rect(bx + 1, 28 - lift_b, 3, 3 + lift_b, BOOT)
    else:
        for side_i, lift in ((-1, lift_l), (1, lift_r)):
            lx = cx + (-6 if side_i < 0 else 2) + (step - 1) * side_i
            ly = 28 - lift
            g.rect(lx, ly, 5, 4 + lift, BOOT_D)
            g.rect(lx + 1, ly, 4, 3, BOOT)
            g.rect(lx + 2, ly, 2, 1, BELT)

    # ── Kettengewand: drei klare Eisenbaender (je 2 px, 1 px Robe dazwischen) ──
    def band(y: int, w: int, rust: bool = False):
        x = cx + ox - w // 2
        g.rect(x, y, w, 2, IRON_D)
        g.rect(x, y, w, 1, IRON)
        g.rect(x, y, 3, 1, IRON_L)
        if rust:
            g.rect(cx + ox - 1, y, 2, 2, RUST)
            g.put(cx + ox - 1, y, RUST_L)

    # ── Zweihandaxt: Rost-Schaft rechts, einschneidiges Blatt nur AUSSEN
    #     (rechts) mit langer Stahlschneide und Bart. Wird vor dem Gewand
    #     gezeichnet, damit der Schaft hinter den Schulterplatten liegt.
    top_y = body_y - 10
    g.rect(26, top_y + 1, 2, 18, BOOT_D)         # Schaft
    g.vline(26, top_y + 1, 22, BOOT)
    blade = [(0, 28, 30), (1, 27, 30), (2, 27, 31), (3, 27, 31),
             (4, 27, 31), (5, 27, 31), (6, 28, 31), (7, 29, 31),
             (8, 30, 31)]
    for dy, x0, x1 in blade:
        y = top_y + dy
        g.rect(x0, y, x1 - x0, 1, IRON)
    g.vline(30, top_y + 2, top_y + 8, STEEL_L)   # Schneide aussen rechts
    g.put(28, top_y, IRON_L)
    g.put(29, top_y, STEEL_L)
    g.rect(27, top_y + 2, 2, 2, RUST)            # Rost-Socket
    g.put(27, top_y + 2, RUST_L)

    band(body_y + 1, 21 - bw)           # Schulterband
    band(body_y + 4, 17 - bw, True)     # Brustband mit Rostschloss
    band(body_y + 8, 19 - bw)           # Saumband

    # ── Schulterplatten (abgerundet, sehr breite Silhouette, Rost-Niete) ──
    def pauldron(x0: int, y0: int, w: int):
        g.rect(x0 + 1, y0, w - 2, 1, IRON)
        g.rect(x0, y0 + 1, w, 2, IRON)
        g.rect(x0 + 1, y0 + 2, w - 2, 1, IRON_D)   # Unterkante gerundet
        g.rect(x0, y0 + 1, w, 1, IRON_D)
        g.rect(x0, y0 + 1, 1, 2, IRON_D)
        g.rect(x0 + w - 1, y0 + 1, 1, 2, IRON_D)
        g.rect(x0 + 1, y0, w - 3, 1, IRON_L)
        g.rect(x0 + w // 2 - 1, y0 + 1, 2, 2, RUST)
        g.put(x0 + w // 2 - 1, y0 + 1, RUST_L)

    if side:
        pauldron(cx + ox + 6, body_y, 8)
    else:
        pauldron(1, body_y, 9)
        pauldron(22, body_y, 9)

    # ── Arme (gewickelte Faeuste, Handschuh-Rampe 8/10/11) ──
    swing = 0 if idle else [1, 0, -1, 0][frame]
    if side:
        g.rect(cx + 4 + swing, body_y + 3, 3, 4, ROBE_D)   # vorderer Aermel
        g.rect(cx + 4 + swing, body_y + 7, 3, 1, 11)       # Wickel
        fx = cx + 3 + swing
        g.rect(fx, body_y + 8, 5, 3, 10)
        g.rect(fx, body_y + 8, 5, 1, 11)
        g.rect(fx, body_y + 10, 5, 1, 8)
        g.rect(fx + 1, body_y + 9, 2, 1, 10)
        g.rect(cx - 6 - swing, body_y + 4, 2, 4, ROBE_D)   # hinterer Arm
        g.rect(cx - 6 - swing, body_y + 8, 2, 3, 10)
    else:
        for side_i in (-1, 1):
            ax = cx + ox + (8 if side_i > 0 else -10)
            if hit:
                ax += 1 if side_i > 0 else -1
            g.rect(ax, body_y + 3, 2, 4, ROBE_D)
            g.rect(ax, body_y + 7, 2, 1, 11)
            fx = ax - 1 if side_i > 0 else ax - 2
            g.rect(fx, body_y + 9, 5, 3, 10)
            g.rect(fx, body_y + 9, 5, 1, 11)
            g.rect(fx, body_y + 11, 5, 1, 8)
            g.rect(fx + 1, body_y + 10, 2, 1, 10)
            g.rect(fx + 3, body_y + 10, 1, 1, 8)

    # ── Kopf: Tonsur (dunkelrotes Haar) + Eisenreif, breite Kiefer ──
    hy = 13 + bob - recoil
    hcx = cx + ox + (2 if hit and not side else 0)
    face = []
    if side:
        # Tonsur-Haarreif am Hinterkopf, Stirn kahl.
        g.rect(hcx - 4, hy - 5, 2, 2, HAIR_D)
        g.ellipse(hcx, hy, 4, 4, SKIN)
        g.rect(hcx - 3, hy + 2, 6, 3, SKIN)
        g.rect(hcx - 4, hy, 2, 4, HAIR_D)             # Hinterkopf-Haar
        g.put(hcx - 4, hy, HAIR)
        g.put(hcx - 5, hy + 1, SKIN_D)
        g.put(hcx - 4, hy + 3, SKIN_D)
        g.put(hcx + 4, hy, SKIN_D)
        # Eisenreif
        g.rect(hcx - 4, hy - 3, 9, 2, IRON_D)
        g.rect(hcx - 4, hy - 3, 9, 1, IRON)
        g.rect(hcx - 4, hy - 3, 3, 1, IRON_L)
        g.rect(hcx + 2, hy - 3, 2, 2, RUST)
        g.put(hcx + 2, hy - 3, RUST_L)
        # Nase als Silhouette
        g.rect(hcx + 4, hy, 2, 1, SKIN)
        g.rect(hcx + 4, hy + 1, 2, 1, SKIN_D)
        # Bart dunkelrot, Mund
        g.rect(hcx + 2, hy + 2, 3, 2, HAIR_D)
        g.rect(hcx + 2, hy + 2, 3, 1, HAIR)
        g.put(hcx + 3, hy + 3, SKIN_D)
        face += [(hcx + 3, hy + 3, INK), (hcx + 4, hy + 3, INK)]
        g.rect(hcx + 2, hy, 2, 2, EYE)
    else:
        # Tonsur-Haar als Kranz ueber dem Eisenreif.
        g.rect(hcx - 4, hy - 5, 9, 2, HAIR_D)
        g.rect(hcx - 3, hy - 5, 4, 1, HAIR)
        g.ellipse(hcx, hy, 5, 4, SKIN)
        g.rect(hcx - 4, hy + 2, 9, 3, SKIN)           # breite Kiefer
        # Eisenreif (2 px), 2x2-Rostniete mittig.
        g.rect(hcx - 5, hy - 3, 11, 2, IRON_D)
        g.rect(hcx - 5, hy - 3, 11, 1, IRON)
        g.rect(hcx - 5, hy - 3, 4, 1, IRON_L)
        g.rect(hcx - 1, hy - 3, 2, 2, RUST)
        g.put(hcx - 1, hy - 3, RUST_L)
        # Wangen-Schatten (2 px Gruppen).
        g.rect(hcx - 5, hy + 1, 2, 1, SKIN_D)
        g.rect(hcx + 4, hy + 1, 2, 1, SKIN_D)
        if up:
            # Hinterkopf: Tonsur-Haar bedeckt den Nacken.
            g.rect(hcx - 4, hy + 1, 9, 4, HAIR_D)
            g.rect(hcx - 3, hy + 1, 4, 1, HAIR)
            g.rect(hcx - 1, hy + 2, 3, 1, 24)
        else:
            # Bart: dunkelrote 2-px-Cluster an den Kiefern.
            g.rect(hcx - 4, hy + 2, 2, 3, HAIR_D)
            g.rect(hcx + 2, hy + 2, 2, 3, HAIR_D)
            g.rect(hcx - 4, hy + 2, 2, 1, HAIR)
            g.rect(hcx + 3, hy + 2, 1, 1, HAIR)
            # Nase 2 px, Mund 2 px, Kinn bleibt Haut.
            g.rect(hcx - 1, hy + 1, 2, 1, SKIN_D)
            g.rect(hcx - 1, hy + 2, 2, 1, SKIN_L)
            face += [(hcx - 1, hy + 3, INK), (hcx, hy + 3, INK)]
            face += [(hcx - 2, hy + 2, 24), (hcx + 1, hy + 2, 24)]

    g = shade_edges(g, band=1)
    if not up:
        if side:
            g.rect(hcx + 2, hy, 2, 2, EYE)
            face += [(hcx + 2, hy, SKIN_L)]
            g.rect(hcx + 2, hy + 2, 3, 2, HAIR_D)
        else:
            g.rect(hcx - 4, hy, 2, 2, EYE)
            g.rect(hcx + 2, hy, 2, 2, EYE)
            face += [(hcx - 4, hy, SKIN_L), (hcx + 2, hy, SKIN_L)]
    for x, y, c in face:
        g.put(x, y, c)
    warm_rim(g)
    g = outline(g)
    return g


def _trapezoid(g: Grid, y0: int, y1: int, xt0: int, xt1: int, xb0: int, xb1: int, col: int):
    """Trapez/Keil: Reihen y0..y1, obere Kante xt0..xt1, untere xb0..xb1.

    Fuer schraeg auslaufende Schultern (keine Box-Silhouette).
    """
    h = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        t = (y - y0) / h
        g.hline(round(xt0 + (xb0 - xt0) * t), round(xt1 + (xb1 - xt1) * t), y, col)


def _lantern(g: Grid, cx: int, top_y: int):
    """Hangende Laterne (7x10) mit Buegel; Anker (cx, top_y) = Buegelscheitel."""
    g.put(cx, top_y, GOLD)                       # Buegel
    g.put(cx - 1, top_y + 1, GOLD)
    g.put(cx + 1, top_y + 1, GOLD)
    g.rect(cx - 2, top_y + 2, 5, 1, GOLD)        # Deckel
    g.put(cx - 2, top_y + 2, GOLD_L)
    g.rect(cx - 2, top_y + 3, 5, 6, 17)          # Rahmen emberOrange
    g.rect(cx - 1, top_y + 3, 3, 6, GOLD)        # Glasfassung Bernstein
    g.rect(cx - 1, top_y + 4, 3, 4, GLOW)        # Glutkern
    g.rect(cx, top_y + 5, 1, 2, GLOW_H)          # heisse Mitte (2 px)
    g.rect(cx - 2, top_y + 9, 5, 1, 16)          # Fuss
    g.rect(cx - 3, top_y + 4, 1, 2, GOLD_L)      # warmer Schein links
    g.rect(cx + 3, top_y + 4, 1, 2, GOLD_L)      # warmer Schein rechts


def portrait(kind: str) -> Grid:
    """48x48-Bueste fuer CharSelect — beide Figuren mit Augenlinie y=24.

    Mira: Laternen-Hexe — glatter Hexenhut (Kegel + Goldborte + Krempe),
    Locken bis auf die Schultern, feines symmetrisches Gesicht, rotes Tuch,
    Laterne in der Hand.
    Kael: Eisen-Moench — spitze Kapuze mit ueber die Schultern ausgehaengten
    Kuttenklappen, weite Kutte mit Falten, Strickguertel, Eisenreif (Tonsure),
    grauer Bart, Laterne in der Hand.
    """
    g = Grid(48, 48)
    if kind == "mira":
        # Koerper: schraeg auslaufende Schulterpartie mit Stofffalten (keine Box).
        _trapezoid(g, 35, 47, 14, 34, 6, 42, CLOTH)
        g.vline(12, 38, 47, CLOTH_S)                  # Falte links
        g.vline(36, 38, 47, CLOTH_S)                  # Falte rechts
        g.vline(29, 39, 47, CLOTH_S)                  # Falte Mitte-rechts
        # Hals (vom Schal verdeckt).
        g.rect(21, 33, 7, 2, SKIN)
        # Kopf: weiches Oval mit spitzem Kinn.
        g.ellipse(24, 25, 10, 9, SKIN)
        # Haar: Pony unter dem Hut, Wellen-Locken bis auf die Schultern.
        g.rect(14, 16, 21, 3, HAIR)                   # Pony
        g.rect(14, 18, 21, 1, HAIR_D)                 # Pony-Kante
        g.rect(12, 16, 5, 10, HAIR)                   # Lockenansatz links
        g.rect(11, 24, 5, 3, HAIR)                    # Welle links
        g.rect(11, 27, 4, 3, HAIR_D)
        g.rect(12, 30, 3, 3, HAIR)                    # Lockenende links
        g.rect(32, 16, 5, 10, HAIR)                   # Lockenansatz rechts
        g.rect(33, 24, 5, 3, HAIR)                    # Welle rechts
        g.rect(34, 27, 4, 3, HAIR_D)
        g.rect(34, 30, 3, 3, HAIR)                    # Lockenende rechts
        # Hexenhut: glatter Kegel mit Knick, goldene Borte, glatte Krempe.
        _cone(g, 24, 3, 12, 8, 3, CLOTH, CLOTH_S)
        g.put(27, 2, CLOTH)                           # Hutspitze
        g.rect(17, 11, 15, 2, GOLD)                   # Borte
        g.rect(18, 11, 4, 1, GOLD_L)
        g.hline(11, 37, 13, CLOTH)                    # Krempe (glatte Stufen)
        g.hline(9, 39, 14, CLOTH)
        g.hline(9, 39, 15, CLOTH_S)                   # Krempe, Unterseite
        # Rotes Tuch ueber die Schultern: Band + Knoten + herablaufendes Ende.
        g.rect(13, 34, 23, 3, SCARF)
        g.rect(22, 35, 5, 3, SCARF)                   # Knoten
        g.put(22, 35, GOLD_L)
        g.rect(25, 36, 2, 2, 16)
        g.rect(23, 38, 3, 4, SCARF)                   # Tuch-Ende
        g.vline(25, 38, 41, 16)
        g.put(23, 38, GOLD_L)
        # Wangen-Rouge: je 2x2 gruppiert, symmetrisch.
        g.rect(16, 28, 2, 2, BLUSH)
        g.rect(31, 28, 2, 2, BLUSH)
        # Aermel, Hand und Laterne mit Buegel (silhouettenpraegender Akzent).
        g.rect(32, 34, 5, 4, CLOTH_S)                 # Aermel
        g.rect(37, 34, 4, 3, SKIN)                    # Hand
        g.rect(37, 36, 4, 1, SKIN_D)                  # Handschatten
        _lantern(g, 41, 35)
    else:
        # ── Bruder Kael: Eisen-Moench mit spitzer Kapuze und Kutte ──
        # Portrait-Rampe der Kutte: 4/3/6 (lesbar vor dem Nacht-Panel).
        K_ROBE, K_ROBE_D, K_ROBE_L = 4, 3, 6
        # Kutte: schraeg auslaufende Moenchsrobe mit vertikalen Falten.
        _trapezoid(g, 36, 47, 16, 32, 5, 43, K_ROBE)
        g.vline(14, 41, 47, K_ROBE_D)                 # Falte links
        g.vline(33, 41, 47, K_ROBE_D)                 # Falte rechts
        # Strickguertel um die Taille: Rope + Knoten + herabhaengende Enden.
        g.hline(10, 38, 42, 19)
        g.hline(9, 39, 43, 19)
        g.hline(10, 38, 44, 17)
        g.rect(22, 41, 5, 4, 19)                      # Knoten
        g.put(22, 41, 20)
        g.rect(25, 42, 2, 2, 17)
        g.vline(23, 45, 47, 19)                       # Guertelende links
        g.vline(26, 45, 47, 17)                       # Guertelende rechts
        # Kuttenklappen: ueber die Schultern nach unten gelegt (weite Silhouette).
        _trapezoid(g, 16, 40, 10, 13, 7, 15, K_ROBE)  # links
        _trapezoid(g, 16, 40, 35, 38, 33, 41, K_ROBE) # rechts
        # Kapuze: spitz zulaufend mit deutlichem Spitzen-Oberteil.
        _trapezoid(g, 2, 18, 23, 25, 10, 38, K_ROBE)
        g.put(24, 1, K_ROBE)                          # Kapuzenspitze
        # Gesichtsfenster mit dunklem Innenrand.
        g.ellipse(24, 24, 12, 11, K_ROBE_D)
        g.ellipse(24, 24, 9, 8, SKIN)
        # Tonsure: grauer Haarkranz am Rand, kahle Stirn über dem Eisenreif.
        g.rect(21, 17, 7, 1, 8)
        g.rect(19, 18, 2, 1, 8)
        g.rect(28, 18, 2, 1, 8)
        # Eiserner Reif mit Rost-Niete (Eisen-Moench).
        g.rect(16, 20, 17, 2, IRON_D)
        g.rect(16, 20, 17, 1, IRON)
        g.rect(16, 20, 5, 1, IRON_L)
        g.rect(23, 20, 2, 2, RUST)
        g.put(23, 20, RUST_L)
        # Grauer Bart (Knochen-Rampe 8/9/10), haengt ueber den Kragen.
        g.rect(15, 29, 19, 6, 8)
        g.rect(15, 35, 19, 1, 8)
        g.rect(19, 30, 3, 1, 9)
        g.rect(26, 30, 3, 1, 9)
        g.rect(17, 34, 3, 1, 10)
        g.rect(27, 34, 4, 1, 10)
        g.rect(18, 35, 13, 1, 10)                     # Kinnkante
        # Aermel, Hand und Laterne in der Rechten (warmer Akzent am Koerper).
        g.rect(35, 35, 4, 4, K_ROBE_D)                # Aermel
        g.rect(39, 36, 4, 3, SKIN)                    # Hand
        g.rect(39, 38, 4, 1, SKIN_D)                  # Handschatten
        _lantern(g, 42, 38)

    g = shade_edges(g, band=2)
    # Gesichtsdetails nach dem Shading scharf setzen (keine Glow-Flächen).
    # Beide Augen identisch und symmetrisch: 3x2-Sockel, 2x2-Pupille,
    # 1 px Glanz oben-links; Augenlinie y=23/24 fuer beide Figuren.
    for socket in (17, 29):
        g.rect(socket, 23, 3, 2, SKIN)
        g.rect(socket + 1, 23, 2, 2, EYE)
        g.put(socket + 1, 23, SKIN_L)
        g.rect(socket - 1, 22, 4, 1, HAIR_D if kind == "mira" else 8)
    g.put(23, 27, SKIN_D)
    g.put(24, 27, SKIN_D)
    if kind == "mira":
        g.rect(23, 31, 3, 1, 24)                      # kleiner Mund, mittelsymmetrisch
        g.put(23, 31, 25)
        g.put(25, 31, 25)
        # Glutkern nachziehen (Shading hatte 1 px auf Knochen (10) verdunkelt —
        # art-director: schwebende helle Einzelpixel).
        g.rect(41, 40, 1, 2, GLOW_H)
    else:
        g.rect(23, 31, 3, 1, 14)                      # Mund im grauen Bart
        g.rect(21, 31, 2, 1, 9)
        g.rect(26, 31, 2, 1, 9)
        # Laterne: Hand-Block über dem Deckel in Metall-Laternenkopf umfärben
        # (art-director: fleischfarbener Block auf der Kerze las sich als Hand).
        g.rect(39, 36, 4, 1, GOLD_L)                  # Deckel-Licht
        g.rect(39, 37, 4, 1, GOLD)                    # Deckel
        g.rect(39, 38, 4, 1, 17)                      # Rahmen emberOrange
        # Glutkern scharf nachziehen (wie bei Mira).
        g.rect(42, 43, 1, 2, GLOW_H)
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
