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
from lib import DIGITS, Grid, ROOT, SHOTS, emit_ts, outline, save_grid_png  # noqa: E402

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
    for rr, col, seg in ((30, 19, 9), (35, 20, 7), (40, 19, 5)):
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
    # Klare Horizontkante: ferne Huegel als dunkle Silhouette (2) mit 1-px-Nebelkante (5)
    # auf dem helleren Nachthimmel (4), darunter die naechste Silhouette (3).
    for x in range(W):
        far = 150 + int(6 * math.sin(x * 0.011) + 4 * _noise(x * 0.05, 0.5, 31))
        g.rect(x, far, 1, H - far, 2)
        g.put(x, far, 5)
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


def lantern_spots() -> list[tuple[int, int]]:
    """Positionen der Moor-Laternen (x, base_y) — identisch zum Aufruf in build()."""
    return [(x, 214 + int(_hash(x, 5, 13) * 5)) for x in (22, 214, 300, 392)]


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
    # Glas-Innenfläche = exakt _GLASS_ROWS (m10-title-flame-glow-r2): flächiger
    # heller Flammenkern (13), Glutfläche (22), Dither (21) nur an den Kanten.
    for _r, _row in enumerate(_GLASS_ROWS):
        for _c, _ch in enumerate(_row):
            g.put(x - 3 + _c, base_y - 15 + _r, DIGITS.index(_ch))
    # Streulicht auf dem Boden (gruppiert).
    g.rect(x - 7, base_y, 4, 1, 19)
    g.rect(x + 4, base_y, 3, 1, 17)


# ── Laternen-Flammen (m10-title-flame-crisp) ────────────────────────────────
# Sparse-Overlay 8x11 über der Glas-Innenfläche: '.' = transparent (binäres
# Alpha). Reihen 0..4 = nur Glutfunken über dem Deckel, Reihen 5..10 = Glas
# (base_y-15..-10) voll opak übermalt. Das Gehäuse (base_y-16..-9, Reihenrand)
# bleibt komplett in der Basis — dort sitzt z. B. ein Glühwürmchen-Pixel, das
# das Overlay NICHT überdecken darf (AE=0 außer der Glasfläche + Funken).
FLAME_W, FLAME_H = 8, 11
FLAME_DX, FLAME_DY = -3, -20

# Glas je Frame (Patch-Spalten 0..7 = lx-3..lx+4, Reihen 5..10 = by-15..by-10);
# nur Paletten-Indices 13 (d=Glow-Kern), 20 (k=amber), 21 (l=Laterne), 22 (m=Glühen).
# m10-title-flame-glow-r2: flächiger heller Kern (d-Gruppe, organisch geformt),
# Dither (l) nur an den Übergangskanten; F0 = exakte Basis-Kopie (_GLASS_ROWS).
_GLASS_ROWS = [
    "kkkkkkkk",
    "kllllllk",
    "kldddllk",
    "kldddmlk",
    "klmddmmk",
    "kmmmmmmk",
]
_FLAME_INTS = [
    _GLASS_ROWS,
    ["kkkkkkkk", "kllllllk", "kllddllk", "kldddmlk", "klddmmmk", "kmmmmmmk"],
    ["kkkkkkkk", "kllllllk", "kldddmlk", "klmdddlk", "klmmddmk", "kmmmmmmk"],
]
# Glutfunken je Frame als (Reihe, Spalte) im Patch — 0..2 px, sparsam, Palette 13.
_FLAME_SPARKS = {0: [], 1: [(1, 4)], 2: [(0, 3), (1, 5)]}


def _glass_ch(f: int, r: int, c: int) -> str:
    """Patch-Zeichen (Reihe r 0..10, Spalte c) — Reihen 0..4 = transparent."""
    return _FLAME_INTS[f][r - 5][c] if r >= 5 else "."


for _rows in _FLAME_INTS:
    assert all(len(r) == FLAME_W for r in _rows), "Flammen-Zeile falsch lang"
    assert all(ch in "klmd" for r in _rows for ch in r), "Off-Palette-Zeichen im Flammen-Frame"
