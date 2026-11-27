#!/usr/bin/env python3
"""Kontaktbogen der 4 Gegner-Schuss-Optiken (M10-Lesbarkeit).

Liest die HD-Grids aus src/systems/EnemyProjectiles.ts und rendert sie 10x nearest
auf Nacht-/Wasserhintergrund nebeneinander, mit Palettenindex-Legende je Optik.
Ausgabe: shots/m10-enemy-enemy-shots-optics.png -> korrekt: m10-enemy-shots-optics.png

Aufruf: python3 scripts/art/optics-enemy-shots.py
"""
from __future__ import annotations

import os
import re
import sys

from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from lib import PAL, ROOT, SHOTS, draw_text, write_rgba_png  # noqa: E402


def load_grids():
    text = (Path(ROOT) / "src/systems/EnemyProjectiles.ts").read_text(encoding="utf-8")
    body = text.split("const HD_GRIDS: Record<string, string[]> = {", 1)[1].split("\n};", 1)[0]
    grids = {}
    for m in re.finditer(r"(\w+):\s*\[(.*?)\]", body, re.S):
        grids[m.group(1)] = re.findall(r'"([^"]*)"', m.group(2))
    return grids


def main():
    grids = load_grids()
    scale = 10
    pad = 8
    label_h = 14
    w = sum(len(rows[0]) for rows in grids.values()) * scale + pad * (len(grids) + 1)
    h = max(len(rows) for rows in grids.values()) * scale + pad * 2 + label_h
    canvas_w, canvas_h = w, h
    px = [(PAL[1][0], PAL[1][1], PAL[1][2], 255)] * (canvas_w * canvas_h)

    class Canvas:
        def __init__(self, w, h, pixels):
            self.w, self.h, self.px = w, h, pixels

        def set(self, x, y, c):
            if 0 <= x < self.w and 0 <= y < self.h:
                self.px[y * self.w + x] = (c[0], c[1], c[2], 255)

        def rect(self, x, y, rw, rh, c):
            for yy in range(y, y + rh):
                for xx in range(x, x + rw):
                    self.set(xx, yy, c)

    cv = Canvas(canvas_w, canvas_h, px)
    # Wasserband unten als zweiter Hintergrund (waterMid, Index 7).
    cv.rect(0, canvas_h - 24, canvas_w, 24, PAL[7])

    x = pad
    for family, rows in grids.items():
        gx, gy = x, pad
        for yy, row in enumerate(rows):
            for xx, ch in enumerate(row):
                if ch == ".":
                    continue
                if "0" <= ch <= "9":
                    idx = ord(ch) - 48
                elif "a" <= ch <= "z":
                    idx = ord(ch) - 97 + 10
                else:
                    continue
                color = PAL[idx] if idx < len(PAL) else PAL[0]
                cv.rect(gx + xx * scale, gy + yy * scale, scale, scale, color)
        draw_text((cv.px, cv.w), gx, gy + len(rows) * scale + 2, family, PAL[13] + (255,), 1)
        x += len(rows[0]) * scale + pad

    # direkter PNG-Weg (RGBA-Puffer, Palette exakt)
    from lib import write_rgba_png  # noqa: E402
    dest = Path(SHOTS) / "m10-enemy-shots-optics.png"
    write_rgba_png(str(dest), cv.w, cv.h, cv.px)
    print("geschrieben:", dest)


if __name__ == "__main__":
    main()
