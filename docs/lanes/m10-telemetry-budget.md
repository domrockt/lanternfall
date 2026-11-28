# Lane m10-telemetry-budget — Eigene Messkosten der Telemetrie deckeln

Android-Blocker-Runde: Der Telemetry-Sampler (`src/telemetry.ts`) sammelte immer
alle 5 s ein Sample mit vollem 600-Frame-Ringpuffer — egal, ob das Spiel auf
`full` oder `minimal` läuft. Genau wenn das Tablet am wenigsten Budget hat
(LOD `minimal`, Endgame/Thermik), war die eigene Mess-Last am größten.

## Ist (K1, Vorher-Probe)

Deterministischer Probe `scripts/m10-telemetry-budget.mjs` (rolldown-Bundle der
TS-Logik, 5 Läufe à 5000 `collect()`-Aufrufe, Median; kein Gerät nötig, kein
flock — feste Iterationszahl, lastunabhängig gemustert):

| Metrik (Ist, tier-unabhängig) | Wert |
|---|---|
| `collect()`-Kosten (collectReadings + buildSample + frameStats-Sort) | **33,5 µs/Sample** |
| Payload je Sample | **334 B** |
| Samples je Minute (5-s-Takt) | 12 |
| Sammelkosten je Minute | **0,40 ms** |
| Payload je Minute | **3,9 KB** |
| Request je Flush (60 Samples Deckel) | 20,0 KB |

Beleg: `~/games/.evidence/m10-telemetry-budget/before.json`.

## Fix (K2)

`telemetryBudgetFor(quality)` + `TELEMETRY_BUDGETS` in `src/telemetry.ts`;
der Collector folgt dem `lod.level` des gemeldeten Samples:

| Tier (= LOD-Level) | Intervall | Frame-Puffer | Pending-Deckel | Samples/min | Sammelkosten/min | Payload/min |
|---|---|---|---|---|---|---|
| `full`    | 5 s (Ist) | 600 (Ist) | 60 (Ist) | 12 | 0,40 ms | 3,9 KB |
| `reduced` | 10 s | 240 | 24 | 6 | **0,081 ms (−80 %)** | **1,97 KB (−50 %)** |
| `minimal` | 20 s | 120 | 12 | 3 | **0,019 ms (−95 %)** | **0,99 KB (−75 %)** |

Belege: `~/games/.evidence/m10-telemetry-budget/after-reduced.json`,
`after-minimal.json`.

- **Aktivierung bitleich unverändert:** `telemetryEnabled`/`installTelemetry`
  nicht angefasst (`?telemetry=1` / APK-127.0.0.1+Android-UA an, Desktop aus,
  `?telemetry=0` gewinnt). Regressionstest in tests/telemetry-budget.test.ts,
  volle Matrix in tests/telemetry.test.ts (weiterhin grün).
- Collector zieht bei Stufenwechsel Puffer/Deckel sofort zusammen und takted
  den laufenden Timer um; `opts.intervalMs` bleibt Test-/Probe-Override.
- `full` = exakt die Ist-Konstanten (Regressionstest `toEqual`).

## Messhinweis (Ehrlichkeit)

Die µs-Zahlen des CPU-Probes schwanken mit der Last paralleler Lanes (derselbe
`full`-Code: 33,5 → 47,3 µs zwischen Läufen, siehe `before-paired.json` /
`after-full-paired.json`). Verbindlich sind daher:
1. die lastunabhängigen Konstanten (Samples/min, Puffergrößen — Regressionstests),
2. die Tier-Verhältnisse im selben Messlauf (13,4 µs bei Puffer 240, 6,5 µs bei
   Puffer 120 gegen 33,5 µs bei 600), nicht einzelne Absolute.
Auf dem Gerät dominiert ohnehin die Wake-up-Zahl (12 → 3/min auf `minimal`),
nicht die CPU-Zeit je Sample.

## Tests (K3)

`tests/telemetry-budget.test.ts` (11 Tests): Budget-Matrix je Tier, dynamische
Puffer-/Pending-Kürzung, Drosselung nach Tier-Intervall (minimal erst nach 20 s),
Override-Semantik, Timer-Reschedule nach Stufenwechsel, Aktivierung bitleich.
`tests/telemetry.test.ts` unverändert grün (19). Gesamtsuite: 193 Dateien /
2121 Tests grün; `npm run build` grün.

## Commits

- K1 `5e336d00` — Probe-Skript + Vorher-Zahlen
- K2 `dd53f444` — Budget-Tabelle + dynamischer Collector
- K3 `a56b535e` — tests/telemetry-budget.test.ts
- K4 — diese Doku + `.lane-done`

## Offene Punkte

- Der Probe misst nur die Sammel-Kosten (CPU/Bytes); Netz-/Server-Kosten des
  Empfängers sind nicht Teil dieser Lane.
- `quality = null` (außerhalb der Run-Szene) läuft weiter auf `full`-Takt —
  Menü-Szenen sind billig; falls doch gewünscht, könnte `null → reduced` den
  Takt auch im Menü halbieren (eine Zeile, Folge-Karte).
- Der Empfänger (Rig, Port 5180) akzeptiert beide Takte unverändert; keine
  Server-Änderung nötig.
