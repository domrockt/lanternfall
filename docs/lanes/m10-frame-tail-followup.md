# Lane m10-frame-tail-followup (Dora, 2026-11-28)

Follow-up zur Lane `m10-frame-tail-batching`: Reviewer-PASS mit 3 „sollte“-Befunden
(dort, Abschnitt Review), die wegen des `src/systems/Spawner.ts`-Claims
(`m10-spawn-burst-alloc`) nicht direkt gefixt werden konnten — Bedarf
`requests.md` 2026-11-28T13:05Z. Dieses Lane-Briefing: K1 Merge-Recheck, K2 Dawn-Drain,
K3 Aufräumen (Doku + reine Positions-Funktion), K4 Guards + `.lane-done`.

## K1 — Merge-Recheck (Stand: `merge-m10-spawn-burst-alloc` 1c161482, enthält cc8a3590)

Ergebnis: **Keiner der 3 Befunde ist über die Merges gelandet.** Alle drei werden hier
umgesetzt (K2/K3/K4). Belege je Befund (Code-Lese im Worktree-Stand 1c161482):

1. **Dawn = Queue-Leak (Debug-API) — NICHT gelandet.**
   `src/scenes/Run.ts:678`: `const spawned = this.dawn ? [] : this.spawner.update(...)`
   — während der Morgendämmerung läuft `Spawner.update()` (und damit der Drain,
   Spawner.ts:150/351) nicht. `startDawn()` (Run.ts:1252) ruft weder
   `drainDebugQueue` noch räumt es die Queue → gequeuete Debug-Spawns materialisieren nie.
   → K2.
2. **Doku Cap je Sim-Substep — NICHT gelandet.**
   `src/systems/Spawner.ts:331`: „update() mit hoechstens SPAWN_DEBUG_BATCH_PER_FRAME
   **je Frame**“ — bei timeScale > 1 (bis ~60 Substeps/Frame) gilt die Obergrenze je
   `update()`-Aufruf (= Sim-Substep), nicht je rAF-Frame. → K3.
3. **RNG-Identität nur durch Code-Duplikation belegt — NICHT gelandet.**
   `src/systems/Spawner.ts:310` (`spawnEnemy`) und `:335` (`queueEnemyWave`)
   duplizieren Winkel→Radius→Clamp; ein Identitätstest mit geseedetem RNG fehlt. → K3/K4.

### Supervisor-Recheck (2026-11-28, nach K2/K3)

Supervisor-Anfrage, ob die 3 Befunde inzwischen über Merges gelandet sind: `origin/main`
hat seit Lane-Basis 1c161482 **keine** neuen Commits, die `src/systems/Spawner.ts` oder
`src/scenes/Run.ts` berühren (`git log origin/main 1c161482..origin/main -- <beide Dateien>`
= leer; neue Merges betreffen hazard-tex-cap / props-always-visible / balance-corridor-guard).
Die Befunde sind also nicht von anderer Seite gelandet — K2/K3 dieses Worktree sind die
Umsetzung (Commits bb990bfd, 3e2045fd).

### Zusätzlich geprüft (aus `requests.md` 12:52Z, gleiche Datei)Der dort gemeldete „Sofort-Zweig“ (Aufrufe ≤ SPAWN_DEBUG_BATCH_PER_FRAME materialisieren
sofort statt gequeut zu werden, für fremde Verify-Skripte mit synchroner Spawn-Lese:
`scripts/m10-boss-fair.mjs`, `scripts/m10-crowd-probe.mjs`) ist **ebenfalls nicht
gelandet**: `queueEnemyWave` (Spawner.ts:335) queut weiterhin immer. Er ist **nicht Teil
dieses Briefings** (K2–K4 decken exakt die 3 Reviewer-Befunde ab) und bleibt offener
Punkt der Frame-Tail-Restarbeit — hier dokumentiert, damit der Bedarf nicht verloren geht.

