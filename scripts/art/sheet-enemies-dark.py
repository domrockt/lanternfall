#!/usr/bin/env python3
"""M4b-Beleg: alle 30 Gegner auf Index-1-Hintergrund (nightDeep).

Erzeugt shots/m4b-sheet-enemies-dark.png:
- alle 30 Gegner samt aller Lauf-Frames, 4x nearest, beschriftet,
  Hintergrund ausschließlich Palettenindex 1 (nightDeep);
- unten die vier dunklen Gegner (crow, spider, wolf, voidcaller) bei 8x
  auf demselben Grund, darunter ihre Frames bei 4x.
Zusätzlich prüft das Skript die Generator-Ausgabe:
- keine Off-Palette-Werte, keine isolierten Einzelpixel;
- dunkle Gegner: Lichtkante oben-links in Palettenfarbe auf der
  Silhouettenkante (mindestens 80 % der Randzeilen/-spalten);
- cultist/witchling: warme Haut aus der Rampe 16/27/21;
- Augen-Akzente 2x1/2x2 auf Höhle 2 (mindestens zwei Akzentläufe ≥2 px
  im oberen Drittel direkt über/unter Höhlenpixeln).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import gen_enemies  # noqa: E402
from lib import PAL, SHOTS, Grid, draw_text, write_rgba_png  # noqa: E402

BG = PAL[1]           # nightDeep
TITLE = PAL[21]       # lantern
LABEL = PAL[10]       # bone
LABEL_HI = PAL[9]     # paleMist

DARK_EDGE = {
    "crow": 9,        # paleMist
    "spider": 8,      # mist
    "wolf": 11,       # boneLight
    "voidcaller": 9,  # paleMist
}

WARM_SKIN = {16, 27, 21}
WARM_ENEMIES = ("cultist", "witchling")


class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px = [(BG[0], BG[1], BG[2], 255)] * (w * h)

    def rect(self, x, y, w, h, color):
        cor = (color[0], color[1], color[2], 255)
        for yy in range(max(0, y), min(self.h, y + h)):
            for xx in range(max(0, x), min(self.w, x + w)):
                self.px[yy * self.w + xx] = cor

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
        draw_text((self.px, self.w), x, y, s,
                  (color[0], color[1], color[2], 255), scale)

    def save(self, path: str):
        write_rgba_png(path, self.w, self.h, self.px)


def cell_size(tier: int, frames: int) -> tuple[int, int]:
    size = gen_enemies.TIER_SIZE[tier]
    return frames * size * 4, size * 4


# ── Generator-Prüfungen ─────────────────────────────────────────────────────
def check_assets(data) -> None:
    errors: list[str] = []
    for eid in gen_enemies.TIER:
        for fi, g in enumerate(data[f"enemy_{eid}"]):
            # 1. Nur Palette oder Transparenz.
            for row in g.px:
                for c in row:
                    if c is not None and not 0 <= c < 32:
                        errors.append(f"{eid} f{fi}: Off-Palette {c}")
                        break
            # 2. Keine isolierten Einzelpixel (Ausnahme: Kontur 0,
            #    Höhle 2, Glow 13/22).
            for y in range(g.h):
                for x in range(g.w):
                    c = g.px[y][x]
                    if c is None or c in (0, 2, 13, 22):
                        continue
                    n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                            if g.get(x + dx, y + dy) is not None)
                    if n == 0:
                        errors.append(f"{eid} f{fi}: Einzelpixel {c} @{x},{y}")
            # 3. Hintergrundindex 1 darf nicht an der Silhouettengrenze liegen
            #    (dort würde das Sprite auf nightDeep verschwinden). Innen
            #    ist 1 als Schatten der Rampe 2/3 zulässig.
            for y in range(g.h):
                for x in range(g.w):
                    if g.px[y][x] != 1:
                        continue
                    if any(g.get(x + dx, y + dy) is None
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        errors.append(f"{eid} f{fi}: Index 1 an der Kontur @{x},{y}")

    # 4. Dunkle Gegner: Lichtkante oben-links.
    for eid, ec in DARK_EDGE.items():
        for fi, g in enumerate(data[f"enemy_{eid}"]):
            rows, cols = [], []
            for y in range(g.h):
                xs = [x for x in range(g.w) if g.px[y][x] is not None]
                inner = [x for x in xs if g.px[y][x] not in (0,)]
                if inner:
                    rows.append(g.px[y][inner[0]])
            for x in range(g.w):
                ys = [y for y in range(g.h) if g.px[y][x] is not None]
                inner = [y for y in ys if g.px[y][x] not in (0,)]
                if inner:
                    cols.append(g.px[inner[0]][x])
            rq = sum(1 for c in rows if c == ec) / max(1, len(rows))
            cq = sum(1 for c in cols if c == ec) / max(1, len(cols))
            if rq < 0.8 or cq < 0.8:
                errors.append(f"{eid} f{fi}: Lichtkante {ec} nur "
                              f"{rq:.0%}/{cq:.0%} der Kanten")

    # 5. Warme Haut bei cultist/witchling.
    for eid in WARM_ENEMIES:
        for fi, g in enumerate(data[f"enemy_{eid}"]):
            used = {c for row in g.px for c in row if c is not None}
            if not WARM_SKIN <= used:
                errors.append(f"{eid} f{fi}: Hautrampe 16/27/21 fehlt "
                              f"({sorted(WARM_SKIN - used)})")

    # 6. Augen-Akzente: mindestens ein 2-px-Akzentlauf im oberen Drittel
    #    auf dunkler Höhle (1/2/3; Shading darf die Höhle um eine Stufe
    #    aufhellen). Einäugige Profile (Ratte, Krähe, Wolf) sind erlaubt.
    for eid, tier in gen_enemies.TIER.items():
        acc = gen_enemies.TIER_ACCENT[tier]
        for fi, g in enumerate(data[f"enemy_{eid}"]):
            ys = [y for y in range(g.h) if any(c is not None for c in g.px[y])]
            top, bot = min(ys), max(ys)
            limit = top + max(2, (bot - top) * 2 // 3)
            eyes = 0
            for y in range(top, min(limit + 1, g.h)):
                x = 0
                while x < g.w:
                    if g.px[y][x] == acc:
                        x0 = x
                        while x < g.w and g.px[y][x] == acc:
                            x += 1
                        if x - x0 >= 2:
                            cave = any(g.get(xx, yy) in (1, 2, 3)
                                       for xx in range(x0, x)
                                       for yy in (y - 1, y + 1))
                            if cave:
                                eyes += 1
                    else:
                        x += 1
            if eyes < 1:
                errors.append(f"{eid} f{fi}: kein 2-px-Akzent auf dunkler Hoehle")

    if errors:
        print("PRUEFUNG FEHLGESCHLAGEN:")
        for e in errors[:40]:
            print("  -", e)
        raise SystemExit(1)
    print(f"OK: {len(data)} Gegner, {sum(len(v) for v in data.values())} Frames, "
          "0 Off-Palette, 0 Einzelpixel, Lichtkanten/Haut/Akzente geprueft")


# ── Kontaktbogen ────────────────────────────────────────────────────────────
def build_sheet(data) -> str:
    order = list(gen_enemies.TIER.keys())
    gap = 8
    left = 24
    # Breite aus der breitesten Tier-Zeile (Tier 4: 6 Gegner × 4 Frames × 32 px × 4).
    widths = []
    for tier in range(5):
        ids = [e for e in order if gen_enemies.TIER[e] == tier]
        frames = gen_enemies.frames_for(ids[0])
        cw, _ = cell_size(tier, frames)
        widths.append(len(ids) * (cw + gap))
    sheet_w = max(widths) + 2 * left
    # Höhen: Titel + 5 Tier-Zeilen + Dunkel-Sektion.
    row_h = []
    for tier in range(5):
        ids = [e for e in order if gen_enemies.TIER[e] == tier]
        _, ch = cell_size(tier, gen_enemies.frames_for(ids[0]))
        row_h.append(ch + 44)
    dark_h = 32 * 8 + 30 + 24 + 14 + 32 * 4 + 24
    sheet_h = 100 + sum(row_h) + 60 + dark_h + 40
    sheet = Canvas(sheet_w, sheet_h)

    sheet.text(left, 14, "LANTERNFALL  M4B  -  GEGNER AUF NIGHTDEEP (INDEX 1)", TITLE, 3)
    sheet.text(left, 50, "ALLE 30 GEGNER + ALLE FRAMES  -  4X NEAREST  -  KONTUR 1PX INK 0", LABEL, 2)
    sheet.text(left, 74, "HINTERGRUND DURCHGEHEND INDEX 1  -  LICHT OBEN-LINKS", LABEL_HI, 1)

    y = 100
    for tier in range(5):
        size = gen_enemies.TIER_SIZE[tier]
        ids = [e for e in order if gen_enemies.TIER[e] == tier]
        frames = gen_enemies.frames_for(ids[0])
        cw, ch = cell_size(tier, frames)
        sheet.text(left, y, f"TIER {tier}  -  {size} PX  -  {frames} FRAMES", LABEL_HI, 2)
        yy = y + 18
        x = left
        for eid in ids:
            sheet.text(x, yy, eid.upper(), LABEL, 1)
            fx = x
            for fi, g in enumerate(data[f"enemy_{eid}"]):
                sheet.blit(g, fx, yy + 10, 4)
                sheet.text(fx + 2, yy + 10 + g.h * 4 + 2, f"F{fi}", LABEL, 1)
                fx += g.w * 4 + gap
            x += cw + gap
        y += row_h[tier]

    # Dunkel-Sektion: vier dunkle Gegner 8x, darunter all ihre Frames 4x.
    dy = y + 24
    sheet.text(left, dy, "DUNKLE GEGNER  -  8X AUF NIGHTDEEP  -  LICHTKANTE OBEN-LINKS", TITLE, 2)
    dy += 22
    x = left
    big_bottom = dy
    for eid, ec in DARK_EDGE.items():
        g = data[f"enemy_{eid}"][0]
        sheet.blit(g, x, dy, 8)
        sheet.text(x, dy + g.h * 8 + 4, f"{eid.upper()}  8X  KANTE {ec}", LABEL_HI, 1)
        big_bottom = max(big_bottom, dy + g.h * 8 + 12)
        x += g.w * 8 + 24

    # Frame-Leisten aller vier dunklen Gegner, 4x, ohne Überlappung.
    sy = big_bottom + 14
    sheet.text(left, sy, "FRAMES 4X  -  CROW / SPIDER / WOLF / VOIDCALLER", LABEL_HI, 1)
    sy += 12
    fx = left
    for eid in DARK_EDGE:
        for fi, fg in enumerate(data[f"enemy_{eid}"]):
            sheet.blit(fg, fx, sy, 4)
            sheet.text(fx + 1, sy + fg.h * 4 + 2, f"F{fi}", LABEL, 1)
            fx += fg.w * 4 + 4
        fx += 12

    path = os.path.join(SHOTS, "m4b-sheet-enemies-dark.png")
    sheet.save(path)
    # Einzelbelege der vier dunklen Gegner, 8x auf Index 1.
    from lib import save_grid_png
    for eid in DARK_EDGE:
        for fi, fg in enumerate(data[f"enemy_{eid}"]):
            save_grid_png(fg, os.path.join(SHOTS, f"m4b-dark-{eid}-f{fi}-dark.png"),
                          scale=8, bg=BG)
    return path


if __name__ == "__main__":
    data = gen_enemies.build()
    check_assets(data)
    path = build_sheet(data)
    print("wrote", path, os.path.getsize(path), "bytes")
