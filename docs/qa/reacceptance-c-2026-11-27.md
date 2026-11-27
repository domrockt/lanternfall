# Nachabnahme C — 2026-11-27 (3. Re-Abnahme: Drain-Welle)

> ## PIN (gesperrter Prüfstand)
> **PIN = `43fd9eb7ef8ddb8a03fa26b66c62acd31a907dea`**
> (`git rev-parse main` am 2026-11-27T20:29:24Z — main-HEAD „Board: Lane-Karten #2679 #2678
> …“). Alle Prüfungen laufen auf diesem Commit (Worktree
> `/home/ai/games/lf-lanes/m10-reacceptance-c`, Branch `m10-reacceptance-c`).
> Diese Lane hat main **nicht** verändert (keine Commits, keine Merges, kein Spielcode/Tests).
>
> Auftrag: Nachabnahme 3 nach der Merge-Drain-Welle. Das Briefing nannte 11 Lane-Merges
> ohne Abnahme-Beleg (Nachtrag 20:04Z: + m10-separation-budget = 12); zum Startzeitpunkt
> (PIN 43fd9eb) waren es **19** — der Drain lief nach Briefing-Erstellung weiter. Alle 19
> sind in `docs/lanes/m10-reacceptance-c.md` (Zuordnungstabelle) einem Kriterium/Beleg
> zugeordnet, damit kein Fix ohne Beleg bleibt.
>
> **Renderer-Pflicht (Wunsch Dom 19:20Z):** Jeder FPS-Beleg nennt den WebGL-Renderer-String.
> Belege mit SwiftShader sind ungültig und werden nur als Vorher-Vergleich geführt
> (iGPU aktiv seit 19:13Z).

## K1 — Basis auf PIN (tsc, Tests, Inhalte, Build)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-27T20:32Z | `npx tsc --noEmit` | rc=0, keine Fehler | **PASS** |
| 2026-11-27T20:33Z | `npm test` (vitest run) | **587 Tests in 58 Dateien, 0 fail**, 1,82 s | **PASS** |
| 2026-11-27T20:32Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | **PASS** |
| 2026-11-27T20:34Z | `npm run build` | rc=0, `✓ built in 413ms`, bekannte Chunk-Warnung >500 kB | **PASS** |

**Urteil K1: PASS** (gegenüber Nachabnahme B: 446→587 Tests, 42→58 Dateien — 19 Lane-Merges
brachten u. a. death-frames, fx-add-cap, evo-signature-calls, passive-stack,
separation-budget, view-width, chest-arrow, enemy-run-frames Tests mit).

## K2 — Renderer-Probe (iGPU-Nachweis)

`shots/qa-reaccc-renderer.json` (2026-11-27T20:34:59Z, frisch auf PIN):

| Feld | Wert |
|---|---|
| renderer | **„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“** |
| vendor | „Google Inc. (Intel)“ |
| powerPreference | high-performance |
| fps | target 60, cappedAt60 (erwartetes 60-FPS-Cap) |

**Urteil K2: PASS** — exakt der erwartete iGPU-String. Kein Beleg dieser Nachabnahme
nutzt SwiftShader.

## K3 — verify:final

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 20:35–20:45Z | `node scripts/verify-final.mjs` | **7/7 PASS**, rc=0, 0 JS-Fehler | **PASS** |

Belege: `shots/qa-reaccc-final-verify.json`, `shots/qa-reaccc-final-options-mute.png`,
`shots/qa-reaccc-final-results-victory.png`.

## K4 — verify-input (Touch/Gamepad/Tastatur)

Erster Lauf (20:41Z, parallel zur Probe-Kette auf demselben Host): **27/28**,
FAIL „Tastatur: ESC setzt fort“ (`{"paused":true,"keys":["Escape"],"listeners":1,
"optionsVisible":false}`), rc=1 — Beleg `shots/qa-reaccc-verify-input.json` (Lauf 1).