## K2 — Dawn-Drain (#12288, Commit siehe git log)

**Ursache:** Während der Morgendämmerung läuft `Spawner.update()` nicht
(Run.simulate: `this.dawn ? [] : this.spawner.update`) — gequeuete Debug-Spawns
materialisierten nie (Reviewer-Befund 1).

**Fix (zwei Hebel, Normalpfad unberührt):**
1. `Run.startDawn()` ruft `this.spawner.drainDebugQueue()` (Methode jetzt public,
   Spawner.ts): erste 30 materialisieren sofort beim Dawn-Start.
2. `Run.simulate()` dränniert während `dawn` je Sim-Substep die Debug-Queue
   (`drainDebugQueue()` statt `spawner.update()`) — der Rest materialisiert
   verteilt mit der Batching-Obergrenze (30/Substep) statt als 300er-Burst;
   die Wave-Logik startet weiterhin nicht.

**Belege (Probe-Skript `scripts/m10-frame-tail-followup.mjs --mode=dawn`, headless,
Seed 101, 80 gequeute bog_rat, `window.__lf.event("dawn")`; JSONs in
`~/games/.evidence/m10-frame-tail-followup/`):**
- `dawn-drain-probe-before.json` (Stand Merge 1c161482): `spawnCounts`-Delta
  bog_rat = 8 (nur die 8 frischen Event-Spawns) → **0/80 materialisiert, Queue-Leak.**
- `dawn-drain-probe-after.json` (Fix): Delta bog_rat = 88 (80 gedrännt + 8 frisch),
  92 Gegner alive → **80/80 materialisiert.**
- Hinweis: die Auxiliarmetrik `debugQueueLen` lieferte im Probe-Kontext `null`
  (Feld existiert im Build, per Live-Check geprüft) und wird nicht als Kriterium
  verwendet — das kampfunabhängige `spawnCounts`-Delta ist das Kriterium.
- Erste Probe-Iteration maß Alive-Gegner statt spawnCounts (durch Kampftode des
  Spielers verfälscht: 42 statt 80) — Skript auf spawnCounts umgestellt (2
  Iterationen, dann eingefroren).

**Normalpfad bitgleich:** die Änderungen liegen ausschließlich im Dawn-Pfad
(`startDawn`, Dawn-Zweig von `simulate`); Seed-Vergleich des Normalpfads siehe
K4 (`seed-baseline-before.json` vs. After-Run, identische Checksumme).

## K3 — Doku-Fix + reine Positions-Funktion (#12289)

- Kommentar zu `SPAWN_DEBUG_BATCH_PER_FRAME` korrigiert (Reviewer-Befund 2): Cap gilt
  **je `update()`-Aufruf (= Sim-Substep)**, nicht je rAF-Frame; bei timeScale 1 identisch
  mit je rAF-Frame (Geräte-Harness läuft mit `setTimeScale(1)`).
- Neue reine exportierte Funktion `debugRingPosition(rng, playerX, playerY)`
  (Spawner.ts): zieht Winkel (`rng.next() * 2π`) dann Radius (`90 + rng.next() * 90`)
  und clampt auf `[20, WORLD_SIZE - 20]`. Genutzt von `spawnEnemy` UND
  `queueEnemyWave` — die Code-Duplikation (Reviewer-Befund 3, erster Teil) ist entfernt,
  Ziehungsreihenfolge unverändert.
- Beleg Spawn-Verhalten bitgleich: `scripts/m10-frame-tail-followup.mjs --mode=seed`
  (sim-exakte Marks via simulate-Hook, Seed 101, 90 Sim-Sekunden, spawnTotal +
  FNV-Positions-Hash je Sekunde). Checksumme nach Fix **identisch** zur
  Vor-Fix-Baseline (Stand Merge 1c161482):
  `1518447412:2166136261,…,1518447412` — JSONs
  `~/games/.evidence/m10-frame-tail-followup/seed-baseline-before.json` und
  `seed-after.json`, 0 JS-Fehler, kein flock (sim-exakt, lastunabhängig).
