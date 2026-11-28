# Lane m10-run-determinism-fix — Sim-Schrittführung deterministisch

**Auftrag:** Gleicher Seed + autoPlay muss denselben Lauf liefern. Before-Befund der Mess-Lane
`m10-run-determinism` (`shots/m10-run-det-verdict-before.json`, `deterministic: false`): erste
Divergenz ab Sim-Sekunde 1 in `elapsed`/`px`, danach alle 120 Marken (Seeds 101/202/404).

## Ergebnis (Kurz)

| Seed | Before (Mess-Lane) | After (diese Lane, Endstand) |
|---|---|---|
| 101 | 120/120 Marken divergent (ab s=1, elapsed/px) | **IDENTISCH** — 120 Marken + Events + Final bitgleich |
| 202 | 120/120 divergent | **IDENTISCH** — 120 Marken + Events + Final bitgleich |
| 404 | 120/120 divergent | **IDENTISCH** — 120 Marken + Events + Final bitgleich |

Verdict after: `shots/m10-run-det-verdict.json` → **`deterministic: true`** (3/3 Seeds, 0
divergierende Marken, 0 JS-Fehler). Before-Beleg: `shots/m10-run-det-verdict-before.json`
(`deterministic: false`, 120/120 divergent je Seed). **AK 1 voll erfüllt.**

Zwischenstand (erster Lauf, committet d81019c): 101/404 bitgleich, 202 divergierte ab s=48 in
kills/enemies — Rest-Leak war die frame-basierte Spawn-Allowance in `src/systems/Spawner.ts`.
Der vergebene Fremd-Job **`m10-spawn-budget-dt`** ist seitdem auf main gemerged (6728485);
dieser Fix wurde hier aus main übernommen (Commit d3c17f3) und der Guard-Lauf wiederholt →
auch Seed 202 jetzt bitgleich.

## Fix — fünf Schichten: vier in `src/scenes/Run.ts` + Mess-Skript, eine aus main (`Spawner.ts`)

1. **Carry-over statt Partial-Schritt** (`Run.update`): `scaledDt` geht in `simCarry`; nur volle
   `SIM_MAX_STEP`-Einheiten (1/20 s) werden simuliert, der Rest bleibt für den nächsten Frame.
   Vorher: variabler Partial-Schritt (`dt = min(SIM_MAX_STEP, remaining)`) → die Phase aller
   Tick-Zyklen (Waffen-Cooldowns, Spawn-Timer, Regen) war frame-abhängig. Bound: realDt ≤ 0,05 s,
   timeScale ≤ 60 → simCarry ≤ 3,05 s, kein separates Cap nötig.
2. **KI-RNG aus dem Run-Seed** (`attachAiRng`, abgeleitet `mulberry32(seed ^ 0x9e3779b9 + c)`): der
   EnemyPool-Fallback `DEFAULT_AI_RNG = Math.random()` (EnemyPool.ts:125, fremde Datei) machte
   Blink-Winkel/Timer/orbitDir zufällig. Bewusst ein EIGENER RNG (nicht das Run-RNG), damit
   Kampf-/Spawn-Ziehungen unverändert bleiben. Angewendet auf Director-Spawns, Splitter-Kinder und
   Beschwörungen.
3. **Start-Gate `?detstart=1`**: Run startet pausiert (Zeile bewusst NACH dem Reset-Block — die
   erste Fassung stand davor und wurde von `paused = false` überschrieben). Das Harness setzt
   Trace/autoPlay/timeScale, bevor Schritt 1 läuft, und ruft `resumeRun()`. Probe-Beleg ohne Gate:
   rep0 hatte autoPlay in Schritt 1, rep1 erst in Schritt 2 → px-Differenz 1,55 px nach 1 s.
4. **Kamera-Anker pro Sim-Schritt** (in `simulate`, aus `posX/posY`): `Spawner.spawnOne` positioniert
   Spawns relativ zum Kamera-Zentrum (`cam.scrollX + width/2`) und entscheidet `outsideView()` damit;
   der Lerp-Follow (0,18) glättete `scrollX` pro Echtzeit-Frame → Spawn-Positionen frame-abhängig.
   Probe-Beleg: Spawn bei bitgleichem RNG-Ziehungsstand um ~1 px unterschiedlich (Gegner uid 15,
   Schritt 475); Kamerazentrum 8/23 px auseinander bei identischem Spieler.
