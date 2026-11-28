# Lane m10-terrain-hole-guard — Terrain-Schwarz-Pixel-Guard

Offener Teil der DRINGEND-Meldung 2026-11-28 04:00Z („Karte hat schwarze Löcher“):
das geforderte Kriterium **„kein Pixel der Spielfläche ohne Terrain“** wird als
festes Abnahme-Kriterium in `verify-terrain` verankert. Diese Lane fixt KEIN
Terrain (main `91361e3` ist sauber, Beleg `~/games/.review/out/holes-*.png`
zeigte das Loch im Lane-Stand m10-evo-fx-dornensturm) — sie baut die
Regressionsschranke, die künftig JEDEN Stand (Lane-Worktrees und main) vor dem
Merge verifiziert. Ein roter Befund wird als Bedarfsmeldung dokumentiert, nicht
selbst umgebaut.

## K1 — Ist-Analyse `scripts/verify-terrain.mjs` (Stand 91361e3)

**Was das Skript heute prüft** (M3-Abnahme Moorwasser, seed=13, Viewport 960x540,
`?debug=1`):
1. Bewegungs-Ratio Wasser/Gras frame-genau über `postupdate`-Samples
   (posX logisch + player.x Darstellung), Ziel 0.6, erlaubt 0.55–0.68.
2. Spritzer-Partikel (`fx_spark`, depth 6, alpha > 0.3) ≥ 3 im Wasser.
3. Gegner-Slow im Wasser (Golem ≤ 75 % der def-Speed, Start+Ende auf Wasser).
4. JS-Fehler (pageerror + console.error) = 0.

**Schnittstellen:** `scripts/harness.mjs` (`ensureBuild`, `startServer`,
`loadPlaywright`, `startRun`), Debug-API `window.__lf` (`god`, `setTimeScale`,
`teleport`, `spawnEnemy`), Ausgabe `shots/m3-terrain.json` + Exit-Code.

**Laufzeit (Ist, gemessen 2026-11-28 auf diesem Stand):** 9 s (dist warm),
Exit 0 / PASS. — Es bleibt also > 2:50 min Budget im 3-min-Korridor für den Guard.

**Was fehlt (die Lücke):** Es gibt keinerlei Prüfung des *gerenderten* Bildes.
Ein Chunk-Rendering-Fehler, der eine zusammenhängende reine Schwarz-Fläche
(r,g,b < 6) mitten im Spielfeld hinterlässt (der beobachtete „rechter
Schwarz-Streifen“ im ersten 1280-Shot von m10-evo-fx-dornensturm, transiente
Repros in Board-Notiz 8bef481), würde heute unbemerkt durch verify + Merge gehen.
Auch bei mehreren Auflösungen wird nur 960x540 überhaupt gefahren — der Defect
trat aber erst bei 1280 auf.

**Kalibrierung an echten Screenshots** (eigener Probe-Decoder, Belege
`~/games/.review/out/*.png`, alle 960x540/1280x720/1920x1080):
- Schwelle r,g,b < 6 („reines Schwarz“): auf ALLEN Belegen (inkl. holes-*.png)
  0 Regionen ≥ 200 px — die Defecte jener Lane-Stände sind hier nicht sichtbar
  (transient / bereits reverted); die Schranke wird deshalb in K3 mit
  künstlichen Loch-Fixtures rot belegt.
- HUD-Leiste oben: `nightDeep` @ 0.82 misst (12,17,23) bis (6,7,12) — knapp
  über der Schwelle, aber zu nah, um sie nicht explizit auszunehmen.
- Kleinste legitime Schwarz-Cluster (Prop-Schatten, late-1920): 135 px.
  → Mindestflächen-Schwelle 300 px zusammenhängend trennt mit Sicherheitsabstand.

**Blacklist (UI-Overlay, ausgenommen vom Spielfeld-Rect), dokumentiert:**
- Obere HUD-Leiste: in Spiel-Pixeln y < 34 (Leiste 12 px + XP-Zeile + HP-Zeile
  bis y≈24 + Toleranz; `src/scenes/UI.ts` — `hud`-Rect y=0 h=12, xpBg y=8 h=4,
  hpBg y=15 h=9). In Bildschirm-Pixeln: `yTop = ceil(34 * bildbreite/GAME_WIDTH)`.
- Restliche Fläche (inkl. Wasser, Vignette, Boss-Banner-Bereich ohne aktiven
  Boss) bleibt im geprüften Spielfeld. Level-Up-/Truhen-Overlays werden im
  Guard-Lauf per `setSuppressLevelUps(true)` gar nicht erst geöffnet.

## K2 — Guard in verify-terrain (Umsetzung)

`scripts/terrain-coverage.mjs` (geteilt mit K3-Suite-Test): minimaler PNG-Decoder
(Muster aus `scripts/m10-hazard-warn.mjs`, 8-bit RGB/RGBA non-interlaced) +
`analyzeCoverage(img, opts)` — flood-fill (4-neighb.) über Pixeln mit
r,g,b < 6 innerhalb des Spielfeld-Rects (Top-Blacklist abgezogen), liefert
Regionen {area, minX, minY, maxX, maxY} und `ok = (regionen mit area ≥ 300) = 0`.

Guard-Ablauf je Format (960x540, 1280x720, 1920x1080), eigener Page-Context:
`?debug=1&seed=13` → startRun → `god(true)`, `setSuppressLevelUps(true)`,
`setTimeScale(8)` → Shot **Start** → 8 Richtungen (E, NE, N, NW, W, SW, S, SE)
je 7.5 Spiel-Sekunden via Tastatur (60 s Spielzeit, ×8 ≈ 8 s Echtzeit) → Shot
**Ende** → Decoder + `analyzeCoverage` im Node-Teil. Renderer-String via
`window.__lf.rendererInfo()` (Pflicht: Mesa Intel iGPU; SwiftShader = FAIL,
Beleg ungültig). Ergebnis-JSON `shots/m10-terrain-guard.json` (Kopie in
`~/games/.evidence/m10-terrain-hole-guard/`), Abnahme-Shots nach
`shots/abnahme/m10-terrain-guard-<fmt>-end.png`.

## K3 — Suite-Test

`tests/terrain-coverage.test.ts` baut Fixtures im Speicher (minimaler
PNG-Encoder via node:zlib, keine Binärdateien im Repo): bekannt-gute Fläche
(Weltgrün + Vignette-artig abgedunkelte Ecken, aber ≥ 6) → ok; bekannt-lochig
(60x40 schwarzes Rect im Spielfeld) → FAIL mit korrekter Region; gleiches Loch
in der HUD-Blacklist → ok; Loch < 300 px → ok (dokumentierte Mindestfläche).
Schwellen-Edgecases: (5,5,5) zählt, (6,7,12) zählt nicht.

## K4 — Guard-Lauf + Belege

(mit dem Lauf gefüllt)

## Messwerte

| Messung | Wert | Beleg |
|---|---|---|
| verify-terrain Ist-Laufzeit (K1) | 9 s, PASS | `~/tmp/m10-terrain-hole-guard/k1-baseline.log` |
| Kleinster legitimer Schwarz-Cluster | 135 px (late-1920, Prop-Schatten) | Probe-Decoder über `~/games/.review/out/*.png` |
| Schwarz-Regionen ≥ 200 px in holes-*.png | 0 (Defect dort nicht sichtbar/transient) | dito |

## Offene Punkte / Bedarfsmeldungen

- (noch keine)
