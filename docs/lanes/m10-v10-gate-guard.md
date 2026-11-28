# Lane m10-v10-gate-guard — v1.0-Host-Gate als wiederholbarer Lauf (2026-11-28)

Ziel: die v1.0-Abnahme-**Host-Tore** (Wünsche von Dom 10:00Z + v10-device-acceptance, lokale Tore nach
19:20Z-Entscheid) als **wiederholbaren lokalen Gate-Lauf** festnageln, bevor `v10-final-run` das Urteil
schreibt — die Endabnahme soll nur noch laufen, nicht mehr Werkzeug bauen. **Keine src-Änderung.**
Das janky-Gerätetor ist bewusst ausgespart (Thema Mess-Lane `m10-janky-remeasure`, Regel: 1 Mess-Thema
pro Lane) — dieses Gate deckt die Host-Tore.

Board-Karten: #12724 (K1 Skript), #12725 (K2 Tests), #12726 (K3 Gate-Lauf), #12727 (K4 Doku).

## Gate-Skript: `scripts/m10-v10-gate.mjs`

Orchestriert **nur bestehende Werkzeuge** (keine Doppel-Messapparate):

| Schritt | Werkzeug | Liefert |
|---|---|---|
| Inhalt | `scripts/acceptance-count.mjs` | Inhalte 30/6/6/6/6/2 |
| Fullrun | `scripts/m10-fullrun-guard.mjs` | 6/6 Bosse 300–1800 s ±2 s, 6 Truhen, Sieg `dawn`, Heap-Rohdaten |
| Meta | `scripts/verify-final.mjs` | Szenen-/Meta-Checks, JS-Fehler |
| Perf-Pass | eigener Pass (Muster aus `perf.mjs`, `m10-frame-tail-batching.mjs`, `m10-atlas-pack.mjs`) | Frame-Zeit-Perzentile, Draw-Calls/Frame, Texturanzahl, Renderer-String |

Tore (Exit 0 = PASS, 1 = FAIL, **2 = Renderer ungültig**):

