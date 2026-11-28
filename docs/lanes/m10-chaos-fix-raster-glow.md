# Lane m10-chaos-fix-raster-glow — Mixel-Rester + Near-White + Gradient-Discs (B1/B2/B3-Teil)

Quelle: Befundliste der Audit-Lane `docs/lanes/m10-chaos-legibility.md` (art-director 3/5 streng),
umgeschnitten (Dora, 2026-11-28): Boot.ts/Run.ts laufen als eigener Job `m10-chaos-fix-glow-runpath`
(seit gemergt), CombatSystem.ts bei `m10-evo-fx-winter-w2`, Hazards.ts bei `m10-chaos-fix-hazard-disc`,
DamageNumbers.ts bei `m10-chaos-fix-dmg-overlap`.

**Diese Lane:** src/gfx/gen-fx.ts, src/gfx/textures.ts, src/gfx/bakeAtlas.ts, src/systems/FxSystem.ts
(+ tests/raster-glow.test.ts, scripts/m10-chaos-fix-glow.mjs). Board: #8218–#8222.

Wartebedingung aus dem Briefing („warten bis Ende der Evo-FX-Kette dornensturm“) ist erfüllt:
dornensturm ist `lane-done` (Commit 1e71514, 03:48Z) und hält keine Claims mehr; der Disponent hat
gen-fx/textures/bakeAtlas/FxSystem dieser Lane zugeordnet (Disposition 04:03Z). **Hinweis Merge:**
dornensturm ist noch NICHT in main gemergt und ändert gen-fx.ts (+312) und textures.ts (±15) —
diese Lane hält die eigenen Edits additiv/lokalisiert, damit der Merge-Job sauber auflösen kann.

## K1 — Repro + Vorher (#8218)

`scripts/m10-chaos-fix-glow.mjs` (Muster `m10-chaos-fix-glowpath.mjs`): seed=1, god, autoPlay,
6 Basis-Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5, skipTo(1490) → Minute ~25, Gegnerbestand
auf 300 gehalten (alle 150 ms nachfüllen, direkt vor dem Screenshot), 640x360@1 + 780x360@3,
je 3 Frames aus dem Live-Lauf + bildzentrierter 4x-nearest-Crop. Renderer-Pflicht iGPU
(`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), ...)`, `swiftShader=false`), sonst rc=1.
Near-White A7 (r,g,b ≥ 150 und r ≥ 235), Gate 4,16 %.

*(Ergebnisse folgen nach dem Lauf.)*

## K2 — Mixel-Bake-Deckel gen-fx + Rampen-Enden (#8219)

*(geplant; Ergebnisse folgen)*

## K3 — Gradient-Quantisierung textures.ts (+bakeAtlas-Check) (#8220)

*(geplant; Ergebnisse folgen)*

## K4 — FxSystem ADD-Alpha-Boden/-Deckel (#8221)

*(geplant; Ergebnisse folgen)*

## K5 — After + Abnahme (#8222)

*(folgt)*
