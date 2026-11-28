# Lane m10-verify-reacceptance-d — Vorab-Check "Nachabnahme D" (2026-11-28)

Basis: main nach merge-m10-run-determinism (`fe3ee61`). Nachabnahme C (`43fd9eb`) war nur an zwei
Punkten rot: verify-input 27/28 (ESC-Regression, seitdem esc-pause-fix gemergt) und Heap-Tor +21 %
(seitdem heap-budget HARD-Gate +11,0/+11,3 % PASS). Diese Lane prueft beide Punkte plus FPS-Tore
auf aktuellem Stand. **Nur Befundliste** — Dora schneidet Fix-Jobs daraus, kein Fix in dieser Lane.

Renderer-Pflicht (K1, Dom 19:20Z/21:15Z): SwiftShader-Belege ungueltig. Probe vor allen Laeufen,
siehe `shots/m10-reaccd-renderer.json`.

## Befundzeilen

| # | Kriterium | Tor | Ist | Urteil | Beleg | Renderer-String |
|---|---|---|---|---|---|---|
| K1 | Renderer-String-Pflicht vor jedem Lauf | kein SwiftShader/llvmpipe | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2), vendor Google Inc. (Intel), webgl2=true | **PASS** | `shots/m10-reaccd-renderer.json` | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) |
| K2 | verify-input vollstaendig inkl. ESC | 28/28, 0 JS-Fehler | **28/28 PASS**, 0 JS-Fehler; ESC-Pfad ausdruecklich OK: „ESC pausiert“ (paused=true, listeners=1) und „ESC setzt fort“ (paused=false) — Regression aus Nachabnahme C durch esc-pause-fix behoben | **PASS** | `shots/m10-reaccd-verify-input.json` (+ 12 Shots) | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) |
| K3 | Heap-Tor 30-min-Echtzeitlauf | HARD endMB−Minute1 ≤ +15 % (SOFT beobachten) | HARD **PASS**: Minute1 54,9 MB → endMB 60,8 MB (post-GC) = **+10,7 %** ≤ +15 %. SOFT-Beobachtung **FAIL**: max Fenster-Peak 77,7 MB = +41,5 % (Fenster 0–5; rohe Peaks ohne erzwungenes GC, GC-Sägezahn). 30 min Sim erreicht (simSeconds 1800,8), victory=false (Endboss in God/AutoPlay nicht beendet — Lauf endete am Sim-Ende), 0 JS-Fehler, 0 Crashes, FPS min 57,2 / median 60,5 | **PASS (HARD)** | `shots/m10-reaccd-heap.json` | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) — im Beleg selbst (Skript-Output) |
| K4 | FPS M25 780x360@3 / Burst 640x360 | ≥ 50 / ≥ 55, nur Vergleich zu Nachabnahme C | 780x360@3: M25 **60,0** FPS (worst frame 16,8 ms), Burst 60,1 — 640x360: Burst **60,0** FPS (worst frame 16,8 ms), M25 60,1 — 0 JS-Fehler; vs. Nachabnahme C (60,0/60,1): stabil, vsync-gecappt, kein Abfall | **PASS** | `shots/m10-reaccd-perf-780x360@3.json`, `shots/m10-reaccd-perf-640x360.json` | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) |

## Befunde für Dora (Fix-Jobs werden daraus geschnitten — kein Fix in dieser Lane)

| # | Befund | Severity | Beleg | Datei-/Hebel-Pointer | Erwarteter Gewinn |
|---|---|---|---|---|---|
| F1 | SOFT-Fenster-Peaks überschreiten Minute-1+25 %: 77,7 MB (Fenster 0–5min) bis 76,7 MB (25–30min), max +41,5 % vs. Minute-1 (54,9 MB). Kein monotone-Leak-Signal (HARD +10,7 % PASS, TimelineMinute 28–29 bei 55,8/55,9 MB platt) — rohe Peaks ohne erzwungenes GC = GC-Sägezahn/Akku-Verhalten zwischen Sammlungen. | NIEDRIG (Beobachtungswert, kein Tor) | `shots/m10-reaccd-heap.json` (`gate.windowPeaks`, `gate.softVerdict`) | Messdefinition: `scripts/m10-heap-budget-gate.mjs` (SOFT_PCT 25, Fenster 0 schließt Boot-Warmup ein); Allokationshebel: `src/logic/Pool.ts`/`EnemyPool.ts` (Per-Frame-Allokationen) | Klareres SOFT-Signal: Fenster 0 (Boot) ausnehmen oder glattes Minimum statt Max je Fenster; Spielgewinn 0 — nur Messrauschen reduzieren |
| F2 | victory=false im 30-min-Lauf bei simSeconds 1800,8 (Sim-Ende erreicht, truncated=true, resultReason=null): God/AutoPlay beendet den Endboss nicht zuverlässig, daher endet der Lauf am Zeitbudget statt mit Sieg-Szene. Beeinflusst das HARD-Tor nicht (endMB nach GC im Run-Ende gemessen), aber Sieg/Results-Pfad bleibt im Echtzeitlauf unbelegt. | NIEDRIG | `shots/m10-reaccd-heap.json` (`victory`, `truncated`, `simSeconds`) | `scripts/m10-heap-budget.mjs` (StartRun/God/AutoPlay-Setup), AutoPlay-Bot `src/logic/` (botDirection/Endboss-Pfad) | Echtzeit-Beleg des Sieg-Pfads (victory=true) ohne God-Mode oder mit Endboss-Override |

## Gesamturteil

**4/4 Befundzeilen im Tor: K1, K2, K3 (HARD), K4 = PASS.** Beide Nachabnahme-C-Rotpunkte sind auf
aktuellem main gruen: verify-input 28/28 (ESC-Regression behoben) und Heap-HARD-Tor +10,7 % ≤ +15 %.
FPS-Tore iGPU stabil (60,0/60,1 FPS, vsync-gecappt, vs. Nachabnahme C unverändert). Offen bleiben
zwei NIEDRIG-Beobachtungen (F1 SOFT-Fenster-Peaks, F2 victory=false im Echtzeitlauf) — siehe
Befunde für Dora.

## Methode

- Alle FPS-/Echtzeit-Laeufe unter `flock /home/ai/games/.lf-perf.lock` (K1 des Briefings, strenger
  als das Parallel-Lane-Minimum), verify-input ohne flock.
- Renderer-String je Beleg: eigener Probe-Lauf unmittelbar vor der Messserie, gleiche Chromium-Flags
  wie das Messskript; Heap-Beleg fuehrt den String im Skript-Output selbst (m10-heap-budget.mjs).
- Keine Code-Aenderung; Messskripte sind Werkzeuge (`scripts/verify-input.mjs --tag reaccd`,
  `scripts/perf.mjs --out`, `scripts/m10-heap-budget.mjs --out`), Renderer-Probe liegt in `~/tmp`.
