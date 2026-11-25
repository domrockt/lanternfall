#!/usr/bin/env python3
"""Lanternfall Art-Pipeline — gemeinsame Bibliothek (pure Python, keine PIL).

Alle Assets werden als Pixel-Grids gezeichnet (Palettenindizes aus src/palette.ts),
mit Rampen-Shading (Licht oben-links), 1-px-Kontur (Index 0) und PNG-Ausgabe.
"""
from __future__ import annotations

import os
import re
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PALETTE_TS = os.path.join(ROOT, "src", "palette.ts")
TS_OUT = os.path.join(ROOT, "src", "gfx")
PUBLIC = os.path.join(ROOT, "public", "art")
SHOTS = os.path.join(ROOT, "shots")

DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

# ── Palette aus src/palette.ts ──────────────────────────────────────────────
def load_palette() -> list[tuple[int, int, int]]:
    text = open(PALETTE_TS, encoding="utf-8").read()
    cols = []
    for m in re.finditer(r"0x([0-9a-fA-F]{6}),\s*//\s*(\d+)", text):
        v = int(m.group(1), 16)
        cols.append(((v >> 16) & 255, (v >> 8) & 255, v & 255))
    if len(cols) != 32:
        raise SystemExit(f"Palette: {len(cols)} Farben gelesen, erwartet 32")
    return cols


PAL = load_palette()

# ── Rampen (Schatten, Basis, Licht, Highlight) ───────────────────────────────
# Jede Rampe hat als MITTE den Palettenindex der Basis; dadurch ist
# SHADE[base] = (Schatten, Licht) eindeutig und ohne Doppelbelegung.
RAMPS: dict[int, tuple[int, int, int]] = {
    29: (28, 29, 30),   # Gras
    30: (28, 30, 31),   # Moor
    31: (29, 31, 31),   # helles Moor
    4:  (2, 4, 6),      # Wasser/Nacht
    3:  (1, 3, 5),      # tiefe Nacht
    2:  (1, 2, 3),      # Nacht
    5:  (2, 5, 7),      # Eisen/Stein
    6:  (3, 6, 9),      # Nebelblau
    7:  (4, 7, 8),      # Eisen hell
    8:  (5, 8, 10),     # Dunst/Knochen
    9:  (6, 9, 11),     # blasse Haut
    10: (8, 10, 11),    # Knochen
    11: (9, 11, 12),    # Knochenlicht/Haut
    12: (10, 12, 13),   # Kerzenweiß
    13: (10, 13, 13),   # Laternenweiß (nur Glow)
    15: (14, 15, 16),   # Holz/Weg
    16: (14, 16, 17),   # Glutbraun
    18: (15, 18, 19),   # Feuer
    19: (17, 19, 20),   # helle Flamme
    20: (16, 20, 21),   # Bernstein
    21: (17, 21, 22),   # Laterne
    23: (14, 23, 25),   # Blutnacht
    24: (23, 24, 25),   # Blut
    25: (23, 25, 26),   # Karmesin
    26: (24, 26, 27),   # heißes Rot
}

# Basis → (Schatten, Licht).
SHADE = {base: (sh, li) for base, (_sh, _mid, li) in RAMPS.items() for sh in (_sh,)}

