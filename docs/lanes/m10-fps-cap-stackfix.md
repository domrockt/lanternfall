# Lane m10-fps-cap-stackfix — RangeError-Regression unter Last (Game-Loop-Tod) fixen

Quelle: Bedarfsmeldung m10-mobile-fps-cap 2026-11-28T15:00Z (docs/lanes/m10-mobile-fps-cap.md,
Abschnitte K3/K4). Auf dem K2-Build 700c815e (Frame-Cap 60 am Geräteknoten) stirbt der Game-Loop
unter Last: 9 × `RangeError: Maximum call stack size exceeded` je Lauf, deckungsgleich mit
9 Frozen-Loop-Ereignissen (alle ~40–80 s); der K1-Old-Build lief 12 min ohne einen Fehler.
Damit ist der K3-Gerätetor janky < 10 % (21,54 % bei Cap 60) nicht erreichbar — v1.0-Gerätetor-Blocker.

**Dateien (Disponent):** src/logic/fps-cap.ts, scripts/m10-fps-cap-stackfix.mjs,
tests/fps-cap-stackfix.test.ts, docs/lanes/m10-fps-cap-stackfix.md, .lane-done.
**Nicht anfassen:** src/main.ts, src/scenes/UI.ts (belegt durch m10-mobile-fps-cap);
Bedarfstat in /home/ai/games/.dispatch/requests.md.

**Vorbemerkung (Fremdgriff, dokumentiert):** Die Regression liegt im K2-Stand der Lane
m10-mobile-fps-cap, die zum Lane-Start noch NICHT in main gemergt war (Branch f64b3d33, lane-done,
Merge ausstehend). Der eigene Worktree (Basis main 213b8494) enthielt src/logic/fps-cap.ts und
die K2-Änderungen daher nicht. Ohne diesen Stand ist die Regression nicht reproduzierbar —
die fps-cap-Dateien (src/logic/fps-cap.ts, src/main.ts, src/audio/options.ts, src/audio/settings.ts,
tests/mobile-fps-cap.test.ts + 5 repointete Tests) wurden per
`git checkout m10-mobile-fps-cap -- <dateien>` in den Worktree materialisiert (Inhalt identisch zum
Branch, kein Merge, kein Branch-Checkout). Beim Merge beider Lanes nach main ist der Inhalt
deckungsgleich, es entstehen keine Konflikte.

## K1 — Stack-Capture unter Last — 28.11.

- Probe: `scripts/m10-fps-cap-stackfix.mjs` (m25-Last wie m10-fps-cap-device.mjs: 6 Evos Lv8,
  6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt; BILDRATE=60 via
  Persistenzpfad + Reload = genau der K2-Pfad; Vite-DEV-Server → Stacks unminified).
- Laufumgebung: LOKAL im Android-Ersatzprofil (Galaxy Tab S4 landscape, dpr 2.25,
  CDP-CPU-Drossel ×4) — das Gerät ist kontentioniert (409 DOM_SPIELT, Dom spielt; 409-Regel:
  nicht wiederholt). Der Stack ist ein Logik-Befund, kein FPS-Beleg; Renderer-String steht im JSON.
- Capture: `pageerror` mit vollem Stack (`e.stack`), Frozen-Loop-Erkennung je Fenster,
  Heilung per Reload (Rezept fps-cap-Lane).

Ergebnis: siehe JSON `~/games/.evidence/m10-fps-cap-stackfix/k1-stack-vorher.json`.

## K2 — Wurzel + Fix — 28.11.

(offen)

## K3 — Regressionstest — 28.11.

(offen)

## K4 — Vorher/Nachher + Doku — 28.11.

(offen)
