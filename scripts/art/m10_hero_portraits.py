#!/usr/bin/env python3
"""M10-Hero-Contrast: Portraet-Belege aus der Asset-Pipeline.

Rendert die 48x48-Portraets von Mira und Kael aus gen_chars.build() als
6x-nearest-PNGs nach shots/m10-hero-contrast-<tag>-portrait-{mira,kael}.png.
Die Pipeline-Daten sind exakt das, was die CharSelect-Textur zeigt.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import save_grid_png, SHOTS  # noqa: E402
import gen_chars  # noqa: E402


def main() -> None:
    tag = sys.argv[1] if len(sys.argv) > 1 else "before"
    data = gen_chars.build()
    for name in ("mira", "kael"):
        out = os.path.join(SHOTS, f"m10-hero-contrast-{tag}-portrait-{name}.png")
        save_grid_png(data[f"portrait_{name}"][0], out, scale=6)
        print("wrote", out)


if __name__ == "__main__":
    main()
