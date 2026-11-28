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

## K2 (#13895): Fix

(folgt)

## K3 (#13896): Guard-Test

(folgt)

## K4 (#13897): Abschluss

(folgt)
