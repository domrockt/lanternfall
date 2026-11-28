# Lane m10-chaos-fix-raster-glow — Mixel-Rester + Near-White + Gradient-Discs (B1/B2/B3-Teil)

Quelle: Befundliste der Audit-Lane `docs/lanes/m10-chaos-legibility.md` (art-director 3/5 streng),
umgeschnitten (Dora, 2026-11-28): Boot.ts/Run.ts laufen als eigener Job `m10-chaos-fix-glow-runpath`
(seit gemergt), CombatSystem.ts bei `m10-evo-fx-winter-w2`, Hazards.ts bei `m10-chaos-fix-hazard-disc`,
DamageNumbers.ts bei `m10-chaos-fix-dmg-overlap`.

**Diese Lane:** src/gfx/gen-fx.ts, src/gfx/textures.ts, src/gfx/bakeAtlas.ts, src/systems/FxSystem.ts
(+ tests/raster-glow.test.ts, scripts/m10-chaos-fix-glow.mjs). Board: #8218–#8222.

Wartebedingung aus dem Briefing („warten bis Ende der Evo-FX-Kette dornensturm“) war beim Start erfüllt:
dornensturm ist `lane-done` (Commit 1e71514, 03:48Z) und hält keine Claims mehr; der Disponent hat
gen-fx/textures/bakeAtlas/FxSystem dieser Lane zugeordnet (Disposition 04:03Z). **Hinweis Merge:**
dornensturm ist noch NICHT in main gemergt und ändert gen-fx.ts (+312) und textures.ts (±15) — diese
Lane hat die eigenen Edits additiv/lokalisiert gehalten (neue Mixel-Defs am Ende der Liste, neue
Signatur-Generatoren als eigener Block, Ramp-Enden nur in blob/ring/fx_star/bolt/death-blob, die
dornensturm nicht berührt). Konfliktfläche: `FX_MIXEL_BASES`/`MIXEL_BAKE_DEFS` (Listen-Anfang), die
dornensturm bei seinen thorn-Defs ebenfalls anfasst.

## K1 — Repro + Vorher (#8218, Commit 5ab51b4)

`scripts/m10-chaos-fix-glow.mjs` (Muster `m10-chaos-fix-glowpath.mjs`): seed=1, god, autoPlay,
6 Basis-Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5, skipTo(1490) → Minute ~25, Gegnerbestand
auf 300 gehalten (alle 150 ms nachfüllen, direkt vor dem Screenshot), 640x360@1 + 780x360@3,
je 3 Frames aus dem Live-Lauf + bildzentrierter 4x-nearest-Crop. Renderer-Pflicht iGPU
(`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`, `swiftShader=false`), sonst rc=1.

**Vorher (worst of 3 je Metrik):** Near-White A7 ganzer Frame **0,57 %**, A7-Crop **3,54 %**
(Gate 4,16 %) — der Runpath-Fix (Boot/Run) ist bereits gemergt, das Near-White-Niveau startet
daher niedrig. FPS 60,1/60,1, jsErrors 0, iGPU. 4x-Crops zeigen: glatte Gradient-Lichtringe um
die Laterne (`before-780-360-3-m25-2-4x.png`) = Raster-Hebel dieser Lane; Chaos-Bursts mit
weißlichen Funken (`before-640-360-1-m25-1-4x.png`).
Belege: `shots/m10-chaos-fix-glow-before-*.{png,json}`.

## K2 — Mixel-Bake-Deckel + Rampen-Enden (#8219, Commit 58fcde0)

**gen-fx.ts — neue Mixel-Basen** (FxSystem/ParticleSystem wählen Stufe via `mixelLevelFor`
automatisch — KEINE Caller-Änderungen in fremden Dateien nötig):
- 5 Todes-Frame-Sets (`fx_death_blob/bone/void/dust/fire`, Basis 9x9, 4 Frames, maxLevel 3/2/3/2/3):
  real bis Scale 2,4 gezeichnet (death.ts scaleFrom 1,6–2,4, rimScale 1,05–1,25, Run.ts Boss-Tod
  1,35). Density-Stufen rendern dieselbe normierte Geometrie in 9L x 9L; bone (handgesetzte
  ASCII-Frames) per LxL-Block-Replikation.
- `fx_bolt` (12x16, 6 Frames, maxLevel 3): bolt() zeichnet Segmente mit Scale segLen/16 (real
  1,6–2,5). Zickzack-Mitte jetzt in Basis-Koordinaten ausgewertet (kontinuierlich statt gerundet).
