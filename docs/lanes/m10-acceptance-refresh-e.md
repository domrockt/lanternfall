# Lane m10-acceptance-refresh-e — Nachabnahme E (NUR-PRÜF, 2026-11-28)

Zweck: Nachabnahme **E** auf aktuellem main nach ~15 Merges seit Nachabnahme C
(dpr-budget-Welle, Gamepad-Nav Kern+Szenen, Terrain-Hole-Guard, Winter-Reste,
VFX-restore Stufe 2, Ops-Hygiene f71c3be/b54e742). Nur-Prüf-Lane: Mess-Skripte werden
ausgeführt, nie geändert. Gamepad-Nav-Skript `scripts/verify-input.mjs` gehört
m10-pad-start-pause-r2 (nur gelaufen); `.opencode/board.json` fremd beansprucht → Board-Updates entfallen.

- **PIN:** main @ `a6f1458b2ffaf578828f408a152dd58a0c2558bf` (2026-11-28T07:20:20Z), Branch `m10-acceptance-refresh-e`, Worktree `/home/ai/games/lf-lanes/m10-acceptance-refresh-e`.
- Belege: `~/games/.evidence/m10-acceptance-refresh-e/`, Abnahme-Bilder: `shots/abnahme/refresh-e-*`.

## K1 — Build / Tests / Inhaltszählung (07:21–07:23Z)

| Check | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | rc=0, keine Ausgabe | **PASS** |
| Build | `npm run build` | rc=0, `✓ built in 487ms` (Chunk-Größenwarnung, bekannt) | **PASS** |
| Tests | `npm test` | **1655/1655 grün in 153 Dateien**, 0 fail, 4,45 s | **PASS** |
| Inhalte | `node scripts/acceptance-count.mjs` | `ok:true` — 30 Gegner / 6 Waffen / 6 Powerups / 6 Evolutionen / 6 Bosse / 2 Helden | **PASS** |

Befund (Delta zu Nachabnahme C, PIN `43fd9eb`): Tests 587 → **1655 (+182 %)**,
Testdateien 58 → 153. Ursache: dpr-budget-Welle, Gamepad-Nav, VFX-restore u. a.
ohne Abnahme-Beleg; keine roten Tests. Hebel: keine (positiver Befund).

Roh-Beleg: `~/games/.evidence/m10-acceptance-refresh-e/k1-logs.txt` ( nachgetragen ).

## K2 — verify:final + verify-input (07:20–07:24Z)

| Check | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| verify:final | `node scripts/verify-final.mjs` | **7/7 PASS**, `errors: []`, 0 JS-Fehler (Master-Mute, Aggregation 110/129, Results `dawn` weapons=12) | **PASS** |
| verify-input | `node scripts/verify-input.mjs` | **28/28 PASS**, 0 JS-Fehler (`jsErrors: []`) — Touch 9, Gamepad 14, Tastatur 3, Shots ok | **PASS** |

Befund E-1 (positiv): die **ESC-Regression aus Nachabnahme C (27/28 FAIL) ist behoben** —
„ESC pausiert" + „ESC setzt fort" grün (`listeners:1`, kein Doppel-Listener), Plausibilität:
Fix-Welle Gamepad-Nav/pad-start-pause-r2 seit C. Hebel: keine.

Roh-Belege: `~/games/.evidence/m10-acceptance-refresh-e/k2-verify-final.json`, `k2-verify-input.json`
(Kopien der Skript-Outputs `shots/final-verify.json` / `shots/m8-input.json`; shots/ ist gitignored).

## K3 — fullrun 30 min 640×360 + Minute-25 780×360@3 (07:26–07:35Z, flock `/home/ai/games/.lf-perf.lock`)

**Renderer-Pflicht:** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU, kein SwiftShader) —
Beleg `~/games/.evidence/m10-acceptance-refresh-e/k3-renderer.txt`.

