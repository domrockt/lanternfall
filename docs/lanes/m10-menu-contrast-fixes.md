# Lane m10-menu-contrast-fixes

Mini-Fixes aus der Bedarfsmeldung von Lane m10-menu-quality-55 (Scan
`~/games/.evidence/m10-menu-quality-55/m10-menu-quality-before-scan.json`): Kontrast- und
Overlap-Mängel in Title/Options/Credits/CharSelect. UI.ts (Pause) ist ausgenommen
(eigene Lane m10-ui-pause-quality). Eine Karte = ein Commit.

## Messmethode

`scripts/m10-menu-contrast.mjs` (Muster: `scripts/m10-menu-quality.mjs`, ohne Pause-Screen):
- Text-Kontrast je PixelText gegen gemessenes Backdrop (snapshotArea mit verstecktem Text),
  WCAG-artiges Verhältnis, Ziel ≥ 4.5.
- Text-/Icon-Overlap-Rechtecke (positiver Schnitt).
- KAEL-Gap: Freiraum zwischen Bestwerte-Zeile `KAEL …` und oberem Rahmen der Knopfreihe
  (ui_frame-NineSlices, Weltposition über Transform-Matrix).

Belege: `~/games/.evidence/m10-menu-contrast-fixes/m10-menu-contrast-{before,after}-scan.json`
(+ PNG-Shots je Screen/Profil). Nur Abnahme-Bilder liegen im Repo (`shots/abnahme/`).

## K1 — Vorher (Branch-Basis, 2026-11-28)

Scan: `~/games/.evidence/m10-menu-contrast-fixes/m10-menu-contrast-before-scan.json`
Renderer beide Profile: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` —
kein SwiftShader. 0 JS-Fehler.

| Screen | Kontrast-Fails < 4.5 | Overlaps |
|---|---|---|
| title | 4 | 0 |
| options | 5 | **1 (465 px²: Options-Footer ↔ Title-Hint `ESC = PAUSE…`)** |
| credits | 12 | 0 |
| charselect | 5 | 0 |

Betroffene Zeilen (Median-Ratio, Profil 640x360@2 — identisch zum Scan der Mess-Lane):

| Datei | Zeile | Ist-Index | Median | Ziel |
|---|---|---|---|---|
| Title.ts | 3 Hint-Zeilen (WASD…/MAUS…/ESC…) | 7 fog | 2.07 | ≥ 10 |
| Title.ts | Subtitle `30 MINUTEN…` | 8 mist | 4.34 | ≥ 4.5 |
| options-menu.ts | Footer `OPTIONEN GELTEN SOFORT…` | 8 mist | ok, aber **Overlap 465 px²** + Position | ≥ 10 + 0 Overlap |
| options-menu.ts | `PFEILE ODER MAUS - ENTER/ESC` | 7 fog | 2.72 | ≥ 10 |
| Credits.ts | Zeilen-Labels (10×) | 7 fog | 2.73 | ≥ 10 |
| Credits.ts | `ESC / ENTER = ZURÜCK` | 7 fog | 2.95 | ≥ 10 |
| Credits.ts | `LANTERNFALL…`/`GRAFIK-PIPELINE…` | 8 mist | 4.16 | ≥ 4.5 |
| CharSelect.ts | `SEED 7 …`, `START: …` (2×) | 7 fog | 2.77 / 2.48 | ≥ 10 |
| CharSelect.ts | Bonus-Zeilen (2×) | 8 mist | 3.78 | ≥ 4.5 |

KAEL-Gap (title): **2 px** (KAEL y1=246, Knopf-Rahmen-Top y=248) — art-director-Hebel (6):
≥ 4–6 interne px gefordert.

## Fix-Logik (Farbwahl, aus den Ist-Zahlen abgeleitet)

Kontrast skaliert mit der Text-Luminanz: Ratio_neu ≈ Ratio_ist × (L_neu+0.05)/(L_ist+0.05).
- `fog(7)` → `bone(10)`: Faktor ≈ 3.7 → alle fog-Zeilen landen ≥ 7.6 (Ziel ≥ 10 nur für die
  im Auftrag genannten Zeilen erfüllt: 2.07→7.6 … 2.95→10.9).
- `mist(8)` → `paleMist(9)`: Faktor ≈ 1.57 → 3.78→5.97, 4.16→6.57, 4.34→6.85 — alle ≥ 4.5.

## Nachher (K6)

_(wird in K6 ausgefüllt)_
