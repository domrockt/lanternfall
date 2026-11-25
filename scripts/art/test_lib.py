#!/usr/bin/env python3
"""Selbsttest fuer die 21-Lichtkanten-Reduktion (shade_edges → reduce_light_edges).

Aufruf: python3 scripts/art/test_lib.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Grid, reduce_light_edges  # noqa: E402


def block_2x2() -> None:
    g = Grid(6, 6, 27)
    for y in (1, 2):
        for x in (1, 2):
            g.put(x, y, 21)
    out = reduce_light_edges(g)
    lights = [(x, y) for y in range(g.h) for x in range(g.w) if out.px[y][x] == 21]
    assert lights == [(1, 1)], f"2x2 muss genau oben-links behalten: {lights}"


def vertical_line() -> None:
    g = Grid(6, 8, 27)
    for y in range(1, 7):
        g.put(2, y, 21)
    out = reduce_light_edges(g)
    lights = [(x, y) for y in range(g.h) for x in range(g.w) if out.px[y][x] == 21]
    assert lights == [(2, y) for y in range(1, 7)], f"1-px-Linie muss erhalten bleiben: {lights}"


def no_skin_fallback() -> None:
    # Dicke 21-Flaeche auf einer Gold-/Steinrampe darf keinen Hautton 27 bekommen.
    g = Grid(6, 6, 20)
    for y in (1, 2):
        for x in (1, 2):
            g.put(x, y, 21)
    out = reduce_light_edges(g)
    assert all(out.px[y][x] != 27 for y in range(g.h) for x in range(g.w))


if __name__ == "__main__":
    block_2x2()
    vertical_line()
    no_skin_fallback()
    print("test_lib: OK (2x2, 1-px-Linie, kein Haut-Fallback)")
