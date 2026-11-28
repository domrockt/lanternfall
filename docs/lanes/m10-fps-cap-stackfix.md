# Lane m10-fps-cap-stackfix — RangeError-Regression unter Last (Game-Loop-Tod) fixen

Quelle: Bedarfsmeldung m10-mobile-fps-cap 2026-11-28T15:00Z (docs/lanes/m10-mobile-fps-cap.md,
Abschnitte K3/K4). Auf dem K2-Build 700c815e (Frame-Cap 60 am Geräteknoten) stirbt der Game-Loop
unter Last: 9 × `RangeError: Maximum call stack size exceeded` je Lauf, deckungsgleich mit
9 Frozen-Loop-Ereignissen (alle ~40–80 s); der K1-Old-Build lief 12 min ohne einen Fehler.
Damit ist der K3-Gerätetor janky < 10 % (21,54 % bei Cap 60) nicht erreichbar — v1.0-Gerätetor-Blocker.

**Dateien (Disponent):** src/logic/fps-cap.ts, scripts/m10-fps-cap-stackfix.mjs,
tests/fps-cap-stackfix.test.ts, docs/lanes/m10-fps-cap-stackfix.md, .lane-done.
**Nicht anfassen:** src/main.ts, src/scenes/UI.ts (belegt durch m10-mobile-fps-cap);
Bedarfstat in /home/ai/games/.dispatch/requests.md.

**Vorbemerkung (Fremdgriff, dokumentiert):** Die Regression liegt im K2-Stand der Lane
m10-mobile-fps-cap, die zum Lane-Start noch NICHT in main gemergt war (Branch f64b3d33, lane-done,
Merge ausstehend). Der eigene Worktree (Basis main 213b8494) enthielt src/logic/fps-cap.ts und
die K2-Änderungen daher nicht. Ohne diesen Stand ist die Regression nicht reproduzierbar —
die fps-cap-Dateien (src/logic/fps-cap.ts, src/main.ts, src/audio/options.ts, src/audio/settings.ts,
tests/mobile-fps-cap.test.ts + 5 repointete Tests) wurden per
`git checkout m10-mobile-fps-cap -- <dateien>` in den Worktree materialisiert (Inhalt identisch zum
Branch, kein Merge, kein Branch-Checkout). Beim Merge beider Lanes nach main ist der Inhalt
deckungsgleich, es entstehen keine Konflikte.

## K1 — Stack-Capture unter Last — 28.11. — **Befund: Spread-Overflow in Spawner.drainDebugQueue**

- Probe: `scripts/m10-fps-cap-stackfix.mjs` (m25-Last wie m10-fps-cap-device.mjs: 6 Evos Lv8,
  6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt; BILDRATE=60 via
  Persistenzpfad + Reload = genau der K2-Pfad; Vite-DEV-Server → Stacks unminified).
- Laufumgebung: LOKAL im Android-Ersatzprofil (Galaxy Tab S4 landscape, dpr 2.25,
  CDP-CPU-Drossel ×4) — das Gerät ist kontentioniert (409 DOM_SPIELT, Dom spielt; 409-Regel:
  nicht wiederholt). Der Stack ist ein Logik-Befund, kein FPS-Beleg; Renderer-String steht im JSON.
- Capture: `pageerror` mit vollem Stack (`e.stack`), Frozen-Loop-Erkennung je Fenster,
  Heilung per Reload (Rezept fps-cap-Lane).

**Beleg (verbindlich):** `~/games/.evidence/m10-fps-cap-stackfix/k1-stack-vorher.json`
(vite-dev + Galaxy-Tab-S4-Profil, CPU ×4, BILDRATE=60; Fenster 0 crasht, 1 RangeError).

Voller Callstack des RangeError-Treffers (unminified, Datei + Funktion):

```
RangeError: Maximum call stack size exceeded
    at Spawner.drainDebugQueue (src/systems/Spawner.ts:368:19)
    at Spawner.update (src/systems/Spawner.ts:146:8)
    at Run.simulate (src/scenes/Run.ts:628:27)
    at Run.update (src/scenes/Run.ts:576:9)
    at Systems.step (phaser)
    at SceneManager.update (phaser)
    at Game.step (phaser)
    at TimeStep.stepLimitFPS (phaser)   ← gecappter Pfad (BILDRATE 60)
    at step (RAF-Loop)
```

