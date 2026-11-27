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
- Limitierung: die Truhen-Hinweis-Zeilen fehlen im Baseline-JSON (Fake-ChestReward ohne
  `evolution`-Feld); im After-Lauf gemessen (x=177, y=153, w=287 bei 640, zentriert im Rahmen).

### K3 — Fix (Commit 41e616b)

Anker in `src/scenes/UI.ts` ueber Konstanten (Ankerpunkt + Margin statt fixer Koordinaten):
`HUD_MARGIN_X=5`, `HUD_HP_X/HUD_HP_W`, `HUD_ICONS_X=122` (= HP-Ende 111 + 11 px),
`HUD_ICON_PITCH=17`, `HUD_EVO_HINT_X=330` (= Ende der vollen Icon-Reihe 317 + 13 px).
Reine Geometrie `hudAnchorBoxes()` wird von `tests/hud-anchor.test.ts` gegen den
Safe-Area-Rand aller 4 Formate geprueft (7 Tests, inkl. Golden Values aus der Baseline).

**Einzige Pixel-Aenderung bei 640x360 (beabsichtigter Basis-Fix):** `hud-icons-bg`
`{x:0,w:224}` → `{x:114,w:212}`. Alle uebrigen Anker-Boxen vor/nachher identisch
(Vergleich baseline-vs-after JSON, 640x360-ref: nur icons-bg aenderungen in
hud/levelup/chest-Zustand).

### K4 — Nachher (`--tag after`, 2026-11-27)

Belege: `shots/m10-hud-anchor-after.json`, `shots/m10-hud-anchor-after-<format>-<zustand>.png`.

| Format | View | Verletzungen | AE vs 640x360-Referenz |
|---|---|---|---|
| 640x360-ref | 640x360 | **0** | Referenz |
| 780x360@3 | 780x360 | **0** | n/a (andere Breite) |
| 1280x720 | 640x360 | **0** | **0** |
| 1920x1080 | 640x360 | **0** | **0** |

- RESULT PASS: violations=0, ae=0, errors=0 (alle 4 Formate, je hud/banner/levelup/chest).
- Pixelgenauigkeit: alle gemessenen Boxen ganzzahlige Spielpixel (subpixel-Check im
  Skript; Balkenfuellungen mit XP/HP-Ratio ausgenommen, kontinuierlich by design).
- Vision-Pruefung (2x nearest vergrößert, `~/tmp/m10-hud-wide-anchor/`):
  - `after-780x360@3-hud`: Icon-Hintergrund beginnt erst hinter der HP-Leiste (Fix sichtbar),
    Evo-Hinweis lesbar, keine Kollision.
  - `after-640x360-ref-banner`: Banner zentriert unter dem HUD-Streifen, kein Ueberlapp.
  - `after-1920x1080-levelup`: 3 Karten im Rahmen, Evo-Zeile, Fusszeile, nichts abgeschnitten.
  - `after-1280x720-chest`: Hinweis-Satz „AUS GLUTFUNKE + ARKANES BUCH WIRD PHÖNIXSCHWARM.“
    im Rahmen, 5 Slots, keine ueberlagerten Fusszeilen mehr.
- Reviewer-Review der Karten #5258–#5260: **PASS** (Diff-Pruefung UI.ts: nur Anker +
  Instrumentierung; Test echte Spec; font.ts/Palette unberuehrt).

## Offene Punkte

- Text-Typo im Waffen-Data (nicht diese Lane): Kettenflegel-Beschreibung „STARKER
  ROCKSTOB“ (vermutlich „RÜCKSTOSS“) — sichtbar im Level-up-Shot bei 780x360.
- Die Truhen-Hinweis-Messung fehlt im Baseline-JSON (siehe K2-Limitierung); der
  Anker ist im After-Lauf belegt und war vom Fix nicht betroffen (zentriert im Rahmen).
