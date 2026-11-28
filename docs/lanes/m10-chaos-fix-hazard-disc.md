# Lane m10-chaos-fix-hazard-disc — B3-Fix: Telegraph-Discs/-Ringe gerastert statt milchig

Auftrag: Befund **B3 (Major)** aus der Audit-Lane `m10-chaos-legibility` — Telegraph-Disc-Flächen
sind milchige weiche Weich-Gradient-Scheiben (Stilbruch „harte 1-px-Sprites unten, Luftbrause oben“),
verdecken Terrain und kleine Gegner und sind nicht als Gefahr lesbar. Fix nach der Lehre aus
m10-chest-reveal: **eigene Komponente statt Patch in Tabu-Dateien** — neuer Bake `src/gfx/hazardDisc.ts`,
Umstellung von `src/systems/Hazards.ts` (nur Optik; Warnlogik/Draw-Pfad bitgleich).

Board-Karten: #7158 (K1 Vorher), #7159 (K2 Bake), #7160 (K3 Tests), #7161 (K4 Nachher/Doku).
Commits: fabedd0 (K1), ea021e3 (K2), e9501b1 (K3), e69758f (K4 WIP), K2b/K4 folgen.

## 1. Messaufbau (`scripts/m10-chaos-fix-disc.mjs --tag=before|after`)

- Repro wie Audit-Lane: seed=1, god, autoPlay, 6 Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5,
  `skipTo(1490)`, Szenarien **500er-Stress** (640×360@1, 780×360@3) und **M25** (300er, 640×360@1).
- Zusätzlich **10 deterministische Telegraph-Discs** (Radien 30–90, warn 120 s) um den Spieler,
  damit der Disc-Anteil im Frame groß und reproduzierbar ist.
- Metrik **milkyShareDisc** (A/B im selben pausierten Frame): ein Screenshot mit Telegraph-Sprites
  (shown), einer ohne (hidden, Sprites unsichtbar). Ein Pixel ist *hazard-attribuiert*, wenn er sich
  unterscheidet (max |Δ| > 10); *milchig*, wenn er außerdem **kein exakter 32-Paletten-Wert** ist
  (Transparenz-/ADD-Überblendung = weiche Scheibe) **und** hell (max(R,G,B) ≥ 110). Opak gerasterte
  Telegraph-Pixel sind exakte Palettenfarben und zählen nicht — genau der Fix.
- Diagnose `milkyShareFull` (ganzer Frame, Licht-/Glow-Baseline mit drin); Renderer-Pflicht erfüllt,
  0 JS-Fehler in allen Läufen; keine flock-Messung (keine FPS-/Echtzeitmessung).

## 2. Messwerte (verbindlich, je Viewport-Mittel über 2–3 Frames)

| Szenario | before | after | Δ |
|---|---|---|---|
| stress500-640 (Akzeptanz-Hauptrepro) | **53,44 %** | **13,92 %** | **−74 %** ✓ (Ziel ≥ 50 %) |
| stress500-780 | **68,73 %** | **9,93 %** | **−86 %** ✓ |
| m25-640 | **59,50 %** | **16,83 %** | **−72 %** ✓ |

`milkyShareFull` (Diagnose): stress500-640 29,4 % → 4,9 %; stress500-780 23,9 % → 2,8 %;
m25 27,0 % → 5,7 %. FPS im Repro 50–57 (iGPU) — unverändert zum Vorher-Lauf.

## 3. Fix (`src/gfx/hazardDisc.ts`, `src/systems/Hazards.ts`)

- **Disc** (`hazard_disc_r<r>`): Textur in exakter Sprite-Pixelgröße gebacken (Seite = 2r+3,
  Radius ganzzahlig geklemmt 8..160), **Draw-Scale immer 1** (vorher radius/30 bis 3,2×).
  Rasterung: 2-px-Konturband am Radius + 50-%-Schachbrett-Dither-Füllung, binaeres Alpha,
  nur 2 Palettenindizes (Kontur `lanternWhite` → mit Tint volle Gefahr-Farbe; Füllung `emberDark`
  → dunkler Ton, **hellt nie auf**, Terrain bleibt zwischen den Dither-Pixeln sichtbar).
