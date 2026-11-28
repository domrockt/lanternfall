# Lane m10-render-1280-gap — 1280er Viewport: Ground-Chunks rechts/unten ungerendert (#12969)

Worktree: `/home/ai/games/lf-lanes/m10-render-1280-gap` (Branch `m10-render-1280-gap`).
Karten: #13894 (K1 Repro-Scan), #13895 (K2 Fix/Nicht-Repro), #13896 (K3 Guard-Test), #13897 (K4 Doku/ Abschluss).
Befund-Karte: #12969 (backlog). Belege: `~/games/.evidence/m10-render-1280-gap/` (untracked).

## K1 (#13894): Repro auf main nach Chunk-Fix-Merges — BEFUND REPRODUZIERT

Skript: `scripts/m10-render-1280.mjs` (Muster `verify-terrain.mjs`: seed 13, god, suppressLevelUps,
timeScale 8, 60 Spiel-Sekunden Laufen in 8 Richtungen; Start-Shot ~300 ms nach Szenenstart, End-Shot danach).
Lauf: 2026-11-28T18-21-12-663Z (JSON + 6 PNGs unter `~/games/.evidence/m10-render-1280-gap/`),
Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — gültig (kein SwiftShader), 0 JS-Fehler.

| Format | Start-Shot | End-Shot (60 s) |
|---|---|---|
| 960x540@1 (Kontrolle) | **Chunk-Lücke rechts/unten sichtbar** (harte Kanten) | vollständig gerendert |
| 1280x720@1 | **rechte Hälfte komplett dunkel** (Chunks fehlen, Licht-Gradient sichtbar, keine reine Schwarz-Fläche) | vollständig gerendert |
| 1280x720@2 | Lücke rechts/unten (Timing-Race, anteilig installiert) | vollständig gerendert |

- Scan A (reine Schwarz-Flächen, `checkScreenshot` aus `scripts/terrain-coverage.mjs`, Schwelle ≥300 px):
  **überall maxRegion=0** — der Befund ist KEINE reine Schwarz-Fläche, sonderndeckungsgleich mit der
  Original-Beschreibung in #12969 („radiale Licht-Gradient sichtbar, NICHT reines Schwarz"). Der
  Schwarz-Pixel-Guard allein fängt diesen Defect NICHT — Entscheidungsgrund war die Sichtprüfung der Shots.
- Scan B (Zellen-Luminanz, ergänzend): Start-Shots zeigen dunkle Quadranten (z. B. 1280@1: rechts
  18,9/18,5 vs. links 44,7/44,8 Mittel-Luminanz), End-Shots ausgeglichen (~48-50 in allen Quadranten).
  Achtung: dunkle Seen produzieren false positives im Scan B — verbindlich ist die Sichtprüfung.
- Original-Beleg von #12969 (`shots/merge-m10-charstats-spec-followup-check-1280.png`, 00:00) zeigt
  denselben Defect; der 960er-Kontroll-Shot derselben Pipeline (`…-check-960.png`, 00:00) war vollständig.

### Ursachenanalyse (src/gfx/GroundRenderer.ts)

