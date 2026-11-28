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

## K2 — Guard in verify-terrain (umgesetzt, Commit ded8f06)

`scripts/terrain-coverage.mjs` (geteilt mit K3-Suite-Test): minimaler PNG-Decoder
(Muster aus `scripts/m10-hazard-warn.mjs`, 8-bit RGB/RGBA non-interlaced,
reines Uint8Array) + `analyzeCoverage(img, opts)` — flood-fill (4-Nachbarn) über
Pixeln mit r,g,b < 6 im Spielfeld-Rect (Top-Blacklist abgezogen), liefert
Regionen {area, minX, minY, maxX, maxY} und `ok = (keine Region ≥ 300 px)`.
`playfieldTopPx(breite) = ceil(34 * breite / 640)` (960→51, 1280→68, 1920→102).

Guard-Ablauf je Format (960x540, 1280x720, 1920x1080), eigener Page-Context:
`?debug=1&seed=13` → startRun → `god(true)`, `setSuppressLevelUps(true)` (keine
Overlays im Prüffenster), `setTimeScale(8)` → Shot **Start** → 8 Richtungen
(E, NE, N, NW, W, SW, S, SE) je 7.5 Spiel-Sekunden via Tastatur (60 s Spielzeit,
×8 ≈ 8 s Echtzeit) → Shot **Ende** → Decoder + `analyzeCoverage` im Node-Teil.
Renderer-String via `window.__lf.rendererInfo()` — Pflicht: kein SwiftShader/
llvmpipe/software (`rendererValid`, FAIL = ungültiger Beleg; Lauf 2026-11-28:
„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“ in allen 3
Formaten). Guard-Fehler (pageerror/console.error) fließen in `errors` und damit
in `passed`. Ergebnis-JSON `shots/m10-terrain-guard.json`, End-Shots
`shots/m10-terrain-guard-<fmt>-end.png`.

## K3 — Suite-Test (umgesetzt, Commit 364654c)

`tests/terrain-coverage.test.ts` (7 Tests, 219 ms) baut Fixtures im Speicher
(minimaler PNG-Encoder via `node:zlib`, CRC32 — keine Binärdateien im Repo) und
schickt sie durch denselben `decodePng → analyzeCoverage`-Pfad wie
verify-terrain:
1. `playfieldTopPx` skaliert die HUD-Blacklist auf 960/1280/1920 (51/68/102).
2. bekannt-gut (Weltgrün + Vignette-Ecke ≥ 6 + schwarzes HUD oben) → ok,
   maxRegion 0 (HUD-Schwarz zählt nicht).
3. bekannt-lochig (60x40 Rect im Spielfeld) → **FAIL** mit exakter Region
   (area 2400, (300,200)-(359,239)) — der rote Beweis der Schranke.
4. gleiches Loch in der HUD-Blacklist → ok (dokumentierte Ausnahme).
5. Loch < Mindestfläche (144 < 300) → ok, aber als Region gemeldet.
6. Schwelle: (5,5,5) zählt, (6,7,12) (HUD-nah) und (6,6,6) nicht (strikt < 6).
7. zwei getrennte Löcher → zwei Befunde (4-Nachbarn-Zusammenhang).
Typen via `scripts/terrain-coverage.d.mts` (Repo-Muster m10-heap-budget-gate.d.mts).

## K4 — Guard-Lauf + Belege (Commit nach diesem Stand)

- Guard-Lauf auf Lane-Stand (identisch mit main `91361e3` + Guard): **PASS in
  38 s** (Budget ≤ 3 min), `coverageOk: true`, `rendererValid: true`,
  maxRegion 0/0 (Start/Ende) in allen 3 Formaten. Log
  `~/games/.evidence/m10-terrain-hole-guard/k4-guard-run.log`, JSON
  `k4-guard-result.json`, Shots `k4-guard-{960,1280,1920}-end.png`.
- Abnahme-Shots im Repo: `shots/abnahme/m10-terrain-guard-{960,1280,1920}-end.png`.
- **Rot-Beweis der Schranke** (künstliches Loch statt Browser-Defect, da main
  sauber ist): 80x60 schwarzes Rect bei (600,300) in den echten 1280x720
  Guard-Shot eingezeichnet → `analyzeCoverage` meldet Region 4800 px
  (600,300)-(679,359), `guardOk: false`. Belege
  `~/games/.evidence/m10-terrain-hole-guard/k4-red-proof.json` + 
  `k4-red-proof-1280.png`.
- Kein roter Befund gegen einen echten Stand: main ist sauber (0 schwarze
  Flächen) — damit keine Bedarfsmeldung aus dem Lauf selbst. Die Schranke ist
  über die K3-Fixtures und den Rot-Beweis belegt.

## Messwerte

| Messung | Wert | Beleg |
|---|---|---|
| verify-terrain Ist-Laufzeit (K1, ohne Guard) | 9 s, PASS | `~/tmp/m10-terrain-hole-guard/k1-baseline.log` |
| verify-terrain mit Guard (K2/K4) | 38 s, PASS (Budget ≤ 3 min) | `~/games/.evidence/m10-terrain-hole-guard/k4-guard-run.log` |
| Schwarze Regionen ≥ 300 px, 3 Formate × Start/Ende | 0/0, 0/0, 0/0 | `k4-guard-result.json` |
| Renderer (alle 3 Formate) | Mesa Intel(R) Graphics (RPL-S), webgl1 — nicht SwiftShader | `k4-guard-result.json` |
| Kleinster legitimer Schwarz-Cluster (Kalibrierung) | 135 px (Prop-Schatten, late-1920) → Mindestfläche 300 | Probe-Decoder über `~/games/.review/out/*.png` |
| Rot-Beweis: künstliches 80x60-Loch im echten Shot | Region 4800 px erkannt, guardOk=false | `k4-red-proof.json` + `-1280.png` |
| Suite-Test | 7/7 grün, gesamt npm test 1529/1529, tsc + build grün | `~/tmp/m10-terrain-hole-guard/k3-{build,test}.log` |

## Offene Punkte / Bedarfsmeldungen

- (keine aus dem Guard-Lauf — main `91361e3` ist terrain-sauber in allen 3 Formaten)

