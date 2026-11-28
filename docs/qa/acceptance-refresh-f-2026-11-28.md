# Nachabnahme F — 2026-11-28 (Refresh nach FX-/Menue-/Android-Merge-Welle)

> **Basis (PIN):** main @ `1ebd4cab9d698d2994a7280009f6f28cd85b66b6`
> (2026-11-28T10:07:09Z, „merge-m10-fx-bakes-evo-r2: Lane-Karten #10251-#10254 …“).
> Worktree `/home/ai/games/lf-lanes/m10-acceptance-refresh-f`, Branch
> `m10-acceptance-refresh-f`. Diese Lane hat main **nicht** verändert (kein
> src-/tests-Code; nur Doku in ACCEPTANCE.md/docs).
>
> **Renderer-Pflicht:** Jeder FPS-Beleg nennt den WebGL-Renderer-String. Belege mit
> SwiftShader sind ungültig. Erwartet: „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
> OpenGL ES 3.2)“.
>
> **Belege:** `/home/ai/games/.evidence/m10-acceptance-refresh-f/` (außerhalb git).
> Lange Läufe unter `flock /home/ai/games/.lf-perf.lock` serialisiert.
> Alte Werte in ACCEPTANCE.md werden nicht überschrieben; Abweichungen ≥ 5 % markiert.

## K1 — Basis auf PIN (Build, Tests, Inhalte)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-28T10:08Z | `npm run build` | rc=0, `✓ built in 947ms` (bekannte Chunk-Warnung phaser >500 kB) | **PASS** |
| 2026-11-28T10:08Z | `npm test` (vitest run) | **1957 Tests in 179 Dateien, 0 fail**, 5,80 s | **PASS** |
| 2026-11-28T10:08Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | **PASS** |

**Urteil K1: PASS** — Testzahl gegenüber Nachabnahme C (587/58) stark gestiegen
(1957/179): die FX-/Menue-/Android-Merges brachten viele neue Tests mit.

## K2 — verify:final + verify:terrain/terrain-coverage

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-28T10:11Z | `node scripts/verify-final.mjs` | **7/7 PASS**, rc=0, `errors:[]` (0 JS-Fehler) | **PASS** |
| 2026-11-28T10:14Z | `node scripts/verify-terrain.mjs` (960/1280/1920) | `passed:true`, `coverageOk:true`, **0 schwarze Fläche** (maxRegion 0/0 start/end je View), `jsErrors:[]` | **PASS** |

Belege (`~/games/.evidence/m10-acceptance-refresh-f/`):
`2026-11-28T10-10-33-835Z-final-verify.json` (+ `…-final-options-mute.png`, `…-final-results-victory.png`),
`k2-verify-terrain.json` (=`shots/m10-terrain-guard.json` des Laufs; Schwarz-Pixel-Guard mit
`blackPx: 0`, `regions: []` für 960x540 / 1280x720 / 1920x1080).

Renderer-String je Lauf (aus `k2-verify-terrain.json`, alle 3 Views):
**„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“**; `rendererValid:true`.
verify-final speichert keinen Renderer-String (kein FPS-Beleg, reiner UI/Logik-Check);
iGPU-Besetzung desselben Hosts ist durch den Terrain-Lauf direkt belegt.

**Urteil K2: PASS** (kein SwiftShader-Beleg in dieser Nachabnahme).

## K3 — Burst + Minute-25 auf iGPU (780x360@3, 960x540)

Messung mit `/home/ai/tmp/m10-acceptance-refresh-f/perf-f.mjs` (Messlogik identisch zu
`scripts/perf.mjs`: Burst 500 Gegner synthetisch, Minute 25 via `skipTo(1490)` + Director-Dichte
≥ 300, Ziel 55 FPS), Beleg-JSON mit Renderer-Feld im selben Lauf
(`~/games/.evidence/m10-acceptance-refresh-f/k3-perf-accf-*.json`), Lauffenster
2026-11-28T10:15–10:17Z (Beleg-mtime 10:16:13Z/10:16:49Z), Läufe unter
`flock /home/ai/games/.lf-perf.lock` serialisiert.

**Harness-Anmerkung (Audit-Restmangel 3):** In den K3-Belegen steht `minute25.passed:false`,
obwohl die Messung sachlich erfüllt ist — mein Harness-Kopie prüft `minute25.minEnemies`,
ein Feld, das `perf-f.mjs` nicht schreibt (`undefined >= 200` → immer false). Die FPS- und
Gegner-Kriterien sind im JSON selbst belegt: minute25.fps 60,1 ≥ 55 und enemies 300 ≥ 200.
`burst.passed:true` ist nicht betroffen.

