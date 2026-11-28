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

## K3 – Perf-Kurzlauf unter flock `/home/ai/games/.lf-perf.lock`

Je Konfiguration 2 Läufe, Min zählt. Tore: Burst ≥ 55 / Burst ≥ 55.

| Konfiguration | Lauf 1 | Lauf 2 | **Min** | Tor ≥ 55 | worstFrameMs | JS-Fehler |
|---|---|---|---|---|---|---|
| Burst 640x360 | 60.1 FPS | 60.0 FPS | **60.0** | ✅ | 16.8 | 0 |
| Burst 780x360@3 | 60.1 FPS | 60.0 FPS | **60.0** | ✅ | 16.8 | 0 |
| Minute-25 640x360 (Info) | 60.0 | 60.0 | 60.0 | – | 16.8 | 0 |
| Minute-25 780x360@3 (Info) | 60.1 | 60.0 | 60.0 | – | 16.8 | 0 |

**Renderer-String (Pflichtbeleg):** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) | swiftshader=false`
→ gültiges Urteil (nicht SwiftShader). Einmalig gelesen via `scripts/m10-postwave-r2.mjs` (nur Renderer-Probe, kein Messapparat).

**Mess-Sperr-Prüfung (Supervisor-Anfrage 15:4xZ):** `ps aux | grep perf.mjs` zeigte 2 Treffer – das sind die
opencode-Sitzungen fremder Lanes, deren Briefing-Text nur „perf.mjs" enthält, **keine laufenden Perf-Prozesse**.
`/proc/locks | grep lf-perf` = leer → keine fremde Sperre. Alle 4 Läufe liefen unblockiert und synchron fertig
(kein Polling nötig).

Urteil K3: **PASS** – beide FPS-Toren mit 60.0 FPS klar erfüllt, 0 JS-Fehler.

Belege: `~/games/.evidence/m10-postwave-smoke-r2/perf-r2-{640,780d3}-run{1,2}.json`, `renderer.json`.

Commit: `M6-m10-postwave-smoke-r2: #12887 K3 Perf-Kurzlauf 60.0/60.0 FPS (Tore >=55), Renderer RPL-S`

## K4 – Befundliste / Welle-sauber-Doku

**Gesamturteil: Welle sauber.** Alle Abnahme-Basis-Checks auf main nach ~20 Merges grün:

- Tests 2455/2455 (+43 vs Baseline 2412), Build rc=0 (449 ms)
- verify-final 7/7, verify-input 29/29, acceptance 30/6/6/6/6/2 = exakt Soll
- Perf: Burst 640x360 min 60.0 FPS, Burst 780x360@3 min 60.0 FPS (Tore ≥55), 0 JS-Fehler, Renderer Mesa RPL-S (kein SwiftShader)

### Befunde (nichts rotes, nur Verbesserungs-Empfehlungen für Fix-Jobs)

| # | Severity | Befund | Datei | vermuteter Hebel |
|---|---|---|---|---|
| B1 | **low** | `perf.mjs` schreibt keinen WebGL-Renderer-String in das Tor-JSON (Pflicht laut Perf-Beleg-Regel, Argus 28.11.). Diese Lane musste ihn per Einmal-Probe (`scripts/m10-postwave-r2.mjs`) nachliefern. | `scripts/perf.mjs` (Output-Objekt) | Feld `renderer` im JSON ergänzen (Probe-Logik aus scripts/m10-postwave-r2.mjs übernehmen); würde auch m10-v10-gate-guard zugutekommen, das perf.mjs orchesteriert. |
| B2 | **low** | `passed: false` in allen 4 Perf-JSONs **trotz** erfülltem FPS-Tor: Gate `passed = fps>=55 && minEnemies>=500`, aber `minEnemies` ist bekanntes Harness-Quirk (God-Mode-Bot räumt schneller ab als der Director spawnt, dokumentiert in m10-acceptance-refresh-g / m10-endgame-fps; dort gilt FPS als ausschließliches Tor). 640x360: min/avg 145/289; 780@3: 0–7/175 bei kills 1573–1739/10 s. | `scripts/perf.mjs` (Zeile `passed: burst.fps >= 55 && burst.minEnemies >= 500`, analog Minute-25) | `minEnemies` aus dem `passed`-Gate herausnehmen (nur Info im JSON, wie in m10-endgame-fps entschieden); sonst meldet jede künftige Lane „passed:false" und muss das Quirk erneut recherchieren. |

Nicht doppelt gemessen: janky-Gerätemessung → m10-janky-remeasure; Endabnahme → v10-final-run.

Belege: `~/games/.evidence/m10-postwave-smoke-r2/` (4 Perf-JSONs, renderer.json, verify-Logs).

Commit: `M6-m10-postwave-smoke-r2: #12888 K4 Welle sauber — Doku + 2 low-Befunde (perf renderer-Feld, minEnemies-Gate)`
