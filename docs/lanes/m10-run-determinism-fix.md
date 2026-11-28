# Lane m10-run-determinism-fix — Sim-Schrittführung deterministisch

**Auftrag:** Gleicher Seed + autoPlay muss denselben Lauf liefern. Before-Befund der Mess-Lane
`m10-run-determinism` (`shots/m10-run-det-verdict-before.json`, `deterministic: false`): erste
Divergenz ab Sim-Sekunde 1 in `elapsed`/`px`, danach alle 120 Marken (Seeds 101/202/404).

## Ergebnis (Kurz)

| Seed | Before (Mess-Lane) | After (diese Lane) |
|---|---|---|
| 101 | 120/120 Marken divergent (ab s=1, elapsed/px) | **IDENTISCH** — 120 Marken + Events + Final bitgleich |
| 202 | 120/120 divergent | divergierend ab **s=48** (kills/enemies); s=1–47 bitgleich |
| 404 | 120/120 divergent | **IDENTISCH** — 120 Marken + Events + Final bitgleich |

Verdict after: `shots/m10-run-det-verdict.json` (`deterministic: false`, weil Seed 202) —
**AK 1 ist zu 2/3 erfüllt; der Rest-Leak liegt in einer Fremd-Datei** (siehe „Offen“).

## Fix — vier Schichten, alle in `src/scenes/Run.ts` + Mess-Skript

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

**Mess-Skript** (`scripts/m10-run-determinism.mjs`, 2 Edit-Iterationen wie genehmigt):
(a) `?detstart=1` + `resumeRun()` im Flag-Eval; (b) `final` wird sim-exakt im simulate-Hook beim
Erreichen des Marken-Limits erfasst (vorher Wall-Clock-Snapshot — zwei bitgleiche Läufe
unterschieden sich nur im final-Stempel).

## Probe-Belege (Diagnose, `~/tmp/m10-run-determinism-fix/probe.mjs`, nicht committet)

- Start-Rennen: rep0 posX 20495500 vs rep1 20480000 nach Schritt 1 (leere Welt, Kills 0/0).
- KI-RNG: vor dem Fix Divergenz ab s=1 in px; nach dem Fix erster Diff s≈28–44.
- Kamera: Schritt 633 — RNG-Ziehungsstand bitgleich (sd=204, ad=54), Spieler bitgleich, aber
  Spawn-Position von Gegner 18 um ~8/21 px unterschiedlich.
- Nach allen vier Schichten: Seeds 101/404 in allen 120 Marken bitgleich; 202 ab s=48.

## Rest-Befund Seed 202 (konkret, belegt aus `shots/m10-run-det-202-r{0,1}.json`)

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
Spawn-Phase frame-abhängig. **Fremd-Datei** (Disponent-Claim liegt nicht bei dieser Lane) — der
Fix (dt-basierte Zuteilung) ist als Job **`m10-spawn-budget-dt`** vergeben (Bedarfsmeldung
`~/.dispatch/requests.md`, Eintrag 2026-11-28T03:1xZ; der Dispatcher hat den Zusammenhang
Spawn-Allowance ↔ Determinismus dort bereits vermerkt).

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
   sim-exakte Marken, lastunabhängig): 101 ✓ IDENTISCH, 202 ✗ ab s=48 (s.o.), 404 ✓ IDENTISCH —
   **teilweise erfüllt**, Rest hängt an `m10-spawn-budget-dt`. Before-Beleg:
   `shots/m10-run-det-verdict-before.json` (aus Mess-Lane 99b990c, hier gesichert/committet).
2. **Marken-JSONs + Guard-Test im selben Commit** wie der Fix: `tests/run-determinism.test.ts`
   assertet jetzt: 101/404 bitgleich (Marken+Events+Final), Marke s=1 bei ALLEN Seeds bitgleich
   (die ursprüngliche Tick-Phase-Divergenz ist fixiert), 202 erster Diff exakt s=48 in
   kills/enemies bei identischem px. Schlägt an, sobald auch 202 bitgleich ist → dann Verdict auf
   `deterministic: true` heben und Befund hier aktualisieren.
3. **Grün**: `npx tsc --noEmit` ✓, `npm test` **1307/1307** in 121 Dateien ✓, `npm run build` rc=0 ✓.
4. **Balance-Korridor unverändert** (`node scripts/balance.mjs --seeds 101 --characters kael`,
   autoPlay, timeScale 30, ohne flock; Beleg `shots/m10-run-det-balance-kael-101.json`):
   Kael/Seed 101 — **Sieg (dawn) bei 30,6 min**, Endlevel **37** (Korridor 25–40), **6/6 Bosse**
   besiegt (Dauern 28/40/38/41/31/32 s — Korridor 20–60 s), **6 Truhen**, 3 Evolutionen
   (wrath_pendulum, phoenix, eternal_winter), 0 JS-Fehler, kein Tod vor Minute 15.
   Level 37 vs. Referenz 27–30 (`shots/m10-balance-kael-final.json`): die deterministische
   Umstellung ändert die Trajektorie (KI-RNG aus Seed statt Math.random, Kamera-Anker, feste
   Schritte) — im Zielband, Ursache dokumentiert, nicht wegtunet.
5. **Doku** = dieses Dokument. `.lane-done` **nicht** gesetzt — siehe „Offen“.

## Offen / blocked

- **Seed 202 Rest-Diff s=48** → wartet auf **`m10-spawn-budget-dt`** (Fremd-Datei
  `src/systems/Spawner.ts`, Z. 106-108: `lastSpawnFrame`/`spawnAllowance`). Danach: Guard-Lauf
  wiederholen, Verdict `deterministic: true` erwarten, `tests/run-determinism.test.ts` erweitern
  (Markierung im Test), Befund hier auf 3/3 heben.
- Bekannte, bewusst NICHT angefasste frame-abhängige Mechanismen außerhalb des 120-s-Fensters
  (für spätere Lanes): Truhe-Autoöffnung/Boss-Tod-Ketten laufen über Phaser-delayedCall (Wall-Clock,
  aber sim-gepaust → erst ab Boss-Phasen relevant); `EnemyProjectilePool.launchBudgetPerFrame`
  (#7491) — vom Dispatcher als `m10-shot-budget-dt` vermerkt.
- Verhaltensänderungen, die Reviewer wissen sollten: Sim-Positionen quantisieren jetzt exakt auf
  20 Hz (visuell minimal stufenliger bei 1×; bei 30× identisch); Gegner-KI-Zufallswerte kommen aus
  einem Seed-abgeleiteten RNG (Verteilung identisch, Instanz-Trajektorie anders); Kamera folgt
  während der Sim exakt der Spielerposition (Rendering-Feed bleibt im Phaser-Lerp).
