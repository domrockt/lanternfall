#!/usr/bin/env python3
"""Kontrast-/Distinktheits-Messung der 4 Gegner-Schuss-Optiken (M10).

Liest die HD-Grids direkt aus src/systems/EnemyProjectiles.ts und die Palette aus
src/palette.ts, damit die Zahlen reproduzierbar zum Code passen (kein Crop-Loop).

Ausgabe: shots/m10-enemy-shots-contrast.json
  - WCAG-Kontrast (sRGB-Luminanz) jedes opaken Nicht-Kontur-Pixels gegen 5 feste
    Hintergrund-Palettenindizes: minInner / meanInner / max
  - shapeIoU: Überlappung der Silhouettenmasken je Optik-Paar (ohne Kontur)

Aufruf: python3 scripts/art/contrast-enemy-shots.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
BG_NAMES = {
    "nightDeep": 1,
    "night": 2,
    "waterDeep": 6,
    "waterMid": 7,
    "grassMarsh": 30,
}


def load_palette():
    text = (SRC / "palette.ts").read_text(encoding="utf-8")
    body = text.split("export const PAL = [", 1)[1].split("] as const", 1)[0]
    return [int(m, 16) for m in re.findall(r"0x([0-9a-fA-F]{6})", body)]


def load_grids():
    text = (SRC / "systems/EnemyProjectiles.ts").read_text(encoding="utf-8")
    body = text.split("const HD_GRIDS: Record<string, string[]> = {", 1)[1]
    # bis zur schließenden "};" auf Spaltenebene
    body = body.split("\n};", 1)[0]
    grids = {}
    for m in re.finditer(r"(\w+):\s*\[(.*?)\]", body, re.S):
        family = m.group(1)
        rows = re.findall(r'"([^"]*)"', m.group(2))
        grids[family] = rows
    return grids


def relative_luminance(rgb):
    def chan(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def rgb_of(hexval):
    return ((hexval >> 16) & 255, (hexval >> 8) & 255, hexval & 255)


def grid_pixels(rows, pal):
    """Liste (x, y, palettenindex) für alle gesetzten Pixel."""
    out = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if "0" <= ch <= "9":
                idx = ord(ch) - 48
            elif "a" <= ch <= "z":
                idx = ord(ch) - 97 + 10
            else:
                continue
            if idx < len(pal):
                out.append((x, y, idx))
    return out


def main():
    pal = load_palette()
    grids = load_grids()
    backgrounds = {name: {"index": idx, "bgColorHex": "0x%06x" % pal[idx], "rgb": rgb_of(pal[idx])} for name, idx in BG_NAMES.items()}

    shots = {}
    masks = {}
    for family, rows in grids.items():
        pix = grid_pixels(rows, pal)
        inner = [(x, y, i) for (x, y, i) in pix if i != 0]  # Kontur = Index 0
        masks[family] = {(x, y) for (x, y, _) in pix}
        colors = sorted({i for (_, _, i) in inner})
        bg = {}
        for name, b in backgrounds.items():
            vals = [contrast(rgb_of(pal[i]), b["rgb"]) for (_, _, i) in inner]
            bg[name] = {
                "minInner": round(min(vals), 2),
                "meanInner": round(sum(vals) / len(vals), 2),
                "max": round(max(vals), 2),
                "bgColorHex": b["bgColorHex"],
            }
        shots[family] = {
            "w": len(rows[0]),
            "h": len(rows),
            "opaquePixels": len(pix),
            "innerPixels": len(inner),
            "colors": colors,
            "bg": bg,
            "minInnerAllBg": round(min(v["minInner"] for v in bg.values()), 2),
        }

    pairs = {}
    keys = sorted(masks)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            inter = len(masks[a] & masks[b])
            union = len(masks[a] | masks[b])
            pairs[f"{a}/{b}"] = round(inter / union, 2) if union else 0.0

    out = {
        "note": (
            "Pixel-Kontrast (WCAG-Verhaeltnis) der 4 Gegner-Schuss-Optiken; ein Lauf, feste "
            "Hintergruende (nightDeep=1, night=2, waterDeep=6, waterMid=7, grassMarsh=30). "
            "minInner/meanInner/max ueber alle opaken Nicht-Kontur-Pixel (Kontur = Index 0). "
            "shapeIoU = Ueberlappung der Silhouettenmasken (Kontur ausgeschlossen). "
            "Reproduzierbar mit scripts/art/contrast-enemy-shots.py."
        ),
        "geneatedBy": "scripts/art/contrast-enemy-shots.py",
        "backgrounds": BG_NAMES,
        "shots": shots,
        "shapeIoU": pairs,
    }
    dest = ROOT / "shots/m10-enemy-shots-contrast.json"
    dest.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"geschrieben: {dest}")
    for fam, s in shots.items():
        print(f"{fam:7s} minInnerAllBg {s['minInnerAllBg']:.2f}  mean(waterMid) {s['bg']['waterMid']['meanInner']:.2f}")
    print("shapeIoU", pairs)


if __name__ == "__main__":
    main()
