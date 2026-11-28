# Lane m10-autoplay-victory-path — Fix-Job F2 (Nachabnahme D)

Basis: main `04a0d2d` (Worktree-Branch `m10-autoplay-victory-path`). Fix-Job aus Befund F2 der
Nachabnahme D (`docs/lanes/m10-reacceptance-d.md`, Lauf `shots/m10-reaccd-heap.json`): Im 30-Min-
Echtzeit-Heap-Lauf (`scripts/m10-heap-budget.mjs`, God/AutoPlay, timeScale 1) endet der Lauf am
Zeitbudget (`victory=false, truncated=true, simSeconds 1800,8`) statt mit Sieg — der Sieg-/Results-Pfad
bleibt im Echtzeitlauf unbelegt. Kein Abnahme-Blocker (Sieg via m3-fullrun auf timeScale 30 belegt),
aber der Echtzeit-Beleg fehlt. `src/scenes/Run.ts` ist ausgenommen (Konflikt mit Lane
m10-run-determinism-fix); Hebel nur im Harness-Skript oder in `src/logic/autoplay.ts`.

Renderer-Pflicht: iGPU-String im JSON des Laufs selbst (`m10-heap-budget.mjs` schreibt `renderer`);
SwiftShader ungueltig. Flock: `flock /home/ai/games/.lf-perf.lock` (Echtzeitlauf K3).

## K1 — Wurzel: Der Endboss stirbt im Echtzeitlauf, weil der Harness ihn nie Kampfzeit gibt — **PASS**

**Urteil: Harness-Truncation, nicht Bot-Versagen.** Belege:

1. **Endboss spawnt exakt bei 30:00:** `src/logic/scaling.ts:168/179` — `FINAL_BOSS_AT = 30 * 60` =
   1800 s; Spawn in `src/scenes/Run.ts:650`
   (`if (!this.bossFlags[5] && !this.dawn && this.elapsed >= FINAL_BOSS_AT) this.spawnBossAt(5)`).
2. **Harness bricht im selben Moment ab:** `scripts/m10-heap-budget.mjs:170` —
   `if (s.time >= RUN_SECONDS) { truncated = true; break; }` mit `RUN_SECONDS = MINUTES * 60 = 1800`.
   Der Baselinelauf (`shots/m10-reaccd-heap.json`) pollte bei simSeconds 1800,8 → trunciert 0,8 s nach
   dem Endboss-Spawn. Der Endboss (HP 15000, `src/data/bosses.ts`, 3 Phasen) hatte keine Sekunde
   Kampfzeit — victory=false war im Setup garantiert, unabhaengig vom Bot.
3. **Bot beendet den Endboss zuverlaessig im Echtzeit-Kampf — Probe** (God/AutoPlay, seed 99, wie
   m3-fullrun; timeScale 30 bis 30:00, danach timeScale 1, Poll bis Results):
   `victory=true, resultReason="dawn"`, 0 JS-Fehler, Kampf + Daemmerung ≈ 40 s Echtzeit
   (Probe: `/home/ai/tmp/m10-autoplay-victory-path/probe-endboss.mjs`, log im Commit).
   Damit sind die Briefing-Hypothesen „Bot weicht aus?“/„God-Modus greift am Endboss nicht?“
   widerlegt; „Zeitbudget vs. Boss-HPS“ trifft es: das Zeitbudget endete VOR dem Kampf.
4. `botDirection` (`src/logic/autoplay.ts:216-234`) folgt aktivem Boss (Ranged: >260 px heran,
   <120 px zurueckweichen) — kein Ausweichpfad-Defekt; identisches God/AutoPlay-Setup siegt in
   m3-fullrun (`scripts/fullrun.mjs:40-41`, dort schaltet es bei sim 1760 auf Echtzeit und laeuft
   bis Sieg).

**Hebelwahl (K2, Begruendung):** Lever (b) — Harness-Fix in `scripts/m10-heap-budget.mjs`. Der Bot
ist im Endboss-Kampf nicht defekt (Probe 4/victory=true); ein autoplay.ts-Eingriff (Lever a) wuerde
Spielverhalten-Risiko (God/AutoPlay-Pfad vs. normales Spiel trennen) ohne jeden Gewinn einfuehren.
Fix: nach `RUN_SECONDS` den Endboss-Kampf aussitzen — bis zu 600 s Sim-Verlaengerung auf Sieg warten,
erst danach `truncated=true` (ehrlicher Fallback, falls der Kampf doch mal schiefgeht).

## K2 — Fix im Harness — (Ergebnis nach Commit)

## K3 — Nachher: 30-min-Echtzeitlauf — (Ergebnis nach Commit)

## Gesamturteil

(K3 nachtraeglich)
