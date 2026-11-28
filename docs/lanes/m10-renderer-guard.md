# Lane m10-renderer-guard — Renderer-Guard (Doms Regel: SwiftShader-Belege ungueltig)

Ziel: Doms Regel (Wünsche von Dom 19:20Z, Punkt b) maschinell durchsetzen:
"in jedem Perf-Beleg den WebGL-Renderer mitschreiben (Abnahme ungueltig bei SwiftShader)".
Stand-Check 28.11.: `scripts/perf.mjs` und `scripts/m10-v10-device-10min.mjs` erfassten den
Renderer NICHT; `m10-heap-budget.mjs` und `fullrun.mjs` taten es. Ohne Guard blieben
SwiftShader-Zahlen als Belege technisch moeglich.

## Karten

### K1 (#13404) — Helper `scripts/lf-renderer.mjs`
- Exporte: `getRendererString(page)` (WEBGL_debug_renderer_info /
  UNMASKED_RENDERER_WEBGL, Fallback `gl.RENDERER`, immer String, `""` wenn
  unlesbar), `isSwiftShader(s)` (regex `/swiftshader/i`), `rendererValid(s)`
  (nicht-leer UND nicht SwiftShader).
- Bewusst KEINE Aenderung an den Skripten, die den Renderer schon selbst
  erfassen (`fullrun.mjs`, `m10-heap-budget.mjs`) — deren Logik bleibt unangetastet.
- Commit: af114498.

### K2 (#13405) — Einbau in `scripts/perf.mjs` und `scripts/m10-v10-device-10min.mjs`
- Beide Skripte erfassen jetzt `renderer` + `rendererValid` im Output-JSON.
- Bei SwiftShader/fehlendem Renderer: `rendererValid:false`, Kennzahl-Bloecke
  (`burst`/`minute25` bzw. `fps`) und Top-Level mit `invalid:true` markiert,
  `passed:false` (Exit-Code 1) — Beleg bleibt lesbar, Urteil eindeutig.
- Messlogik (Fenster, Spawning, Tore an FPS/Gegnerzahl) unveraendert.
- Commit: c9316904.

### K3 (#13406) — Guard-Test `tests/renderer-guard.test.ts`
- 12 Tests: SwiftShader-Varianten (ANGLE-String, Gross/klein, Vulkan), echte
  iGPU-Strings (Mesa Intel RPL-S, UHD 620), Adreno (Android-Tablet), fehlende
  Werte (leer/null/undefined/nicht-String) -> ungueltig; getRendererString
  faellt robust auf `""` zurueck.
- Quell-Guard: beide Skripte importieren `lf-renderer.mjs` und schreiben
  `renderer`/`rendererValid`/`invalid` ins Output (Muster Quelle-Guard-Tests,
  wie `verify-outputs-hygiene.test.ts`).
- Commit: 98108511. `npx vitest run tests/renderer-guard.test.ts`: 12/12 gruen;
  `npx tsc --noEmit` rc=0; commit-gate PASS ueber alle 3 Commits.

### K4 (#13407) — Probe-Lauf + Beleg — **ERLEDIGT (Restauftrag Lane m10-renderer-guard-k4, 28.11. 17:32Z)**
- Erster Versuch 28.11. tagsueber war blocked (Mess-Sperre durchgehend fremd
  belegt: `flock -w 2400` vom Supervisor abgebrochen, `flock -w 60` rc=1,
  Halter/Wartende u. a. m10-v10-gate-rerun, m10-janky-remeasure,
  m10-heap-budget-Smoke, m10-gc-probe, m10-blend-band).
- Restauftrag als eigene Lane `m10-renderer-guard-k4` (Worktree
  `/home/ai/games/lf-lanes/m10-renderer-guard-k4`, Board #13599–#13601)
  abgeschlossen. Probe-Lauf mit begrenzter Wartezeit
  (`flock -w 900` + `timeout 5400`, Log `~/tmp/m10-renderer-guard-k4/k1-perf.log`),
  Sperre nach kurzem Warten (u. a. 1-min-Heap-Smoke von m10-heap-gate-retry)
  frei geworden, Lauf Ende 17:32Z, Exit 0.
- Befehl: `node scripts/perf.mjs --viewport 780x360 --dpr 3
  --out shots/m10-renderer-guard-k4-perf.json` unter
  `flock /home/ai/games/.lf-perf.lock`.
- Beleg: `/home/ai/games/.evidence/m10-renderer-guard/m10-renderer-guard-perf.json`
  (Kopie des gitignorierten `shots/m10-renderer-guard-k4-perf.json`).
- Kennzahlen:
  - `renderer`: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
    → iGPU, kein SwiftShader.
  - `rendererValid: true`, Top-Level `invalid: false`, `jsErrors: []`,
    `passed: true`.
  - `burst`: fps 59, `invalid: false`, `passed: true`.
  - `minute25`: fps 60 (gemessen 60.6), `invalid: false`, `passed: true`.
- Damit ist der K2-Guard (K1–K3 dieser Lane) an einem echten Lauf belegt:
  der Renderer-String steht im JSON, die Kennzahl-Bloecke sind nicht mit
  `invalid:true` markiert.

## Ergebnis

- K1–K3 committed (af114498, c9316904, 98108511), commit-gate PASS, tsc rc=0,
  12/12 Guard-Tests gruen.
- K4 erledigt (Restauftrag Lane m10-renderer-guard-k4, 28.11. 17:32Z):
  Probe-Beleg mit iGPU-Renderer-String (Mesa Intel RPL-S),
  `rendererValid: true`, 0 JS-Fehler, burst/minute25 `passed`/nicht `invalid`.
  Lane damit abgeschlossen.

## Offene Punkte / Folgen
- Die beiden gesicherten Skripte decken `npm run perf` und den 10-min-Device-Lauf
  ab. `fullrun.mjs`/`m10-heap-budget.mjs` schrieben den Renderer schon vorher
  (ohne SwiftShader-Markierung). Falls gewuenscht: Folge-Karte, um auch dort
  `rendererValid`/`invalid` via lf-renderer.mjs zu ergaenzen (deren Logik nicht
  angefasst, nur Felder ergaenzt) — Bedarf hier gemeldet, nicht umgesetzt.
- Sw1ftShader-Muster: einfacher `/swiftshader/i`-Check; falls Chrome kuenftig
  andere Software-GL-Namen liefert (z. B. llvmpipe), kann die Regex erweitert
  werden (Tests haengen an der Regex-Funktion, einzeilig aenderbar).