- Fix bei der Gelegenheit: bolt-Flanke war als 'g' kodiert = Palette 16 (emberBrown), Kommentar
  behauptete „amber (20)“ — neu: Kern lantern(21) → amber(20) → flame(18).

**Gewittersiegel-Signatur in Zielgröße:** `thunderSignatureFrame` 128x128 (THUNDER_SIGNATURE_SIZE),
`drawScale: [1,1]` (vorher 32x32 @ 3,2–4,6 = 3–5-px-Blöcke; letzter nicht gebackener Evo-Sig neben
thorn_storm, das dornensturm behebt). Palette [12,9,7] unverändert, kein Ink.

**Glow-Rampen enden auf Amber/Lantern statt Weiß (B2):** blob()-Kern lanternWhite(13) → lantern(21),
Übergangsband candleWhite(12) → erste Rampenfarbe; ring()-Innenkante candleWhite → lantern(21);
fx_star (Treffer-Funken) Kern/Flanken 13/12 → 21/20; fx_death_blob-Kern 13/12 → 21/20. Die
Signaturen der Evo-Lanes (winter 13/12, zorn 22, thunder 12) bleiben bewusst unangetastet — deren
art-director-Abnahmen (Draw-Scale 1, NORMAL-Blend) sollen nicht regressieren.

**Tests:** `tests/raster-glow.test.ts` (Pixel-Metrik: reale Caller-Scales → Draw-Scale ≤ 1,
Bake-Dims 9Lx9L/12Lx16L, Stufen-Key-Umschreibung, Near-White-Zeichen-Verbot 12/13/22 in heißen
Texturen, thunder-Sig 128x128 nur Palette 12/9/7). Bestehende Tests minimal angepasst:
- `tests/fx-mixel.test.ts`: `mixelBaseFor("fx_death_blob")` ist jetzt absichtlich eine Basis.
- `tests/death-frames.test.ts`: Blob-Farb-Guard auf {1,20,21,30,31} (war {1,12,13,30,31}).
- `tests/evo-fx-zornpendel.test.ts`: thunder_seal.drawScale jetzt [1,1].
- `tests/palette-compliance.test.ts` + `scripts/m10-palette-fx-guard.mjs`: Dedupe Death-Sets ↔
  Mixel-Basen (fx_death_* sind jetzt beides), Fixture regeneriert (53 Sets, off-palette 0,
  maxDitherBandPx 7 an fx_bolt@2 — Heuristik-Baseline im Fixture).
Fremd-Dateien nur because unclaimed (claims.json geprüft) und minimal; Begründung hier dokumentiert.

## K3 — Gradient-Quantisierung textures.ts (#8220, Commit eaf2ab6)

- `LIGHT_EDGE_STEPS` + `lightEdgeAlphaFor`: light_radius-Außenkante = 5 harte Alpha-Bänder
  (0..70 → 1, dann 0,66/0,38/0,18/0,08 bis 96, Bänder ≥ 6 px) statt destination-in-Radialgradient.
- `vignetteSteps()`: 11 Bänder à 20 px über r 70..290 + Ecken-Klemme 0,72 — gleiche Alpha-Treppe
  wie der Original-Gradient, hart gekantet.
- **bakeAtlas-Check:** keine Gradients, Bake bleibt nearest (`imageSmoothingEnabled = false` 2x) —
  nichts zu quantisieren, per Quelltext-Guard gesichert.
- **Quelltext-Guards** in tests/raster-glow.test.ts: kein createRadialGradient/
  createLinearGradient mehr in textures.ts.
- **OFFENPUNKT (bekannt, außerhalb meines Scopes):** Boot.ts überschreibt dieselben Keys
  (`light_radius`, `vignette`) in `createLightTextureLocal`/`createVignetteTextureLocal` mit den
  WEICHEN Versionen (Titel-Schnellpfad, m10-boot-startup; Kommentar dort: „Bei Freigabe durch einen
  Import ersetzen und diesen Block loeschen“). Zur Laufzeit gewinnen daher die Boot-Glatt-Versionen —
  die K3-Quantisierung greift sichtbar erst, wenn der Boot-Local-Block durch den Import der
  textures.ts-Versionen ersetzt wird. Boot.ts ist dieser Lane laut Briefing explizit verboten
  („keine Boot.ts-/Run.ts-Aenderungen“) → als Zeile in `.dispatch/requests.md` gemeldet, nicht
  selbst geändert. Bis dahin zeigen die after-4x-Crops um das Spielerlicht weiterhin glatte Bögen
  (identisch zur Glowpath-Abnahme 4/5).

