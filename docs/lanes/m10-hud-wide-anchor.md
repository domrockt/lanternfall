# Lane m10-hud-wide-anchor — HUD-Anker bei breiten Formaten (Vorrat)

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-hud-wide-anchor`, Branch `m10-hud-wide-anchor`.

## Ziel

Bei 780x360@3, 1280x720 und 1920x1080 duerfen HUD-Bloecke (Herzen/XP, Waffen-Icons,
Level-Up-/Evolution-Banner, Truhen-Hinweis) nicht aus dem Safe-Area-Rand rutschen oder
untereinander kollidieren. Referenzpfad 640x360 (1920x1080@1) darf sich NICHT veraendern
(AE = 0).

## Formate (M8-Display-Tabelle)

| Format | Geraet | n | logische View |
|---|---|---|---|
| `640x360-ref` | 1920x1080 @1 | 3 | 640x360 (Referenz) |
| `780x360@3` | 2340x1080 @3 | 3 | 780x360 |
| `1280x720` | 1280x720 @1 | 2 | 640x360 |
| `1920x1080` | 1920x1080 @1 | 3 | 640x360 |

## Safe-Area-Rand (HUD-Konvention aus der 640x360-Referenz)

Alle 4 Formate sind Desktop-/Tablet-Profile ohne Geraete-Insets (Notch-Profil iphone14 ist
eigenes Thema, siehe `m10-display-qa.md`). Der Rand ist die bestehende HUD-Konvention der
640x360-Referenz, einheitlich in Spielpixeln:

- links/rechts **5 px** (Anker `x=5` bzw. `GAME_WIDTH-5`),
- oben **1 px** (Text-Anker `y=1`, HUD-Leiste als Full-Bleed-Deko darueber),
- unten **7 px** (Fußzeilen enden bei `H-7`).

Geprueft werden die Inhalte-Bloecke, nicht Full-Bleed-Hintergrundbalken.

## Messskript

`scripts/m10-hud-anchor.mjs` (kein flock — reine Geometrie-/Anzeige-Messung, kein FPS-Gate):

```
node scripts/m10-hud-anchor.mjs --tag baseline   # Ist-Zustand
node scripts/m10-hud-anchor.mjs --tag after      # nach dem Fix
```

Misst pro Format und Zustand (`hud`, `banner`, `levelup`, `chest`) die echten gerenderten
Bounding-Boxen benannter GameObjects (SetName-Instrumentierung in `UI.ts`, aendert kein Layout),
zaehlt Rand-/Kollisions-/View-Verletzungen und schreibt
`shots/m10-hud-anchor-<format>-<zustand>-<tag>.png` + `shots/m10-hud-anchor-<tag>.json`.

## Ergebnisse

### K2 — Ist-Baseline (`--tag baseline`, 2026-11-27)

Belege: `shots/m10-hud-anchor-baseline.json`, `shots/m10-hud-anchor-baseline-<format>-<zustand>.png`
(4 Formate x hud/banner/levelup/chest).

| Format | View | Verletzungen | Befund |
|---|---|---|---|
| 640x360-ref | 640x360 (n=3) | 16 | icons-bg x=0 (Rand) + 3 Kollisionen mit HP-Zeile |
| 780x360@3 | 780x360 (n=3) | 16 | identisch |
| 1280x720 | 640x360 (n=2) | 16 | identisch |
| 1920x1080 | 640x360 (n=3) | 16 | identisch |

- **64 Verletzungen gesamt, alle eine Ursache:** `hud-icons-bg` (Waffen-Icon-Hintergrund)
  liegt fix bei `x=0, Breite 8+n*18` statt am Icon-Cluster verankert → Rand-Verletzung
  links (x=0 < 5) und Kollision mit HP-Zeile (`hud-hp-bg/-label/-fill`), sichtbar im
  Shot `baseline-780x360@3-hud.png` (dunkler Streifen unter der HP-Leiste).
- **AE gegen 640x360-Referenz = 0** (1280x720 und 1920x1080 liefern identische Boxen).
- Alle gemessenen Boxen ganzzahlig (Pixelgenauigkeit ok), 0 JS-Fehler.
- Level-Up-Dialog, Banner und Truhen-Hinweis: keine Rand-/Kollisions-/View-Verletzungen.

## Offene Punkte

(tbd)
