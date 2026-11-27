# M10-perf-fix-ambient-batching — Ambient-Layer batching / ambientBudgetFor(lod)

Datum: 2026-11-27. Lane `m10-perf-fix-ambient-batching`
(Worktree `/home/ai/lanes/...` → `/home/ai/games/lf-lanes/m10-perf-fix-ambient-batching`, Branch `m10-perf-fix-ambient-batching`).

Belegte Ursache aus `m10-perf-recovery` (`.lane-done` c4295f3): Commit `c0f56d5` (#280 Ambient
Glühwürmchen + Nebel) kostet ~8,6 FPS in Minute 25 (51,4 vs 60,0). Vorlage:
`~/tmp/m10-perf-recovery/ambient-lod-fix.patch` (Ambient-Layer + `ambientBudgetFor`-LOD), dort gegen
einen älteren Stand erstellt.

## 1. Vorher-Messung (Baseline HEAD)

Je 3 Läufe, 10-s-Fenster, `flock /home/ai/games/.lf-perf.lock`, gleiche Bedingungen wie `perf.mjs`.
Median (nicht bester Lauf):

| Viewport / dpr | Lauf 1 Burst / M25 | Lauf 2 | Lauf 3 | **Median Burst** | **Median M25** |
|---|---|---|---|---|---|
| 640x360 @1 | 60,0 / 53,5 | 60,1 / 55,7 | 60,1 / 54,0 | **60,1** | **54,0** |
| 780x360 @3 | 55,8 / 43,2 | 56,2 / 45,1 | 55,1 / 45,1 | **55,8** | **45,1** |

Belege: `shots/m10-ambient-before-640-{1..3}.json`, `shots/m10-ambient-before-780-{1..3}.json`.
0 JS-Fehler in allen 6 Läufen. Interner Framebuffer bei 640x360 ist 480x360 (MAX_WIDTH-Klemme),
780x360@3 rendert intern 780x360 (fill-rate-bound).

**Befund:** 640x360 Minute 25 liegt mit Median 54,0 unter dem Ziel 55; 780x360@3 mit 45,1 deutlich
darunter (fill-rate). Burst ist bei 640 bereits ≥ 55. Ziel des Fixes: Blend-Wechsel und Draw-Calls
pro Frame senken, 640/M25 auf ≥ 55 heben.

## 2. Fix

- Ambient (24 ADD-Glühwürmer, 3 NORMAL-Nebelbänder) wird in zwei feste Container-Layer
  (`glowLayer` ADD, `fogLayer` NORMAL, feste Tiefen unter Props) gezogen, damit ADD/NORMAL
  nicht pro Bild zwischen anderen Tiefen sortiert werden und als ein Batch zusammenbleiben.
- `ambientBudgetFor(enemies)` in `src/logic/lod.ts` begrenzt sichtbare Glow-/Fog-Zahl und
  Update-Rate anhand der Gegnerlast (Endgame: 0 Glows, 1 Nebelband, 15/30 Hz statt 60 Hz).
  Die Ambient-Positionen werden damit nicht mehr jeden Frame neu gesetzt.
- Kleine Dekor-Props (Boulder/Stump/Bones/Reeds/…) werden ab 250 Gegnern ausgeblendet
  (eigene Texturen = Batch-Bruch), große Strukturen bleiben.
- Unit-Test `tests/ambient-batching.test.ts` fixiert die Budget-Stufen und Batch-Zahl.

Claim-Hinweis: Der Fix kommt ohne Änderungen an `src/scenes/Run.ts`, `src/scenes/UI.ts`,
`src/gfx/textures.ts` aus (kein Claim-Konflikt). Alle Änderungen liegen in den zugeteilten Dateien
plus `src/logic/lod.ts`.

## 3. Nachher-Messung

Je 3 Läufe, 10-s-Fenster, gleiche Bedingungen wie Vorher (`scripts/m10-ambient-batching.mjs`,
Fix-Commit `6ca654d`, auf PIN `49727faa` erneut verifiziert 2026-11-27, siehe
`docs/qa/reacceptance-b-2026-11-27.md` K2d). Median (nicht bester Lauf):

| Viewport / dpr | Lauf 1 Burst / M25 | Lauf 2 | Lauf 3 | **Median Burst** | **Median M25** |
|---|---|---|---|---|---|
| 640x360 @1 | 60,1 / 57,0 | 60,1 / 56,3 | 57,2 / 52,3 | **60,1** | **56,3** |
| 780x360 @3 | 57,7 / 41,2 | 59,0 / 44,8 | 58,3 / 45,5 | **58,3** | **44,8** |

Belege: `shots/m10-ambient-after-640-{1..3}.json`, `shots/m10-ambient-after-780-{1..3}.json`.
0 JS-Fehler in allen 6 Läufen; 640 M25 Läufe 1–2 `passed:true`.

**Befund:** 640x360 Minute 25 ist von Median **54,0 → 56,3** gestiegen und damit über dem
Ziel 55 (PASS). 780x360@3 liegt mit 44,8 praktisch unverändert an der fill-rate-Grenze
(vorher 45,1; intern rendert 780x360@3 mit voller 780er-Breite) — kein Rückschritt, aber
der Fix adressiert primär die 640er-Schwelle. Burst in beiden Views ≥ 55 (Medians 60,1 / 58,3).

## 4. Abnahme

- `npx tsc --noEmit` grün; `npm run build` grün; `npm test` grün (auf PIN `49727faa`:
  446/446 in 42 Dateien, inkl. `tests/ambient-batching.test.ts`).
- Ziel „640x360 Minute 25 ≥ 55“: **PASS** (Median 56,3, Belege
  `shots/m10-ambient-after-640-{1..3}.json`).
- 780x360@3 Minute 25: weiterhin an der fill-rate-Grenze (Median 44,8 < 55) — bekannter
  offener Punkt, kein Bestandteil dieser Lane; keine Regression gegen Vorher (45,1).
- Unit-Test fixiert Budget-Stufen und Batch-Zahl (`tests/ambient-batching.test.ts`).
- Nachabnahme-Beleg: `docs/qa/reacceptance-b-2026-11-27.md`, Abschnitt K2d.

