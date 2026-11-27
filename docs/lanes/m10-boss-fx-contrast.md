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

(folgt)

## Karte #5220 — Hebel 2: Mindest-Alpha-Boden + LOD-Ausnahme in `FxSystem.ts`

(folgt)

## Karte #5221 — Nachher-Messung + art-director-Vision

(folgt)
