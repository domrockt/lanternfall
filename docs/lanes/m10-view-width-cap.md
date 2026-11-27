# M10-view-width-cap — Renderbreite im Endgame deckeln (Vorher/Nachher)

Datum: 2026-11-27. Lane: `m10-view-width-cap` (Worktree `/home/ai/games/lf-lanes/m10-view-width-cap`,
Branch `m10-view-width-cap`). Grundlage: `docs/lanes/m10-perf-rootcause.md` — intern breite Canvas-Ausgabe
kostet FPS (640 intern 480: 60,1; 780 intern: 54,5; 1080 intern 860: 50,7), UI/PostFX +18,5 % sind der
größte Einzelposten, Projektile/Partikel sind nicht treibend. Diese Lane setzt nur den kleinsten Hebel um:
bei hoher Gegnerlast die interne logische Breite auf **≤ 640** klemmen, weiter ganzzahlig skalieren.

## Scope

Nur `src/logic/view.ts`, `tests/view-width.test.ts`, `scripts/m10-view-width.mjs`, dieses Dokument und
`shots/m10-view-width-*`. `src/main.ts` wird für **eine** minimale Verdrahtung angefasst (Poll auf
`Run.getQuickStats().enemies`, dann `applyView`), weil der Schalter sonst nur in Tests existiert;
`src/main.ts` ist von keiner anderen Lane beansprucht (Dispatch-Request in `.dispatch/requests.md`).
Nicht angefasst: `src/scenes/Run.ts`, `src/systems/FxSystem.ts`, `src/systems/EnemyPool.ts`,
`src/systems/CombatSystem.ts`, `src/gfx/textures.ts`. Keine Gegnerzahl-, Waffen- oder Balance-Werte.

## Fix-Design

- `CROWD_WIDTH = 640`, `CROWD_ENEMY_THRESHOLD = 300`, `CROWD_RELEASE_THRESHOLD = 260` (Hysterese gegen Flattern).
- `shouldCapForCrowd(activeEnemies, currentlyCapped)` — reine Funktion mit Hysterese.
- `computeView({ width, height, dpr, setting, crowd })` — bei `crowd: true` wird die logische Breite auf
  `CROWD_WIDTH` begrenzt; die ganzzahlige Stufe `n` bleibt unverändert, `isIntegerPixelPerfect` bleibt true.
  Auf schmalen Geräten (Breite ohnehin ≤ 640) ändert der Schalter nichts.

## 1. Baseline (vor Fix)

`flock /home/ai/games/.lf-perf.lock timeout 240 node scripts/perf.mjs --viewport <WxH> --dpr <n> --out shots/m3-perf.json`
kopiert nach `shots/m10-view-width-before-*.json`; 3 Läufe je Viewport.

| Viewport | Lauf | intern | Burst FPS | Burst Gegner | Minute-25 FPS | Minute-25 Gegner | JS-Fehler |
|---|---|---|---|---|---|---|---|
| 640×360 @1 | 1 | 480×360 | 59,9 | 500 | 54,7 | 300 | 0 |
| 640×360 @1 | 2 | 480×360 | 60,1 | 500 | 51,8 | 300 | 0 |
| 640×360 @1 | 3 | 480×360 | 59,8 | 500 | 55,4 | 300 | 0 |
| 780×360 @3 | 1 | 780×360 | 55,9 | 500 | 44,7 | 300 | 0 |
| 780×360 @3 | 2 | 780×360 | 47,5 | 500 | 30,2 | 300 | 0 |
| 780×360 @3 | 3 | 780×360 | 36,9 | 500 | 31,9 | 300 | 0 |

Median Minute-25 bei 640×360@1: **54,7 FPS** (Ziel ≥ 55). Median Minute-25 bei 780×360@3: **31,9 FPS**.
Die drei 780-Läufe streuen stark (44,7 / 30,2 / 31,9) — parallele Lanes und CPU-Last; die Rootcause-Lane
hatte 54,5 FPS avg gemessen. Maßgeblich ist hier der **Vorher/Nachher-Vergleich desselben Rechners**.

## 2. Nachher (nach Fix)

_folgt nach K1._

## 3. Sicht-Belege

_folgt nach K1/K2._

## 4. Abnahme

_folgt._
