# Lane m10-fullrun-renderer-valid

**Auftrag (Argus 17:14Z, Backlog):** Doms Renderer-Regel (19:20Z, „Abnahme ungültig bei
SwiftShader") ist in `perf.mjs` und `m10-v10-device-10min.mjs` maschinell durchgesetzt
(merge-m10-renderer-guard, 9bcc1e41) — aber `scripts/fullrun.mjs` (30-min-Abnahme-Lauf,
Heap-/Inhalts-Tore) schreibt keinen `rendererValid`-Wert und keine `invalid`-Markierung
ins Output-JSON und zieht die Renderer-Gültigkeit nicht in `passed`/Exit-Code. Damit sind
fullrun-Belege nicht regelkonform verifizierbar.

Karten: #13786 (K1 Befund), #13787 (K2 Integration), #13788 (K3 Test), #13789 (K4 Beleg).

## K1 — Befund (Karte #13786)

**Regel:** In jedem Perf-/Abnahme-Beleg muss der WebGL-Renderer-String mitschreiben und
maschinell geprüft werden: `rendererValid=false` (leer oder SwiftShader) ⇒ Beleg
`invalid`, `passed=false`, Exit-Code 1. Muster: `scripts/perf.mjs` (Zeile 8: `import
{ getRendererString, rendererValid } from "./lf-renderer.mjs"`, Zeilen 134–137
`renderer, rendererValid, invalid`, `passed: rendererValidFlag && …`,
`process.exit(result && result.passed ? 0 : 1)`) und `scripts/m10-v10-device-10min.mjs`
(Zeilen 12/186/199–203/207).

**Ist-Stand fullrun.mjs (Vorher):** Seit 78cb1bc5 erfasst fullrun.mjs den Renderer
inlined (page.evaluate, Objekt `{ renderer, vendor }`) und schreibt das Objekt ins
Summary (`renderer: …`), aber:

1. **kein `rendererValid`-Feld** und **kein `invalid`-Feld** im Output-JSON,
2. **kein Tor:** `passed: ok && heapOk && fpsOk` — Renderer-Gültigkeit fließt nicht ein,
3. **Exit-Code blind:** `process.exit(summaryPassed ? 0 : 1)` — ein SwiftShader-Lauf mit
   grünen Inhalts-/Heap-/FPS-Toren verlässt das Skript mit **rc=0**.

**Beleg an alten Output-JSONs** (`~/games/.evidence/…`, per `python3` geprüft):

| JSON | renderer | rendererValid | passed |
|---|---|---|---|
| m10-acceptance-refresh-g/m3-fullrunaccg1.json | `{renderer: "ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S)…"}` | **None** | true |
| m10-acceptance-refresh-g/m3-fullrunaccg2.json | dito | **None** | true |
| m10-heap-regression-fix/m3-fullrunheapfix1.json | dito | **None** | true |
| m10-heap-regression-fix/m3-fullrunheapfix2.json | dito | **None** | true |
| m10-acceptance-refresh-f/m3-fullrunaccf.json | None (alter Stand) | **None** | false |

Die vier grünen Belege sind mit Mesa RPL-S (iGPU) faktisch valide, aber **nicht
regelkonform nachweisbar**: kein `rendererValid`, kein `invalid`, kein Tor. Ein
SwiftShader-Lauf hätte dieselbe Struktur mit `passed: true` produziert.

**Vergleich perf.mjs (Nachher-Muster, 9bcc1e41):** flacher `renderer`-String via
`getRendererString(page)`, `rendererValid`, `invalid` auf Top-Level und pro Gate
(`burst.invalid`, `minute25.invalid`), `passed` mit `rendererValidFlag &&`, Exit 1.

**Diff-Grenze (bewusst NICHT angerührt):**

- `scripts/m10-heap-budget.mjs` — hat dasselbe Defizit (inlined `renderer`-Objekt,
  kein `rendererValid`, Gate ohne Renderer-Tor), läuft aber als separater Vorrat-Job
  (merge-m10-heap-gate-retry / Backlog Teil 2). Kein Touch, keine Doppelarbeit.
- `scripts/lf-renderer.mjs` — Helper wird nur importiert, nicht geändert.
- Spielcode (`src/`), `GAME.md` — kein Verhaltenstouch.

**Fix (K2):** fullrun.mjs importiert `rendererValid` aus `scripts/lf-renderer.mjs`,
wendet sie auf den bereits erfassten Renderer-String an (bestehende Erfassung bleibt —
kein Duplikat, siehe Kommentar in lf-renderer.mjs), schreibt `renderer`,
`rendererValid`, `invalid` ins Summary und zieht die Gültigkeit in `passed` ⇒
SwiftShader ⇒ `passed=false` ⇒ Exit-Code 1. Messablauf (Tore, Heap-Metrik, FPS-Fenster,
Screenshots) unverändert.

## K2 — Umsetzung (Karte #13787, Commit c047a0a0)

`scripts/fullrun.mjs` (+22/−3, Commit-Gate PASS):

- `import { rendererValid } from "./lf-renderer.mjs";` — Helper unverändert genutzt
  (kein Duplikat der SwiftShader-Erkennung; lf-renderer.mjs selbst nicht angefasst).
- `rendererString`-Mapping: `"none"` (fehlender GL im Inline-Capture) ⇒ `""` —
  fehlender Renderer ist **nie** valide (wie `rendererValid("")`).
- Summary: `renderer` (Objekt, unveränderte JSON-Form), `rendererString` (flacher
  String wie in perf.mjs-JSONs), `rendererValid`, `invalid`.
- Tore: `heap.passed = heapOk && rendererValidFlag`, `fps.passed = fpsOk &&
  rendererValidFlag`, Top-Level `passed = rendererValidFlag && ok && heapOk && fpsOk`;
  `summaryPassed = summary.passed` ⇒ `process.exit(summaryPassed ? 0 : 1)` —
  **SwiftShader ⇒ Exit-Code 1**, Kennzahlen bleiben lesbar (wie in perf.mjs).
- Messablauf unangetastet: Loop, Heap-Metrik (Teardown-Tor), FPS-Fenster,
  Inhalts-Tore (Bosse/Truhen/Dawn), Screenshots — Diff greift nur an Import,
  Mapping und Summary-Feldern.
- `npx tsc --noEmit` rc=0; `node --check` ok.

## K3 — Test (Karte #13788, Commit 89b61fa9)

`tests/fullrun-renderer-valid.test.ts` (9 Tests, gemockt, kein Browser; npm test
238 Files / 2577 Tests, 0 fail):

- Verhalten (über `lf-renderer.mjs`): iGPU-String (Mesa RPL-S, die echten Belege)
  ⇒ `rendererValid=true`; SwiftShader-Varianten ⇒ `false`; Mapping `none ⇒ ""` ⇒
  `rendererValid=false` (fehlender GL nie durchlassbar).
- Quell-Guard auf `scripts/fullrun.mjs`: Helper-Import, `none`-Mapping,
  `rendererString/rendererValid/invalid` im JSON, Tor-Verdrahtung
  (`heap/fps/passed` ziehen `rendererValidFlag`), Exit über `summaryPassed`,
  Inhalts-Tore weiterhin vorhanden (Messablauf unangetastet).

## K4 — realer Kurz-Beleg (Karte #13789)

**Geplant:** Ein fullrun-Kurzlauf (Skript-Fenster 150 s @30x + 1x-Endminute ⇒
~3 min, `--viewport 640x360`, `--tag -rv`) unter `flock /home/ai/games/.lf-perf.lock`
(`timeout 3300 flock -w 3200`, synchron/kein Polling). Ergebnis-JSON mit
`rendererValid:true` nach `~/games/.evidence/m10-fullrun-renderer-valid/` und
`shots/m10-fullrun-rv-1.json`.

**Lage (17:59Z):** Sperre durch Lane `m10-heap-gate-retry` belegt — **zwei 30-min
Heap-Läufe in EINEM flock-Halt** (17:39Z–ca. 18:41Z), dahinter wartet
`m10-fx-medium-cap` seit 17:43Z (`flock -w 3900`). Erster eigener Versuch
(`timeout 540 flock -w 900`) endete rc=124 im Warten, bevor die Sperre frei wurde
(leeres Log ⇒ Prozess kam nie über `flock` hinaus). Kurzlauf ist queued; falls die
Sperre nicht frei wird ⇒ Karte blocked mit Grund (Sperrenkontention), Ausweichbeleg
bleibt dem Merge-/Abnahme-Job vorbehalten.

**Befund-Seitennotiz (Supervisor-Steer):** Der Steer zu Karte #13283
(GroundRenderer chunk_*-Doppel-Adds) ist dieser Lane fehlgeroutet — #13283 gehört
nicht zu diesem Briefing (Disponent: nur #13786–#13805; Datei-Claims nennen `src/`
nicht). Karte nicht angenommen, Spalte unverändert, Hinweis als Board-Notiz an
#13283.

