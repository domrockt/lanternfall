# Lane m10-postwave-smoke-r2 – NUR-MESS-Integrations-Smoke (Welle 12:00–15:30Z)

Zweck: Abnahme-Basis auf main nach ~20 Merges prüfen (worldview-Anker-Kette, run-setter-churn,
fx-alloc-trim, golden-frame-rebaseline, det-e2e-guard, ground-chunk-budget, device-tier-schedule,
quality-Kette, heap-Kette, loadscreen-Kette). Diese Lane fixt nichts – Befunde = Fix-Job-Empfehlungen.
janky-Gerätemessung bleibt bei m10-janky-remeasure (nicht doppelt gemessen).

## K1 – npm test + npm run build (tsc)

| Check | Ergebnis | rc | Vergleich Baseline |
|---|---|---|---|
| npm test | **2455/2455 Tests grün**, 226 Files | 0 | Baseline 2412/2412 → **+43 Tests** durch die Welle, alle grün |
| npm run build (tsc --noEmit + vite) | **built in 449 ms** | 0 | unverändert grün |

Urteil K1: **PASS** – keine roten Befunde.

Details: Test-Duration 6.34 s (vitest run, 226 isolierte Worker). Build-Ausgaben siehe
`~/games/.evidence/m10-postwave-smoke-r2/` (Logs K1).

Commit: `M6-m10-postwave-smoke-r2: #12885 K1 test+build grün (2455/2455, build ok)`

## K2 – verify:final + verify:input + acceptance-count

| Check | Ergebnis | rc |
|---|---|---|
| `node scripts/verify-final.mjs` | **7/7 Checks PASS** (Master-Mute-Option/-Block/-Persistenz, Aggregation <120/≥120, Ergebnis-Screen Sieg) | 0 |
| `node scripts/verify-input.mjs` | **29/29 Checks PASS** (`M8-input: PASS`), alle Shots >10 KB, keine JS-Fehler | 0 |
| `node scripts/acceptance-count.mjs` | **30/6/6/6/6/2** (enemies/weapons/powerups/evolutions/bosses/characters) = exakt Soll, `ok: true` | 0 |

Urteil K2: **PASS** – Soll 30/6/6/6/6/2 exakt getroffen; keine Abweichungen.

Logs: `~/games/.evidence/m10-postwave-smoke-r2/` (verify-final, verify-input, acceptance-count).

Commit: `M6-m10-postwave-smoke-r2: #12886 K2 verify-Skripte 7/7 + 29/29 + 30/6/6/6/6/2 grün`