# ── Grid ────────────────────────────────────────────────────────────────────
class Grid:
    __slots__ = ("w", "h", "px")

    def __init__(self, w: int, h: int, fill=None):
        self.w = w
        self.h = h
        self.px = [[fill for _ in range(w)] for _ in range(h)]

    def put(self, x: int, y: int, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x: int, y: int):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return None

    def filled(self, x: int, y: int) -> bool:
        return self.get(x, y) is not None

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.put(xx, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(int(min(x0, x1)), int(max(x0, x1)) + 1):
            self.put(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(int(min(y0, y1)), int(max(y0, y1)) + 1):
            self.put(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                dx = (x - cx) / max(0.1, rx)
                dy = (y - cy) / max(0.1, ry)
                if dx * dx + dy * dy <= 1.03:
                    self.put(x, y, c)

    def ellipse_ring(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                dx = (x - cx) / max(0.1, rx)
                dy = (y - cy) / max(0.1, ry)
                d = dx * dx + dy * dy
                if 0.72 <= d <= 1.03:
                    self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c, thick=1):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            if thick <= 1:
                self.put(x0, y0, c)
            else:
                self.rect(x0 - thick // 2, y0 - thick // 2, thick, thick, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def limb(self, x0, y0, x1, y1, c, thick=2):
        """Gliedmaße: 2-px-Block entlang einer Linie (keine Einzelpixel)."""
        self.line(x0, y0, x1, y1, c, thick)
        if thick == 2:
            self.line(int(x0) + 1, int(y0), int(x1) + 1, int(y1), c, 1)

    def blit(self, other: "Grid", ox=0, oy=0):
        for y in range(other.h):
            for x in range(other.w):
                c = other.px[y][x]
                if c is not None:
                    self.put(x + ox, y + oy, c)

    def mirror_x(self) -> "Grid":
        g = Grid(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                g.px[y][x] = self.px[y][self.w - 1 - x]
        return g

    def flip_y(self) -> "Grid":
        g = Grid(self.w, self.h)
        for y in range(self.h):
            g.px[y] = list(self.px[self.h - 1 - y])
        return g

    def copy(self) -> "Grid":
        g = Grid(self.w, self.h)
        g.px = [row[:] for row in self.px]
        return g

    def count_filled(self) -> int:
        return sum(1 for row in self.px for c in row if c is not None)

    def occupied(self) -> list[list[bool]]:
        return [[c is not None for c in row] for row in self.px]


# ── Shading / Kontur ────────────────────────────────────────────────────────
def shade_edges(g: Grid, allow_highlight=True, band: int = 1, region_aware: bool = True) -> Grid:
    """3 Stufen pro Materialfläche: Licht oben/links, Schatten unten/rechts.

    Als "Fläche" zählt nicht nur die Silhouette, sondern jede Materialgrenze:
    Ein Nachbarpixel derselben Rampe (Basis/Schatten/Licht) verlängert die
    Fläche, ein andersfarbiger Nachbar beendet sie. Dadurch bekommen auch
    eingebettete Teile (Gesicht im Kapuzenrahmen, Bauch im Rumpf) echte
    2-px-Licht-/Schattenbänder statt flacher Innenflächen.
    """
    out = g.copy()

    for y in range(g.h):
        for x in range(g.w):
            c = g.px[y][x]
            if c is None or c not in SHADE:
                continue
            sh, li = SHADE[c]
            own = (sh, c, li)

            def depth(dx: int, dy: int) -> int:
                d = 0
                cx, cy = x, y
                while d <= band:
                    cx += dx
                    cy += dy
                    if not (0 <= cx < g.w and 0 <= cy < g.h):
                        return d + 1
                    n = g.px[cy][cx]
                    if n is None or (region_aware and n not in own):
                        return d + 1
                    d += 1
                return band + 1

            dt = depth(0, -1)
            dl = depth(-1, 0)
            db = depth(0, 1)
            dr = depth(1, 0)
            light_side = min(dt, dl) <= band
            shadow_side = min(db, dr) <= band
            if light_side and shadow_side:
                # Dünne Gliedmaßen: die nähere Seite gewinnt, Licht bei Gleichstand.
                if dt + dl <= db + dr:
                    out.px[y][x] = li
                else:
                    out.px[y][x] = sh
            elif light_side:
                out.px[y][x] = li
            elif shadow_side:
                out.px[y][x] = sh
    return out


def outline(g: Grid, color=0, diagonal=False) -> Grid:
    """1-px-Kontur außen um alle gefüllten Pixel (nicht überschreiben)."""
    out = g.copy()
    occ = g.occupied()
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonal:
        dirs += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    for y in range(g.h):
        for x in range(g.w):
            if not occ[y][x]:
                continue
            for dx, dy in dirs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < g.w and 0 <= ny < g.h and not occ[ny][nx] and out.px[ny][nx] is None:
                    out.px[ny][nx] = color
    return out


def denoise(g: Grid, keep_colors=(0, 13, 22)) -> Grid:
    """Entfernt isolierte Einzelpixel (außer Kontur/Glanzpunkte)."""
    out = g.copy()
    occ = g.occupied()
    for y in range(g.h):
        for x in range(g.w):
            if not occ[y][x]:
                continue
            c = g.px[y][x]
            if c in keep_colors:
                continue
            n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if g.filled(x + dx, y + dy))
            if n == 0:
                out.px[y][x] = None
    return out


def trim(g: Grid):
    """Bounding-Box der gefüllten Pixel (x0,y0,x1,y1 inkl.)."""
    xs = [x for y in range(g.h) for x in range(g.w) if g.px[y][x] is not None]
    ys = [y for y in range(g.h) for x in range(g.w) if g.px[y][x] is not None]
    if not xs:
        return (0, 0, -1, -1)
    return (min(xs), min(ys), max(xs), max(ys))


# ── Grid ↔ Zeichen ──────────────────────────────────────────────────────────
def to_rows(g: Grid) -> list[str]:
    rows = []
    for y in range(g.h):
        rows.append("".join("." if c is None else DIGITS[c] for c in g.px[y]))
    return rows


def from_rows(rows: list[str]) -> Grid:
    g = Grid(len(rows[0]), len(rows))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            g.px[y][x] = None if ch == "." else DIGITS.index(ch)
    return g


def pad_grid(g: Grid, w: int, h: int, ax="center", ay="center") -> Grid:
    out = Grid(w, h)
    if ax == "center":
        ox = (w - g.w) // 2
    elif ax == "right":
        ox = w - g.w
    else:
        ox = 0
    if ay == "center":
        oy = (h - g.h) // 2
    elif ay == "bottom":
        oy = h - g.h
    else:
        oy = 0
    out.blit(g, ox, oy)
    return out


# ── PNG (pure Python) ───────────────────────────────────────────────────────
def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_rgba_png(path: str, w: int, h: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = b"".join(
        b"\x00" + b"".join(bytes(pixels[y * w + x]) for x in range(w)) for y in range(h)
    )
    data = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(raw, 9))
        + _png_chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def read_rgba_png(path: str):
    """Liest RGBA-PNG (8 Bit, Filter 0–4) und gibt (w, h, pixel-list) zurück."""
    data = open(path, "rb").read()
    pos = 8
    w = h = 0
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if tag == b"IHDR":
            w, h, _bd, ct, _c, _f, _i = struct.unpack(">IIBBBBB", chunk)
            if ct not in (2, 6):
                raise SystemExit("read_rgba_png: nur RGB/RGBA erwartet")
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
    raw = zlib.decompress(idat)
    bpp = 4 if ct == 6 else 3
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    i = 0
    for _y in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            cc = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - cc
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - cc)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else cc)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    if bpp == 4:
        pix = [(row[x * 4], row[x * 4 + 1], row[x * 4 + 2], row[x * 4 + 3]) for row in rows for x in range(w)]
    else:
        pix = [(row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255) for row in rows for x in range(w)]
    return w, h, pix


def grid_rgba(g: Grid, bg=None, alpha=255):
    w, h = g.w, g.h
    pix = []
    for y in range(h):
        for x in range(w):
            c = g.px[y][x]
            if c is None:
                pix.append((bg[0], bg[1], bg[2], 255) if bg else (0, 0, 0, 0))
            else:
                r, gg, b = PAL[c]
                pix.append((r, gg, b, alpha))
    return pix


def save_grid_png(g: Grid, path: str, scale=1, bg=None) -> None:
    w, h = g.w * scale, g.h * scale
    src = grid_rgba(g, bg)
    pix = [src[(y // scale) * g.w + (x // scale)] for y in range(h) for x in range(w)]
    write_rgba_png(path, w, h, pix)


def save_sheet_png(frames: list[Grid], path: str, scale=1, bg=None, gap=0) -> None:
    total_w = sum(f.w for f in frames) + gap * max(0, len(frames) - 1)
    max_h = max(f.h for f in frames)
    w, h = total_w * scale, max_h * scale
    pix = [(0, 0, 0, 0)] * (w * h)
    ox = 0
    for f in frames:
        src = grid_rgba(f, bg)
        for y in range(f.h * scale):
            for x in range(f.w * scale):
                pix[y * w + ox * scale + x] = src[(y // scale) * f.w + (x // scale)]
        ox += f.w + gap
    write_rgba_png(path, w, h, pix)


# ── 5x7-Label-Font für Kontaktbögen ─────────────────────────────────────────
FONT = {
    "A": (".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "B": ("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
    "C": (".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    "D": ("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    "E": ("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    "F": ("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
    "G": (".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."),
    "H": ("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "I": ("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"),
    "J": ("..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."),
    "K": ("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
    "L": ("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    "M": ("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
    "N": ("#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"),
    "O": (".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "P": ("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    "Q": (".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
    "R": ("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    "S": (".####", "#....", "#....", ".###.", "....#", "....#", "####."),
    "T": ("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
    "U": ("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "V": ("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
    "W": ("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"),
    "X": ("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
    "Y": ("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    "Z": ("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
    "0": (".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
    "1": ("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    "2": (".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
    "3": ("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),
    "4": ("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
    "5": ("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    "6": ("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."),
    "7": ("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    "8": (".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
    "9": (".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
    "-": (".....", ".....", ".....", "#####", ".....", ".....", "....."),
    ".": (".....", ".....", ".....", ".....", ".....", ".##..", ".##.."),
    "/": ("....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."),
    ":": (".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."),
    "%": ("##..#", "##.#.", "..#..", ".#...", "#.##.", "#.##.", "....."),
    "+": (".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
    "=": (".....", ".....", "#####", ".....", "#####", ".....", "....."),
    "(": ("...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."),
    ")": (".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."),
    "!": ("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."),
    "?": (".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),
    "_": (".....", ".....", ".....", ".....", ".....", ".....", "#####"),
    " ": (".....", ".....", ".....", ".....", ".....", ".....", "....."),
}


def draw_text(canvas, x, y, text, color=(240, 238, 220, 255), scale=1):
    """Schreibt Text in ein RGBA-Pixel-Array (Modify in place)."""
    cw = canvas[1]
    pix = canvas[0]
    cx = x
    for ch in text.upper():
        glyph = FONT.get(ch, FONT["?"])
        for gy in range(7):
            for gx in range(5):
                if glyph[gy][gx] == "#":
                    for sy in range(scale):
                        for sx in range(scale):
                            px, py = cx + gx * scale + sx, y + gy * scale + sy
                            if 0 <= px < cw and 0 <= py < len(pix) // cw:
                                pix[py * cw + px] = color
        cx += 6 * scale
    return cx


def text_width(text, scale=1):
    return len(text) * 6 * scale


# ── TS-Emitter ──────────────────────────────────────────────────────────────
def emit_ts(filename: str, var_name: str, sprites: dict, note: str, extra: str = "") -> str:
    """Schreibt Grid-Daten als TS (Record<string,{w,h,frames}>)."""
    lines = [
        "// AUTO-GENERIERT von scripts/art — nicht von Hand editieren.",
        f"// {note}",
        "",
        "export interface GenSprite { w: number; h: number; frames: string[][] }",
        "",
        f"export const {var_name}: Record<string, GenSprite> = {{",
    ]
    for key, frames in sprites.items():
        w, h = frames[0].w, frames[0].h
        lines.append(f"  {key}: {{ w: {w}, h: {h}, frames: [")
        for f in frames:
            rows = to_rows(f)
            lines.append("    [")
            for row in rows:
                lines.append(f'      "{row}",')
            lines.append("    ],")
        lines.append("  ] },")
    lines.append("};")
    if extra:
        lines.append(extra)
    lines.append("")
    path = os.path.join(TS_OUT, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return path
