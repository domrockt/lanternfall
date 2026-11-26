#!/usr/bin/env python3
"""Titelbild 480x270: Moor-Horizont bei Nacht mit Mondlaterne, toten Bäumen,
Nebelschwaden und Glühwürmchen. Wird als Hintergrundtextur im Titel verwendet
(das Emblem liegt separat obenauf). Palette-only, keine Off-Palette-Farben.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, ROOT, SHOTS, emit_ts, outline, save_grid_png  # noqa: E402

W, H = 480, 270


def _hash(x: int, y: int, s: int) -> float:
    n = (x * 374761393 + y * 668265263 + s * 1442695040888963407) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def _noise(x: float, y: float, s: int) -> float:
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - x0, y - y0
    v00 = _hash(x0, y0, s)
    v10 = _hash(x0 + 1, y0, s)
    v01 = _hash(x0, y0 + 1, s)
    v11 = _hash(x0 + 1, y0 + 1, s)
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy


def sky(g: Grid) -> None:
    # Gebänderter Nachthimmel 1 -> 2 -> 3 -> 4, Übergänge als breite Blöcke.
    bands = [(0, 42, 1), (42, 74, 2), (74, 98, 2), (98, 122, 3), (122, 146, 3), (146, 158, 4)]
    for y0, y1, c in bands:
        g.rect(0, y0, W, y1 - y0, c)
    # Sternenstaub: gruppierte 2x1-Paare, keine Einzelpixel.
    for i in range(24):
        sx = int(_hash(i, 1, 9) * (W - 8)) + 2
        sy = int(_hash(i, 2, 9) * 118) + 4
        g.rect(sx, sy, 2, 1, 6 if i % 3 else 7)
    # Stern-Gruppen: L-Cluster (4 px) und Einzelpixel-Rauschen.
    for sx, sy in ((78, 22), (262, 38), (452, 90), (150, 104)):
        g.rect(sx, sy, 2, 1, 7)
        g.rect(sx, sy + 1, 1, 2, 6)
        g.put(sx + 3, sy + 2, 7)
    # Kreuzfunken: 3x3-Kern.
    for sx, sy in ((318, 16), (360, 84), (58, 88), (206, 68)):
        g.rect(sx - 1, sy, 3, 1, 13)
        g.rect(sx, sy - 1, 1, 3, 13)
        g.put(sx, sy, 12)
    # Mondlaterne: runder Glaskörper in Eisenring, Licht von oben-links.
    cx, cy, r = 404, 56, 24
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d = math.hypot(x - cx, y - cy)
            if d > r:
                continue
            if d > r - 2:
                g.put(x, y, 4)                       # Eisenring
            elif d > r - 7:
                g.put(x, y, 20)                      # äußerer Glutring
            elif d > r - 12:
                g.put(x, y, 21)
            elif d > r - 17:
                g.put(x, y, 22)
            else:
                g.put(x, y, 13)
    # Harte, unterbrochene Pixelringe als Halo (statt ADD-Glow).
    for rr, col, seg in ((28, 19, 9), (32, 20, 7), (36, 19, 5)):
        for deg in range(0, 360, 2):
            if (deg // 2) % (seg + 3) >= seg:
                continue
            a = math.radians(deg)
            x = int(round(cx + math.cos(a) * rr))
            y = int(round(cy + math.sin(a) * rr))
            g.put(x, y, col)
    # Glanzkern oben-links und drei Krater-Cluster.
    g.rect(cx - 7, cy - 7, 4, 4, 13)
    g.rect(cx - 6, cy - 6, 2, 2, 12)
    for dx, dy, pw, ph in ((-8, 4, 3, 2), (7, -4, 2, 2), (3, 11, 2, 1)):
        g.rect(cx + dx, cy + dy, pw, ph, 21)
        g.put(cx + dx, cy + dy, 20)
    # Ringnieten als 2x2-Bl an vier Stellen (gruppiert, kein Rauschen).
    for dx, dy in ((-20, -10), (18, -12), (-16, 16), (14, 18)):
        g.rect(cx + dx, cy + dy, 2, 2, 6)
        g.put(cx + dx, cy + dy, 7)
    # Klare Horizontkante: dunkle Ridge unter dem Himmel.
    for x in range(W):
        y = 158 + int(2 * math.sin(x * 0.02))
        g.put(x, y, 4)
        g.put(x, y + 1, 3)


def hills(g: Grid) -> None:
    for x in range(W):
        far = 150 + int(6 * math.sin(x * 0.011) + 4 * _noise(x * 0.05, 0.5, 31))
        g.rect(x, far, 1, H - far, 4)
        near = 168 + int(7 * math.sin(x * 0.007 + 2) + 5 * _noise(x * 0.04, 1.5, 47))
        g.rect(x, near, 1, H - near, 3)
    # Moorboden: ruhige 28/29-Flächen, 30 nur als gruppierte Flecken.
    for y in range(172, H):
        for x in range(W):
            n = _noise(x * 0.045, y * 0.06, 51)
            c = 29
            if n < 0.40:
                c = 28
            if n > 0.70 and _noise(x * 0.16, y * 0.18, 53) > 0.58:
                c = 30
            g.put(x, y, c)
    # Nebel: einzelne 1-px-Schwaden mit Lücken (keine geraden Doppellinien).
    for i, base in enumerate((158, 172, 186, 202, 218)):
        x = 0
        while x < W:
            run = 30 + int(_hash(x, i, 61) * 64)
            gap = 26 + int(_hash(x, i, 67) * 44)
            g.rect(x, base, run, 1, 5)
            if i % 2 == 0:
                g.rect(x + 6, base + 1, max(4, run - 14), 1, 4)
            x += run + gap


def _tree_grid(h: int, w: int = 52) -> Grid:
    """Toter Baum als eigene Grid-Zeichnung; Kontur kommt von outline()."""
    g = Grid(w, h)
    cx = w // 2
    base = h - 1
    trunk_h = int(h * 0.72)
    for i in range(trunk_h):
        y = base - i
        half = 3 + i // 18
        g.rect(cx - half, y, half * 2 + 2, 1, 2)
        g.put(cx - half + 1, y, 3)
        g.put(cx + half, y, 3 if i % 4 == 0 else 2)
    # Zwei Hauptäste (2 px), leicht mit 1-px-Twigs.
    branches = [
        (cx, base - int(trunk_h * 0.55), -1, 16, 10),
        (cx, base - int(trunk_h * 0.7), 1, 14, 12),
        (cx - 1, base - int(trunk_h * 0.8), -1, 9, 8),
    ]
    for bx, by, side, ln, rise in branches:
        for i in range(ln):
            x = bx + side * i
            y = by - int(i * rise / ln)
            g.put(x, y, 2)
            g.put(x, y + 1, 2)
            g.put(x, y + 2, 3)
        tipx = bx + side * ln
        tipy = by - rise
        for j in range(6):
            g.put(tipx - side * j // 3, tipy - j, 2)
            g.put(tipx + side, tipy - j, 3 if j % 2 else 2)
    return outline(g)


def dead_tree(g: Grid, x: int, base_y: int, h: int, s: int) -> None:
    t = _tree_grid(h)
    g.blit(t, x - t.w // 2, base_y - h)


def lantern(g: Grid, x: int, base_y: int) -> None:
    # Laternenpfahl 20 px hoch, Eisen 4/5/7, Glaskern 21/22/13.
    g.rect(x - 4, base_y - 3, 10, 3, 5)
    g.rect(x - 4, base_y - 3, 10, 1, 7)
    g.rect(x - 4, base_y - 3, 2, 3, 6)
    g.rect(x - 1, base_y - 17, 4, 14, 4)
    g.rect(x - 1, base_y - 17, 1, 14, 5)
    g.rect(x + 2, base_y - 17, 1, 14, 2)
    g.rect(x - 5, base_y - 18, 12, 2, 4)
    g.rect(x - 5, base_y - 18, 12, 1, 7)
    g.rect(x - 4, base_y - 16, 10, 8, 4)
    g.rect(x - 3, base_y - 15, 8, 6, 20)
    g.rect(x - 2, base_y - 14, 6, 4, 21)
    g.rect(x - 1, base_y - 13, 3, 2, 22)
    g.put(x, base_y - 13, 13)
    # Streulicht auf dem Boden (gruppiert).
    g.rect(x - 7, base_y, 4, 1, 19)
    g.rect(x + 4, base_y, 3, 1, 17)


def build() -> dict[str, list[Grid]]:
    g = Grid(W, H)
    sky(g)
    hills(g)
    for x, h in ((40, 66), (96, 46), (148, 74), (410, 70), (452, 48), (478, 58)):
        dead_tree(g, x, 174 + int(_hash(x, 3, 11) * 10), h, x)
    for x in (22, 214, 300, 392):
        lantern(g, x, 214 + int(_hash(x, 5, 13) * 5))
    # Glühwürmchen: 2x2 mit hellem Kern (Glow nur als Glanzpunkt).
    for i in range(22):
        fx = int(_hash(i, 7, 71) * (W - 6)) + 3
        fy = 178 + int(_hash(i, 8, 71) * 74)
        g.rect(fx, fy, 2, 2, 20)
        g.put(fx, fy, 22)
    return {"title_background": [g]}


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-title.ts", "GEN_TITLE", data, "Titelbild 480x270 (Moor-Horizont, Mondlaterne)")
    print("wrote", path)
    save_grid_png(data["title_background"][0], os.path.join(SHOTS, "m4-title-bg.png"), scale=2)
    print("title bg written")
