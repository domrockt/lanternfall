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

- K1 Guard-Skript + Marken-JSONs — `99b990c` (#7519)
- K2 Guard-Test — `ac4ff4c` (#7520)
- K3 Befund + Bedarfsmeldung — `c001fb0` (#7521)
- K4 Abschluss — Commit `M10-m10-run-determinism:` (#7522)

## Lane-Abschluss (K4)

- Build/Tests: `npx tsc --noEmit` grün, `npm run build` grün, `npm test`
  114 Dateien / 1221 Tests grün (davon 5 neue in tests/run-determinism.test.ts).
- Abnahme: Guard-Test grün auf Lane-Stand (main + 3 Commits), Marken-JSONs
  committed (7 Dateien in shots/), **0 Änderungen an src/****, Bedarfsmeldung
  gestellt (Befund war belegt, kein Grünnachweis möglich).
- Keine eigenen Reste im Worktree (`git status --ignored` geprüft; nur
  board.json, das bei main bleibt).

## Review (Kontrolleur)

- `reviewer` (Subagent): **PASS** — Scope sauber (10 Lane-Dateien, 0 × src/**,
  keine Secrets/Temp-Reste), Skript-Logik und Test-Pfade verifiziert, selbst
  `npx tsc --noEmit` (grün) und `npx vitest run tests/run-determinism.test.ts`
  (5/5 grün) ausgeführt, Befunddaten gegen verdict.json/Rohdaten geprüft,
  Fix-Erkennung bestätigt (ein echter Determinismus-Fix lässt den Guard
  an schlagen → Befund-Update erzwungen).
- Zwei Soll-Punkte aus dem Review noch in K4 eingearbeitet:
  Diff-Statistik an `--reps` gekoppelt (statt hart `reps[1]`), `pageErrors`
  fließen ins Urteil ein (`pageErrorCount` je Seed, >0 ⇒ nichtdeterministisch).
