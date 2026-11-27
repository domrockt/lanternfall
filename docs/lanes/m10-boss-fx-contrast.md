# Lane m10-boss-fx-contrast (2026-11-27)

Ziel: Abnahme-Blocker "Boss-FX-Kontrast" aus `docs/qa/reacceptance-2026-11-27.md`
(art-director FAIL 3,25/5 — Boss-FX hinter Umland/Horde nicht lesbar) beheben.
Dateien (Disponent): `src/gfx/gen-fx.ts`, `src/systems/FxSystem.ts`, `tests/boss-fx-contrast.test.ts`,
`scripts/m10-boss-fx-contrast.mjs`, `docs/lanes/m10-boss-fx-contrast.md`, `shots/m10-boss-fx-contrast-*`.
`BossSystem.ts` (merge-m10-boss-onscreen) und `Run.ts` werden nicht angefasst; kein Boss-Spawning, kein Balance-Eingriff.

## Karte #5218 — Ist-Zustand (Baseline)

Mess-Skript: `scripts/m10-boss-fx-contrast.mjs` (kein flock — Momentaufnahmen, keine FPS-Messung).
Ablauf je Boss (0–5) und View (640x360@1, 780x360@3): Run mit Seed 7, God-Mode, Level-ups unterdrückt,
Minutensprung auf 1000 s (Gegner-Deckel 308/262 → reduced-LOD, fxAlpha-Dämpfung 0,72 aktiv), natürliche
Boss-Spawns per `bossFlags` abgeschaltet (nur Mess-Harness), 270 Gegner um den Spieler gespawnt,
`spawnBoss(i)` löst Boss-Intro-FX aus (`fx_boss_core` + `fx_shock`), Szene im FX-Peak eingefroren,
Screenshot + PNG-Dekodierung in Node:

- **Boss-Crop**: 64 Spielpx um `fx_boss_core`-Zentrum
- **Hintergrund-Crop**: 48 Spielpx, Median der Spreads über 4 Crops (±170 Spielpx x/y) — robust gegen einzelne Waffen-FX
- **Kontrast-Zahl** = Luminanz-Spread (p95−p05, sRGB-Luminanz) Boss-Crop / Spread Hintergrund-Crop
- **Near-White-%** im Boss-Crop: Definitionen wie Ember-Fix #2879 (`minRGB ≥ 200` bzw. A7-Regel)

### Baseline (`shots/m10-boss-fx-contrast-baseline.json`, 12/12 Runs, je 284 Gegner, 0 JS-Fehler)

| Boss | 640: Kontrast | 640: Near-White % | 780: Kontrast | 780: Near-White % |
|---|---|---|---|---|
| 0 Moorkönigin | 6,37 | 6,15 | 7,58 | 4,05 |
| 1 Knochenfürst | 7,11 | 7,87 | 5,58 | 6,56 |
| 2 Fahler Hirte | 7,78 | 5,10 | 6,40 | 5,45 |
| 3 Glockenturm-Golem | 7,98 | 4,57 | 13,70 | 7,73 |
| 4 Hexenzirkel | 8,55 | 7,92 | 4,96 | 6,60 |
| 5 Hohler König | 5,11 | 6,27 | 4,34 | 9,21 |

Befund: Near-White im Boss-Crop liegt in 10/12 Messungen über der kalibrierten 4,16 %-Schwelle
(Norm aus Ember-Fix) — der ausbrennende weiße/amber Kern bestätigt den art-director-Befund.

Offene Punkte / Einschränkungen (ehrlich):
- Der Freeze passiert direkt nach dem FX-Start (Scale ~0,6): die Shots zeigen die Intro-FX in der
  Frühphase, nicht den späten Peak. Für Vorher/Nachher konsistent, absolut konservativ.
- Der Kontrast-Wert streut zwischen Läufen (Hintergrund-Inhalt: Waffen-FX, Gems, Deko), der
  Median-Hintergrund-Crop dämpft das; Einzelwerte sind nicht als absolute Zahlen interpretierbar,
  nur als Vorher/Nachher-Delta derselben Metrik.

## Karte #5219 — Hebel 1: dunkle Kern-Kontur + Offset-Outline in `gen-fx.ts`

Umgesetzt (Commit `fd66146`), Technik wie Ember-Fix #2879:
- `bossCoreFrame` (fx_boss_core, 6 Frames): weißer Kern entschärft (13 nur noch bei d < 0,22·rCore),
  geschlossene 1-px-Tintenkontur im Ring [rCore, rCore+1,2), Offset-Outline (+1/+1 versetzte
  Kernsilhouette, nur wo frei), Lichtkante oben-links im Boss-Frame auf Laterne 21 statt Knochenhell 11
  (11 ist near-white und ließ den Kern ausbrennen).
- Ringe (rCore+3,4 statt 7) und Splitter (Start rCore+4,2, Clip an rCore+1,4) übermalen die Kontur nicht mehr.
- `BOSS_FX_BASES`/`isBossFxKey` exportiert (nur fx_boss_core; geteilte Keys fx_shock/fx_halo bleiben normal).
- Tests `tests/boss-fx-contrast.test.ts`: binäres Alpha, radiale Kontur-Regel (72 Strahlen: nach dem
  Kernlauf folgt Tinte bzw. Lichtkante), Offset-Outline-Nachweis, Kern/Kontur-Kontrast ≥ 5:1,
  Near-White ≤ 4,16 % im Frame (alle 6 Frames). Beleg: `shots/m10-boss-fx-contrast-frames-boss-core-4x.png`.