**Re-Run (20:52Z) ohne parallele GPU-Last:** erneut **27/28**, derselbe Check FAIL mit
dieselben Details (`paused:true, keys:["Escape"], listeners:1, optionsVisible:false`) —
Beleg `shots/qa-reaccc-verify-input-run2.json`. Der Befund ist damit **stabil
reproduzierbar** und kein Last-Artefakt: ESC beendet den Pause-Zustand auf dem PIN nicht.

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 20:41Z | `node scripts/verify-input.mjs --tag qa-reaccc` | **27/28**, 1 FAIL (Tastatur: ESC setzt fort) | **FAIL** |
| 20:52Z | `node scripts/verify-input.mjs --tag qa-reaccc2` (Re-Run, ruhiger Host) | **27/28**, derselbe FAIL | **FAIL (reproduziert)** |

**Urteil K4: FAIL** — Abnahme misst, sie repariert nicht: Der Befund geht als Folge-Karte
(`m10-reacceptance-c-Folge: verify-input FAIL „Tastatur: ESC setzt fort“`, Board backlog)
an den Lead. Letzter bekannter 28/28-Stand war die erste Nachabnahme (13:43Z, main
@ `38c21c4`); alle 19 Merges des Drains liegen danach. Kriterium „verify-input 28/28“
auf dem PIN: **nicht erfüllt (27/28, 1 stabiler FAIL)**.

## K5 — Visuelle Belege der geänderten Bereiche (Neuläufe auf PIN)

| Bereich | Skript | Belege |
|---|---|---|
| Hazard-Warnung (Fairness, MIN_WARN_S 0,45) | `scripts/m10-hazard-fairness.mjs` | `shots/qa-reaccc-hazard-fairness.json` + `-warnframe.png` |
| Results-Screen (Overlap, 640 + 780@3, stress12) | `scripts/m10-results-overlap.mjs --tag qa-reaccc` | `shots/qa-reaccc-results-overlap-*.png` + `.json` |
| Chest-Arrow (Randpfeil ab Spawn) | `scripts/m10-chest-arrow.mjs --out shots/qa-reaccc-chest-arrow.json --shots` | `shots/qa-reaccc-chest-arrow.json` + `-edge/-inside.png` — **Befund siehe K5b** |
| Android-Audit-Zahlen | `scripts/android-audit.mjs` | `shots/qa-reaccc-android-audit.json`, Log `~/tmp/m10-reacceptance-c/android-audit.txt` |
| Renderer | Probe | `shots/qa-reaccc-renderer.json` |
| Passive-Math | Zieldatei auf PIN | `shots/m10-passive-math-caps.json` (22 checks, 0 violations) + `tests/passive-stack.test.ts` grün |
| Boss-Onscreen | Zieldateien auf PIN | `shots/m10-boss-onscreen-after.json` + 12 Spawn-Shots `shots/m10-boss-onscreen-shots/` |
| Enemy-Frame-Cadence / Death-Frames / FX-ADD / Evo-Signatur / View-Width / Separation / Heap-Margin | Unit-Zielläufe | 72/72 grün (`tests/{enemy-run-frames,death-frames,fx-add-cap,evo-signature-calls,view-width,separation-budget,passive-stack,chest-arrow,heap-margin}.test.ts`-Batch) |

## K5b — Chest-Arrow Re-Lauf auf PIN: Abweichung gegen den Lane-Nachher-Lauf

Neu auf PIN (20:47Z, iGPU, `shots/qa-reaccc-chest-arrow.json`, verdict `passed:false`,
0 JS-Fehler):

| Format | Lane nachher (17:52Z, Beleg `shots/m10-chest-arrow-after.json`) | Re-Lauf auf PIN | Urteil |
|---|---|---|---|
| 780×360 | alle 10 Cases ok | alle 10 Cases ok | PASS |
| 640×360 | alle 10 Cases ok | **5/10 FAIL**: `top`, `bottom`, `tl`, `br` (`visibleAtSpawn:false`, Winkelfehler 90–180°, Positionsfehler 312–355 px) und `disappear` (Pfeil bleibt sichtbar, während Truhe im View ist) | **FAIL** |

