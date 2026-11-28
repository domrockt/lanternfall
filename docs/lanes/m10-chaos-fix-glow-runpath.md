# Lane m10-chaos-fix-glow-runpath — Near-White-Deckel + Run-seitige Bake-Pfade (B1-Teil/B2/B5)

Quelle: Befundliste der Audit-Lane `docs/lanes/m10-chaos-legibility.md` (art-director 3/5 streng).
Diese Lane schneidet die Hebel heraus, deren Dateien NICHT von der Evo-FX-Kette belegt sind
(Boot.ts + Run.ts); `gen-fx.ts`/`textures.ts`/`FxSystem.ts` bleiben bei m10-chaos-fix-raster-glow
und m10-evo-fx-*. Board: #7298–#7302. Basis: Commit vor K1 = `18ded2e`.

## K1 — Repro + Vorher (#7298)

`scripts/m10-chaos-fix-glowpath.mjs` (Muster `m10-vfx-restore.mjs`): seed=1, M25-Chaos wie das Audit
(6 Basis-Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5, skipTo 1490), 640x360@1 + 780x360@3, je 3
Frames aus dem Live-Lauf + bildzentrierter 4x-nearest-Crop. Renderer-Pflicht: iGPU
(`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`, `swiftShader=false` — SwiftShader
bricht mit rc=1 ab). Gegnerbestand: einmaliges Top-up zerfiel auf ~23-100 (Evolutions-Waffen
schlichten zu schnell); Fix wie im Audit: alle ~120 ms nachfuellen, direkt vor dem Screenshot.
FPS nebenbei ~60 (kein flock-nötiger Langlauf, Sperre trotzdem gesetzt).

**Vorher (worst of 3 je Metrik):** Near-White A7 ganzer Frame **2,74 %**, A7-Crop **23,86 %**
(Gate 4,16 %). Belege: `shots/m10-chaos-fix-glowpath-before-*.{png,json}` — 4x-Crops zeigen B1/B2/B5
(Near-White-Wäsche über dem Spieler, weiche Gradient-Discs, weiße Kratzer).

## K2 — Run.ts ADD-Alpha-/Scale-Deckel (B5) (#7299)

- `src/logic/fx-caps.ts` (NEU — reine Funktionen, testbar ohne Phaser; beim Disponenten vermerkt,
  `.dispatch/requests.md`): `RUN_ADD_ALPHA_CAP 0,8`, `RUN_ADD_ALPHA_FLOOR 0`,
  `RUN_PARTICLE_SCALE_CAP 2,4`, `RUN_LIGHT_ALPHA_MAX 0,7`, `runAddAlpha()`, `uniformScale()`.
- Run.ts: alle direkten ADD-Bilder (splash, dawn rays/sun, levelup pillar, chest beam) über
  `runAddAlpha`; kein nicht-uniformes `setScale` mehr an FX-Stellen (pillar 1,4/1,6 → 1,4,
  beam 0,9/1,1 → 0,9, rays 2,4-2,9 × 3,2 → uniform, Tweens uniform). Laternen-Licht-Alpha
  0,85 → 0,7 (create + applyFxRestore + applyLod). Schatten-Ellipse (NORMAL-Blend) bewusst
  ausgenommen.

## K3 — fx_pillar/fx_shock auf den Bake-Pfad (B1-Teil) (#7300)

- `fx_shock`-Ring in `playEvolutionFx`: direkter `makeImage`-Tween → `spawnAnim("fx_shock")`
  (FxSystem-Mixel-Bake, Stufen bis 4 → Draw-Scale ≤ 1).
- `fx_pillar` ist KEIN Mixel-Bake in gen-fx.ts (fremd geclaimed) — Run.ts backt die Ziel-Pixelgröße
  selbst: `ensurePillarBake` nearest-hochskaliert die Level-1-Einzeltexturen (`fx_pillar`,
  `fx_pillar_2..5`, 26x72) auf 26L x 72L (L = 2..4, idempotent, lazy). Alle 3 Stellen (dawn rays,
  levelup, chest) zeichnen über `addPillarImage()` mit Draw-Scale = Scale/L ≤ 1 und ganzzahliger
  Position. Level-1-Pfad unverändert.
- `pillarBakeLevel()/pillarDrawScale()` in fx-caps.ts (gleiche Mathematik wie `mixelLevelFor`,
  inkl. dokumentiertem Fallback > Cap).

## K4 — Boot.ts Glow-Deckel + After-Gate (B2) (#7301)

`createLightTextureLocal`: Rampen-ENDE (Kern r ≤ 40) von lanternWhite(13)/candle(22) auf
amber(20)/lantern(21) — die A7-Near-White-Definition (r,g,b ≥ 150 und r ≥ 235) treffen Amber
0xffb84d / Lantern 0xffd77a nicht mehr. Boot-seitiger Alpha/Blend-Deckel im Kommentar dokumentiert
(nur ADD in Run.ts, dort 0,7 statt 0,85; Ring-Alpha ≤ 0,10). Vignette unberührt.