- RNG-Identitätstest (zweiter Teil von Befund 3): siehe K4
  (`tests/frame-tail-followup.test.ts`).

## K4 — Guards (#12290)

`tests/frame-tail-followup.test.ts` (7 Tests, alle grün):
- **Formel-Identität:** `debugRingPosition` ist bitgleich zur historischen
  Inline-Formel aus `spawnEnemy`/`queueEnemyWave` (git-Stand 1c161482, im Test
  referenziert) über 3 Seeds × 200 Züge — die Extraktion verschiebt keinen Wert.
- **Stream-Vertrag:** exakt 2 Züge je Position (Winkel zuerst), kein versteckter
  Draw dazwischen — Verify-Skripte können Positionen aus einem bekannten
  RNG-Stream reproduzieren.
- **RNG-Identität der Pfade:** gleicher Seed, stream-aligned (n=1):
  `spawnEnemy` und `queueEnemyWave`+`drainDebugQueue` erzeugen bitgleich
  dieselben Spawns (x, y, phase, elite, hpScale). Für n>1 gilt die Identität
  auf Positionsebene über die reine Funktion (Positions-Draws 2n am Stück,
  Phase-Draws beim Drain) — die Pfade arbeiten mit denselben Formeln/Werten,
  der Stream-Anteil je Spawn ist prozedural identisch.
- **Dawn-Drain-Guard (Modell):** ein Drain beim Dawn-Start materialisiert
  Cap-30, wiederholte Substep-Drains leeren die Queue vollständig (80/80,
  kein Leak), Reihenfolge und Werte exakt erhalten; `drainSpawnQueue`-Vertrag
  „verliert nie einen Eintrag“ über Caps.
- Die Run-Seiten-Verdrahtung (`startDawn`-Aufruf + Substep-Drain) ist durch die
  Probe-Skript-Belege von K2 abgesichert (vorher 0/80, nachher 80/80).

Hinweis: `npm test` regeneriert `shots/m10-passive-math-{caps,matrix}.json`
(nur `generatedAt`, durch `tests/passive-stack.test.ts`) und macht den Worktree
damit dirty — nach Testläufen mit `git checkout -- shots/` zurücksetzen; kein
Fachinhalt, keine Lane-Arbeit.

## Abnahme

- ✅ Debug-Spawns materialisieren auch während Morgendämmerung — Probe-Skript-Beleg:
  `.evidence/m10-frame-tail-followup/dawn-drain-probe-before.json` (0/80, Leak)
  vs. `dawn-drain-probe-after.json` (80/80, spawnCounts-Delta bog_rat 88 = 80 + 8 frisch).
- ✅ Spawn-Verteilung im Normalpfad bitgleich (Seed-Vergleich): sim-exakte Probe
  Seed 101, 90 Sim-s, 90 Marks, Checksumme vor/nach Fix identisch
  (`seed-baseline-before.json` / `seed-after.json`, 0 JS-Fehler).
- ✅ `npm test` grün (2317/2317, 209 Dateien) + `npm run build` grün je Karte.
- ✅ `.lane-done` gesetzt (dieser Commit).

## Lane-Abschluss

Alle 3 Reviewer-Befunde sind umgesetzt (K2 = Befund 1, K3 = Befund 2 + 3a,
K4 = Befund 3b). Offener Punkt (nicht Teil dieses Briefings, dokumentiert in K1):
Sofort-Zweig aus `requests.md` 12:52Z (Aufrufe ≤ 30 materialisieren sofort statt
gequeut zu werden, für `m10-boss-fair.mjs`/`m10-crowd-probe.mjs` mit synchroner
Spawn-Lese) ist weiterhin nicht umgesetzt — queueEnemyWave queut weiterhin immer.