- `finalizeReady()` baut **höchstens 1 Chunk pro Frame** (frame-tail-batching / #12436-Glättung),
  `dispatch()` hält **max. 2 Worker-Aufträge** parallel.
- Sichtbereich 1280x720 = 5x3 Chunks à 256 px + 1 Chunk Margin = **35 Chunks**, 960x540 = 30.
  Mit 1 Install/Frame und 2 in-flight Worker-Jobs ist der Start-Rückstau bei 1280 zum
  Kontroll-Screenshot-Moment (Szenenstart, 00:00) noch nicht abgearbeitet → rechts/unten dunkel.
- Bei 960 ist der Rückstau knapp rechtzeitig abgearbeitet (Timing-Race, deshalb „1280 betroffen,
  960 nicht" im Original-Befund). Nach 60 s Laufen ist jede Format-Version vollständig.
- Zusätzlich (latent): die Chunk-Anfrage-Range in `update()` nutzt `camera.scrollX + camera.width`
  ohne Zoom-Kompensation — bei Render-Teiler s>1 wäre die Range wieder zu schmal (#4658-Fehlerklasse,
  nur im Culling gefixt). Seit `RENDER_SCALE_MAX = 1` aktuell inaktiv, aber vom gleichen Muster.

## K2 (#13895): Fix — Worker-Pool + Start-Rueckstau-Installs + sichtbare Chunk-Range

Fix in `src/gfx/GroundRenderer.ts` (Terrain-Generierung bitgleich unveraendert):

1. **Worker-Pool (`CHUNK_WORKER_COUNT = 4`)** statt 1 sequenziellem Terrain-Worker:
   Der einzelne Worker malt ~100 ms je Chunk (Wasser-Chunks alle WATER_ANIM_STEPS-Frames);
   die 24-Chunks-Startfuellung dauerte im K1-Messlauf **2.113 ms** (Probe `~/tmp/m10-render-1280-gap/probe3-filltime.json`).
   4 Worker malen auf echten Threads parallel: **24 Chunks in ~0,95 s**, die ersten 12 sichtbaren
   nach ~0,64 s, die ersten 4 nach ~0,33 s (Probe `~/tmp/m10-render-1280-gap/probe4-timeline.json`, Lauf 18:39).
   Dispatch bleibt naechstgelegen-zuerst (1 Job je Worker), 2-s-Timeout/Sync-Fallback unveraendert.
2. **Start-Rueckstau-Installs (`backlogInstallsAllowed` + `CHUNK_INSTALL_BACKLOG_BUDGET_MS = 10`)**:
   ueber das 1-Install-pro-Frame-Gate (#12436-Glaettung) hinaus duerfen bei echtem Rueckstau
   (ready > 2, kein Frame-Budget-Defer) weitere Installs innerhalb eines 10-ms-Echtzeitbudgets erfolgen.
3. **Chunk-Anfrage-Range aus `cameraWorldView()`** (`chunkRangeForView`, #4658-Muster): bei Teiler s>1
   war die alte Range `scrollX + camera.width` zu schmal (aktuell inaktiv, da RENDER_SCALE_MAX = 1,
   aber gleiche Fehlerklasse wie der #4658-Cull-Bug). Bei Teiler 1 bitgleich zur alten Berechnung.

Bundler-Falle (K1-Befund, dokumentiert weil sonst nicht sichtbar): der Worker muss im
Inline-Muster `new Worker(new URL("./terrainWorker.ts", import.meta.url))` referenziert bleiben —
eine ausgezogene URL-Variable wird von Rolldown als `data:`-URL eingebettet, und
data:-URL-Module-Worker schlagen im Chrome fehl (onerror) → stiller Sync-Fallback
(Probe `~/tmp/m10-render-1280-gap/probe6-worker.json`: single/four = onerror).

### Nachher-Messung (scripts/m10-render-1280.mjs, Lauf 2026-11-28T18-37-57-415Z)

Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (gueltig), 0 JS-Fehler.
Belege: `~/games/.evidence/m10-render-1280-gap/2026-11-28T18-37-57-415Z-*.png|json`.

| Format | Start-Shot | End-Shot (60 s) |
|---|---|---|
| 960x540@1 | voll gerendert, Quadranten 44.6/47.2/44.7/48.4 (vorher: Lücke rechts/unten) | vollständig |
| 1280x720@1 | **voll gerendert, keine Chunk-Lücke** (vorher: rechte Hälfte dunkel) | vollständig |
| 1280x720@2 | voll gerendert (vorher: Lücke) | vollständig |
| 1920x1080@1 | voll gerendert | vollständig |

- Scan A (reine Schwarz-Flächen): überall maxRegion=0, ok=true.
- Scan B (Zellen-Luminanz): Start-Quadranten ausgeglichen; dunkle Zellen (97-700 je Format)
  sind dunkle Seen (minCell ~9 = Wasserfläche), flächig verteilt und in Vorher/Nachher identisch
  sichtbar — kein Chunk-Defect. Verbindlich war die Sichtprüfung der PNGs (Sichtprüfung 1280@1:
  Terrain/Props/Wasser überall, harte Kanten weg).
- Sichtprüfung nach Fix: `2026-11-28T18-37-57-415Z-1280-dpr1-start.png` voll gerendert
  (Abnahme-Bild: `shots/abnahme/m10-render-1280-1280-start-after.png`).

Vorher-Belege (Start-Luecke sichtbar): `2026-11-28T18-21-12-663Z-*.png` im selben Evidence-Ordner.

## K3 (#13896): Guard-Test

(folgt)

## K4 (#13897): Abschluss

(folgt)
