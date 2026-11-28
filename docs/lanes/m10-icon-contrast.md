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

- `shots/m10-icon-contrast-before.json` — Rohdaten Ist-Stand (Methode, Hintergründe, 12 Icons, Summary).
- `shots/m10-icon-contrast-after.json` — Rohdaten Lane-Ende (identisch zu before: 0 Fails).
- `shots/m10-icon-contrast-before-zoom.png` / `-after-zoom.png` — boots/tome/heart/charm 8x nearest
  auf beiden Hintergründen (oben HUD #090c10, unten Panel #101724).
- `tests/icon-contrast.test.ts` — 19 Regressionstests (Kontrast ≥ 3:1, Off-Palette, binäres Alpha).

## Abnahme-Status

| Kriterium | Status |
|---|---|
| alle 12 Icons Kontrast ≥ 3:1 auf beiden Hintergründen (JSON belegt) | ✅ erfüllt (before == after, 0 Fails) |
| Tests + `npx tsc --noEmit` grün | ✅ erfüllt (19 neue Tests, Suite 991/991, rc=0) |
| AE=0 für nicht betroffene Icons (Pixel-Diff) | ✅ erfüllt (leerer Diff gegen 942af93) |
| art-director ≥ 4/5 für die 4 neu gezeichneten Icons | ❌ **nicht erfüllt** (3,5 — Design-Debt aus Vor-Lane-Redraw, Backlog-Karte angelegt; Hebel fremd-geclaimt) |

## Nachher-Stand (Karte #7101)

- **Messung unverändert 0 Fails:** `shots/m10-icon-contrast-after.json` — identische Werte
  wie Vorher (Vorher == Nachher, programmatisch geglichen: Icon-Arrays byteidentisch), da
  diese Lane keine Icon-Raster ändert (Karte #7099, No-Op — Fix kam mit Merge `942af93`).
- `shots/m10-icon-contrast-after-zoom.png` — boots/tome/heart/charm 8x nearest auf beiden
  Hintergründen (Standlergebnis nach Lane-Ende).
- **Regressionsschutz:** `tests/icon-contrast.test.ts` (Karte #7100) — 19 Tests: Kontrast ≥ 3:1
  für alle 12 Icons auf beiden Hintergründen, F3-Icons einzeln verankert, 0 Off-Palette,
  binäres Alpha. `npx tsc --noEmit` rc=0, Gesamt-Suite 991/991 grün, `npm run build` grün.
- **art-director-Sichtprüfung** der 4 F3-Icons (Maßstab kommerziell auslieferbar, ≥ 4/5):
  Ergebnis siehe unten.

### art-director-Urteil

**FAIL — Gesamtnote 3,5/5** (tome 4,5 / boots 3,5 / heart 3 / charm 3; Maßstab kommerziell
auslieferbar). **Kontrast-Punkte uneingeschränkt bestätigt:** alle 4 Körper heben sich visuell auf
beiden Hintergründen ab (nicht nur Akzentpixel), 1-px-ink-Kontur, 0 Off-Palette, 0 soft-Alpha,
Licht durchgehend oben-links. Die FAIL-Gründe sind **Icon-Design der Vor-Lane**, nicht Kontrast:

- `passive_heart` (3): gezackte Silhouettenkante (Zeilen-Alternation x=1/2 bzw. x=13/14,
  Raster Z.173–179), Einzel-Pixel-Rauschen im Glanzfleck, 2-px-`h`-Band wirkt wie Riss.
- `passive_charm` (3): liest sich als Hufeisenmagnet/Goldbarren statt Amulett (keine Kette),
  teilt Grau+Orange-Farbwelt mit boots → Distinktheits-Risiko im HUD.
- `passive_boots` (3,5): Block auf dem Fußrücken liest sich als Treppe; Silhouette sehr blockig.
- `passive_tome` (4,5): auslieferungsreif.

**Disposition:** Der Hebel `src/gfx/gen-icons.ts` ist in dieser Lane **fremd-geclaimt/tabu**
(Briefing), und Icon-Redesign überschreitet den Kontrast-Scope. Die Muss-Liste (glatte Herz-Kontur,
Schatten als 1-px-Rand, charm mit Kette + Farbtrennung von boots, boots Stufenblock abflachen)
ist als Backlog-Karte für die Icon-Owner-Lane angelegt. Die Abnahme der Vor-Lane (art-director
PASS 5/5/5/4/4 mit Kontrast-Fokus) bleibt davon unberührt — dieses strengere Urteil ist der
Grund, warum die Lane-Abnahme „art-director ≥ 4/5“ hier NICHT als erfüllt gemeldet wird.

## Verbleibende offene Punkte (nicht Lane-Scope)

- F2 `chest_closed` 2.4x-Mixel: Hebel `src/scenes/UI.ts` (tabu) — Folge-Lane mit UI-Claim.
- F1 `title_background` 1.333x/1.625x: Hebel `src/scenes/Title.ts` — läuft separat.
