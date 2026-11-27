#!/usr/bin/env python3
"""fa-02: Kontaktboegen 30 Gegner + 6 Bosse auf exakt 640x360 (2-4x nearest fuer Vision).

Liest dieselben Generatoren wie das Spiel (scripts/art/gen_enemies.py, gen_bosses.py).
Ausgabe: shots/qa-enemy-contact-640.png, shots/qa-boss-contact-640.png und
@2x-Vergroesserungen (shots/qa-*-640@2x.png) fuer die Sichtpruefung.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "art"))
from contact import LABEL, LABEL_HI, TITLE, Sheet  # noqa: E402
from lib import PAL, SHOTS, write_rgba_png  # noqa: E402
import gen_bosses  # noqa: E402
import gen_enemies  # noqa: E402

W, H = 640, 360


def upscale(sheet: Sheet, factor: int):
    out = [(0, 0, 0, 255)] * (sheet.w * factor * sheet.h * factor)
    for y in range(sheet.h * factor):
        for x in range(sheet.w * factor):
            out[y * sheet.w * factor + x] = sheet.px[(y // factor) * sheet.w + (x // factor)]
    return out


def save_pair(sheet: Sheet, name: str):
    path = os.path.join(SHOTS, name)
    sheet.save(path)
    print(path)
    for f in (2, 4):
        big = upscale(sheet, f)
        bp = os.path.join(SHOTS, name.replace(".png", f"@{f}x.png"))
        write_rgba_png(bp, sheet.w * f, sheet.h * f, big)
        print(bp)


def enemies():
    data = gen_enemies.build()
    order = list(gen_enemies.TIER.keys())
    sheet = Sheet(W, H)
    sheet.text(8, 4, "LANTERNFALL  fa-02  -  30 GEGNER  -  640x360", TITLE, 1)
    cols, rows = 6, 5
    cell_w, cell_h = W // cols, (H - 18) // rows
    for tier in range(5):
        ids = [e for e in order if gen_enemies.TIER[e] == tier]
        for idx, eid in enumerate(ids):
            x = (idx % cols) * cell_w
            y = 18 + tier * cell_h
            sheet.cell(x, y, cell_w - 2, cell_h - 2, idx % 2 == 1)
            frames = data[f"enemy_{eid}"]
            big = frames[0]
            scale = 2 if big.w <= 24 else 1
            sheet.blit(big, x + (cell_w - big.w * scale) // 2, y + 4, scale)
            sheet.text(x + 2, y + cell_h - 9, eid.upper(), LABEL_HI, 1)
            sheet.text(x + 2, y + 2, f"T{tier}", LABEL, 1)
    save_pair(sheet, "qa-enemy-contact-640.png")


def bosses():
    data = gen_bosses.build()
    ids = list(gen_bosses.DRAW.keys())
    sheet = Sheet(W, H)
    sheet.text(8, 4, "LANTERNFALL  fa-02  -  6 BOSSE  -  640x360", TITLE, 1)
    cols, rows = 3, 2
    cell_w, cell_h = W // cols, (H - 18) // rows
    for i, bid in enumerate(ids[:6]):
        x = (i % cols) * cell_w
        y = 18 + (i // cols) * cell_h
        sheet.cell(x, y, cell_w - 2, cell_h - 2, i % 2 == 1)
        grid = data[f"boss_{bid}"][0]
        scale = 2 if grid.w * 2 <= cell_w - 12 else 1
        sheet.blit(grid, x + (cell_w - grid.w * scale) // 2, y + 6, scale)
        sheet.text(x + 3, y + cell_h - 10, bid.upper(), LABEL_HI, 1)
    save_pair(sheet, "qa-boss-contact-640.png")


if __name__ == "__main__":
    enemies()
    bosses()
