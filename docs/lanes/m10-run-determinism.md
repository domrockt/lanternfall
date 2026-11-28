# Lane m10-run-determinism — Determinismus-Guard

Ziel: Sicherstellen, dass die Abnahme-Maschinerie (fullrun-guard, balance-Korridor,
perf-Harness) auf einem belastbaren Fundament steht: **gleicher Seed + autoPlay =
gleicher Lauf** (bitgleiche Kill-/Level-/Boss-/Truhen-Marken).

## Methode (K1, `scripts/m10-run-determinism.mjs`)

- Je Seed (Fixture: 101, 202, 404) **2 identische Läufe** (autoPlay, god off,
  timeScale 30, mira, 120 Sim-Sekunden, gleiche URL `?debug=1&seed=<seed>`).
- Marken werden **exakt im Sim-Loop** gelesen (prototype-Patch von `Run.simulate`
  im Seiten-Kontext, kein Polling): bei jedem Überschreiten einer ganzzahligen
  Sim-Sekunde werden `elapsed, kills, level, xp, hp, enemies, chestsDropped,
  bossesSpawned, px, py` festgehalten; zusätzlich `bossDefeated`/`chestOpen`-Events.
- Vergleich: `JSON.stringify` pro Marke; Urteil + Diff-Statistik in
  `shots/m10-run-det-verdict.json`, Roh-Marken in `shots/m10-run-det-<seed>-r<rep>.json`.
- Kein flock: die Marken sind sim-exakt (innerhalb `simulate()` gelesen) und damit
  lastunabhängig; das Skript misst keine FPS/Realzeit.

## Befund: NICHTDETERMINISMUS BELEGT (K3)

Beleg: `shots/m10-run-det-verdict.json` (`deterministic: false`, 3/3 Seeds divergent),
Rohdaten 6 × 120 Marken committed. Reproduzierbar mit
`node scripts/m10-run-determinism.mjs --seconds=120`.

| Seed | erster Kills-Diff (Sim-s) | erster Level-Diff (Sim-s) | Kills am Lauf-Ende r0/r1 |
|---|---|---|---|
| 101 | 50 | 86 | 62 / 68 |
| 202 | 45 | 36 | 79 / 79 |
| 404 | 51 | 56 | 67 / 62 |

- Erste Divergenz **bereits bei Sim-Sekunde 1** in `elapsed` und `px` (Spielerposition),
  alle 3 Seeds. Danach weichen in allen 120 Marken `elapsed`/`px` ab; `kills`/`xp`/
  `enemies`/`level` folgen ab Sim-Sekunde ~36–86 (Details: `divergingFields` im Verdict).
- Verdachts-Datei: **`src/scenes/Run.ts`** — `update()` akkumuliert
  `scaledDt = min(0.05, delta/1000) * timeScale` und macht verbleibende Reste als
  **variablen Partial-Schritt** (`dt = min(SIM_MAX_STEP, remaining)`). Da `delta`
  Echtzeit-Frame-Zeiten sind, verschiebt sich die Phase aller Tick-Zyklen (Waffen-
  Cooldowns, Spawn-Timer, Regen) frame-abhängig — der Laufzustand bei Sim-Sekunde s
  ist damit nicht reproduzierbar.
- Hebel liegt in einer **fremden Datei** (`src/scenes/Run.ts`, parallel belegt und in
  der Lane-Grenze explizit ausgeschlossen) → **Bedarfsmeldung** in
  `/home/ai/games/.dispatch/requests.md` (Eintrag 2026-11-28T02:4xZ, Lane
  m10-run-determinism): Sim-Schrittführung auf feste `SIM_MAX_STEP`-Einheiten
  quantisieren (Rest carry-over statt Partial-Schritt). Kein Fix in dieser Lane.

## Konsequenz für die Abnahme-Maschinerie

Solange der Partial-Schritt aus Echtzeit-delta akkumuliert, sind Vorher/Nachher-Belege
auf Markenebene ("gleicher Seed = gleicher Lauf") nur auf **aggregierter Ebene**
(Minuten-Samples, Todeszeit ±Sekunden, Korridore) belastbar, nicht bitgenau.
Abhilfe-Hebel (Vorschlag, fremde Datei): Sim-Schrittführung auf feste
`SIM_MAX_STEP`-Einheiten quantisieren und nur volle Schritte ausführen (Rest
carry-over in `Run.update`), oder Sim-Zeit über einen eigenen Akkumulator mit
fester Quantisierung führen.

## Karten

- K1 Guard-Skript + Marken-JSONs — Commit `M10-m10-run-determinism:`
- K2 Guard-Test — Commit `M10-m10-run-determinism:`
- K3 Befund + Bedarfsmeldung — Commit `M10-m10-run-determinism:`
- K4 Abschluss — Commit `M10-m10-run-determinism:`
