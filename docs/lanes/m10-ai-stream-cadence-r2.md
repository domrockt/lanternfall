# Lane m10-ai-stream-cadence-r2 — Pro-Gegner-KI-RNG-Streams (Teil 4 Determinismus-Schnitt)

Re-Queue (Dora 2026-11-28T07:3xZ): das Original m10-ai-stream-cadence wurde dispatcht, hatte aber
keinen Runner-Lauf (kein run1.log, kein Lane-Doc, kein Merge) — Inhalt ging verloren, Briefing
inhaltlich unverändert übernommen. Offener Punkt aus `docs/lanes/m10-ai-rng-seed.md` ("Offene
Punkte / Hinweise", Teil 4): KI-Entscheidungen hängen von der Frame-Kadenz ab, weil der gemeinsame
Run-RNG-Stream + AI-Stagger zeichenzahlabhängig zieht.

## Befundlage

- **Spielniveau (feste Substeps) ist bereits zeitstabil:** `scripts/m10-run-determinism.mjs`
  mit gleichem Seed 101 bei timeScale 30 vs 5 (je 60 s, autoPlay) liefert **bitgleiche Marken**
  (60/60 Sim-Sekunden, kills 28, level 5, 0 Events; Belege
  `~/games/.evidence/m10-ai-stream-cadence-r2/marks-cad{30,5}.json` + `run-det-cad{30,5}.json`).
  Der feste Substep (SIM_MAX_STEP) bündelt timeScale nur in Schrittzahl — die Schrittfolge ist
  identisch.
- **Die Rest-Abhängigkeit sitzt in der Stream-Adressierung:** `Run.attachAiRng` verteilte EIN
  gemeinsames KI-RNG-Objekt (abgeleitet aus dem Run-Seed) an alle Gegner. Wie viele Ziehungen ein
  Gegner im KI-Zug konsumiert, hängt von seiner AI-Stagger-Kadenz ab (volle Steps je Distanzring,
  in Frames gezählt) und von der Schrittgranularität von dt. Mit gemeinsamem Stream verschiebt
  jede Kadenzänderung die Ziehungsfolge ALLER Gegner (Interleaving).

## K1 (#9795): Vorher-Probe

Probe `m10-ai-cadence-probe.mjs` (reine Logik: `stepEnemyAi`/`newAiState`, kein Renderer, ohne
flock; Skript + JSON in `~/games/.evidence/m10-ai-stream-cadence-r2/`). Emuliert die IST-Verdrahtung
(`mode=shared`: ein Stream aus dem Run-Seed für alle Gegner) und läuft zwei Kontrollläufe mit
gleichem Seed 20261128, gleicher UID-/Spawn-Reihenfolge, gleichem Layout/Spielerpfad, aber
verschiedener Frame-Kadenz (Substep-dt 1/60 vs 1/30, je 30 s, 120 Gegner, ~36 % ziehende
Archetypen phaser/orbiter).

**Akzeptanz (vor der Messung im JSON festgelegt):** Metrik „KI-Divergenz“ = Anzahl UIDs, deren
Entscheidungskette (Folge der vom KI-Zug gezogenen Werte, gemeinsamer Präfix) zwischen den
Kadenzen abweicht. Erwartung before: divergentUids > 0.

| Probe | Modus | Kadenz A/B | divergente UIDs | Verhaltens-Marken |
|---|---|---|---|---|
| before | shared (Ist) | 1/60 vs 1/30 | **40 / 120** | unterschiedlich |

Beispiele: uid 2 weicht ab Ziehung 3 ab (36 vs 33 Ziehungen), uid 4 ab Ziehung 3, uid 9 ab
Ziehung 6 — die Interleaving-Verschiebung dominoisiert die komplette Folge. Beleg:
`m10-ai-cadence-before.json` (verdict: PASS).

## K2 (#9796): Stream-Adressierung pro Gegner

- `src/logic/ai-state.ts`: `enemyStreamSeed(seed, uid)` (FNV-artiges Avalanche-Mixing),
  `EnemyAiRng` (implementiert `AiRng`, in-place `rekey(seed, uid)`), `attachEnemyAiStream(target, seed, uid)`.
  Das RNG-Objekt bleibt pro EnemyRuntime bestehen (Pooling-Vertrag aus
  `tests/enemy-pool-reuse.test.ts`: Identität beim Recycle), wird aber bei jedem Spawn auf den
  Stream des NEUEN (Seed, UID) neu gesät — die Stream-Position startet pro Inkarnation bei 0.
- `src/systems/EnemyPool.ts`: Fallback-Pfad (Spawn ohne explizite `rng`) sä't jetzt pro Gegner aus
  (aiSeed, uid) statt einen pool-weiten Stream zu teilen. Explizite `rng` (Run-SeededRng der
  Spawner/BossSystem) behält weiterhin Vorrang — Vertrag aus `tests/enemy-ai-rng.test.ts` unangetastet.
- `src/scenes/Run.ts` (Fremdberührung, 2 Zeilen in `attachAiRng`, begründet unten): statt des
  gemeinsamen `this.aiRng` bekommt jeder Gegner seinen eigenen Stream aus (Run-Seed, UID);
  `resetAiState` zieht den Initialzustand aus diesem Stream.
- Anforderung notiert in `/home/ai/games/.dispatch/requests.md` (Datei war/ist nicht claimed;
  minimaler Eingriff wie bereits in Lane m10-ai-rng-seed praktiziert).

## K3 (#9797): tests/ai-cadence.test.ts

7 Tests, alle grün (`npx vitest run tests/ai-cadence.test.ts`):
- Kadenz-Unabhängigkeit: dt 1/60 vs 1/30, 40 Gegner (Seed 20261128, 20 s, per-uid-Streams) →
  **0 divergente UIDs** in der Ziehungswert-Folge; Kontrolle: gemeinsamer Stream divergiert
  weiterhin (alter Defekt gepinnt — greift der Fix zurück, schlägt dieser Test fehl).
- `EnemyAiRng.rekey` setzt die Stream-Position auf 0 (Recycle = neue Inkarnation, neuer UID-Stream).
- `attachEnemyAiStream` hält die Objekt-Identität (Pooling-Vertrag, kein Churn) und sä't in-place um.
- `resetAiState` baut den Initialzustand rein aus (Seed, UID) — bitgleicher timer/cooldown/orbitDir.
- Pool-Fallback: zwei Pools mit gleichem Seed liefern je UID bitgleiche Initial-KI-Zustände.

## K4 (#9798): Nachher-Probe + Verhaltens-Bilanz

**Nachher-Probe** (dieselbe Probe wie K1, `mode=peruid` — die Fix-Verdrahtung über
`enemyStreamSeed(SEED, uid)`): gleicher Seed 20261128, 120 Gegner, Kadenz 1/60 vs 1/30:

| Probe | Modus | Kadenz A/B | divergente UIDs | Akzeptanz |
|---|---|---|---|---|
| before (#9795) | shared (Ist) | 1/60 vs 1/30 | **40 / 120** | Divergenz belegt ✓ |
| after (#9798) | peruid (Fix) | 1/60 vs 1/30 | **0 / 120** | 0 KI-Divergenz ✓ |

Belege: `~/games/.evidence/m10-ai-stream-cadence-r2/m10-ai-cadence-{before,after}.json` (+ Probe-Skript).
Hinweis zur Metrik (vor der Messung festgelegt): „KI-Divergenz“ = UIDs mit unterschiedlicher
Ziehungswert-Folge (Entscheidungskette) zwischen den Kadenzen. Die Verhaltens-Marken (Positionen)
bleiben bei dt-Variante erwartbar unterschiedlich (Integrations-/Schrittgranularität) —
`behaviourMarksIdentical=false` in beiden Proben, bewusst NICHT Akzeptanzteil. Auf Spielebene
stellt der feste Substep die Bitgleichheit sicher (Nachweis oben: timeScale 30 vs 5 bitgleich).

**Balance-Korridor-Sanity** (`node scripts/balance.mjs`, 6 Läufe, 0 JS-Fehler;
Rohdaten `~/games/.evidence/m10-ai-stream-cadence-r2/balance-main.json` — im Worktree als
ungetrackte `shots/balance-main.json`):

| Char | Seed | Ergebnis | Minuten | Level | Kills | passedAll |
|---|---|---|---|---|---|---|
| mira | 101 | Tod | 22,0 | 31 | 2.411 | ja |
| kael | 101 | Sieg | 30,5 | 34 | 4.923 | ja |
| mira | 202 | Sieg | 30,5 | 36 | 6.226 | ja |
| kael | 202 | Sieg | 30,4 | 36 | 8.327 | nein (Boss-Dauern) |
| mira | 404 | Sieg | 30,4 | 36 | 5.385 | nein (Boss-Dauern) |
| kael | 404 | Sieg | 30,4 | 34 | 5.673 | nein (Boss-Dauern) |

4/6 im Korridor; Survival/Level/Evolution in ALLEN Läufen im Korridor, Drift nur bei Boss-Dauern —
**derselbe Drift-Typ wie in der dokumentierten Baseline** (m10-ai-rng-seed A/B: 4/6 bzw. 3/6,
ebenso Boss-Dauern/Level). Kein durch diese Lane neu eingeführter Balance-Drift; die Stream-Werte
der KI sind statistisch gleichverteilt wie zuvor (nur andere Ziehungskonstanten). Hinweis: der
Lauf schrieb standardmäßig die Tabelle in `docs/lanes/balance.md` (`--doc` wurde von parseArgs
nicht wie erwartet behandelt) — dort zurückgesetzt, Rohdaten liegen in .evidence.

**Gesamt:** `npm test` 157 Dateien / **1697 Tests grün**, `npm run build` grün, `npx tsc --noEmit` grün.

## Offene Punkte / Hinweise

- **Fremdberührung (begründet):** 2 Zeilen in `src/scenes/Run.ts` (`attachAiRng` + Import) — der
  gemeinsame Stream lebte dort; ohne diese Verdrahtung wäre der Fix nur im Fallback-Pfad wirksam.
  Anfrage in `/home/ai/games/.dispatch/requests.md` notiert; Datei war zum Arbeitszeitpunkt
  unclaimed (vgl. Praktik in Lane m10-ai-rng-seed, 1 Zeile Run.ts).
- `Run.ts` hält `this.aiRng` (Zeile ~272) weiterhin als totes Feld (jetzt ungenutzt); bewusst nicht
  entfernt, um die Fremdberührung minimal zu halten. Kann von einem späteren Run.ts-Besitzer
  aufgeräumt werden.
- `scripts/balance.mjs` `--doc=`-Arg wird von parseArgs offenbar nicht ausgewertet (Tabelle landete
  trotzdem in docs/lanes/balance.md) — Bedarfsmeldung an den Balance-Besitzer.
- Die Verhaltens-Marken der KI bleiben bei veränderlichem Substep-dt unterschiedlich (Integra­tion).
  Für volle Kadenz-Unabhängigkeit auf Trajektorienebene müssten Stagger-Intervalle zeitbasiert
  statt framebasiert gezählt werden — nicht Teil dieser Lane (kein Eingriff in Spawner-/Balance-
  Logik); auf Spielebene ist die Schrittfolge durch den festen Substep bereits determiniert.

