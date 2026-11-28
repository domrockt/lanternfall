#!/usr/bin/env python3
"""Moor-Requisiten (16-56 px) + Wasser-Details, für M4b.

Alle Requisiten sind einzelne, im Spiel als Bild-Sprites platzierte Objekte
(kein 16-px-Kachelzwang), damit tote Bäume/Ruinen über Kachelgrenzen wachsen
können. Bodenschatten ist eingebacken (Palette 1/2, keine Alpha-Blends).

Palette: Holz 14/15/16/17, Stein 4/5/6/8, Knochen 5/8/10/11,
Moor 28/29/30/31, Rot 23/24/25/27, Gold 16/17/20/22.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, emit_ts, save_grid_png, save_sheet_png, SHOTS  # noqa: E402

INK = 0


def _shadow(w: int, h: int, bw: int, bh: int, cy: int) -> Grid:
    """Weicher Bodenschatten in Moostönen (29 Rand / 28 Kern), 2–3 px nach SO."""
    g = Grid(w, h)
    cx = w // 2
    g.ellipse(cx + 2, cy + 2, max(5, bw // 2), max(2, bh // 2), 29)
    g.ellipse(cx + 1, cy + 1, max(4, bw // 2 - 2), max(2, bh // 2 - 1), 28)
    return g


def _finish(body: Grid, w: int, h: int, shade: bool = True) -> Grid:
    """Kontur um den Körper, Schatten darunter (Körper über Schatten)."""
    if shade:
        body = shade_edges(body, band=1, region_aware=True)
    body = outline(body)
    out = _shadow(w, h, max(10, body.w - 10), 8, h - 4)
    out.blit(body, (w - body.w) // 2, 0)
    return out


def dead_tree(kind: int) -> Grid:
    """Toter Baum, 34x48 bzw. 40x56: dicker verdrehter Stamm, knorrige Äste, Wurzeln."""
    w, h = (34, 48) if kind == 0 else (40, 56)
    g = Grid(w, h)
    cx = w // 2 + (kind * 2 - 1)
    base = h - 10
    top = 8 if kind == 0 else 4
    lean = 3 if kind == 0 else -2

    # Stamm: 7-9 px am Fuß, verjüngt nach oben, leichte Neigung.
    for y in range(top, base + 3):
        t = (y - top) / max(1, base + 3 - top)
        ww = 4 + int(t * (4 if kind == 0 else 5))
        x = cx - ww // 2 + int((1 - t) * lean)
        g.rect(x, y, ww, 1, 15)
        g.rect(x, y, 2, 1, 16)
        g.put(x + ww - 1, y, 14)
        g.put(x + ww - 2, y, 14)
    # Rindenrisse als 2-px-Blöcke, keine Einzelpixel.
    for y in range(top + 8, base - 2, 9):
        g.rect(cx - 1, y, 2, 3, 14)
        g.rect(cx + 2, y + 4, 2, 2, 14)
    g.rect(cx - 1, base - 14, 3, 2, 17)
    g.rect(cx + 1, base - 6, 2, 3, 17)

    # Wurzeln: 2-px-Äste direkt am Stammfuß, gruppiert.
    root_y = base + 1
    g.line(cx - 2, root_y, cx - 12 - kind * 2, root_y + 2, 15, 2)
    g.line(cx + 1, root_y, cx + 12 + kind * 2, root_y + 1, 15, 2)
    g.put(cx - 13 - kind * 2, root_y + 3, 14)
    g.put(cx + 13 + kind * 2, root_y + 2, 14)
    g.rect(cx - 6, root_y - 1, 3, 2, 16)

    # Äste: 3-px am Stamm, 2-px nach außen, knorrige Gabeln.
    branches = (
        [(-1, 24, -14, 14), (1, 20, 12, 10), (-1, 13, -9, 4), (1, 10, 10, 2)]
        if kind == 0 else
        [(-1, 27, -18, 16), (1, 23, 16, 13), (-1, 17, -12, 6), (1, 14, 14, 4), (-1, 9, -7, 1)]
    )
    for side, y, dx, ty in branches:
        x0 = cx + side * 2
        x1 = cx + dx
        g.line(x0, y, x1, ty, 15, 2)
        # Rinde als durchgehendes 2-px-Band: 16 oben-links, 14 unten-rechts,
        # kein Schachbrett aus Einzelpixeln.
        g.line(x0, y - 1, x1, ty - 1, 16, 1)
        g.line(x0 - side, y + 1, x1 - side, ty + 1, 14, 1)
        g.put(x1, ty, 16)
        # Zweig: 2-px-Gabel mit verdorrter Spitze.
        g.line(x1, ty, x1 + side * 6, ty - 5, 14, 2)
        g.put(x1 + side * 6, ty - 5, 15)
        g.put(x1 + side * 7, ty - 6, 14)
        g.put(x1 + side * 7, ty - 7, 14)

    # Abgebrochene Krone: 2x2-Cluster aus Totholz.
    for x, y in ((cx - 13, 10), (cx + 9, 6), (cx - 5, 2)):
        g.rect(x, y, 3, 3, 15)
        g.put(x, y, 16)
        g.put(x + 2, y + 2, 14)

    # Rinde bereits manuell gebändert (16/15/14); kein automatisches Shading,
    # das dünne Äste sonst zu einem 1-px-Schachbrett dithert.
    return _finish(g, w, h, shade=False)


def stump() -> Grid:
    g = Grid(22, 16)
    cx = 11
    # Wurzelansätze.
    g.rect(cx - 8, 10, 5, 3, 14)
    g.rect(cx + 4, 11, 5, 3, 14)
    g.rect(cx - 7, 10, 4, 1, 16)
    # Stumpfkorpus.
    g.rect(cx - 6, 5, 13, 6, 15)
    g.rect(cx - 6, 5, 2, 6, 16)
    g.rect(cx + 5, 5, 2, 6, 14)
    # Schnittfläche: Ellipse mit Jahresringen.
    g.ellipse(cx, 5, 6, 3, 16)
    g.ellipse(cx, 4, 5, 2, 17)
    g.ellipse(cx, 4, 3, 1, 15)
    g.put(cx, 4, 16)
    # Moos am Fuß.
    g.rect(cx - 5, 11, 4, 2, 29)
    g.put(cx - 5, 11, 30)
    g.rect(cx + 2, 12, 3, 1, 29)
    return _finish(g, 22, 16)


def boulder() -> Grid:
    g = Grid(26, 20)
    # Findling: asymmetrischer Block, oben-links Licht.
    g.ellipse(13, 11, 10, 7, 5)
    g.ellipse(11, 9, 8, 5, 6)
    g.rect(5, 15, 16, 2, 4)
    g.put(7, 7, 8)
    g.put(8, 7, 8)
    g.put(9, 6, 8)
    g.put(12, 5, 8)
    # Risse + Moos.
    g.line(12, 7, 16, 12, 4, 1)
    g.line(16, 12, 15, 15, 4, 1)
    g.rect(7, 13, 3, 2, 29)
    g.put(7, 13, 30)
    g.rect(17, 14, 3, 1, 29)
    g.put(6, 16, 30)
    return _finish(g, 26, 20)


def boulder_b() -> Grid:
    """Mooblock 26x20: flacher, breiter Findling, stark bewachsen (Variantenziel:
    Steine wiederholen seltener). Licht oben-links wie boulder()."""
    g = Grid(26, 20)
    g.ellipse(12, 13, 11, 5, 5)
    g.ellipse(10, 12, 8, 3, 6)
    g.rect(4, 16, 18, 2, 4)
    g.put(6, 11, 8)
    g.put(7, 10, 8)
    g.put(13, 9, 8)
    # Langer Riss quer zum Block.
    g.line(8, 12, 14, 17, 4, 1)
    g.put(15, 17, 4)
    # Moosteppich mit Bewuchs-Kante (dichter als boulder()).
    g.rect(6, 9, 7, 2, 29)
    g.rect(5, 10, 3, 2, 29)
    g.put(6, 9, 30)
    g.put(9, 8, 30)
    g.rect(15, 10, 5, 2, 29)
    g.put(16, 9, 30)
    g.put(19, 11, 28)
    g.rect(12, 8, 2, 1, 29)
    return _finish(g, 26, 20)


def boulder_c() -> Grid:
    """Splitterfels 26x20: hoher, spitzer Brocken mit Kerbe und heller Kante."""
    g = Grid(26, 20)
    g.ellipse(13, 11, 8, 8, 5)
    g.ellipse(11, 9, 6, 6, 6)
    g.rect(6, 15, 15, 2, 4)
    # Spitze oben, Kante oben-links hell.
    g.put(13, 3, 6)
    g.put(12, 4, 8)
    g.put(11, 5, 8)
    g.put(10, 7, 8)
    g.put(9, 9, 8)
    # Kerbe/Spalt auf der rechten Flanke.
    g.line(16, 6, 18, 12, 4, 1)
    g.line(18, 12, 16, 16, 4, 1)
    g.put(17, 9, 4)
    # Kies am Fuss + ein Moostupfer.
    g.put(7, 17, 5)
    g.put(18, 17, 5)
    g.put(19, 16, 4)
    g.rect(8, 13, 3, 2, 29)
    g.put(9, 13, 30)
    return _finish(g, 26, 20)


def bones_b() -> Grid:
    """Wirbelsaeule 23x14: Schaedel unten links, Wirbelkette nach rechts,
    langer Knochen diagonal darueber."""
    g = Grid(23, 14)
    # Schaedel halb versenkt, grob 7x6 mit Kiefer.
    g.ellipse(5, 8, 4, 4, 10)
    g.rect(2, 10, 8, 2, 10)
    g.rect(3, 9, 2, 1, 2)
    g.rect(6, 9, 2, 1, 2)
    g.rect(4, 12, 4, 1, 8)
    g.put(3, 6, 11)
    g.put(6, 5, 11)
    # Wirbelkette: 5 Wirbel als 2x2-Blöcke auf 1-px-Spine, abnehmende Hoehe.
    for i in range(5):
        x = 11 + i * 2
        y = 8 - i
        g.put(x, y + 1, 10)
        g.rect(x, y, 2, 2, 10)
        g.put(x, y, 11)
        g.put(x + 1, y + 1, 8)
    # Langer Knochen diagonal, Knaeufe an beiden Enden.
    g.line(10, 5, 18, 2, 11, 2)
    g.put(9, 6, 10)
    g.put(9, 5, 11)
    g.put(19, 1, 10)
    g.put(19, 2, 11)
    return _finish(g, 23, 14)


def bones_c() -> Grid:
    """Gebein-Haufen 23x14: zwei Schaedel ueber gekreuzten langen Knochen."""
    g = Grid(23, 14)
    # Gekreuzte Knochen zuerst (liegen unter den Schaedeln).
    g.line(4, 11, 19, 4, 11, 2)
    g.line(4, 4, 19, 11, 10, 2)
    g.put(3, 12, 10)
    g.put(3, 11, 11)
    g.put(20, 3, 10)
    g.put(20, 4, 11)
    g.put(3, 3, 11)
    g.put(3, 4, 10)
    g.put(20, 12, 11)
    g.put(20, 11, 10)
    # Schaedel 1 (Mitte links, leicht gekippt).
    g.ellipse(8, 6, 4, 3, 10)
    g.rect(5, 8, 7, 1, 10)
    g.rect(6, 5, 2, 1, 2)
    g.rect(9, 5, 2, 1, 2)
    g.rect(7, 7, 2, 1, 8)
    # Schaedel 2 (rechts, tiefer, halb verdeckt).
    g.ellipse(16, 8, 4, 3, 11)
    g.rect(13, 10, 7, 1, 10)
    g.rect(14, 8, 2, 1, 2)
    g.rect(17, 8, 2, 1, 2)
    return _finish(g, 23, 14)


def grave() -> Grid:
    g = Grid(18, 22)
    # Grabstein mit gerundetem Kopf, schief eingelassen.
    g.rect(4, 5, 11, 13, 6)
    g.ellipse(9, 5, 5, 3, 6)
    g.rect(5, 4, 9, 12, 6)
    g.rect(5, 4, 2, 13, 7)
    g.put(6, 3, 8)
    g.put(7, 3, 8)
    g.put(11, 4, 4)
    # Kreuz-Relief, 2 px breit.
    g.rect(8, 7, 2, 8, 8)
    g.rect(6, 9, 6, 2, 8)
    g.put(8, 7, 9)
    # Bruchkante + Moos.
    g.rect(13, 6, 2, 3, 4)
    g.put(13, 5, 4)
    g.rect(4, 15, 4, 2, 29)
    g.put(4, 15, 30)
    g.put(13, 14, 29)
    # Sockel.
    g.rect(3, 17, 13, 3, 5)
    g.rect(3, 17, 13, 1, 7)
    g.rect(4, 19, 11, 1, 3)
    return _finish(g, 18, 22)


def cross() -> Grid:
    g = Grid(16, 24)
    # Holzkreuz, leicht nach rechts gelehnt.
    g.rect(7, 3, 3, 16, 15)
    g.rect(2, 8, 13, 3, 15)
    g.rect(2, 8, 13, 1, 16)
    g.rect(7, 3, 1, 16, 16)
    g.rect(13, 8, 1, 3, 14)
    g.put(9, 3, 16)
    g.put(10, 4, 14)
    # Nagelstellen.
    g.rect(4, 9, 2, 2, 14)
    g.rect(9, 11, 2, 2, 14)
    # Moos + Sockel.
    g.rect(6, 19, 4, 2, 29)
    g.put(6, 19, 30)
    g.rect(5, 21, 7, 2, 5)
    g.rect(5, 21, 7, 1, 6)
    return _finish(g, 16, 24)


def ruin() -> Grid:
    """Gebrochene Mauer, 52x30: 5-7-px-Steinblöcke, Bogenfenster, Efeu."""
    g = Grid(52, 30)
    rows = ((3, 7, 46), (10, 6, 40), (16, 7, 30), (23, 5, 18))
    for y0, bh, bw in rows:
        x0 = (52 - bw) // 2
        for bx in range(x0, x0 + bw, 7):
            ww = min(6, x0 + bw - bx)
            g.rect(bx, y0, ww, bh, 5)
            g.rect(bx, y0, ww, 1, 7)
            g.rect(bx, y0, 1, bh, 6)
            g.rect(bx + ww - 1, y0 + bh - 2, 1, 2, 4)
            g.put(bx + 2, y0 + 2, 8)
            # Fugen: 1-px dunkel zwischen Blöcken (keine Rauschpunkte).
            g.vline(bx - 1, y0, y0 + bh - 1, 4)
    # Bogenfenster (Öffnung 1, Tiefe unten 2 statt VollInk 0 mit Steinrahmen).
    g.rect(22, 20, 8, 10, 1)
    g.rect(23, 25, 6, 5, 2)
    g.ellipse(26, 21, 4, 3, 1)
    g.rect(21, 19, 10, 2, 6)
    g.put(21, 21, 7)
    g.put(30, 21, 4)
    # Efeu/Moos in 2x2-Clustern.
    for x, y in ((12, 13), (36, 20), (9, 24), (39, 14)):
        g.rect(x, y, 3, 2, 29)
        g.put(x, y, 30)
        g.put(x + 2, y + 1, 28)
    return _finish(g, 52, 30)


def column() -> Grid:
    """Umgestürzte/stehende Säule 18x38 (stehend, gebrochen)."""
    g = Grid(18, 38)
    cx = 9
    # Sockel.
    g.rect(cx - 6, 31, 13, 4, 5)
    g.rect(cx - 6, 31, 13, 1, 7)
    # Schaft mit Kanneluren.
    g.rect(cx - 4, 9, 9, 23, 6)
    g.rect(cx - 4, 9, 2, 23, 8)
    g.rect(cx + 3, 9, 2, 23, 4)
    for x in (cx - 2, cx + 1):
        g.vline(x, 10, 30, 5)
        g.vline(x + 1, 11, 29, 7)
    # Kapitell + Bruch.
    g.rect(cx - 5, 6, 11, 4, 5)
    g.rect(cx - 5, 6, 11, 1, 7)
    g.rect(cx - 3, 4, 7, 2, 6)
    g.put(cx - 2, 3, 8)
    g.put(cx + 1, 2, 6)
    g.put(cx + 3, 3, 5)
    # Sturz-Riss.
    g.line(cx - 4, 14, cx - 1, 20, 4)
    g.put(cx + 2, 24, 4)
    # Moos.
    g.rect(cx - 5, 29, 4, 2, 29)
    g.put(cx - 5, 29, 30)
    return _finish(g, 18, 38)


def post() -> Grid:
    """Laternenpfahl 20x32: Eisenpfosten, Querarm, warmes Glas, Lichtpool."""
    g = Grid(20, 32)
    cx = 10
    # Sockel.
    g.rect(cx - 5, 27, 11, 3, 5)
    g.rect(cx - 5, 27, 11, 1, 7)
    # Pfosten.
    g.rect(cx - 1, 12, 3, 16, 4)
    g.put(cx - 1, 12, 5)
    g.put(cx + 1, 26, 2)
    # Querarm + Aufhängung.
    g.rect(cx - 6, 11, 13, 2, 4)
    g.rect(cx - 6, 11, 13, 1, 5)
    g.put(cx - 6, 12, 2)
    # Laterne: Rahmen + Glas.
    g.rect(cx - 4, 4, 9, 2, 4)
    g.rect(cx - 4, 4, 9, 1, 5)
    g.rect(cx - 4, 6, 2, 4, 4)
    g.rect(cx + 3, 6, 2, 4, 4)
    g.rect(cx - 2, 6, 5, 4, 17)
    g.rect(cx - 1, 6, 3, 4, 20)
    g.rect(cx - 1, 6, 2, 3, 21)
    g.put(cx - 1, 6, 13)
    g.put(cx, 6, 13)
    g.rect(cx - 4, 10, 9, 1, 3)
    # Lichtpool am Boden (3 Stufen, kein harter Kern).
    for hw, col in ((7, 17), (5, 18), (3, 19)):
        g.rect(cx - hw, 29, hw * 2, 1, col)
    g.put(cx - 1, 30, 20)
    g.put(cx, 30, 21)
    return _finish(g, 20, 32)


def post_b() -> Grid:
    """Abgebrochene Laterne 20x32 (Rest): schief geknickter Pfosten, hängendes
    zerbrochenes Gehäuse, Glas erloschen (Nachtton), Scherben am Fuss — kein
    Lichtpool (GroundRenderer gibt nur der intakten Laterne den Glow)."""
    g = Grid(20, 32)
    cx = 10
    # Sockel wie post().
    g.rect(cx - 5, 27, 11, 3, 5)
    g.rect(cx - 5, 27, 11, 1, 7)
    # Pfosten nur bis zur Bruchstelle (y=19), oben gezackt.
    g.rect(cx - 1, 15, 3, 13, 4)
    g.put(cx - 1, 15, 5)
    g.put(cx + 1, 26, 2)
    g.put(cx - 1, 14, 4)
    g.put(cx, 14, 2)
    g.put(cx + 1, 15, 4)
    # Verrosteter Querarm, hängt schief (2 px nach unten rechts).
    g.rect(cx - 6, 16, 13, 2, 4)
    g.rect(cx - 6, 16, 13, 1, 5)
    g.put(cx - 6, 17, 2)
    g.put(cx + 6, 18, 14)
    # Hängendes, zerbrochenes Gehäuse: Rahmen schief, Glas erloschen + Riss.
    g.rect(cx - 3, 19, 7, 2, 4)
    g.rect(cx - 3, 19, 7, 1, 5)
    g.rect(cx - 3, 21, 2, 3, 4)
    g.rect(cx + 3, 22, 2, 3, 4)
    g.rect(cx - 1, 21, 4, 4, 2)
    g.put(cx, 21, 3)
    g.put(cx, 22, 3)
    g.rect(cx - 3, 24, 7, 1, 3)
    # Riss im Glas.
    g.line(cx, 22, cx + 1, 24, 0, 1)
    # Scherben am Fuss (Knochen-/Dunstton, kein Licht).
    g.put(cx - 6, 30, 8)
    g.put(cx + 5, 30, 9)
    g.put(cx + 6, 29, 8)
    return _finish(g, 20, 32)


def mushroom_ring() -> Grid:
    """Pilzring: 5 rote Kappen mit hellen Stielen, in einem Bogen."""
    g = Grid(30, 18)
    spots = ((5, 10, 5), (11, 8, 6), (18, 9, 6), (24, 11, 5), (15, 13, 4))
    for x, y, r in spots:
        # Stiel.
        g.rect(x - 1, y, 2, 4, 10)
        g.put(x - 1, y + 3, 8)
        # Kappe: 2-zeilig, Licht oben-links.
        g.ellipse(x, y - 2, r, r // 2 + 1, 24)
        g.rect(x - r + 1, y - 2, r * 2 - 1, 2, 24)
        g.rect(x - r + 1, y - 3, r * 2 - 3, 1, 25)
        g.put(x - r + 2, y - 3, 27)
        # Weiße Tupfen (2x2).
        for dx in (-2, 1):
            g.rect(x + dx, y - 2, 2, 2, 11)
    # Ring-Spur am Boden: 2x1-Flecken, kein Kreis.
    for x in (3, 9, 16, 23, 27):
        g.rect(x, 16, 2, 1, 29)
    return _finish(g, 30, 18)


def bones() -> Grid:
    g = Grid(23, 14)
    # Schädel.
    g.ellipse(6, 5, 5, 4, 10)
    g.rect(2, 8, 9, 2, 10)
    g.rect(4, 8, 2, 1, 11)
    g.rect(7, 8, 2, 1, 11)
    g.rect(4, 4, 2, 2, 2)
    g.rect(7, 4, 2, 2, 2)
    g.put(5, 4, 13)
    g.put(8, 4, 13)
    g.rect(5, 6, 3, 1, 8)
    # Rippen als 2-px-Bögen.
    for i in range(3):
        x = 11 + i * 3
        g.rect(x, 4 + i, 2, 2, 11)
        g.put(x, 4 + i, 10)
    g.rect(11, 9, 8, 2, 10)
    g.rect(11, 9, 8, 1, 11)
    # Einzelknochen.
    g.line(15, 11, 20, 12, 11, 2)
    g.put(20, 12, 10)
    return _finish(g, 23, 14)


def reeds() -> Grid:
    """Schilf 18x24: 3 hohe Halme mit Kolben, 2-px-Stängel."""
    g = Grid(18, 24)
    base = 21
    stalks = ((4, 9), (9, 4), (14, 7))
    for x, top in stalks:
        g.vline(x, top, base, 30)
        g.vline(x + 1, top + 1, base, 29)
        # Kolben: 2x3-Cluster.
        g.rect(x, top, 3, 3, 16)
        g.put(x, top, 17)
        g.put(x + 2, top + 2, 14)
        # Halmblatt: 2-px-Bogen.
        g.put(x - 1, base - 4, 29)
        g.put(x - 2, base - 3, 29)
        g.put(x + 2, top + 4, 31)
        g.put(x + 3, top + 5, 30)
    # Grasbüschel am Fuß.
    g.rect(1, base, 4, 2, 29)
    g.put(1, base, 30)
    g.rect(12, base + 1, 5, 2, 29)
    g.put(12, base + 1, 30)
    return _finish(g, 18, 24)


def reeds_b() -> Grid:
    """Buschwerk 18x24 (Schilf-Variante): 5 krumme Halme, dichtes Buschherz,
    ein trockener Halm (Holzton) — Ufer wirken weniger wiederholt."""
    g = Grid(18, 24)
    base = 21
    # Krumme Halme: (Fuss, Scheitel, Biege-Richtung)
    stalks = ((3, 8, 1), (7, 4, -1), (10, 6, 1), (13, 9, -1), (15, 12, -1))
    for x, top, bend in stalks:
        g.vline(x, top + 3, base, 30)
        g.vline(x + bend, top + 1, top + 4, 29)
        g.vline(x + 2 * bend, top, top + 2, 30)
        # Kolben klein, versetzt zur Biege.
        g.rect(x + 2 * bend, top - 1, 2, 3, 16)
        g.put(x + 2 * bend, top - 1, 17)
        # Blätter.
        g.put(x - 1, base - 5, 31)
        g.put(x + 2, top + 5, 29)
    # Trockener, geknickter Halm (Holzton, ohne Kolben).
    g.vline(5, 14, base, 15)
    g.line(5, 14, 9, 11, 16, 1)
    g.put(10, 11, 14)
    # Dichtes Buschherz + Grasbüschel am Fuss.
    g.rect(4, base - 2, 9, 2, 29)
    g.put(5, base - 2, 30)
    g.put(11, base - 1, 28)
    g.rect(1, base, 4, 2, 29)
    g.put(1, base, 30)
    g.rect(11, base + 1, 5, 2, 29)
    g.put(12, base + 1, 30)
    return _finish(g, 18, 24)


def lilypad() -> Grid:
    g = Grid(15, 10)
    g.ellipse(7, 5, 6, 4, 29)
    g.ellipse(7, 4, 5, 3, 30)
    # Kerbe (2 px).
    g.rect(9, 2, 2, 3, None)
    g.put(10, 2, None)
    g.put(4, 3, 31)
    g.put(5, 3, 31)
    g.put(3, 5, 31)
    # Blüte: 2x2 Rot auf hellem Kern.
    g.rect(4, 2, 2, 2, 25)
    g.put(4, 2, 27)
    g.put(5, 3, 24)
    return g


def ripple(frame: int) -> Grid:
    """Wellenring 21x9, zwei Frames mit deutlichem Kamm-Versatz (±3 px)."""
    g = Grid(21, 9)
    if frame == 0:
        g.rect(2, 1, 8, 1, 8)
        g.rect(13, 2, 6, 1, 7)
        g.rect(4, 3, 5, 1, 7)
        g.rect(1, 5, 7, 1, 6)
        g.rect(11, 6, 7, 1, 8)
        g.put(2, 1, 9)
        g.put(13, 2, 8)
        g.put(11, 6, 9)
    else:
        g.rect(5, 2, 9, 1, 7)
        g.rect(1, 3, 5, 1, 8)
        g.rect(14, 4, 5, 1, 6)
        g.rect(3, 6, 8, 1, 8)
        g.rect(13, 7, 6, 1, 7)
        g.put(5, 2, 8)
        g.put(1, 3, 9)
        g.put(13, 7, 8)
    return g


SPRITES = {
    "prop_tree_a": (dead_tree(0), 34, 48),
    "prop_tree_b": (dead_tree(1), 40, 56),
    "prop_stump": (stump(), 22, 16),
    "prop_boulder": (boulder(), 26, 20),
    "prop_boulder_b": (boulder_b(), 26, 20),
    "prop_boulder_c": (boulder_c(), 26, 20),
    "prop_grave": (grave(), 18, 22),
    "prop_cross": (cross(), 16, 24),
    "prop_ruin": (ruin(), 52, 30),
    "prop_column": (column(), 18, 38),
    "prop_post": (post(), 20, 32),
    "prop_post_b": (post_b(), 20, 32),
    "prop_mushroom_ring": (mushroom_ring(), 30, 18),
    "prop_bones": (bones(), 23, 14),
    "prop_bones_b": (bones_b(), 23, 14),
    "prop_bones_c": (bones_c(), 23, 14),
    "prop_reeds": (reeds(), 18, 24),
    "prop_reeds_b": (reeds_b(), 18, 24),
    "prop_lilypad": (lilypad(), 15, 10),
    "water_ripple_0": (ripple(0), 13, 6),
    "water_ripple_1": (ripple(1), 13, 6),
}


def build() -> dict:
    data: dict[str, list[Grid]] = {}
    for key, (grid, w, h) in SPRITES.items():
        data[key] = [grid]
    return data


# m10-props-variety: Varianten-Wahl als reine Funktion (wird an gen-props.ts
# angehaengt). Basis-Keys ohne existierende Basis (z.B. prop_tree_a) und
# Fremd-Keys bleiben unveraendert; Wahl ist deterministisch je Position.
VARIANT_HELPER = """
// m10-props-variety: Sprite-Varianten je Prop-Klasse (Basis + _b/_c-Keys).
const PROP_VARIANTS: Record<string, string[]> = {};
for (const k of Object.keys(GEN_PROPS)) {
  const m = /^(prop_.+)_[a-z]$/.exec(k);
  if (m && GEN_PROPS[m[1]]) {
    (PROP_VARIANTS[m[1]] ??= []).push(k);
  }
}

