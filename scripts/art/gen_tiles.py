#!/usr/bin/env python3
"""Tileset + Dekor, 16x16.

Referenz-Asset (M4-01): Laternenpfahl. Vollständiges Autotiling folgt in M4-05.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, outline, shade_edges, save_grid_png, SHOTS  # noqa: E402


def lantern_post() -> Grid:
    """16x16 Laternenpfahl: Eisenrahmen (2/4/5/7), Glaskern (17/20/21/22/13),
    Steinsockel mit warmem Streulicht als gruppierte 2x2-Blöcke."""
    g = Grid(16, 16)
    # Sockel: ein 10-px-Block, oben Licht 6, unten Schatten 2.
    g.rect(3, 13, 10, 3, 5)
    g.rect(3, 13, 10, 1, 6)
    g.rect(4, 14, 8, 1, 4)
    g.rect(3, 15, 10, 1, 2)
    g.put(4, 13, 7)
    g.put(9, 13, 6)
    # Streulicht auf dem Sockel (2x2 gruppiert, hellster Kern oben-links).
    g.rect(4, 14, 2, 2, 19)
    g.put(4, 14, 20)
    g.rect(10, 14, 2, 2, 17)
    g.put(10, 14, 19)
    # Pfosten: 3 px breit.
    g.rect(7, 9, 3, 4, 4)
    g.rect(7, 9, 1, 4, 5)
    g.put(9, 12, 2)
    # Querarm + Aufhängung.
    g.rect(4, 8, 8, 1, 4)
    g.rect(4, 8, 8, 1, 4)
    g.put(4, 8, 5)
    g.put(11, 8, 2)
    g.put(7, 8, 5)
    # Laternenrahmen (Eisen): Deckel, Seiten, Boden.
    g.rect(4, 3, 8, 2, 4)
    g.rect(4, 3, 8, 1, 5)
    g.put(4, 3, 7)
    g.put(5, 3, 7)
    g.put(11, 3, 2)
    g.rect(4, 5, 2, 3, 4)
    g.rect(10, 5, 2, 3, 4)
    g.put(4, 5, 5)
    g.put(10, 5, 2)
    g.rect(4, 8, 8, 1, 3)
    # Glaskern (2x2 Laternenweiß, umgeben von Glut/Gold).
    g.rect(6, 5, 4, 3, 17)
    g.rect(6, 5, 4, 3, 20)
    g.rect(7, 5, 2, 3, 21)
    g.rect(7, 5, 2, 2, 22)
    g.put(7, 5, 13)
    g.put(8, 5, 13)
    g.put(7, 6, 13)
    g.put(8, 6, 13)
    g.put(6, 7, 18)
    g.put(9, 7, 16)
    return outline(g)


if __name__ == "__main__":
    post = lantern_post()
    save_grid_png(post, os.path.join(SHOTS, "m4-ref-post.png"), scale=10)
    print("wrote reference lantern post")
