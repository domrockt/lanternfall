# Lane m10-icon-contrast — Icon-Körperkontrast (F2/F3-Folge aus m10-menu-art-crisp)

**Briefing:** 4 Passive-Icons mit Körperkontrast < 3:1 gegen HUD-Hintergrund (#090c10) bzw.
Build-Panel (#101724); Empfehlung der Vor-Lane: Icon-Körper in Zielgröße zeichnen (`gen-ui.ts`)
oder Scale auf 2 — hier umsetzen. Abnahme: alle 12 Icons Kontrast ≥ 3:1 auf beiden Hintergründen
(JSON belegt), art-director ≥ 4/5, Tests + `npx tsc --noEmit` grün, AE=0 für nicht betroffene Icons.

## Zentrale Feststellung (Karte #7098, Commit ef1b606)

**Der Befund ist im Lane-Branch bereits behoben.** Die Vor-Lane m10-menu-art-crisp hat den
F3-Fix (boots/tome/heart/charm) in `src/gfx/gen-icons.ts` umgesetzt (Commit `00c500e`, Karte #6421)
und dieser ist mit dem Merge `942af93` in `main` und damit in diesem Worktree enthalten.
`scripts/m10-icon-contrast.mjs` misst deshalb **0 Fails**: alle 12 Icons (6 Waffen + 6 Passive)
liegen ≥ 3:1 auf beiden Hintergründen.

## Methode (`scripts/m10-icon-contrast.mjs`)

- WCAG-Kontrast des Icon-Körpers: Median-Luminanz aller opaken Pixel **ohne** die 1-px-ink-Kontur
  (Palettenindex 0), Grenzwert **3:1** — identische Methode zur Vor-Lane.
- Offline auf den `GEN_ICONS`-Rastern (`src/gfx/gen-icons.ts`) gegen `src/palette.ts`: die Texturen
  werden mit binärem Alpha und Nearest-Neighbor ganzzahlig gezeichnet (`src/gfx/icons.ts`,
  `setScale` ganzzahlig/2.4 im Panel), Körperkontrast ist daher skalierungs- und
  renderings-unabhängig exakt.
- Hintergründe: HUD `#090c10` und Build-Panel `#101724` (night) — Werte aus dem Vor-Lane-Befund.
- Zoom-Sheet 8x nearest (beide Hintergründe) über eingebauten PNG-Encoder (zlib), keine
  Temp-Abhängigkeiten.

## Messwerte (Ist-Stand, `shots/m10-icon-contrast-before.json`)

| Icon | HUD #090c10 | Panel #101724 | dunkelste Körperfarbe | Grenzwert 3:1 |
|---|---|---|---|---|
| passive_boots | 4.53 | 4.15 | #6b7c86 (fogBlue) | PASS |
| passive_tome | 10.93 | 10.01 | #a84a21 (emberOrange) | PASS |
| passive_heart | 5.38 | 4.93 | #b8303f (crimson) | PASS |
| passive_charm | 4.53 | 4.15 | #a84a21 (emberOrange) | PASS |
| passive_whetstone | 7.23 | 6.62 | #0a0e16 (nightDeep) | PASS |
| passive_hourglass | 11.40 | 10.44 | #7a331a (emberBrown) | PASS |
| weapon_ember | 3.42 | 3.13 | #2b1410 (emberShadow) | PASS |
| weapon_flail | 4.53 | 4.15 | #0a0e16 (nightDeep) | PASS |
| weapon_frost | 4.53 | 4.15 | #101724 (night) | PASS |
| weapon_lantern | 11.40 | 10.44 | #101724 (night) | PASS |
| weapon_storm | 10.93 | 10.01 | #a84a21 (emberOrange) | PASS |
| weapon_thorn | 6.07 | 5.56 | #16261e (mossNight) | PASS |

Die Werte decken sich mit der Nachher-Tabelle der Vor-Lane (`docs/lanes/m10-menu-art-crisp.md`,
Abweichungen ≤ 0.06 durch Median-Interpolation bei gerader Pixelzahl). Off-Palette: 0,
soft-Alpha: 0 (Raster per Konstruktion binär, '.' = transparent).

## Karte #7099 — kein Neuzeichnen nötig (dokumentierter No-Op)

- Die 4 vormals betroffenen Icons wurden von der Vor-Lane in `gen-icons.ts` neu gezeichnet
  (Silhouetten pixelidentisch, nur hellere Palettenfarben) — genau die hier vorgesehene Änderung.
- `src/gfx/gen-icons.ts` ist **fremd-geclaimt** (Briefing: nicht anfassen); `src/gfx/gen-ui.ts`
  (Lane-Claim) enthält nur `title_logo` + `ui_frame`, keine Icons. Ein Zweit-Iconset in `gen-ui.ts`
  anzulegen, würde die Texturen doppeln und die `#6421`-Lösung umgehen — nicht sinnvoll.
- **AE=0 für nicht betroffene Icons:** Diese Lane ändert **keine** Icon-Raster — Diff der
  betroffenen Dateien gegen den Merge-Stand ist leer:
  `git diff --stat 942af93 HEAD -- src/gfx/gen-icons.ts src/gfx/gen-ui.ts` → 0 Dateien geändert
  (Beleg im Karten-Commit). Damit ist AE=0 für alle 8 nicht (ehemals) betroffenen Icons exakt.
- Die Empfehlung „Scale auf 2 / Zielgröße“ der Vor-Lane betraf ursprünglich **F2 (`chest_closed`,
  Scale 2.4, Mixel)**, nicht die Icon-Kontraste. Der Truhen-Fix liegt in `src/scenes/UI.ts`
  (Lane-tabu, nach wie vor Truhen-Reveal-Nachlauf) und bleibt dokumentierte Altlast für eine
  Folge-Lane mit UI-Claim.

## Belege

- `shots/m10-icon-contrast-before.json` — Rohdaten (Methode, Hintergründe, 12 Icons, Summary).
- `shots/m10-icon-contrast-before-zoom.png` — boots/tome/heart/charm 8x nearest auf beiden
  Hintergründen (oben HUD #090c10, unten Panel #101724).

## Verbleibende offene Punkte (nicht Lane-Scope)

- F2 `chest_closed` 2.4x-Mixel: Hebel `src/scenes/UI.ts` (tabu) — Folge-Lane mit UI-Claim.
- F1 `title_background` 1.333x/1.625x: Hebel `src/scenes/Title.ts` — läuft separat.
