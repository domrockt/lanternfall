# Lane m10-palette-fx-guard — Harte Regressionsschranke für FX-Frames in `npm test`

Auftrag (Dom 21:45Z/00:00Z): „eine Pixelgröße für alles", Dither nur an Übergangskanten (1–2 px),
Kerne flächig hell. Die bestehende palette-guard-Schranke (`tests/palette-compliance.test.ts`)
prüfte nur statische Grids; gerenderte FX-Frames (Hochskalierung > 1x, stufenloses Alpha,
Off-Palette) kamen durch die Lücke. Ziel: Guard für Palette-Index-Gültigkeit + binäres Alpha +
Mixel-Heuristik (Draw-Scale > 1 ohne Bake, Raster-Dither über > 2 px Band) über eine
repräsentative FX-Menge (Boss-Effekte, Evo-Signaturen, ADD-Glows).

Board-Karten: #7400 (K1 Sammler/Fixtures), #7401 (K2 Guard/Negativ-Fixtures), #7402 (K3
Laufzeit/rot-grün), #7403 (K4 Doku).
Commits: a35e70f (K1), a64572d (K2), 39b7a02 (K3), K4 folgt.
**Keine Änderung an Spielcode** — `gen-fx.ts`/`textures.ts`/`FxSystem.ts`/`Run.ts` nur gelesen
(Evo-Kette gehört die Dateien), `src/palette.ts` unverändert.

## 1. Sammler (`scripts/m10-palette-fx-guard.mjs`, Karte K1)

- Lädt `src/gfx/gen-fx.ts` über den Vite-SSR-Loader und extrahiert **nur über öffentliche
  Exporte**: 12 Evo-Signaturen (`EVOLUTION_SIGNATURES` + `signatureFrame`, hit/death je 4 Frames,
  32×32), Boss-/Todes-Sets (`deathFrameSets`, u. a. `fx_boss_core` 6 Frames), 4 Mixel-Basen
  Level-1 (`mixelLevel1Frames`) + alle Bakes ≥ 2 (`mixelBakes`).
- Ergebnis: **34 Sets / 134 Frames**, Fixture `tests/fixtures/palette-fx-guard.json` (236 KB:
  Rows + Guard-Metriken je Frame + Scale-Manifest + knownFindings), Report
  `shots/m10-palette-fx-guard-report.json`.

## 2. Guard-Logik (Karte K2, `scripts/art/palette-check.mjs` + Test)

- **Palette-Index + binäres Alpha**: `analyzeFxGuard` über alle 134 Frames live im Test;
  Ist: off-palette 0, alpha-Verstöße 0. Canvas-gefangene FX bleiben über `analyzeCapturedFx`
  abgedeckt (fraktionale Alpha zählt als Verstoß).
- **Dither-Metrik** (`ditherMetrics`): Dither-Pixel = Abwechslung in horizontaler UND vertikaler
  Richtung (Schachbrett-/Halftone-Signatur; Streifen/Konturen/Zickzack-Beams bleiben unbeanstandet).
  Banddicke = Minimum der durchgehenden Dither-Läufe in 4 Richtungen (dünnste Achse) — Ringe und
  Kanten-Dither (1–2 px radial) fallen NICHT auf, flächige Halftone-Kerne schon. Schwelle: 2 px.
  Zwei Vorab-Versionen (Nachbarzähler, BBox-Komponenten) hatten False Positives auf gezackten
  Ringen (`fx_boss_core` bandPx 32) — finale Metrik belastbar über alle 134 Frames.
- **Draw-Scale-Coverage**: kuratiertes Scale-Manifest mit Quellen (FxSystem `spawnEvolution`
  Hit 3,2→3,6 / Death 4,0→4,6; `fx_boss_core` 3,6 via Run.ts:1711; Mixel-Basen laut
  MIXEL_BAKE_DEFS-Kommentar). Regel: Draw-Scale > 1 nur mit Bake-Stufe ≥ Scale
  (`mixelLevelFor`/`mixelMaxLevel`). **Coverage 4/7**; ungedeckte Keys = 13
  (`fx_evo_*` 12 + `fx_boss_core`) — als `knownFindings` gepinnt, im Test als Ratchet:
  neue ungedeckte Keys schlagen an.
- **Ratchet für Dither**: pro Frame `live bandPx ≤ Baseline`; die Menge der Frames mit
  bandPx > 2 muss exakt den gepinnten `ditherFindings` entsprechen. Ist (gepinnt, 2 Frames):
  `fx_evo_death_thunder_seal#0..#3` bandPx 6 bzw. `fx_evo_hit_phoenix#0` bandPx 4 —
  ECHTE Befunde im Evo-Kette-Bereich (Dither-Noise im Beam-Kern), dort zu fixen, hier nur
  dokumentiert und gepinnt (Verschlechterung schlägt an, Verbesserung zieht die Baseline mit).

## 3. Negativ-Fixtures (rot/grün belegt, Karte K3)

| Befund | Fixture | rot (schlägt an) | grün (Gegenprobe) |
|---|---|---|---|
| Phoenix-Dither | 16×16-Halftone-Kern (`c`/`6`-Schachbrett) | bandPx 16 > 2; `expectFxMixelClean` wirft | 2-px-Übergangskante am flachen Kern: bandPx ≤ 2 |
| Winter-fogBlue | 20×20-Haze-Band (`6`/`9`-Wechsel > 2 px) | bandPx > 2 | binaeres Alpha-FX: 0 Verstöße |
| hazard-disc milky | Canvas-Pixel mit alpha 0,5 / 0,25 | alphaViolations 2; `expectPaletteClean` wirft | alpha 0/1: sauber |

Echte Rot/Grün-Demo über die Suite: Baseline `fx_evo_death_thunder_seal#0` 6→2 gesenkt
(simulierte Regression) → **1 failed** (`live 6 > baseline 2`), Restore → **11/11 grün**.
Belege: `shots/m10-palette-fx-guard-k3-rot.log`, `…-k3-gruen.log`, `…-rotgruen.json`.

## 4. Laufzeit

- `npx vitest run tests/palette-compliance.test.ts`: **11 Tests in 880 ms** (< 3 s Grenze;
  in-Test-Assertions: FX-Guard-Block < 3 s, bisheriger Guard < 2 s).
- Full-Suite (Karte-K2-Commit): **101 Files / 1098 Tests grün**, ~3,1 s Wandzeit.
- `npm run build` grün (je Karte).

## 5. Offene Punkte / Handoffs

1. **Evo-Kette**: Dither-Noise in `fx_evo_death_thunder_seal` (6 px) und `fx_evo_hit_phoenix`
   (4 px) auf ≤ 2 px bringen (Kerne flächig hell); der Ratchet belohnt das automatisch.
2. **Evo-Kette/ Lead**: ungedeckte Draw-Scales — Evo-Signaturen werden 3,2–4,6× gezeichnet ohne
   Mixel-Bake (32×32-Textur → mixelte Screen-Pixel), `fx_boss_core` 3,6×. Entweder Bakes
   (Muster `mixelBakes`) oder Skeleton-Scale ≤ 1. Der Scale-Guard schlägt an, sobald ein NEUER
   Key ungedeckt bleibt; die 13 gepinnten Keys sind der Abbau-Pfad.
3. Scale-Manifest bei Spawn-Änderungen in Run.ts/CombatSystem.ts nachziehen
   (`SCALE_MANIFEST` im Sammler, Quellen kommentiert).