## K4 — FxSystem ADD-Alpha-Boden/-Deckel (#8221, Commit b4929e2)

- `ADD_ALPHA_CAP = 0,8` + `addAlphaClamp()` (rein funktional, NaN → 0, Deckel injizierbar) in
  src/systems/FxSystem.ts; Boden bleibt `ADD_GLOW_ALPHA_FLOOR` (0,04, frühe Freigabe) — der
  Lifetime-Fade läuft über alphaTo, ein härterer Boden würde Fade-outs verhindern.
- Angewendet in FxSystem.spawn und ParticleSystem.spawn für ADD-Sprites (Vorher 0,9/0,95 Default).
  Ausgenommen: Boss-FX (NORMAL, Boden 0,7 aus #5220) und `additive: false` (Evo-Signaturen, Decals).
- Unit-Tests + Quelltext-Guard (beide Pools rufen addAlphaClamp).

## K5 — After + Abnahme (#8222, verbindlicher Lauf)

**After (verbindlich, gleiche Szene/Seeds wie before):** Near-White A7 ganzer Frame **0,51 %**
(vorher 0,57), A7-Crop **3,10 %** (vorher 3,54) — beide ≤ 4,16-Gate. FPS 60,0/60,1 (vorher
60,1/60,1 — within noise), jsErrors 0, Renderer iGPU (ANGLE RPL-S). Belege:
`shots/m10-chaos-fix-glow-after-*.{png,json}`.

Sichtprüfung 4x-Crops: Funken-/Blitz-Positionen warm (kein Weiß-Kern), Todes-Shards und
Blitz-Segmente auf Bake-Raster, Spieler-/Gegner-Silhouetten lesbar. Verbleibende glatte Lichtbögen
= Boot.ts-Local-Kopie (s. K3-Offenpunkt), out of scope.

## Messwerte gesamt

| Metrik | Vorher | Nachher | Gate |
|---|---|---|---|
| Near-White A7 Frame (worst of 3) | 0,57 % | **0,51 %** | ≤ 4,16 % |
| Near-White A7 Crop (worst of 3) | 3,54 % | **3,10 %** | ≤ 4,16 % |
| FPS 640x360@1 / 780x360@3 | 60,1 / 60,1 | 60,0 / 60,1 | within noise |
| JS-Fehler | 0 | 0 | 0 |
| Renderer | iGPU ANGLE RPL-S | iGPU ANGLE RPL-S | Pflicht |
| Suite / tsc / Build | – | 1365 Tests grün | grün |

## Verlauf

- 2026-11-28: K1 before (5ab51b4), K2 mixel-bake + rampen (58fcde0), K3 gradients (eaf2ab6),
  K4 add-cap (b4929e2), K5 after + docs. Board #8218–#8222.

## art-director-Abnahme (streng, 2026-11-28)

**PASS — Note 4/5 (streng)** (Kontrolleur-Subagent, eigenes Bild-Review der after-/before-Crops):
- (1) Mixel: Todes-Blob ohne Blockrepetition, Blitze saubere 1-Game-px-Zickzack, fx_star mit
  1-px-Kontur — im After nicht mehr die unrhythmischen Pixelbreiten des Before.
- (2) Near-White: Rampen/Kerne enden auf Lantern/Amber, kein Weißausbruch; JSON worst 0,51 %.
- (3) Stilbruch: in-scope Todes-Blob endet sauber auf Amber/Night-Rim; Restglätte = Boot-Scope.
- Verbleibende Punkte mit Verantwortung: Boot.ts-Local-Kopien überschreiben K3-Texturen
  (Boot/Run-Scope, Request in .dispatch/requests.md gestellt); glatte Strahlen/Lichtbögen
  (Boot/Run-Scope, dort 4/5); Belegqualität-Hinweise des Kontrolleurs: Capture-Profil 640x360@1
  ist 1,333x nicht-ganzzahlig (künftig ganzzahlige Profile nutzen) und die 300er-Frames zeigen
  teils den Truhen-Dialog (Chaos-Nachweis stützt sich auf die 62–74-Gegner-Frames + JSON).

