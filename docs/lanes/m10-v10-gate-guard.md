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
Texturanzahl ≤ 500. Das In-run-Heap-Delta m1→end bleibt Beobachtung (kalte m1-Referenz bei 30x,
Post-GC-Sägezahn — siehe `docs/qa/acceptance-refresh-g-2026-11-28.md`).

Aufruf (FPS/Echtzeit ⇒ Mess-Sperre):

```bash
flock /home/ai/games/.lf-perf.lock node scripts/m10-v10-gate.mjs --out shots/m10-v10-gate.json
```

Tor-Logik ist rein (`evaluateGates`, `rendererVerdict`, `frameP95`, `retainedHeapDeltaPct`) und in
`tests/v10-gate.test.ts` unit-getestet (17 Tests: PASS/FAIL-Matrix pro Tor, Renderer-Check, Helfer).

## K3 — vollständiger Gate-Lauf (Ergebnis)

(Beleg wird nach dem Lauf eingetragen: Tor-JSON, Renderer-String, Tore-Tabelle, Warnings, Belegpfade.)

## Befunde / Hebelliste

(falls FAIL: Liste mit Datei/Hebel/Gewinn — Fixes schneidet der Lead, nicht diese Lane.)

## Belege

- Tor-JSON: `shots/m10-v10-gate.json` (im Repo)
- Roh-Belege: `~/games/.evidence/m10-v10-gate-guard/` (fullrun-guard-JSON, verify-JSON, Minute-25-Shot)
- Lauf-Log: `~/tmp/m10-v10-gate-guard-k3-run.log`