**After (zweiter Lauf = die erlaubte Wiederholung, verbindlich):** Near-White A7 ganzer Frame
**0,45 %** (vorher 2,74), A7-Crop **2,98 %** (vorher 23,86) — beide ≤ 4,16-Gate. Erster After-Lauf:
0,64 % / 5,02 % (ein Burst-Frame knapp über dem Crop-Gate; Gate zählt der verbindliche Lauf).
FPS 60,1/60,2 (vorher 60,0/60,1 — within noise), jsErrors 0, Renderer iGPU.
Belege: `shots/m10-chaos-fix-glowpath-after-*.{png,json}`. Die 4x-Crops zeigen: Terrain und
Spieler-Silhouette im Burst-Zentrum lesbar, Starburst auf 1-px-Raster quantisiert, keine
Near-White-Wäsche, keine weißen Kratzer.

Gate als Regressionstest: `tests/chaos-glow-runpath.test.ts` liest das after-JSON
(≤ 4,16 % Frame+Crop, iGPU, jsErrors leer, FPS ≥ 50) und prüft Boot/Run-Verdrahtung per
Quelltext-Check (Muster `tests/vfx-restore.test.ts`/`tests/evo-signature-calls.test.ts`).

## Abnahme

- Near-White im AoE-Chaos-Frame ≤ 4,16 %: **PASS** (0,45 % Frame / 2,98 % Crop).
- 0 pure-weiße gestreckte Partikel im 4x-Crop: **PASS** (vorher B5-Kratzer sichtbar, after nicht;
  einheitliche Scales + Bake-Draw-Scale ≤ 1).
- fx_pillar/fx_shock auf Pixelraster (4x-Zoom 1-px-Stufen): **PASS** (Bake-Stufen, Draw-Scale ≤ 1;
  art-director-Sichtprüfung s. u.).
- Trefferverhalten/Balance unberührt: **PASS** — nur Darstellung (Alpha/Scale/Bake); keine Logik-
  oder Waffen-Änderungen. tsc rc=0, vitest grün (13/13 lane + Regression fx-mixel/vfx-restore 35/35),
  `npm run build` rc=0.
- art-director über before/after-Crops: **4/5 (streng)** — siehe Verlauf.
- FPS-Regression: keiner (60,1/60,2 vs. 60,0/60,1, gleiche Szenario-Frames).

## Grenzen / offene Punkte (für GAME.md-Übernahme)

- Der **größte Teil der Rest-Near-White-Fläche** im Chaos kommt aus Waffen-FX in `gen-fx.ts`/
  `FxSystem.ts` (Glow-Rampen, Signaturen, Phoenix-Kern) — fremd geclaimed, hier bewusst NICHT
  angefasst. Hebel-Doku: `docs/lanes/m10-chaos-legibility.md` Priorität 1/2
  (m10-chaos-fix-raster-glow, m10-evo-fx-*).
- Milchige Discs (B3) und Damage-Numbers (B4) sind nicht Teil dieser Lane (Hazards.ts/textures.ts
  bzw. DamageNumbers.ts).
- `fx_pillar` könnte künftig in `MIXEL_BAKE_DEFS` (gen-fx.ts) wandern; der Run-seitige
  Runtime-Bake (`ensurePillarBake`) ist idempotent und kollisionsfrei (`fx_pillar_bake<L>_<i>`),
  sollte dann aber entfernt werden, damit die Bake-Definitionen an einer Stelle liegen.

## Verlauf

- 2026-11-28: K1 Vorher (#7298), K2 Deckel (#7299), K3 Bake-Pfad (#7300), K4 Boot-Glow + After-Gate
  (#7301), K5 Doku/Abnahme (#7302).
- 2026-11-28: reviewer über die Lane-Commits: **PASS** (Sollte-Punkte im Follow-up-Commit umgesetzt:
  alle Ereignis-FX-ADD-Alphas über runAddAlpha, toter Export pillarDrawScale entfernt,
  addPillarImage nutzt uniformScale als zentralen B5-Enforcement; Nit 3 (5 Bake-Frames, nur Frame 0
  genutzt) und Nit 4 (hardwaregebundenes iGPU-Gate = lokales Gate nach Repo-Konvention) bewusst
  akzeptiert). tsc rc=0, 13/13 lane-Tests, build rc=0.
- 2026-11-28: art-director-Sichtprüfung der before/after-4x-Crops: **4/5 (streng), Gate ≥ 4/5 PASS**
  (1) Near-White-Ausbrüche weg: after-Crops zeigen Spieler/Truhe/Terrain voll lesbar, verbleibende
  A7-Pixel sind Hot-Cores im Brandfleck + UI-Text, kein Ausbruch über Sprites. (2) Keine gestreckten
  Partikel/Kratzer mehr (längste A7-Sequenz im after-Frame = Brandfleck-Kern, kein Wisch-Spur).
  (3) fx_pillar-Strahlen harte, gestufte Keile mit Treppen-Kanten (vorher verwaschene Gradient-Fächer);
  Run-Verteilung dominiert 1–2 px, keine 2–6-px-Blöcke. (4) Spieler-/Terrain-Lesbarkeit besser als
  before. (5) Kein neues Problem (kein Weiß-Anlaufen der Laternen, keine sichtbaren Bake-Blöcke).
  - **Nachbesserung (nicht diese Lane, fremd geclaimed):** White-Hot-Kern des Brandflecks und
    fx_shock-Ring haben noch weiche Gradient-Ränder → harte 1-px-Quantisierung (gen-fx.ts/FxSystem,
    m10-chaos-fix-raster-glow / m10-evo-fx-*); optional Laternen-Rampen-Banding prüfen (lighting-
    Layer, verzeihlich).