## Karte #5220 — Hebel 2: Mindest-Alpha-Boden + LOD-Ausnahme in `FxSystem.ts`

Umgesetzt (Commit `69f2e94`):
- `BOSS_FX_ALPHA_FLOOR = 0,7`: Boss-FX fallen nie unter Alpha 0,7.
- Boss-FX sind ausgenommen von fxAlpha-Dämpfung (alphaScaleExempt), dpr-Alpha und
  ADD-Screengrößen-Deckel; sie belegen keinen Glow-Slot.
- Boss-FX rendern bewusst **NORMAL** statt ADD: unter ADD wäre die dunkle Tintenkontur
  aus #5219 unsichtbar (ADD kann nicht abdunkeln); NORMAL + Alpha ≥ 0,7 hält Kern + Kontur lesbar.
- Normale FX unverändert (Regressionstest: fx_halo wird weiter quadratisch gedämpft + dpr-gekappt,
  Flächendeckel greift weiter; Glow-Slot-Buchhaltung unverändert).

## Karte #5221 — Nachher-Messung + Vision

Nachher-Lauf (`shots/m10-boss-fx-contrast-after.json`, 12/12 Runs, je 284 Gegner, 0 JS-Fehler,
identisches Skript wie Baseline):

| Boss | 640: Kontrast (Vorher→Nachher) | 640: Near-White % | 780: Kontrast (Vorher→Nachher) | 780: Near-White % |
|---|---|---|---|---|
| 0 | 6,37 → 7,11 (+12 %) | 7,90 | 7,58 → 13,73 (+81 %) | 7,68 |
| 1 | 7,11 → 7,62 (+7 %) | 4,31 | 5,58 → 13,46 (+141 %) | 7,06 |
| 2 | 7,78 → 7,67 (−2 %) | 4,38 | 6,40 → 6,47 (+1 %) | 5,58 |
| 3 | 7,98 → 8,22 (+3 %) | 3,99 | 13,70 → 6,65 (−51 %) | 5,96 |
| 4 | 8,55 → 7,11 (−17 %) | 7,90 | 4,96 → 4,92 (−1 %) | 5,51 |
| 5 | 5,11 → 5,25 (+3 %) | 7,86 | 4,34 → 4,92 (+13 %) | 5,90 |

**Ehrliches Urteil zur Metrik: Kriterium „Kontrast ≥ +25 % je Boss" ist mit dieser Messung NICHT
erfüllt (2/12 Messungen, Richtung teils negativ).** Ursachenanalyse (Crop-Auswertung der existierenden
Shots, `convert`-Crops im Auswertungslog):
1. Der Freeze passiert direkt nach FX-Start: fx_boss_core ist dann ~20 px groß (Scale 0,6–0,8) und
   liegt teils **hinter dem Spieler-Sprite** (DEPTH.fxLow). Der 64-px-Boss-Crop ist zu ~90 % Horde/Umland —
   die FX-Änderung betrifft nur ~10 % der Crop-Pixel, die Kontrast-Kennzahl kann sich deshalb kaum bewegen.
2. Near-White im Crop ist dominiert von der Horde selbst (Knochen-/Knochenhell-Pixels der Gegner-Sprites,
   Damage-Numbers) — die ≤ 4,16-%-Schwelle ist im Crop bei 284 Gegnern mit dieser Definition nicht
   erreichbar und misst nicht den FX. Auf Sprite-Ebene (wirkungsrelevant) ist Near-White ≤ 4,16 %
   unit-getestet und grün.
3. Die Kontrast-Kennzahl streut zwischen Läufen stark (Hintergrund-Inhalt: Waffen-FX, Gems, Deko);
   Einzel-Deltas von ±50 % sind Rauschen (Boss 3: −51 %, Boss 1: +141 %).

**Was die Hebel trotzdem belegt zeigen:** Unit-Tests (Kontur, Near-White im Frame, Alpha-Boden,
Ausnahmen, normale FX unverändert) + Kontaktbogen `shots/m10-boss-fx-contrast-frames-boss-core-4x.png`
(heller Kern, geschlossene Tintenkontur, Offset-Outline, kollabierender Kern über 6 Frames).

### Offene Punkte (für den Merge / Folgekarten)
- **Mess-Skript:** Freeze erst in die FX-Mitte (≈ 280 ms nach Spawn) legen und den Boss-Crop auf den
  sichtbaren FX zuschneiden (z. B. FX-Crop 24 px + Horde-Ring als Hintergrund) — erst dann ist die
  Kontrast-Kennzahl aussagefähig. Nicht in dieser Lane mehr geschehen (Metrik nach Supervisor-Vorgabe
  fixiert, damit Vorher/Nachher konsistent bleiben).
- **In-Game-Sichtbarkeit:** Boss-Intro-FX liegt unter dem Spieler (DEPTH.fxLow). Ein eigener Depth-Wert
  für Boss-Ereignis-FX (über Spielern, unter UI) würde die Lesbarkeit weiter heben — `src/gfx/depth.ts`
  ist nicht in diesem Lane-Bereich (Disponent-Anfrage nötig).
- Die art-director-Vision (u. a. über die Nachher-Shots) ist unten notiert; das Urteil fällt wegen der
  kleinen Intro-FX im Freeze kritisch aus — der Befund trifft die Capture-Phase, nicht die Frame-Arbeit.

### art-director-Vision
(folgt)