/**
 * Deterministische Variantenwahl: pick in [0,1) waehlt gleichverteilt zwischen
 * der Basis-Sprite und ihren Varianten (prop_boulder_b/_c ...). Platzierung,
 * LOD-Tier und Batching bleiben klassenbasiert — nur die Textur variiert.
 */
export function propVariantKeyFor(base: string, pick: number): string {
  const variants = PROP_VARIANTS[base];
  if (!variants || variants.length === 0) return base;
  const idx = Math.min(variants.length, Math.max(0, Math.floor(pick * (variants.length + 1))));
  return idx === 0 ? base : variants[idx - 1];
}
"""


if __name__ == "__main__":
    data = build()
    path = emit_ts("gen-props.ts", "GEN_PROPS", data, "Moor-Requisiten + Wasser-Details (M4b)", extra=VARIANT_HELPER)
    print("wrote", path, len(data), "keys")
    keys = list(SPRITES.keys())
    save_sheet_png([SPRITES[k][0] for k in keys], os.path.join(SHOTS, "m4b-sheet-props.png"), scale=5, bg=(10, 14, 22))
    for k in ("prop_tree_a", "prop_ruin", "prop_post", "prop_mushroom_ring"):
        save_grid_png(SPRITES[k][0], os.path.join(SHOTS, f"m4b-ref-{k}.png"), scale=6)
    print("prop shots written")