| Tor | Schwelle |
|---|---|
| `renderer-pflicht` | WebGL-Renderer-String Pflicht; SwiftShader/llvmpipe/Software → INVALID (Regel 6, 2026-11-28) |
| `content-counts` | exakt 30/6/6/6/6/2 |
| `frame-p95` | JS-Frame-Zeit p95 ≤ 16 ms (Minute-25-Worst-Case, 300er Top-up, 10 s) |
| `js-errors-0` | 0 JS-Fehler über Perf-Pass + Fullrun-Guard + verify:final (+ 0 rote verify-Checks) |
| `fullrun-inhalt` | Guard-Tore grün: 6/6 Bosse ±2 s, 6 besiegt, 6 Truhen, `dawn` |
| `heap-retained` | retained Heap (endMB vs startMB, nach erzwungenem GC) strikt < +15 % (Tor-Definition #11391 / Nachabnahme G) |

Beobachtungen (Warnung, kein FAIL — keine selbst erfundenen Tore): Draw-Calls/Frame p95 ≤ 40,
Texturanzahl ≤ 3500 (Baseline-Kalibrierung aus Gate-Lauf 28.11.: gemessen 2776–2787). Das In-run-
Heap-Delta m1→end bleibt Beobachtung (kalte m1-Referenz bei 30x, Post-GC-Sägezahn — siehe
`docs/qa/acceptance-refresh-g-2026-11-28.md`).

Aufruf (FPS/Echtzeit ⇒ Mess-Sperre):

```bash
flock /home/ai/games/.lf-perf.lock node scripts/m10-v10-gate.mjs --out shots/m10-v10-gate.json
```

Tor-Logik ist rein (`evaluateGates`, `rendererVerdict`, `frameP95`, `retainedHeapDeltaPct`) und in
`tests/v10-gate.test.ts` unit-getestet (17 Tests: PASS/FAIL-Matrix pro Tor, Renderer-Check, Helfer).

## K3 — vollständiger Gate-Lauf (Ergebnis)

Drei Läufe auf aktuellem main-Stand (Branch `m10-v10-gate-guard`, main-Tip `fa93a8d6`), alle unter
`flock /home/ai/games/.lf-perf.lock`, Belege in `~/games/.evidence/m10-v10-gate-guard/`:

| Tor | Lauf 1 (14:4xZ) | Lauf 2 (15:52Z) | Lauf 3 (verbindlich) |
|---|---|---|---|
| `renderer-pflicht` | PASS — `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` | PASS (dito) | **PASS** (dito) |
| `content-counts` | FAIL¹ (Parse-Bug im Gate-Skript) | **PASS** (30/6/6/6/6/2) | **PASS** (30/6/6/6/6/2) |
| `frame-p95` | FAIL 16,7 ms² | FAIL 16,8 ms² | **FAIL 16,8 ms** (Befund 1; worst 16,9 ms) |
| `js-errors-0` | PASS | FAIL³ (1 RangeError) | **PASS** (0 Fehler) |
| `fullrun-inhalt` | **PASS** (6/6 Bosse ±2 s, 6 Truhen, `dawn`) | **PASS** (dito) | **PASS** (dito) |
| `heap-retained` | **PASS** +8,1 % | **PASS** +7,9 % | **PASS** +8,1 % |
| verify:final / Exit | — | 0 Checks rot | 0 Checks rot / **Exit 1 (nur frame-p95)** |
| Beobachtung | draws p95 24, Texturen 2787 | draws p95 22, Texturen 2776 | draws p95 26, Texturen 2782; Warnung: Top-up avg 52 (Befund 3) |

**Verbindliches Urteil (Lauf 3, Tor-JSON `shots/m10-v10-gate.json` @ 15:57Z): FAIL — ausschließlich
`frame-p95`, und zwar strukturell (Befund 1). Bei Tor-Definition „janky % (dt > 16,9 ms)“ wäre das
Urteil PASS (worst 16,9 ms = 0 % janky). Alle übrigen Host-Tore PASS, wiederholbar über 3 Läufe.**

## Befunde / Hebelliste (verbindlich nach Lauf 2; keine Fixes in dieser Lane)

1. **`frame-p95` ist strukturell gegen die 60-FPS-Cap nicht erfüllbar — Tor-Definition anpassen.**
   `src/main.ts` (fps `{ target: 60, limit: 60 }`, M10-Android/ARM-Entscheid) drosselt den Render-
   Takt auf 60 Hz; rAF-dt ist damit per Design ~16,7 ms. Beleg Lauf 1+2: p50=p90=p95≈16,7–16,8 ms,
   p99 16,9, worst 17,0 — perfekt gleichmäßig (Cap-Quantisierung), **kein Janky-Schwanz**; auch
   `--disable-gpu-vsync --disable-frame-rate-limit` im Gate-Lauf ändert das nicht (Phaser schedelt
   selbst auf 16,6 ms). Das Tor „p95 ≤ 16 ms" misst aktuell den Cap, nicht Frame-Kosten.
   **Hebel:** Tor umdefinieren, z. B. (a) janky % (dt > 16,9 ms) ≤ 1 % wie `m10-frame-tail-batching`
   (Lauf 1+2: worst 17,0 ms → janky 0 %, klar PASS), oder (b) dt-p95 ≤ 17 ms als „cap-quantisiert,
   kein Schwanz", oder (c) JS-Frame-Kosten über Performance-API statt rAF-dt. Entscheidung: Lead/
   v10-final-run. Datei: `scripts/m10-v10-gate.mjs` (Tor), `docs/qa/v10-readiness-2026-11-28.md` (B7).
2. **`js-errors-0` Lauf 2 war ein Harness-Artefakt meines per-Frame-Top-ups** (RangeError: Maximum
   call stack — Spawn-Queue-Druck, Muster wie `Team/Stolperfallen.md` 63; der `push(...rest)`-Fix
   ist im Code, aber ~600 Top-ups à Defizit überfordern die Drain-Rate). Zurück auf 50-ms-Takt
   (Geräte-Methodik, Lauf 1: 0 JS-Fehler). Kein Spiel-Befund.
3. **Minute-25-Worst-Case hält lokal nicht: avg ~60 statt 300 Gegner** (Bot räumt auf Host-CPU
   schneller ab als das 50-ms-Top-up füllt; auf dem Gerät war avg 300, K2 Geräte-Abnahme). Lokales
   p95 ist dadurch weniger belastend — der strenge Dichte-Beweis bleibt das Gerät (109–112 FPS).
   Hebel (falls Host-Dichte gewünscht): Top-up ohne Bot-Kill-Rate konfrontieren (Waffen-
   Deaktivierung im Messfenster) — Methodik-Entscheid, nicht kritisch.
4. **Alles andere ist grün und wiederholbar:** Renderer-Pflicht (Intel iGPU, kein SwiftShader),
   Inhalte 30/6/6/6/6/2, Fullrun 6/6 Bosse ±2 s + 6 Truhen + `dawn` (2×), retained Heap +8,1 %/
   +7,9 % (< 15 %), verify:final 0 Checks rot, 0 JS-Fehler im Guard/verify, Draw-Calls p95 22–24
   (Beobachtungsgrenze 40 weit entfernt), Texturen 2776–2787 (Baseline, Warngrenze 3500 kalibriert).

¹ Mein Zeilenfilter zerlegte das mehrzeilige stdout-JSON von `acceptance-count.mjs` → gefixt
  (einfaches `JSON.parse(stdout)`).
² Messung 1 ohne vsync-Flags, Messung 2 mit — identisches Bild (siehe Befund 1).
³ Genau 1 Fehler im Perf-Pass; fullrun-guard und verify:final hatten in beiden Läufen 0 Fehler.

## Belege

- Tor-JSON (verbindlicher Lauf 3): `~/games/.evidence/m10-v10-gate-guard/gate-final-run3.json`
  (Arbeitskopie im Worktree: `shots/m10-v10-gate.json`, gitignored — shots sind Belege, keine
  Deliverables, Vera 28.11.)
- Minute-25-Shot: `~/games/.evidence/m10-v10-gate-guard/gate-final-run3-minute25.png`
- Roh-Belege: `~/games/.evidence/m10-v10-gate-guard/` (fullrun-guard-JSON ×3, verify-JSON ×3,
  fullrun-results/minute25-Shots)
- Lauf-Logs: `~/tmp/m10-v10-gate-guard-k3-run{,2,3}.log`