assert _FLAME_INTS[0] == _GLASS_ROWS, "F0 muss Basis-Glas kopieren"
for _f in (1, 2):
    _diff = sum(1 for _r in range(FLAME_H) for _c in range(FLAME_W)
                if _glass_ch(_f, _r, _c) != _glass_ch(0, _r, _c)) + len(_FLAME_SPARKS[_f])
    assert 2 <= _diff <= 12, f"F{_f}-Diff {_diff} ausserhalb 2..12"
# Glut-Anteil (13+22) im Glas muss das K1-Ziel (>= 0.30) uebertreffen.
assert sum(1 for _row in _GLASS_ROWS for _ch in _row if _ch in "dm") / 48 >= 0.30, \
    "Glut-Flaechenanteil < 0.30"


def flame_frames(g: Grid, lx: int, by: int) -> list[Grid]:
    """3 Frames; F0 ist eine Zell-kopie der Basis (statischer Referenz-Frame)."""
    frames: list[Grid] = []
    for f in range(3):
        p = Grid(FLAME_W, FLAME_H)
        for r in range(FLAME_H):
            for c in range(FLAME_W):
                ch = _glass_ch(f, r, c)
                if ch != ".":
                    p.put(c, r, DIGITS.index(ch))
        for r, c in _FLAME_SPARKS[f]:
            p.put(c, r, DIGITS.index("d"))  # heller Glutfunken (Palette 13)
        frames.append(p)
    return frames


def build() -> dict[str, list[Grid]]:
    g = Grid(W, H)
    sky(g)
    hills(g)
    for x, h in ((40, 66), (96, 46), (148, 74), (410, 70), (452, 48), (478, 58)):
        dead_tree(g, x, 174 + int(_hash(x, 3, 11) * 10), h, x)
    spots = lantern_spots()
    for lx, by in spots:
        lantern(g, lx, by)
    # Glühwürmchen: 2x2 mit hellem Kern (Glow nur als Glanzpunkt).
    for i in range(22):
        fx = int(_hash(i, 7, 71) * (W - 6)) + 3
        fy = 178 + int(_hash(i, 8, 71) * 74)
        g.rect(fx, fy, 2, 2, 20)
        g.put(fx, fy, 22)
    # Flammen-Overlay: Glas-Innenfläche muss an allen Spots identisch sein
    # (sonst wäre ein gemeinsamer Frame falsch). Guard bricht laut, falls sich
    # das ändert (z. B. neue Deko-Elemente im Glasbereich).
    regions = [[[g.px[by - 15 + i][lx - 3 + j] for j in range(8)] for i in range(6)]
               for lx, by in spots]
    if any(r != regions[0] for r in regions[1:]):
        raise SystemExit("flame: Laternen-Glas unterscheidet sich zwischen Spots")
    data: dict[str, list[Grid]] = {"title_background": [g]}
    for f, frame in enumerate(flame_frames(g, *spots[0])):
        data[f"title_flame_f{f}"] = [frame]
    return data


if __name__ == "__main__":
    data = build()
    spots = lantern_spots()
    spots_ts = ", ".join(f"{{ x: {lx + FLAME_DX}, y: {by + FLAME_DY} }}" for lx, by in spots)
    extra = (f"\n/** Flammen-Patch-Anker (Texel-Koordinaten im 480x270-Kernbild), "
             f"Patch {FLAME_W}x{FLAME_H}. */\n"
             "export const TITLE_FLAME_SPOTS: ReadonlyArray<{ x: number; y: number }> = [\n"
             f"  {spots_ts},\n];\n")
    path = emit_ts("gen-title.ts", "GEN_TITLE", data,
                   "Titelbild 480x270 (Moor-Horizont, Mondlaterne) + Laternen-Flammen-Overlay", extra)
    print("wrote", path)
    save_grid_png(data["title_background"][0], os.path.join(SHOTS, "m4-title-bg.png"), scale=2)
    for f in range(3):
        save_grid_png(data[f"title_flame_f{f}"][0],
                      os.path.join(SHOTS, f"m10-title-flame-frames-f{f}.png"), scale=8)
    print("title bg + flame frames written")
