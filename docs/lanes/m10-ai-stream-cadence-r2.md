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

## Offene Punkte / Hinweise

- (wird pro Karte ergänzt)
