#!/usr/bin/env python3
"""Asset-Server-Client (Tesla P4) fuer Lanternfall.

Rohmaterial-Generator: palette/view/outline/width/height/n. Die Ergebnisse
werden NICHT direkt benutzt, sondern per scripts/art nachbearbeitet (Palette,
Kontur, Rauschen) bzw. als Referenz gesichtet.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.request

SERVER = os.environ.get("PIXEL_ASSET_SERVER", "http://10.10.50.220:8188")

PALETTE_FALLBACK = [
    "#06070c", "#0a0e16", "#101724", "#17202e", "#1e2a3a", "#2a3547", "#3a4a5c", "#4e5f6e",
    "#6b7c86", "#8fa0a6", "#b8c4c2", "#d9ddcd", "#f2edd8", "#fff8e6", "#2b1410", "#4d2214",
    "#7a331a", "#a84a21", "#cf6b26", "#ef9130", "#ffb84d", "#ffd77a", "#ffeeb0", "#3d1220",
    "#7a1f2e", "#b8303f", "#e4574d", "#ff8a6b", "#16261e", "#22382a", "#3d5a38", "#6f9b58",
]


def load_palette() -> list[str]:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "src", "palette.ts")
    try:
        import re
        text = open(path, encoding="utf-8").read()
        cols = ["#" + m.group(1).lower() for m in re.finditer(r"0x([0-9a-fA-F]{6}),", text)]
        if len(cols) == 32:
            return cols
    except OSError:
        pass
    return PALETTE_FALLBACK


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True, help="Ziel-PNG (Varianten _1.._n)")
    ap.add_argument("--width", type=int, default=32)
    ap.add_argument("--height", type=int, default=32)
    ap.add_argument("--size", type=int, default=None, help="Alt: quadratisch")
    ap.add_argument("--n", type=int, default=1, choices=[1, 2, 3, 4])
    ap.add_argument("--view", default="topdown", choices=["side", "topdown", "item", "tile", "raw"])
    ap.add_argument("--outline", default="#06070c", help="1-px Aussenkontur (#rrggbb) oder 'none'")
    ap.add_argument("--palette", default="project", choices=["project", "pico8", "none"])
    ap.add_argument("--seed", type=int)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--opaque", action="store_true")
    a = ap.parse_args()

    if a.size:
        a.width = a.height = a.size
    palette = load_palette() if a.palette == "project" else (None if a.palette == "none" else "pico8")
    body = {
        "prompt": a.prompt,
        "width": a.width,
        "height": a.height,
        "size": max(a.width, a.height),
        "n": a.n,
        "steps": a.steps,
        "view": a.view,
        "transparent": not a.opaque,
        "palette": palette,
    }
    if a.outline and a.outline.lower() != "none":
        body["outline"] = a.outline
    if a.seed is not None:
        body["seed"] = a.seed

    req = urllib.request.Request(
        f"{SERVER}/generate",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            d = json.load(r)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"asset server error: {exc} (health: curl -s {SERVER}/health)")

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    root, ext = os.path.splitext(a.out)
    paths = [a.out] if len(d["images"]) == 1 else [f"{root}_{i}{ext or '.png'}" for i in range(len(d["images"]))]
    for path, b64 in zip(paths, d["images"]):
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(b64))
    print(json.dumps({"files": paths, "seed": d.get("seed"), "ms": d.get("ms")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
