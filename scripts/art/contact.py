#!/usr/bin/env python3
"""Kontaktbögen für die M4-Abnahme.

Erzeugt shots/m4-sheet-{chars,enemies,bosses,tiles,fx,ui}.png (4× nearest,
beschriftet, dunkler Moor-Hintergrund). Liest dieselben Generatoren wie das Spiel.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import (  # noqa: E402
    Grid, PAL, ROOT, SHOTS, draw_text, text_width, read_rgba_png, save_grid_png, save_sheet_png,
)

BG = PAL[3]
BG_ALT = PAL[2]
FRAME = PAL[5]
LABEL = PAL[10]
LABEL_HI = PAL[13]
TITLE = PAL[21]


class Sheet:
    def __init__(self, w: int, h: int):
        self.w = w
        self.h = h
        self.px = [(BG[0], BG[1], BG[2], 255)] * (w * h)

    def rect(self, x, y, w, h, color):
        for yy in range(max(0, y), min(self.h, y + h)):
            for xx in range(max(0, x), min(self.w, x + w)):
                self.px[yy * self.w + xx] = (color[0], color[1], color[2], 255)

    def cell(self, x, y, w, h, alt=False):
        self.rect(x, y, w, h, BG_ALT if alt else BG)

    def blit(self, g: Grid, x: int, y: int, scale: int):
        for yy in range(g.h * scale):
            for xx in range(g.w * scale):
                c = g.px[yy // scale][xx // scale]
                if c is None:
                    continue
                px, py = x + xx, y + yy
                if 0 <= px < self.w and 0 <= py < self.h:
                    r, gg, b = PAL[c]
                    self.px[py * self.w + px] = (r, gg, b, 255)

    def text(self, x, y, s, color=LABEL, scale=1):
        draw_text((self.px, self.w), x, y, s, (color[0], color[1], color[2], 255), scale)

    def blit_pix(self, w: int, h: int, pix, x: int, y: int, scale: int, src_scale: int = 1):
        for yy in range(h * scale // src_scale):
            for xx in range(w * scale // src_scale):
                p = pix[(yy // (scale // src_scale)) * w + (xx // (scale // src_scale))]
                if p[3] < 8:
                    continue
                px, py = x + xx, y + yy
                if 0 <= px < self.w and 0 <= py < self.h:
                    self.px[py * self.w + px] = p

    def save(self, path: str):
        from lib import write_rgba_png
        write_rgba_png(path, self.w, self.h, self.px)


def _grids(mod_build, *keys):
    data = mod_build()
    out = []
    for key in keys:
        out.extend(data[key])
    return out


def sheet_chars() -> str:
    import gen_chars
    data = gen_chars.build()
    # Pro Figur eine Zeile: 3 Richtungen ×4 Frames + Extras-Zelle = 13 Zellen.
    cols = 13
    cell_w, cell_h = 184, 210
    sw, sh = cols * cell_w + 128, 2 * cell_h + 118
    sheet = Sheet(sw, sh)
    sheet.text(20, 16, "LANTERNFALL  M4  -  SPIELFIGUREN (32PX)", TITLE, 3)
    sheet.text(20, 52, "LAUF 4 FRAMES  /  IDLE 2  /  TREFFER  /  PORTRAIT 48", LABEL, 2)
    y = 92
    for name, pretty in (("mira", "MIRA ASHWICK"), ("kael", "BRUDER KAEL")):
        sheet.text(20, y - 20, pretty, LABEL_HI, 2)
        x = 20
        for d, dl in (("down", "UNTEN"), ("side", "SEITE"), ("up", "OBEN")):
            for f in range(4):
                sheet.cell(x, y, 176, 168, (f % 2 == 1))
                sheet.blit(data[f"player_{name}_{d}"][f], x + 24, y + 16, 4)
                sheet.text(x + 4, y + 152, f"{dl} {f}", LABEL, 1)
                x += cell_w
        # Idle + Hit + Portrait nebeneinander in einer breiteren Extraspalte.
        sheet.cell(x, y, 260, 168, True)
        sheet.blit(data[f"player_{name}_down_idle"][0], x + 4, y + 18, 2)
        sheet.blit(data[f"player_{name}_hit"][0], x + 72, y + 18, 2)
        # Portrait 48 px bei 2x -> 96 px breit, vollstaendig in der Zelle.
        sheet.blit(data[f"portrait_{name}"][0], x + 142, y + 14, 2)
        sheet.text(x + 4, y + 152, "IDLE / HIT / PORTRAIT 48", LABEL, 1)
        y += cell_h
    sheet.text(20, sh - 30, "KONTUR 1PX INK 0  -  HAUT-RAMPE 9/11/12  -  LICHT OBEN-LINKS", LABEL, 2)
    path = os.path.join(SHOTS, "m4-sheet-chars.png")
    sheet.save(path)
    return path


def sheet_ref() -> str:
    import gen_chars
    import gen_enemies
    import gen_tiles
    chars = gen_chars.build()
    enemies = gen_enemies.build_reference()
    post = gen_tiles.lantern_post()
    w, h = 1300, 620
    sheet = Sheet(w, h)
    sheet.text(20, 16, "M4 REFERENZ-ASSETS  (8X)", TITLE, 3)
    sheet.text(20, 54, "MIRA 32  -  IRRLICHT 16  -  LATERNENPFAHL 16", LABEL, 2)
    # Mira
    sheet.cell(20, 84, 420, 460)
    sheet.blit(chars["player_mira_down"][0], 60, 100, 8)
    sheet.text(40, 500, "SPIELERIN MIRA (32PX)", LABEL_HI, 2)
    # Irrlicht
    sheet.cell(460, 84, 360, 460)
    sheet.blit(enemies["enemy_wisp"][0], 520, 130, 8)
    sheet.blit(enemies["enemy_wisp"][1], 660, 130, 8)
    sheet.text(490, 500, "IRRLICHT (16PX, 2 FRAMES)", LABEL_HI, 2)
    # Laternenpfahl
    sheet.cell(840, 84, 420, 460)
    sheet.blit(post, 1000, 100, 8)
    sheet.text(880, 500, "LATERNENPFAHL (16PX)", LABEL_HI, 2)
    sheet.text(20, h - 32, "ZIEL: JEDES ASSET NOTE >= 4 VOR DEM AUSBAU", LABEL, 2)
    path = os.path.join(SHOTS, "m4-sheet-ref.png")
    sheet.save(path)
    return path


def sheet_enemies() -> str:
    import gen_enemies
    data = gen_enemies.build()
    order = list(gen_enemies.TIER.keys())
    cells_w, cells_h = 270, 268
    cols = 6
    sw, sh = cols * cells_w + 40, 5 * cells_h + 126
    sheet = Sheet(sw, sh)
    sheet.text(20, 14, "LANTERNFALL  M4  -  GEGNER - 30 - TIER 0-4", TITLE, 3)
    sheet.text(20, 50, "16 / 20 / 24 / 28 / 32 PX  -  TIER-AKZENT AN DEN AUGEN  -  KONTUR 1PX", LABEL, 2)
    for tier in range(5):
        y = 84 + tier * cells_h
        sheet.text(20, y - 16, f"TIER {tier}  ({gen_enemies.TIER_SIZE[tier]} PX)", LABEL_HI, 2)
        x = 20
        for idx, eid in enumerate([e for e in order if gen_enemies.TIER[e] == tier]):
            sheet.cell(x, y, cells_w - 8, cells_h - 12, idx % 2 == 1)
            frames = data[f"enemy_{eid}"]
            big = frames[0]
            scale = 5 if big.w <= 20 else 3
            sheet.blit(big, x + 6, y + 26, scale)
            sheet.text(x + 6, y + 6, eid.upper(), LABEL_HI, 1)
            # Frame-Leiste: jede Pose einzeln, 2x, mit F-Nummer.
            sx = x + 4
            # Feste Leistenposition: Labels enden oberhalb der naechsten Tier-Zeile.
            sy = y + 168
            for fi, fg in enumerate(frames):
                sheet.blit(fg, sx, sy, 2)
                sheet.text(sx + 1, sy + fg.h * 2 + 2, f"F{fi}", LABEL, 1)
                sx += fg.w * 2 + 2
            x += cells_w
    sheet.text(20, sh - 26, "GROSS: FRAME 0  -  LEISTE: ALLE POSEN F0 BIS F3 - 2X NEAREST", LABEL, 2)
    path = os.path.join(SHOTS, "m4-sheet-enemies.png")
    sheet.save(path)
    return path


def sheet_bosses() -> str:
    import gen_bosses
    data = gen_bosses.build()
    ids = list(gen_bosses.DRAW.keys())
    cell_w, cell_h = 330, 340
    sw, sh = 6 * cell_w + 30, 3 * cell_h + 100
    sheet = Sheet(sw, sh)
    sheet.text(20, 14, "LANTERNFALL  M4  -  BOSSE (48-96 PX)", TITLE, 3)
    sheet.text(20, 50, "FRAME 0 RUHE  -  FRAME 1 ATMEN  -  FRAME 2 WIND-UP (TELEGRAPH)", LABEL, 2)
    for col, bid in enumerate(ids):
        x = 15 + col * cell_w
        for f in range(3):
            y = 90 + f * cell_h
            sheet.cell(x, y, cell_w - 14, cell_h - 18, f % 2 == 1)
            grid = data[f"boss_{bid}"][f]
            scale = max(1, min(3, (cell_w - 40) // grid.w))
            sheet.blit(grid, x + (cell_w - 14 - grid.w * scale) // 2, y + 12, scale)
            sheet.text(x + 6, y + cell_h - 26, f"{bid.upper()}  F{f}", LABEL, 1)
    path = os.path.join(SHOTS, "m4-sheet-bosses.png")
    sheet.save(path)
    return path


def _parse_texture_grids(keys: list[str]) -> dict[str, Grid]:
    """Liest SPRITE_GRIDS-Einträge (w/h/rows) aus src/gfx/textures.ts."""
    import re
    text = open(os.path.join(ROOT, "src/gfx/textures.ts"), encoding="utf-8").read()
    out: dict[str, Grid] = {}
    for key in keys:
        m = re.search(r"\n  " + re.escape(key) + r": \{\s*\n\s*w: (\d+), h: (\d+),\s*\n\s*rows: \[(.*?)\]", text, re.S)
        if not m:
            continue
        w, h = int(m.group(1)), int(m.group(2))
        rows = re.findall(r'"([^"]*)"', m.group(3))
        g = Grid(w, h)
        for y, row in enumerate(rows[:h]):
            for x, ch in enumerate(row[:w]):
                if ch == ".":
                    continue
                g.px[y][x] = (ord(ch) - 48) if ch.isdigit() else (ord(ch) - 87)
        out[key] = g
    return out


def sheet_fx() -> str:
    # Echte, zur Laufzeit exportierte Texturen (scripts/art/shots.mjs -> shots/fx).
    keys = ["projectile_ember", "projectile_thorn", "projectile_ice", "projectile_phoenix",
            "flail_ball", "chain_link", "orb_lantern", "orb_soul", "bolt_seg",
            "ring_frost", "ring_burst", "ring_seal", "ring_soul",
            "chest_closed", "chest_open", "lantern_small", "gem_small", "gem_medium", "gem_large",
            "fx_coin", "fx_spark", "arrow_chest"]
    items = []
    fx_dir = os.path.join(SHOTS, "fx")
    for key in keys:
        path = os.path.join(fx_dir, key + ".png")
        if os.path.exists(path):
            w, h, pix = read_rgba_png(path)
            items.append((key, w, h, pix))
        else:
            grid = _parse_texture_grids([key]).get(key)
            if grid is not None:
                items.append((key, grid.w, grid.h, grid_rgba_local(grid)))
    cols = 6
    cell_w, cell_h = 210, 230
    sw, sh = cols * cell_w + 30, ((len(items) + cols - 1) // cols) * cell_h + 96
    sheet = Sheet(sw, sh)
    sheet.text(20, 14, "LANTERNFALL  M4  -  FX / PROJEKTILE (12 WAFFEN + EVOLUTIONEN)", TITLE, 3)
    sheet.text(20, 50, "GLUT 17-22  -  KERN 13 NUR ALS GLOW  -  KONTUR 1PX  -  ECHTE IN-GAME-TEXTUREN", LABEL, 2)
    for i, (key, w, h, pix) in enumerate(items):
        x = 15 + (i % cols) * cell_w
        y = 86 + (i // cols) * cell_h
        sheet.cell(x, y, cell_w - 10, cell_h - 12, i % 2 == 1)
        # Ringe (96 px) mit 2x, kleine Sprites mit 4-8x, nie ueber die Zelle.
        scale = 2 if max(w, h) > 64 else max(4, min(8, 140 // max(w, h)))
        sheet.blit_pix(w, h, pix, x + (cell_w - 10 - w * scale) // 2, y + 8, scale)
        sheet.text(x + 4, y + cell_h - 26, key.upper(), LABEL, 1)
    sheet.text(20, sh - 22, "BASIS: EMBER/THORN/ICE/STORM/LANTERN/FLAIL  -  EVO: PHOENIX/WRATH PENDULUM/ETERNAL WINTER/THORN STORM/THUNDER SEAL/SOUL BEACON", LABEL, 1)
    path = os.path.join(SHOTS, "m4-sheet-fx.png")
    sheet.save(path)
    return path


def grid_rgba_local(grid):
    from lib import grid_rgba
    return grid_rgba(grid)


def sheet_tiles() -> str:
    sw, sh = 1640, 740
    sheet = Sheet(sw, sh)
    sheet.text(20, 14, "LANTERNFALL  M4  -  TILESET / AUTOTILING", TITLE, 3)
    sheet.text(20, 50, "PIXEL-TERRAIN  -  UFER 2 PX SCHAUM + SCHLAMMBANK  -  DEKOR IN GRUPPEN  -  WEICHER LICHTPOOL", LABEL, 2)
    atlas_path = os.path.join(SHOTS, "tileset-atlas.png")
    scale = 3
    if os.path.exists(atlas_path):
        w, h, pix = read_rgba_png(atlas_path)
        ax, ay = 24, 86
        sheet.cell(ax - 8, ay - 8, w * scale + 16, h * scale + 16, False)
        sheet.blit_pix(w, h, pix, ax, ay, scale)
        # 16-PX-Raster als duenne Hilfslinien (Palette 5) ueber den Atlas.
        for gx in range(0, w // 16 + 1):
            for gy in range(h):
                sheet.px[(ay + gy) * sheet.w + ax + gx * 16 * scale] = PAL[5] + (255,)
        for gy in range(0, h // 16 + 1):
            for gx in range(w):
                sheet.px[(ay + gy * 16 * scale) * sheet.w + ax + gx * scale] = PAL[5] + (255,)
        ly = ay + h * scale + 14
        sheet.text(ax, ly, "REIHE 1: WASSER  -  REIHE 2: WEG  -  REIHE 3: SCHLAMM", LABEL_HI, 1)
        sheet.text(ax, ly + 14, "REIHE 4: GRAS  -  REIHE 5/6: DEKOR + REINES GRAS", LABEL, 1)
        sheet.text(ax, ly + 28, "GITTER = 16-PX-KACHELN (HILFSLINIEN)", LABEL, 1)
        sheet.text(ax, ly + 42, "TERRAIN SELBST PIXELGENAU, KEINE KACHELNAHT", LABEL, 1)
        sheet.text(ax, ly + 56, "DEKOR: BAUM / GRAB / STEIN / RUINE / LATERNE", LABEL, 1)
    src = os.path.join(SHOTS, "m4-probe-terrain.png")
    if os.path.exists(src):
        w, h, pix = read_rgba_png(src)
        px, py = 520, 86
        sheet.blit_pix(min(w, 960), min(h, 540), pix, px, py, 1, 1)
        sheet.text(px, py + min(h, 540) + 10, "IN-GAME-ERDE (PFAD + MOORGRAS + DEKOR, 2X SPIELPIXEL)", LABEL_HI, 1)
        sheet.text(px, py + min(h, 540) + 26, "AUTOTILING IM LAUFENDEN SPIEL, KEINE JS-FEHLER", LABEL, 1)
    sheet.text(20, sh - 26, "ALLE KACHELN 16x16, GANZZAHLIG, PALETTE 0-31 + TRANSPARENZ", LABEL, 2)
    path = os.path.join(SHOTS, "m4-sheet-tiles.png")
    sheet.save(path)
    return path


def sheet_ui() -> str:
    import gen_ui
    import gen_icons
    ui = gen_ui.build()
    icons = gen_icons.build()
    cols = 6
    cell_w, cell_h = 250, 240
    rows = (len(icons) + cols - 1) // cols
    sw = cols * cell_w + 30
    sh = 420 + rows * cell_h + 60
    sheet = Sheet(sw, sh)
    sheet.text(20, 14, "LANTERNFALL  M4  -  UI / ICONS", TITLE, 3)
    sheet.text(20, 50, "TITEL-EMBLEM 96x56  -  9-SLICE-RAHMEN 24x24 (BORDER 8)  -  18 ICONS 16x16", LABEL, 2)
    # Emblem + Rahmen nebeneinander.
    sheet.cell(20, 84, 800, 320, False)
    logo = ui["title_logo"][0]
    sheet.blit(logo, 110, 104, 5)
    sheet.text(40, 380, "TITEL-EMBLEM (GLASKERN 13 = GLOW)", LABEL_HI, 2)
    sheet.cell(840, 84, 340, 320, True)
    sheet.blit(ui["ui_frame"][0], 930, 160, 8)
    sheet.text(860, 380, "9-SLICE-RAHMEN", LABEL_HI, 2)
    for i, (key, grids) in enumerate(icons.items()):
        x = 15 + (i % cols) * cell_w
        y = 430 + (i // cols) * cell_h
        sheet.cell(x, y, cell_w - 12, cell_h - 14, i % 2 == 1)
        sheet.blit(grids[0], x + (cell_w - 12 - 128) // 2, y + 8, 8)
        sheet.text(x + 4, y + cell_h - 26, key.replace("weapon_", "W_").replace("passive_", "P_").replace("evo_", "EVO_").upper(), LABEL, 1)
    path = os.path.join(SHOTS, "m4-sheet-ui.png")
    sheet.save(path)
    return path


if __name__ == "__main__":
    print(sheet_ref())
    print(sheet_chars())
    print(sheet_enemies())
    print(sheet_bosses())
    print(sheet_fx())
    print(sheet_tiles())
    print(sheet_ui())