**Wurzel (Mikro-Mechanismus separat belegt):** KEINE JS-Frame-Rekursion — der Stack wird
von der ARGUMENTLISTE verbraucht. `Spawner.drainDebugQueue` repushte die nicht gedräinte
Rest-Queue per `this.debugQueue.push(...rest)`; Spread übergibt alle Einträge als
Funktionsargumente. Mikro-Messung (node): 100k Argumente noch ok, 150k → RangeError —
deshalb zeigt der Stack genau EINEN `drainDebugQueue`-Frame ohne Wiederholung.

Warum wächst die Queue so groß? Kette:
- `__lf.spawnEnemy` → `Run.debugSpawnEnemy` → `Spawner.queueEnemyWave` legt ALLE Positionen
  sofort in `debugQueue` (Frame-Tail-Batching, m10-frame-tail-batching).
- Der m25-Top-up fordert alle 50 ms das Defizit auf 300 an (~200 je Tick unter Last,
  `maxActiveEnemies`/Qualitätsstufe deckeln die aktiven Gegner) → Nachschub ~4k/s.
- Drain: nur `SPAWN_DEBUG_BATCH_PER_FRAME = 30` je Sim-Substep (~1,8k/s) → Netto-Wachstum
  ~2k/s → ~100–200k Einträge nach ~50–80 s → der nächste Drain crasht.
- Passt zu beiden Geräteläufen: 9 Crashes je 10 min, alle ~40–80 s; K1-Old-Build ohne
  Cap bzw. hoher aktiver Gegnerzahl hatte kleines Defizit/keinen Rückstau → 0 Fehler.
- Der fps-cap-Bezug ist real (Cap 60 senkt die Substep-/Drain-Rate UND über die
  Qualitätsstufe die aktive Gegnerzahl → größeres Defizit), aber der Hebel ist der
  Spread im Drain — nicht `applyFpsLimit` (das wird in den Messläufen nie aufgerufen:
  `onSettingsChanged` feuert nur aus Menü/Debug, nicht unter autoplay Last).

## K2 — Fix — 28.11. — Commit ad78560e

`src/systems/Spawner.ts`, `drainDebugQueue` (Fremdgriff — Begründung oben in der
Vorbemerkung + Bedarfsmeldung 2026-11-28T15:2xZ in `.dispatch/requests.md`; Datei war in
claims.json niemandem zugeordnet, Briefing erlaubt minimalen Fix im Loop-Pfad):

- **Alt:** `drainSpawnQueue(...)` → `spawn(now)` → `this.debugQueue.push(...rest)`
  (Spread = Stackgrenze bei großen Queues).
- **Neu:** Front-Entnahme per `slice(0, batch)` + `splice(0, batch)` — konstante
  Argumentzahl, keine Rest-Kopie; Spawn-Reihenfolge und Batchgröße (30 je Drain)
  bitgleich. `drainSpawnQueue` bleibt als reine Funktion unverändert bestehen
  (Vertrag von tests/frame-tail-batching/followup).
- bewusst NICHT geändert: Batching-Grenze 30, Dawn-Drain-Aufrufe (Run.ts), fps-cap-Oberfläche
  (src/logic/fps-cap.ts unangetastet — K4-Empfehlung der fps-cap-Lane bleibt unberührt).
- main.ts/UI.ts nicht angerastet (belegt durch m10-mobile-fps-cap).

## K3 — Regressionstest — 28.11. — Commit ad78560e

`tests/fps-cap-stackfix.test.ts` (5 Tests grün, `npx tsc --noEmit` rc=0):

- Gegenprobe Mechanismus: `push(...new Array(200k))` wirft genau `RangeError: Maximum
  call stack size exceeded` (pinnt den Bug-Typ, schützt vor Re-Import des Musters).
- Regression: Drain bei 200k Queue-Einträgen wirft NICHT, materialisiert exakt 30,
  Reihenfolge erhalten, Rest bleibt in der Queue.
- Mehrfach-Drains folgen derselben Ordnung (bitgleich zum Vorgänger-Modell).
- Leere Queue: No-op (Vertrag unverändert).
- Desktop-Pfad (kein Cap): Drain-Verhalten plattformunabhängig, Batchgröße/Reihenfolge
  bitgleich gegen den Referenz-RNG-Stream (queueEnemyWave-Draws 2 je Position).
- Bestehende Batching-Tests (frame-tail-batching, frame-tail-followup) unverändert grün.

Abnahme-Lastnachweis (eigene Messung, identisches Rezept zu K1): siehe K4.

## K4 — Vorher/Nachher unter identischer Last — 28.11.

(offen — Nachher-Lauf läuft)