5. **Spawn-Allowance auf dt-Akkumulator** (`src/systems/Spawner.ts`, aus main übernommen — Job
   `m10-spawn-budget-dt`, Merge 6728485): `accrueSpawnAllowance(acc, dt)` wächst mit SIM-Zeit
   (480 Spawns je Sim-Sekunde = altes 60-Hz-Verhalten, ganzzahliger Abgriff, Rest-Carry,
   Deckel `SPAWN_ALLOWANCE_MAX`). Vorher: `SPAWN_FRAME_BUDGET = 8` wurde pro *Echtzeit-Frame*
   über `game.loop.frame` zurückgesetzt → Spawn-Phase frame-abhängig (Rest-Diff Seed 202 ab s=48).

**Mess-Skript** (`scripts/m10-run-determinism.mjs`, 2 Edit-Iterationen wie genehmigt):
(a) `?detstart=1` + `resumeRun()` im Flag-Eval; (b) `final` wird sim-exakt im simulate-Hook beim
Erreichen des Marken-Limits erfasst (vorher Wall-Clock-Snapshot — zwei bitgleiche Läufe
unterschieden sich nur im final-Stempel).

## Probe-Belege (Diagnose, `~/tmp/m10-run-determinism-fix/probe.mjs`, nicht committet)

- Start-Rennen: rep0 posX 20495500 vs rep1 20480000 nach Schritt 1 (leere Welt, Kills 0/0).
- KI-RNG: vor dem Fix Divergenz ab s=1 in px; nach dem Fix erster Diff s≈28–44.
- Kamera: Schritt 633 — RNG-Ziehungsstand bitgleich (sd=204, ad=54), Spieler bitgleich, aber
  Spawn-Position von Gegner 18 um ~8/21 px unterschiedlich.
- Nach allen vier Schichten: Seeds 101/404 in allen 120 Marken bitgleich; 202 ab s=48
  (→ siehe „Rest-Befund“; geschlossen durch Schicht 5).

## Rest-Befund Seed 202 (Zwischenstand, geschlossen — Beleg aus `shots/m10-run-det-202-r{0,1}.json`)

```
s=47: r0 kills 22, enemies 3, xp 9, px 21651341 | r1 identisch (bitgleich)
s=48: r0 kills 24, enemies 4 | r1 kills 23, enemies 3  ← erster Diff; px IDENTISCH (21085350)
s=49: px 20503852 vs 20503854 (2 e-4 px); level 4 beide, xp 3 beide
s=50+: px-/xp-Drift (Gegner-Subzustand), level/kills laufen auseinander
```

Muster: **Spawn-Zahlungsebene** — ein Spawn mehr/weniger bzw. verschobene Spawn-Position bei
bitgleichem Spieler und bitgleichem RNG-Ziehungsstand. Ursache: die **frame-basierte Spawn-Allowance
in `src/systems/Spawner.ts`** (`SPAWN_FRAME_BUDGET = 8` wird pro *Echtzeit-Frame* über
`game.loop.frame` zurückgesetzt, Spawner.ts:106-108): bei 30× laufen 10–30 Sim-Schritte pro Frame;
bei rauen Frame-Zeiten (geteilter Host) bindet der Deckel intermittierend und verschiebt die
Spawn-Phase frame-abhängig. **Fremd-Datei** (Disponent-Claim lag nicht bei dieser Lane) — der
Fix (dt-basierte Zuteilung) war als Job **`m10-spawn-budget-dt`** vergeben (Bedarfsmeldung
`~/.dispatch/requests.md`, Eintrag 2026-11-28T03:1xZ) und ist inzwischen auf main gemerged
(6728485); hier übernommen (Commit d3c17f3), Guard-Lauf danach: 202 bitgleich.

Nicht die Ursache (geprüft/ausgeschlossen):
- FrameBudget-Regler (scaling.ts): greift nur bei Deckel < 320 → `floorRatio = 1` → ratio bleibt
  1 → im gesamten 120-s-Fenster ein No-Op.
- `maybeOpenLevelUp`: wird jetzt PRO Schritt geprüft (vorher Frame-Ende → frame-abhängiger
  Öffnungspunkt); UI-AutoPick (0,35 s Echtzeit) friert die Sim — sim-neutral.
