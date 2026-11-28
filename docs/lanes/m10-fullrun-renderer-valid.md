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
