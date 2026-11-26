#!/usr/bin/env python3
"""Kontaktbogen pro Tier fuer M9: 3 Gegner je Bild, 4 Frames je Zeile, 6x, dunkler Grund."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lib
from gen_enemies import build, TIER

SCALE = 6
BG = 1
GAP = 3
LABEL_H = 16
ROW_GAP = 6


def make_group(data, group, path):
    rows = []
    for e in group:
        frames = data["enemy_" + e]
        fw = frames[0].w
        g = lib.Grid(len(frames) * (fw + GAP), frames[0].h)
        for i, fr in enumerate(frames):
            g.blit(fr, i * (fw + GAP), 0)
        rows.append((e, g))
    total_w = max(g.w for _, g in rows) + 8
    total_h = sum(g.h + LABEL_H + ROW_GAP for _, g in rows) + 8
    canvas = lib.Grid(total_w, total_h, BG)
    y = 4
    for _e, g in rows:
        canvas.blit(g, 4, y + LABEL_H)
        y += g.h + LABEL_H + ROW_GAP
    pix = lib.grid_rgba(canvas, bg=lib.PAL[BG])
    y = 4
    for e, g in rows:
        lib.draw_text((pix, total_w), 4, y, e, color=lib.PAL[11] + (255,), scale=2)
        y += g.h + LABEL_H + ROW_GAP
    w2 = total_w * SCALE
    h2 = total_h * SCALE
    big = [pix[(yy // SCALE) * total_w + (xx // SCALE)]
           for yy in range(h2) for xx in range(w2)]
    lib.write_rgba_png(path, w2, h2, big)
    print("wrote", path, group)


def main():
    data = build()
    for tier in (0, 1, 2, 3, 4):
        names = [e for e, t in TIER.items() if t == tier]
        for gi in range(0, len(names), 3):
            group = names[gi:gi + 3]
            path = os.path.join(
                lib.SHOTS, "m9-art-enemies-tier%d-%d.png" % (tier, gi // 3 + 1))
            make_group(data, group, path)


if __name__ == "__main__":
    main()