- **Ring** (`hazard_ring_r<r>`): Rand-Puls als durchgehendes 2-px-Band in Sprite-Pixelgröße
  (vorher `ring_burst` 96 px, bis 3,2× skaliert, ADD).
- **Beam** (`hazard_beam_l<l>` / `hazard_beam_rim_l<l>`): in Strahl-Länge gebacken, abrundende
  8er-Quantiserung (nie länger als der Treffer-Strahl, begrenzter Cache), Scale 1 statt bis ~26×
  Streckung — gleiche Milch-Ursache, im selben Zug gefixt (round 1 der Messung zeigte den Rest).
- Tint-Vertrag: `spawnCircle/spawnBeam` tinten immer (`color`-Option oder Default `crimson` wie
  zuvor) — Kontur erscheint in exakter Gefahr-Farbe, Füllung dunkler. Warnlogik (Puls-Alpha
  0,55±0,35, Depth, Blend, Trefferzeitpunkt) **bitgleich**; kein Tabu-File angefasst.
- Bewusste Reste: Impact-Ring (`ring_burst`, kurzlebig 320 ms) und Puddle-Optik unverändert;
  neue Keys tragen Präfix `hazard_` (nicht im Runtime-Atlas, Discs/Beams sind wenige Sprites).

## 4. Tests (`tests/hazard-disc.test.ts`, 10 Tests)

Masken quantisiert (nur 2 Palettenindizes + Clear — kein stufenloser Gradient), Sprite-Pixelgröße +
Clamping, 2-px-Konturband + Band-Kontrast (Kontur ≥ 20 Luminanz heller als Füllung), 50-%-Dither,
durchgehender Ring, Beam-Quantiserung, Draw-Pfad (Keys, Scale 1, Alpha/Tint bitgleich, beide Spawn-Pfade),
before-JSON-Beleg (0 JS-Fehler, iGPU). `npx tsc --noEmit` grün, `npm run build` grün,
Vitest 94 Dateien / 1003 Tests grün (inkl. `hazard-telegraph` Regression).

## 5. Sichtprüfung

- 4x-Zooms (`shots/m10-chaos-fix-disc-{before,after}-*-zoom4x.png`): vorher milchige Glow-Felder +
  unscharfe Dark-Disc; nachher klare 2-px-Ringe im 1-px-Raster, Terrain und kleine Gegner sichtbar.
- **art-director strenge Abnahme („kommerziell auslieferbar“): PASS, Note 4/5** (2026-11-28).
  Begründet erfüllt: Konturen/Dither/Strahlen in 640@1 + 780@3, einheitliche Systemwirkung mit den
  1-px-Sprites (kein „Luftbrause-oben“-Bruch), Terrain-/Gegner-Sichtbarkeit, before/after deckt sich
  mit der Metrik (−72 bis −86 %). Nicht blockierende Nachbesserungen (backlog-würdig):
  1) Innenkante der Dither-Füllung am Ring mit 1–2 px Übergangsband statt harter Checker-Kante,
  2) Fülldichte bei überlappenden Discs abstufen (5+ Stapel wirkt unruhig).
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`, swiftShader=false.

## 6. Offene Punkte

- Beam-Warnlinien bleiben in der Treffergeometrie schmaler als die alte Visuell-Ausdehnung war
  (Textur ≤ Trefferlänge statt bis 26× gestreckt) — reine Optik, Fairness-Tests unverändert grün.
- Falls der Runtime-Atlas künftig auch `hazard_*` packen soll: Präfix in `src/gfx/atlas.ts`
  ergänzen (fremde Datei, hier nicht beansprucht).
