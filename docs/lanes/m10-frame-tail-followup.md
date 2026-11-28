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

### Zusätzlich geprüft (aus `requests.md` 12:52Z, gleiche Datei)

Der dort gemeldete „Sofort-Zweig“ (Aufrufe ≤ SPAWN_DEBUG_BATCH_PER_FRAME materialisieren
sofort statt gequeut zu werden, für fremde Verify-Skripte mit synchroner Spawn-Lese:
`scripts/m10-boss-fair.mjs`, `scripts/m10-crowd-probe.mjs`) ist **ebenfalls nicht
gelandet**: `queueEnemyWave` (Spawner.ts:335) queut weiterhin immer. Er ist **nicht Teil
dieses Briefings** (K2–K4 decken exakt die 3 Reviewer-Befunde ab) und bleibt offener
Punkt der Frame-Tail-Restarbeit — hier dokumentiert, damit der Bedarf nicht verloren geht.

## K2 — Dawn-Drain

(Offen — wird in dieser Karte gefüllt.)

## K3 — Doku-Fix + reine Positions-Funktion

(Offen.)

## K4 — Guards

(Offen.)

## Abnahme

- Debug-Spawns materialisieren auch während Morgendämmerung (Probe-Skript-Beleg, K2).
- Spawn-Verteilung im Normalpfad bitgleich (Seed-Vergleich).
- `npm test` grün; `.lane-done` am Ende.
