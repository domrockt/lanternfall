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
| K3 | Heap-Tor 30-min-Echtzeitlauf | HARD endMB−Minute1 ≤ +15 % (SOFT beobachten) | — | — | `shots/m10-reaccd-heap.json` | — |
| K4 | FPS M25 780x360@3 / Burst 640x360 | ≥ 50 / ≥ 55, nur Vergleich zu Nachabnahme C | 780x360@3: M25 **60,0** FPS (worst frame 16,8 ms), Burst 60,1 — 640x360: Burst **60,0** FPS (worst frame 16,8 ms), M25 60,1 — 0 JS-Fehler; vs. Nachabnahme C (60,0/60,1): stabil, vsync-gecappt, kein Abfall | **PASS** | `shots/m10-reaccd-perf-780x360@3.json`, `shots/m10-reaccd-perf-640x360.json` | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) |

## Methode

- Alle FPS-/Echtzeit-Laeufe unter `flock /home/ai/games/.lf-perf.lock` (K1 des Briefings, strenger
  als das Parallel-Lane-Minimum), verify-input ohne flock.
- Renderer-String je Beleg: eigener Probe-Lauf unmittelbar vor der Messserie, gleiche Chromium-Flags
  wie das Messskript; Heap-Beleg fuehrt den String im Skript-Output selbst (m10-heap-budget.mjs).
- Keine Code-Aenderung; Messskripte sind Werkzeuge (`scripts/verify-input.mjs --tag reaccd`,
  `scripts/perf.mjs --out`, `scripts/m10-heap-budget.mjs --out`), Renderer-Probe liegt in `~/tmp`.