**fullrun 640×360@1** (`flock … npm run fullrun -- --viewport 640x360 --dpr 1 --tag refresh-e-640`,
JSON `shots/m3-fullrunrefresh-e-640.json` → Kopie `~/games/.evidence/m10-acceptance-refresh-e/k3-fullrun-640.json`):

| Kriterium | Ist | Tor | Urteil |
|---|---|---|---|
| Sim-Dauer | 30,2 min | 30 | PASS |
| Bosse | 6/6 bei 300/600/900/1200/1500/1800 s (exakt) | 6/6 ±2 s | **PASS** |
| Truhen | 6/6 | 6/6 | **PASS** |
| Sieg | `dawn=true`, `resultReason=dawn` | Sieg dawn | **PASS** |
| fpsMin | **59,2** | ≥ 55 | **PASS** |
| Heap-Tor | **+13,9 %** (Minute-1 → Run-Ende nach GC; endMB 40,5) | ≤ +15 % | **PASS** |
| JS-Fehler | 0 | 0 | **PASS** |

**Minute-25 780×360@3** (`flock … npm run perf -- --viewport 780x360 --dpr 3 --tag refresh-e-780`):
Burst **60,1 FPS** bei 500 Gegnern (PASS), Minute-25 **60,1 FPS** (gemessen 60,7) bei 300 Gegnern,
Tor ≥ 50 → **PASS**. Sicht: `shots/abnahme/refresh-e-minute25-780x360dpr3.png` (getrackt), 0 JS-Fehler.
JSON `~/games/.evidence/m10-acceptance-refresh-e/k3-perf-780x360dpr3.json`.

Befund E-2 (positiv): die FPS-Latte der Nachabnahme C/Versuch 3 (fullrun-fpsMin 34,8/35,7,
M25-780 41,3–46,4) ist auf PIN `a6f1458` **voll erfüllt** — Attribution der Fix-Welle:
dpr-budget (780@3-Pfad), separation-budget, endgame-fps/ground-cost Merges seit C.
Hebel: keine.

## Befundliste Nachabnahme E (Severity + Hebel)

| # | Befund | Severity | Hebel / Pointer |
|---|---|---|---|
| E-1 | verify-input **28/28** — die ESC-Regression aus Nachabnahme C (27/28, „ESC setzt Pause nicht fort") ist auf PIN `a6f1458` **behoben** | info (positiv) | keine; Fix stammte aus Gamepad-Nav/pad-start-pause-Welle |
| E-2 | FPS-Latte der Nachabnahme C/Versuch 3 vollständig erfüllt: fullrun-fpsMin 34,8/35,7 → **59,2**; M25-780 41,3–46,4 → **60,1** | info (positiv) | keine; Attribution dpr-budget, separation-budget, endgame-fps/ground-cost Merges |
| E-3 | `npm run build`: Chunk-Größenwarnung (> 500 kB Bundle) | low | Vite-Code-Splitting (`build.rolldownOptions.output.codeSplitting`) — Backlog-Kandidat, kein Abnahme-Blocker (Dora) |
| E-4 | verify-Skripte schreiben Neben-Outputs in getrackte `shots/*.json` (`shots/m10-passive-math-*.json` durch verify-final-Lauf verändert, im Worktree restored, nicht committed) | low | Hebel bei Skript-Owner (m10-pad-start-pause-r2 / QA): Outputs nach `~/games/.evidence/` statt in getrackte shots — als Bedarf gemeldet |
| E-5 | Historische Restpunkte unverändert und nicht Teil dieses Urteils: Heap-SOFT (GC-Sägezahn-Peaks), 780@3 fill-rate-Grenze, art-director-Restpunkte (Halo, #320–#322) | info | siehe ACCEPTANCE.md „Offene Punkte / Restmängel" |

**Kein FAIL unter den K-Kriterien.** Gesamtergebnis der Lane: Nachabnahme E = **PASS** (alle K1–K3-Kriterien grün).