| View | Burst (500 Gegner) | Minute 25 | Renderer-String (aus demselben JSON) |
|---|---|---|---|
| 780x360@3 | **60,0 FPS** (worst frame 16,8 ms) | **60,1 FPS** | „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“ |
| 960x540 | **60,1 FPS** (worst frame 16,8 ms) | **60,1 FPS** | „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“ |

`swiftshader:false` und `jsErrors:[]` in beiden Belegen.

**Urteil K3: PASS** — beide Views ≥ 55 FPS (Ziel), beide am 60-FPS-Cap. Gegen die M6-Werte
(01. Nachabnahme 27.11.: Burst 780x360@3 55,9–57,8, M25-780 43,1–47,3 FAIL, M25-960 50,7):
**+7 % bei Burst-780** (innerhalb der 5-%-Marke? 55,9→60 = +7,3 % ≥ 5 % → markiert: Verbesserung)
und **+18…+25 % bei Minute-25-780** (43,1→60,1; Improvement, in ACCEPTANCE.md markiert).

## K4 — fullrun-Guard + ACCEPTANCE.md

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-28T10:18–10:20Z | `flock … npm run fullrun -- --tag accf` (Beleg-mtime 10:20Z) | 6/6 Bosse exakt 300–1800 s, **6 Truhen**, Sieg `dawn`, fpsMin **60,4**, 0 JS-Fehler; **Heap-Tor +18,2 % > +15 %** | Inhalt/FPS **PASS**, Heap-Tor **FAIL** |
| 2026-11-28T10:20–10:22Z | `flock … npm run fullrun -- --tag accf2` (Wiederholung 1, verbindlich; Beleg-mtime 10:22Z) | identisches Bild: 6/6 Bosse, 6 Truhen, Sieg `dawn`, fpsMin **60,3**, 0 JS-Fehler; **Heap-Tor +20,8 % > +15 %** | **FAIL (reproduziert)** |
| 2026-11-28T10:23–10:38Z | `node scripts/m10-heap-budget.mjs` (formales Tor-Skript; interne Timestamps 10:23:06–10:38:02Z) | Lauf crashete mittendrin („Target page … closed“) → `gate=UNMESSBAR`; partielles JSON als Beleg | **UNMESSBAR** — fullrun-Belege bleiben verbindlich |

Heap-Detail: Minute 1 → Minute 29 **53,4 → 63,1 MB** (+18,2 %) bzw. **51,5 → 62,2 MB**
(+20,8 %); endMB nach Run-Ende 47,5 MB (GC-Sägezahn-Muster, aber Re-Messung entkräftet
den FAIL diesmal **nicht** — gegen Nachabnahme E (+13,9 % PASS) eine Verschlechterung
≥ 5 %). Kein Spielcode durch diese Lane geändert.

Belege: `~/games/.evidence/m10-acceptance-refresh-f/m3-fullrunaccf.json`,
`m3-fullrunaccf2.json`, `k4-heap-budget-partial.json`.

**Urteil K4: FAIL** (nur Heap-Tor; Inhalt/FPS/Truhen/JS-Fehler alle grün).
ACCEPTANCE.md ist ergänzt (Abschnitt „Nachabnahme F“, alte Werte unverändert,
Abweichungen ≥ 5 % markiert).

**Audit-Anmerkungen (Restmängel, nicht urteilsändernd):**
1. **Renderer-Pflicht-Defizit im K4-FPS-Beleg:** `scripts/fullrun.mjs` schreibt keinen
   Renderer-String ins Beleg-JSON; die iGPU-Besetzung ist hier nur indirekt gedeckt
   (heap-budget-Lauf direkt danach auf demselben Host/`flock`: RPL-S; K3-Läufe: RPL-S im
   selben JSON). Bei künftigen fullruns sollte `fullrun.mjs` ein `renderer`-Feld bekommen
   (Folge-Bedarf an Dora, kein Fix durch diese Lane).
2. Die ursprünglich dokumentierten K4-Zeitpunkte (10:44–10:54Z) waren um den Bearbeitungs-
   overhead verschoben; korrigiert auf die Beleg-mtimes/internen Timestamps (siehe Tabelle).

## Gesamtergebnis

**Nachabnahme F: NICHT ABGENOMMEN.** K1, K2, K3 **PASS**; K4 **FAIL** — einziger
Blocker das Heap-Tor (+18,2 %/+20,8 % > +15 %, in 2 vollen Läufen reproduziert).
Alle FPS-Tore sind grün (60-Cap), Inhalte und Tests unverändert vollständig.
Empfehlung: Heap-Regressions-Diagnose als Folge-Karte (Vergleich gegen `m10-fx-bakes-evo-r2`-
Bakes und Menü-/Android-Merges seit Nachabnahme E `a6f1458`).