- Evolution-Zeitlupe: Ende jetzt an Sim-Zeit gekoppelt (`slowmoUntil = elapsed + 0,405`), Mittelwert
  unverändert (0,9 s Wandzeit bei timeScale 0,45).
- x/y-Float-Drift: elapsed = k·0,05 exakt; Marken bei s exakt.

## Abnahmekriterien

1. **Determinismus-Messlauf** (`node scripts/m10-run-determinism.mjs --seconds=120`, ohne flock —
   sim-exakte Marken, lastunabhängig): **101 ✓, 202 ✓, 404 ✓ — alle drei Seeds IDENTISCH über
   120 Marken + Events + Final**, Urteil `deterministic: true`, 0 JS-Fehler.
   Before-Beleg: `shots/m10-run-det-verdict-before.json` (aus Mess-Lane 99b990c, gesichert/committet).
2. **Marken-JSONs + Guard-Test im selben Commit** wie der Fix: `tests/run-determinism.test.ts`
   assertet jetzt: `deterministic: true` + je Seed `identical: true, divergingMarks: 0`,
   alle 3 Seeds bitgleich (Marken+Events+Final), Marke s=1 bei ALLEN Seeds bitgleich,
   und Seed 202 bleibt bitgleich (ehemaliger Rest-Leak als eigene Schranke). **7/7 grün.**
3. **Grün**: `npx tsc --noEmit` ✓, `npm test` **1317/1317** in 122 Dateien ✓, `npm run build` rc=0 ✓.
4. **Balance-Korridor unverändert** (`node scripts/balance.mjs --seeds 101 --characters kael`,
   autoPlay, timeScale 30, ohne flock; Beleg `shots/m10-run-det-balance-kael-101.json`,
   **nach dem Spawner-Dt-Fix neu gemessen**):
   Kael/Seed 101 — **Sieg (dawn) bei 30,6 min**, Endlevel **40** (Korridor 25–40, obere Grenze),
   18254 Kills, **6/6 Bosse besiegt** (Dauern 33/48/44/36/40/34 s — Korridor 20–60 s,
   `bossDurationsInCorridor: true`), 3 Evolutionen (wrath_pendulum, thunder_seal, soul_beacon),
   `passedAll: true`, `allRunsPass: true`, 0 JS-Fehler, kein Tod vor Minute 15.
   Level 40 vs. Referenz 27–30 (`shots/m10-balance-kael-final.json`) und vs. 37 (Erst-Messung
   d81019c): die deterministische Umstellung + Spawner-Dt-Fix ändern die Trajektorie (KI-RNG aus
   Seed statt Math.random, Kamera-Anker, feste Schritte, simzeit-basierte Spawn-Allowance) —
   im Zielband (25–40 inklusive), Ursache dokumentiert, nicht wegtunet.
5. **Doku** = dieses Dokument. `.lane-done` committet (alle Karten done).

## Offen / Erledigt

- ~~Seed 202 Rest-Diff s=48~~ — **erledigt**: `m10-spawn-budget-dt` ist auf main gemerged
  (6728485), Fix hier übernommen (d3c17f3), Guard-Lauf: alle 3 Seeds bitgleich,
  `deterministic: true` (siehe AK 1–3).
- Bekannte, bewusst NICHT angefasste frame-abhängige Mechanismen außerhalb des 120-s-Fensters
  (für spätere Lanes): Truhe-Autoöffnung/Boss-Tod-Ketten laufen über Phaser-delayedCall (Wall-Clock,
  aber sim-gepaust → erst ab Boss-Phasen relevant); `EnemyProjectilePool.launchBudgetPerFrame`
  (#7491) — vom Dispatcher als `m10-shot-budget-dt` vermerkt.
- Verhaltensänderungen, die Reviewer wissen sollten: Sim-Positionen quantisieren jetzt exakt auf
  20 Hz (visuell minimal stufenliger bei 1×; bei 30× identisch); Gegner-KI-Zufallswerte kommen aus
  einem Seed-abgeleiteten RNG (Verteilung identisch, Instanz-Trajektorie anders); Kamera folgt
  während der Sim exakt der Spielerposition (Rendering-Feed bleibt im Phaser-Lerp).