Einordnung (Abnahme misst, sie repariert nicht):
- Unit-Tests `tests/chest-arrow.test.ts` sind auf dem PIN grün (im 72er-Ziellauf).
- Der Lane-Nachher-Lauf (17:52Z) lief **vor** 19:13Z → SwiftShader-Ära; der Re-Lauf
  läuft auf iGPU. Ein Renderer-/Timing-Einfluss auf die Screen-Projektion/Sampling
  des Probe-Harness ist nicht ausgeschlossen und im Folge-Job zu klären.
- Zwischen 17:52Z und PIN liegen 19 Merges; Regressionsverdächtige für 640×360:
  v. a. `m10-view-width-cap` (interne Breite 640) und `m10-ground-props-batch`
  (Batch-Container-Layer). Vom Folge-Job zu lokalisieren.
- Folge-Karte: `m10-reacceptance-c-Folge: Chest-Arrow 640×360 Re-Lauf FAIL auf PIN`
  (wird vom Lead zusammen mit dem verify-input-Befund dispositioniert).

## K6 — FPS-Gates (iGPU, unter flock /home/ai/games/.lf-perf.lock)

`node scripts/qa-reaccept-perf.mjs --runs 2` (2 Läufe × 2 Views, beendet ~20:55Z),
Belege `shots/qa-reaccc-perf-iter{1,2}-{640x360@1,780x360@3}.json` +
`shots/qa-reaccc-perf.json` (Summary).

**Renderer-Bezug (Pflicht):** Alle FPS-Läufe auf demselben Host/iGPU wie die Probe in
K2 — Renderer **„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“**
(`shots/qa-reaccc-renderer.json`, 20:34:59Z, 10 min vor Lauf 1). Kein SwiftShader-Beleg.

| View | Burst-FPS (min über 2 Läufe) | Minute-25 FPS (min) | Ziel | Urteil |
|---|---:|---:|---|---|
| 640×360@1 | **60,0** | **60,0** | Burst ≥ 55, M25 ≥ 50 | **PASS** |
| 780×360@3 | **60,1** | **60,0** | Burst ≥ 55, M25 ≥ 50 (IST-Wert) | **PASS** |

JS-Fehler: 0 (alle 4 Iterationen). Alle Messwerte ~60 FPS = vsync-gecappt (60-FPS-Cap
aktiv, siehe K2 `fps.cappedAt60`); damit deutlich über den Vorwerten (640 M25 Median 56,3
bei Nachabnahme B; ground-props-Lane meldete 48,5/40,3 auf ihrem Stand) — die späteren
Perf-Merges (view-width-cap, fx-add-cap, ground-props-batch, passive-math) haben die
640- und 780-Pfade auf vsync-Niveau gebracht. Bekannte vsync-Quantisierung: Einzelwerte
60,0–60,1, Median-Differenzierung unter dem Cap nicht möglich.

**Urteil K6: PASS** (640-Korridor ≥ 55 erreicht; 780@3 IST-Wert 60,0 ≥ 50 — der
„offene Hebel“ Atlas-Pack ist damit auf diesem PIN kein FPS-Blocker mehr).

## K7 — 30-min-Echtzeitlauf (A4)

Der iGPU-Beleg von m10-realtime-stability (Lauf 1: 18:20–18:50Z) liegt **vor** 19:13Z und
trägt keinen Renderer-String → keine Übernahme. Neuer Lauf auf iGPU in dieser Lane:
`flock -w 60 … node scripts/realtime-run.mjs --minutes 30` (gestartet ~20:57Z, beendet
~21:28Z, 1854 s Echtzeit, `truncated:false`), Belege `shots/qa-reaccc-realtime-30min.json`
+ `-minute-{5,10,15,20,25,30}.png` + `-end.png` + `-results.png`. Renderer wie K2 (iGPU,
RPL-S).

