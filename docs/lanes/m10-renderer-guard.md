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

### K4 (#13407) — Probe-Lauf + Beleg — **BLOCKED (Mess-Sperre)**
- Probe-Lauf `node scripts/perf.mjs --out ...` soll unter
  `flock /home/ai/games/.lf-perf.lock` laufen. Zwei Versuche:
  1. `flock -w 2400` (Hintergrund) — von Supervisor abgebrochen; zur Laufzeit
     hielt u. a. `m10-janky-remeasure` (10-min-Lauf) die Sperre.
  2. `flock -w 60` + `timeout 240` (kurzer Retry, 17:02Z) — rc=1, Lock auch
     danach belegt (Halter/Wartende u. a.: m10-v10-gate-rerun,
     m10-janky-remeasure, m10-heap-budget-Smoke, m10-gc-probe, m10-blend-band).
- Beleg also NICHT erzeugt:
  `/home/ai/games/.evidence/m10-renderer-guard/m10-renderer-guard-perf.json`
  fehlt. K4 bleibt auf `blocked`; der Lauf ist reines Ausfuehren der in K2
  gebauten Funktion (Code ist committed und per Quell-Guard abgesichert).
- Disponent in `/home/ai/games/.dispatch/requests.md` informiert: Restauftrag
  ist der einmalige Probe-Lauf, sobald `.lf-perf.lock` frei ist.

## Ergebnis

- K1–K3 committed (af114498, c9316904, 98108511), commit-gate PASS, tsc rc=0,
  12/12 Guard-Tests gruen.
- K4 blocked: Mess-Sperre durchgehend fremd belegt (Supervisor-Anweisung,
  Abbruchkriterium erreicht).

## Offene Punkte / Folgen
- Die beiden gesicherten Skripte decken `npm run perf` und den 10-min-Device-Lauf
  ab. `fullrun.mjs`/`m10-heap-budget.mjs` schrieben den Renderer schon vorher
  (ohne SwiftShader-Markierung). Falls gewuenscht: Folge-Karte, um auch dort
  `rendererValid`/`invalid` via lf-renderer.mjs zu ergaenzen (deren Logik nicht
  angefasst, nur Felder ergaenzt) — Bedarf hier gemeldet, nicht umgesetzt.
- Sw1ftShader-Muster: einfacher `/swiftshader/i`-Check; falls Chrome kuenftig
  andere Software-GL-Namen liefert (z. B. llvmpipe), kann die Regex erweitert
  werden (Tests haengen an der Regex-Funktion, einzeilig aenderbar).
