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

### 2a. Burst (scripts/m10-view-width.mjs, 10 s, 500 Gegner, `shots/m10-view-width-after-burst-*.json`)

| Viewport | cap | intern | FPS (3 Läufe) | Median | JS-Fehler |
|---|---|---|---|---|---|
| 640×360 @1 | on | 480×360 (Klemme greift nicht, ≤ 640) | 60,0 / 60,0 / 57,1 | 60,0 | 0 |
| 780×360 @3 | off | 780×360 | 53,8 / 53,4 / 53,3 | 53,4 | 0 |
| 780×360 @3 | on | **640×360** | 54,0 / 57,9 / 57,7 | **57,7** | 0 |
| 1080×360 @3 | on | **640×360** (statt 860) | 58,1 / 59,2 | 58,6 | 0 |

A/B an 780×360: **+4,3 FPS (+8 %)**; 1080×360 intern 640 statt 860: **+7,9 FPS (+15,6 %)** gegen die
Rootcause-Baseline (50,7 FPS bei intern 860, `docs/lanes/m10-perf-rootcause.md`).

### 2b. Minute-25 (scripts/perf.mjs, 3 Läufe je Viewport, `shots/m10-view-width-after-640-*.json` / `-780-*.json`)

| Viewport | Lauf | intern (Snapshot) | Burst FPS | Minute-25 FPS | Minute-25 Gegner | JS-Fehler |
|---|---|---|---|---|---|---|
| 640×360 @1 | 1 | 480×360 | 47,9 | 55,2 | 300 | 0 |
| 640×360 @1 | 2 | 480×360 | 59,6 | 57,2 | 300 | 0 |
| 640×360 @1 | 3 | 480×360 | 59,4 | 53,3 | 300 | 0 |
| 780×360 @3 | 1 | 640×360 (Klemme aktiv) | 59,6 | 50,8 | 300 | 0 |
| 780×360 @3 | 2 | 780×360 (Snapshot nach Hysterese-Release) | 57,0 | 49,7 | 300 | 0 |
| 780×360 @3 | 3 | 640×360 (Klemme aktiv) | 58,7 | 44,6 | 300 | 0 |

Median Minute-25: **640×360 55,2 (Ziel ≥ 55: erfüllt)**; **780×360 49,7** gegen Vorher 31,9 = **+56 %,
deutlich besser, aber unter 55**. Hinweis zur Messqualität: Der `view.internal`-Snapshot wird am Ende des
Messfensters genommen; die Hysterese kann dort kurzzeitig gelöst sein (Lauf 780-2), das Messfenster selbst
lief überwiegend mit Klemme. Die Burst-A/B in 2a zeigt den Klemm-Effekt sauber.

### 2c. Fullrun (genau 1× nach dem Fix, `shots/m10-view-width-fullrun.json`)

- `fpsMin` **39,4** (Fenster ab Sim-Zeit 29:20, volle Dichte + Endboss) — **Ziel ≥ 55 NICHT erfüllt**
- Sieg `dawn`, 6 Truhen, 157 Elites, Level 36, 4085 Kills, **0 JS-Fehler**
- Heap +7,7 % ggü. Minute 1 (Ziel ≤ 15 %: erfüllt)
- WIP-Frühlauf 14:50 (parallel hohe Last, im Checkpoint dd439cd): fpsMin 37,7 — gleiche Tendenz
- **Autoritative Nachher-Reihe:** `shots/m10-view-width-after-640-*.json` / `-after-780-*.json` (M25) und
  `-after-burst-*` (Burst, Kapitel 2a). Die früheren `-after-perf-*` / `-after-burst-perf-*` JSONs aus dem
  WIP-Checkpoint (14:42–14:51) sind **veraltet** (dazwischen liefen andere Lanes mit voller Last, z. B.
  minute25 25,8 bei sonst 55+) und nur als Roh-Historie im Branch — nicht für Urteile verwenden.

**Ursache (dokumentiert, nicht weiter getunt):** Der Fullrun läuft bei 960×540 @1 → intern **480** breit
(Fit-Fallback), die 640-Klemme kann hier nichts bringen — das FPS-Minimum im Fullrun wird nicht durch die
Renderbreite verursacht. Der größte verbleibende Einzelposten ist UI/PostFX (+18,5 %, Rootcause-Lane);
das ist die vereinbarte **Folgekarte** (UI/PostFX-Drosselung), nicht Teil dieser Lane.

## 3. Sicht-Belege

Screenshots nach dem Fix (`shots/m10-view-width-640.png`, `-780.png` [intern 640, Klemme aktiv],
`-1080.png` [intern 640]): ganzzahlige n-Skalierung bleibt erhalten (n = Skalierungsstufe unverändert,
`isIntegerPixelPerfect` true), Canvas zentriert im Viewport, keine Unschärfe/falschen Pixelkanten.
Art-director-Urteil: siehe Abschnitt 4.

## 4. Abnahme

- `npm test` grün (view-width 4/4, view 9/9), `npm run build` rc=0 (Commit 7576db7).
- 640×360 Minute-25 Median **55,2 ≥ 55**: PASS. 780×360 nicht schlechter als Vorher (49,7 vs 31,9): PASS.
- Fullrun `fpsMin` 39,4 < 55: **KRITERIUM NICHT ERFÜLLT** — Ursache dokumentiert (Abschnitt 2c); nächster
  Hebel UI/PostFX-Drosselung als Folgekarte, laut Briefing nicht in dieser Lane zu tunen.
- Kein Spielgefühl-Eingriff: nur `src/logic/view.ts` + 1 Poll in `src/main.ts` (Dispatch-Request),
  keine Gegner-/Waffen-/Balance-Werte.
- Kontrolleure: reviewer **PASS** (27.11.: Klemme/Hysterese mit Belegen view.ts:19-27/109, Tests deckend 5/5
  + `npm test` 34 Dateien/360 Tests grün, main.ts-Poll minimal, keine Fremd-Dateien, keine Temp-Reste).
- Sicht-Beleg (einmaliges Urteil, 3x nearest vergrößert): **PASS** — keine Unschärfe/keine falschen Pixelkanten
  bei 640/780/1080; ganzzahlige Skalierung erhalten, Canvas zentriert, HUD lesbar.
- **Abschluss-Check (Supervisor, 27.11.):** fullrun `fpsMin` 39,4 < 55 → Abnahmekriterium **NICHT erfüllt**.
  Ergebnis + Ursache stehen in Abschnitt 2c (Fullrun läuft intern 480 breit, die 640-Klemme greift dort nicht;
  größter verbleibender Posten UI/PostFX +18,5 %). Karte #3461 wird **blocked** gesetzt, nicht weiter getunt;
  Folgekarte UI/PostFX-Drosselung im Backlog.