| Tor | Ist | Soll | Urteil |
|---|---|---|---|
| FPS (7307 Samples) | **min 60,1 / Median 60,5** | min ≥ 55 | **PASS** |
| Inhalt | Sieg `dawn` bei 30,3 Sim-Min, **6/6 Bosse pünktlich (300–1800 s ±0 s)**, 6 Truhen, 3 Evolutionen (phoenix, eternal_winter, thunder_seal), Level 38, 5687 Kills | vollständiger Run | **PASS** |
| JS-Fehler / Abbrüche | **0 / 0**, 6 Minuten-Shots geschrieben | 0 | **PASS** |
| Heap (hard) | Minute 1 → 29: 31,9 → 38,6 MB = **+21 %** (endMB 27,1) | ≤ +15 % | **FAIL** |

**Urteil K7: FPS-Tor PASS — Heap-Tor FAIL (+21 % > 15 %).** Einordnung: `endMB 27,1`
liegt unter dem Minute-1-Wert (31,9 MB) → klassischer GC-Sägezahn, kein monotoner Leak;
das m10-realtime-stability-Urteil hatte denselben Jitter-Effekt („Heap-Delta 16 % (Jitter)“).
Das Tor ist ein Hard-Gate und zählt als FAIL — Behebung (z. B. GC-Timing/Messfenster,
`m10-heap-margin`-Nachfolge) geht als Folge-Job an den Lead, nicht durch die Abnahme.

## Gesamturteil

Auf PIN `43fd9eb` (2026-11-27T20:29:24Z), alle Belege iGPU (kein SwiftShader):

| Kriterium | Urteil |
|---|---|
| `npx tsc --noEmit` rc=0 | **PASS** |
| `npm test` 0 fail (587/587, 58 Dateien) | **PASS** |
| `acceptance-count` 30/6/6/6/6/2 | **PASS** |
| `npm run build` rc=0 | **PASS** |
| verify:final 7/7 | **PASS** |
| verify-input 28/28 | **FAIL — 27/28**, stabile Regression „Tastatur: ESC setzt fort“ (K4) |
| 640-Korridor ≥ 55 FPS / M25 ≥ 50 | **PASS** (60,0 / 60,0) |
| 780×360@3 ≥ 50 FPS (IST) | **PASS** (60,0) |
| 30-min-Echtzeitlauf: FPS-Tor | **PASS** (min 60,1) |
| 30-min-Echtzeitlauf: Inhalt | **PASS** (Sieg, 6/6 Bosse ±0 s, 6 Truhen, 3 Evolutionen) |
| 30-min-Echtzeitlauf: Heap-Tor ≤ 15 % | **FAIL** (+21 %, GC-Sägezahn, endMB < Minute-1) |
| Renderer-Pflicht (kein SwiftShader-Beleg) | **PASS** |
| 19/19 Drain-Merges zugeordnet (Tabelle in `docs/lanes/m10-reacceptance-c.md`) | **PASS** |
| Keine Änderung an Spielcode/Tests | **PASS** (nur ACCEPTANCE.md, docs/qa, docs/lanes, shots/qa-reaccc-*) |

**Ergebnis Nachabnahme C: NICHT abgenommen.** Zwei Kriterien FAIL auf dem PIN:
1. **verify-input 27/28** — ESC setzt den Pause-Zustand nicht fort (stabil reproduziert,
   Folge-Karte im Board-Backlog). Regression gegen den 28/28-Stand der ersten Nachabnahme
   (13:43Z); Verdächtige sind die 19 Drain-Merges.
2. **Heap-Tor +21 % > 15 %** im 30-min-Echtzeitlauf (hard gate; GC-Sägezahn-Bild, kein
   monotoner Leak, aber Tor ist Tor).

Zusätzlich dokumentiert (nicht Abnahmekriterium, aber belegt): Chest-Arrow 640×360
Re-Lauf 5/10 FAIL gegen PASS im SwiftShader-Ära-Lauf der Lane (K5b, Folge-Karte).

Alle Mess-/Prüfbefehle und Zeitstempel: diese Datei; Merge-Zuordnung:
`docs/lanes/m10-reacceptance-c.md`; historische Einordnung: ACCEPTANCE.md Versuch (c).
