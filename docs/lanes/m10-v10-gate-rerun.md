# Lane m10-v10-gate-rerun — v1.0-Host-Gate: Urteil je Tor auf aktuellem main (2026-11-28)

Ziel: das verbindliche v10-Host-Gate-Urteil (m10-v10-gate-guard, Lauf 3 @ 15:57Z: FAIL nur
`frame-p95`, alle übrigen Host-Tore PASS) fiel auf einen HEAD **vor** dem Fix-Schub
(ground-chunk-tex-dup, gc-sawtooth-trim, blend-band-followup, renderer-guard, heap-gate-retry,
evo-element-guard). Diese Lane fährt **dieselbe Gate-Suite** (`scripts/m10-v10-gate.mjs`,
unverändert — dünner Wrapper `scripts/m10-v10-gate-rerun.mjs`) zweimal auf dem aktuellen main
und liefert das Urteil je Tor für die v1.0-Markierung.

- **NUR-MESS-Lane:** kein Spielcode; endet mit Fix-Empfehlungen (Hebelliste) oder „keine Befunde".
- **Kein zweites Geräte-Mess-Thema:** janky%/Gerätetore ausgespart (Thema `m10-janky-remeasure`).
- **`frame-p95` wird NICHT als FAIL gewertet** (Tor-Definition gegen das 60-FPS-Cap strukturell
  nicht erfüllbar — Frage steht bei Dom, `Lead/Fragen an Dom.md`, Eintrag 15:20Z / Dora 17:0xZ);
  p95/worst werden nur dokumentiert. (Auf aktuellem main moot: Desktop-Cap ist seit
  mobile-fps-cap `73b03c0e` 15:54Z entfallen, das Tor misst jetzt echte Frame-Kosten und ist PASS.)

Board-Karten: #13455 (K1 Werkzeuge), #13456 (K2 Gate-Lauf 1+2), #13457 (K3 Urteil je Tor),
#13458 (K4 Hebelliste + .lane-done). Duplikate des Disponent-Reserveblocks #13491–#13494 sind
als solche markiert (#13491 done, #13492–#13494 backlog, Notiz `Duplikat`).

## Stand (K1)

| Werkzeug | Wert |
|---|---|
| main-HEAD der Läufe | `11f929c7` (Worktree fast-forward, Wrapper-Commit `6556c8f8`) |
| Suite | `scripts/m10-v10-gate.mjs` (unverändert, Tore unit-getestet in `tests/v10-gate.test.ts`) |
| Tore | renderer-pflicht · content-counts · frame-p95 · js-errors-0 · fullrun-inhalt · heap-retained |
| Viewport | 960×540 (wie guard-Lauf 3) |
| Mess-Sperre | `flock /home/ai/games/.lf-perf.lock` (beide Läufe hintereinander, 17:16–17:22Z) |
| Belege | `~/games/.evidence/m10-v10-gate-rerun/run{1,2}.json` (+ Runtime-Belege fullrun-guard/verify/minute25 in `~/games/.evidence/m10-v10-gate-guard/`, Stamps `17-18-33-280Z` = Lauf 1, `17-20-27-389Z` = Lauf 2); Log `~/tmp/m10-v10-gate-rerun-k2.log` |
| Referenz-Urteil | guard-Lauf 3, 15:57:11Z: `~/games/.evidence/m10-v10-gate-guard/gate-final-run3.json` |

Verfahrensnotiz: Der Wrapper kann das mehrzeilige stdout-JSON der Suite nicht parsen
(`verdict=kein-JSON` im Log, Muster wie Parse-Bug Lauf 1 der guard-Lane) — irrelevant fürs
Urteil: die Tor-JSONs der Suite (`--out run{1,2}.json`) sind vollständig; Exit-Codes (1/1)
stimmen mit dem JSON-Urteil FAIL überein. Kein Patch, Belege gelten.

## Urteil je Tor (verbindlich: Lauf 1 + Lauf 2 auf main `11f929c7`)

| Tor | Guard-Lauf 3 (15:57Z) | Rerun Lauf 1 (17:20Z) | Rerun Lauf 2 (17:22Z) | Urteil (aktuelles main) |
|---|---|---|---|---|
| `renderer-pflicht` | PASS (Mesa Intel RPL-S) | PASS (dito) | PASS (dito) | **PASS** |
| `content-counts` | PASS 30/6/6/6/6/2 | PASS 30/6/6/6/6/2 | PASS 30/6/6/6/6/2 | **PASS** |
| `frame-p95`¹ | 16,8 ms / worst 16,9 (cap-quantisiert) | **2,0 ms** / worst 11,5 | **1,9 ms** / worst 7,4 | **PASS** (nur dokumentiert, kein Urteilstreiber) |
| `js-errors-0` | PASS (0 Fehler) | **FAIL — 13 Fehler** | **FAIL — 13 Fehler** | **FAIL** |
| `fullrun-inhalt` | PASS (6/6 Bosse ±2 s, 6 Truhen, dawn) | FAIL (nur `js-errors-0`; sonst dawn, completed) | FAIL (dito) | **FAIL** (Folgetor von `js-errors-0`) |
| `heap-retained` | PASS +8,1 % (< 15 %) | PASS +8,8 % | PASS +8,8 % | **PASS** |
| verify:final | 0 Checks rot | 0 Checks rot, 0 Fehler | 0 Checks rot, 0 Fehler | — |

**Verbindliches Urteil auf main `11f929c7`: FAIL — ausschließlich `js-errors-0` (13×
`Texture key already in use: chunk_*` im Fullrun-Guard, in beiden Läufen reproduziert;
Perf-Pass und verify:final je 0 Fehler), und `fullrun-inhalt` als Folgetor desselben Befunds
(Inhalt selbst grün: completed, `dawn`, keine Content-Failures). Alle übrigen Host-Tore PASS.**

¹ nur dokumentiert (siehe oben), kein Urteilstreiber. Beobachtungen: draws p95 26/26 (Grenze 40),
Texturen 2787/2787 (Guard-Lauf 3: 2782), Minute-25-Top-up avg 71/51 (< 200, gleiche
Messvaliditäts-Warnung wie Guard-Lauf 3), In-run-Heap-Beobachtung m1→end −13,1 %/−13,1 %.

## Delta gegen Lauf 3 (15:57Z)

(folgt im K3-Commit)
