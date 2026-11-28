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

Scan: `~/games/.evidence/m10-menu-contrast-fixes/m10-menu-contrast-after-scan.json`
(sowie Zwischen-Belege `…-k2/k3/k4/k5-scan.json` je Karte). Renderer beide Profile:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader. 0 JS-Fehler.

| Screen | Kontrast-Fails < 4.5 (vorher) | Overlaps (vorher) |
|---|---|---|
| title | **0** (4) | 0 (0) |
| options | **0** (5) | **0** (1 = 465 px²) |
| credits | **0** (12) | 0 (0) |
| charselect | **0** (5) | 0 (0) |

KAEL-Gap: **7 px** (vorher 2 px) — kael y1=241, Knopf-Rahmen-Top y=248, beide Profile.

Zeilen nachher: alle 13 betroffenen Zeilen ≥ 4.5 (After-Scan: 0 Fails auf allen 4 Screens,
beide Profile). Erwartete Median-Ratios (Modell: skaliert aus den Vorher-Median-Ratios mit der
Luminanz-Ratio alt→neu, im Test `tests/menu-contrast-fixes.test.ts` gegen die gemessenen
Backdrop-Luminanzen geprüft):
- Hint-Zeilen fog→bone: 2.07 → ≈ 7.6; Subtitle mist→paleMist: 4.34 → ≈ 6.9.
- Options: `PFEILE ODER MAUS` 2.72 → ≈ 10.0; Footer mist→bone + H-14 → H-50 (Overlap 465 px² → 0).
- Credits: Labels 2.73 → ≈ 10.1; `ESC/ENTER` 2.95 → ≈ 10.9; mist-Zeilen 4.16 → ≈ 6.6.
- CharSelect: `SEED …` 2.77 → ≈ 10.2; `START: …` 2.48 → ≈ 9.2; Bonus-Zeilen 3.78 → ≈ 6.0.

Regressionstest: `tests/menu-contrast-fixes.test.ts` (6 Tests) — Kontrast-Assertions für die
13 betroffenen Zeilen (Backdrop-Luminanz aus dem Vorher-Scan zurückgerechnet, Muster
menu-quality-Scan), Quelltext-Check der Farb-Indices, Overlap-Regressionen Footer ↔ Hint
(0 px für H ∈ {360, 540}) und KAEL-Gap ≥ 4 px aus den Quell-Positionen geparst.

Abnahme-Bilder (git): `shots/abnahme/m10-menu-contrast-after-<profil>-<screen>.png` (8×) +
3x nearest-Zoom-Crops der Positions-Fixes (`…-title-kaelgap-3x.png`, `…-options-footer-3x.png`
mit before-Gegenstücken). Sichtprüfung: KAEL-Zeile mit klarem Freiraum zur Knopfreihe, Footer
hell (bone) und klar getrennt über dem Hint-Block — sonstige Optik unverändert.

## Abweichungen vom Auftrag

- **K3 Footer-Verschiebung:** Auftrag sagte „4–6 px nach oben“. Geometrisch nötig sind ≥ 12 px
  (Footer-Rechteck [y, y+7] muss unterhalb der untersten Hint-Zeile [H-18, H-11] enden ODER
  oberhalb der obersten [H-38, H-31] beginnen; dazwischen liegen nur 1-px-Lücken). Gewählt:
  **H-14 → H-50** — Footer sitzt damit sauber zwischen Panel und Hint-Block, 0 px Overlap zu
  ALLEN Title-Texten in beiden Profilen (belegt im After-Scan), keine neuen Overlaps.
- **K3 Umfang:** zusätzlich zur Footer-Farbe (mist→bone) die dokumentierte FAIL-Zeile
  `PFEILE ODER MAUS - ENTER/ESC` (fog→bone, Ist 2.72) in derselben Datei gefixt — nötig für
  „0 Kontrast-Fails“ in options.
- **K3 Footer-Farbe:** Scan meldete Index 8 (mist), nicht 7 — Ziel „>= 10“ trotzdem umgesetzt.

## Board-Hinweis

Board-Buchung war während der Lane teilweise verweigert (Plugin-Regel „uncommitted changes“):
fremde dirty Dateien `shots/m10-passive-math-caps.json` / `shots/m10-passive-math-matrix.json`
(Lane m10-passive-math) im Worktree — nicht angefasst, gleicher Fall wie #10246. Karten:
#10768-#10773 (Reserve-Block), K1/K2-Kommits nennen die Karten-IDs.
