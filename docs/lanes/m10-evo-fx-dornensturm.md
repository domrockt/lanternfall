# Lane m10-evo-fx-dornensturm — Dornensturm-FX neu (6. und letzter Evo-Effekt-Job)

Dom-Wunsch 21:45Z, Punkt 1: Dornensturm (thorn_storm, Dornensalve-Evolution) bekommt
dieselbe Grundregel wie die 5 vorherigen Evo-Effekte: „eine Pixelgröße für alles“,
klare Farbe (grünlich-gelbe Natur-Töne), Aufbau Anticipation → Impact → Ausklang,
Lesbarkeit vor Menge. Vorlage: `docs/lanes/m10-evo-fx-phoenix.md`, endgültiges Muster
aus `docs/lanes/m10-evo-fx-gewittersiegel.md` (Mixel-Fundament, Loop-Regel).

## Regelwerk (Kette, auf Dornen übertragen)

1. **Textur in Zielgröße backen, Draw-Scale 1** — nie > 1x hochskalieren.
2. **Dorn-Farbtreppe** (`THORN_RAMP` in gen-fx.ts): Spitze boneLight(11, sparsam —
   Near-White-Gate) → marshLight(31) → marsh(30) → mossDark(29) → Kontur
   mossNight(28). **Kein Ink(0), kein Grau (1–9), keine warmen Glut-Fremdfarben.**
3. **Aufbau (Krone Phase 0) → Impact (Krone Phase 1 + Streaks) → Ausklang**
   (Krone Phase 2 mit Band-Bruch, Streak-/Signatur-Fragmente).
4. Lesbarkeit vor Menge: unregelmäßige Dornenlängen, einseitige Barben, gebogene
   Splitter — organisch statt Rauten/Platten; binäres Alpha.

## Ist-Zustand (Vorher, Commit 81470c2)

Skript: `node scripts/m10-evo-fx-dornensturm.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("thorn_storm", 8)` + 20 Gegner; 640x360@2x und 960x540). Belege:
`shots/m10-evo-fx-dornensturm-before.json` (+ PNGs), Renderer **ANGLE (Intel, Mesa
Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**, 0 JS-Fehler.

| Effekt | Vorher | Problem |
|---|---|---|
| `projectile_thorn` | 7x7 @ **1,7x**, 12/25 **Ink** | schwarze Raute, warme Glutrampe (lantern/flame) |
| `fx_thorn` (Trail/Streaks) | 9x9 @ bis **2,9x** | Ramp-Char-Bug `97+idx` → fleshWarm(27)/mossNight statt Glut, lanternWhite-Kern; Streaks @ scaleFrom 3.0 + Amber-Tint |
| `fx_evo_death_thorn_storm` | 32x32 @ **~4x**, **188/354 Ink** | schwarzer Blockring |
| `ring_burst`/`fx_shock` | 96 @ 0,45 / 48 @ 0,28 | Matsch-Downscale, generisch warm |

Sichtprüfung before-640.png: gold-oranger „Feuerwerkskranz" direkt am Spieler, keine
dornige/pflanzliche Lesbarkeit, Mixel-Quetschung.

## Fix

- **#7719 gen-fx.ts** (Commit 977de67): `thornProjectileFrame()` 12x12 (ungleich
  langer Dornenstern, 1-px-Saum mossNight statt Ink-Rahmen), `thornTrailFrame()`
  14x14 x3 (Ramp-Char-Bug behoben), `thornStreakFrame()` 22x22 x3 (Dart mit
  einseitigen Barben, Phase 2 = nur Splitter), `thornCrownFrame()` 96x96 x3
  (Wobble-Ring + 11 unregelmäßige Zacken, Phase 2 bricht das Band an 3 organischen
  Stellen). `projectile_thorn` aus `SPRITE_GRIDS` (textures.ts) in `createFxTextures`
  gezogen (Muster phoenix). `FX_FRAME_COUNTS` + `THORN_*_SIZE`-Konstanten.
- **#7719 CombatSystem.ts**: `fireThornStorm` — Projektil-Scale 1,7→1, Krone
  (fx_thorn_crown, Scale 1, life 0,36) ersetzt ring_burst + fx_shock, 16 Streaks
  @ Scale 1→0,55 ohne Tint; `fireThorn` (Basis-Dorn) Scale 1,6→1; Dornen-Trails
  behalten Natur-Grün (kein Ember-Orange-Tint mehr, Flag `thornTrail`).
- **#7720 gen-fx.ts** (Commit 11ac797): `thornSignatureFrame(kind, stage)` 128x128,
  4 Frames — gebogene Dornen-Splitter (Taper, einseitige Barben), flächiger Kern,
  Fragment-Ausklang; `drawScale: [1, 1]` am `EVOLUTION_SIGNATURES.thorn_storm`-
  Eintrag + `BAKED_SIGNATURES`-Registrierung (spawnEvolution-Muster der Kette).
- **#7722 gen-fx.ts** (Commit 135ea6b): Near-White-Gate — Knochen-Spitzen (11) nur
  noch an jedem dritten Splitter (deterministisch `i % 3 === 0`).

## Tests (Commit 781551a)

`tests/evo-fx-dornensturm.test.ts`, **11/11 Guards**: drawScale [1,1] + FxSystem-
Quelltext-Guard, 4 Frames à 128x128 (Hit/Death verschieden), Dorn-Treppe ohne
Ink/Grau/warm (alle Frames), Timing unverändert (hit 0,18 / death 0,42 — kein
Balance-Eingriff), Projektil 12x12, Trail 14x14, Streak-Phasen (Phase 2 < 50 %
Masse), Krone 96x96 + Phasen, kein Mixel am Quelltext (keine 3.0x-Streaks, Krone
@ Scale 1, thornTrail-Flag), Determinismus (byte-identisch), binäres Alpha.
Suite **1290/1290 grün** (1x Timeout-Flake in tests/fx-mixel.test.ts unter
Parallel-Last der Nachbar-Lanes, Wiederholung grün — TestTimeout 5 s, kein
Sachfehler), `npx tsc --noEmit` rc=0, `npm run build` rc=0.

## Nachher (Commit 135ea6b)

`node scripts/m10-evo-fx-dornensturm.mjs after`, gleicher Renderer, 0 JS-Fehler:

| Kriterium | Nachher | Vorher |
|---|---|---|
| Todes-Signatur | **128x128 @ Draw-Scale 1** | 32x32 @ ~4x |
| Ink/Grau/Semi | **0 / 0 / 0** (alle gemessenen Texturen) | 12/25 Ink (Projektil), 188/354 (Sig) |
| Near-White (min RGB ≥ 200) | **3,76 %** (16/425, ≤ 4,16 %-Gate) | — |
| Live-Scales | Projektile **1,0**, Streaks **0,981**, Krone **1,0**, Trail 0,702 | 1,7x / 3,0x / 0,45+0,28 |
| Farb-Treppe | nur 11/31/30/29/28 (Projektil ohne 11) | warm: lantern/flame/fleshWarm |
| GIF | `shots/m10-evo-fx-dornensturm-after.gif` (24 Frames, lebende Gegner, 0 JS-Fehler) | — |

## art-director-Sichtprüfung (verschärfte Skala)

**Runde 1: FAIL — Note 3,5/5** (Belege after-GIF/PNGs + Code-Review): Texturen selbst
auslieferungsreif, ABER Streaks (`scaleTo: 0.55`), Trail (`scaleX * 0.8 → 0.15`) und
Muzzle-Puff (`0.7 → 0.2`) tweenen nicht-ganzzahlig → Resample = Mixel gegen die
eigene Regel „eine Pixelgröße für alles".

**Nachbesserung (Commit 8820123):** Streaks/Trail/Muzzle ohne Scale-Tween —
Draw-Scale 1, das Schrumpfen übernimmt der 3-Frame-Decay; Trail alphaFrom 0,6;
Signatur-Barben +1 px mossNight(28)-Saum (Grün-auf-Gras-Kontrast); Guards für
Scale-1-Pflicht + Trail/Muzzle-Pfade in tests/evo-fx-dornensturm.test.ts ergänzt.
Neue Messung: **alle live Scales exakt 1,0** (dispW = sourceW), Near-White 3,76 %.

**Runde 2: PASS — Note 4,5/5 (auslieferungsreif im Kartenscope).** Alle vier
Dornen-FX-Texturen 4,5; Kriterien (1) Dither nur an Kanten, (2) Kerne flächig,
(3) organische Formen (Before-Rauten komplett weg), (4) Lesbarkeit inkl.
Grün-auf-Gras bestätigt. Out-of-Scope-Meldungen (nicht diese Lane):
- GIF/PNG-Belege künftig ganzzahlig vergrößert aufnehmen (2×/3× statt 1,5×/2,25×)
  — Capture-Artefakt, keine Asset-Eigenschaft.
- Harter, rechteckiger Schatten-/Vignette-Kantenseam rechts/unterhalb des Spielers
  (in before UND after identisch) → eigene Karte beim Licht-/Vignette-Compositing.
- Schwarzes Rechteck bei World-Edge/Chunk-Streaming (GIF Frame 3) → Terrain-Lane.

## Commits (Lane)

81470c2 (#7718 Ist), 977de67 (#7719 Zielgrößen), 11ac797 (#7720 Signatur),
781551a (#7721 Tests), 135ea6b (#7722 After), 8820123 (#7722 Nachbesserung PASS).

## Belege

`shots/m10-evo-fx-dornensturm-before.json` / `-after.json` (+ PNGs `-640`/`-960`
/+ `-streaks`), `-after.gif` (24 Frames, lebende Gegner), Renderer **ANGLE (Intel,
Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**, 0 JS-Fehler;
`scripts/m10-evo-fx-dornensturm.mjs`, `-gif.mjs`; diese Datei.

## Offene Punkte

- `fx_seal`-Nachglüh-Burst der **Sturm-Basiswaffe** (CombatSystem ~Zeile 696,
  scaleFrom 2.0 → 2.6) und `fx_star`-Burst (scaleFrom 2.0) bleiben > 1x — geteilte
  generische Pfade außerhalb des Lane-Bereichs (Tabu: alles außer der Dornen-Area);
  die Mixel-Bake-Lane (m10-fx-mixel-fix) deckt FxSystem-Scales ab.
- `projectile_thorn`/`fx_thorn` sind mit der **Basiswaffe Dornensalve** geteilt —
  die Zielgrößen-/Farb-Fixes verbessern beide (kein Balance-Eingriff: Werte in
  evolution-weapons.ts unverändert, nur Optik/Signatur).
- Fremd-Dateien, minimal + begründet: `tests/evo-fx-zornpendel.test.ts` (1 Assertion
  folgt drawScale, Muster 0b3b563 — thorn_storm jetzt ebenfalls Zielgröße),
  `.gitignore` (1 Ausnahmezeile für das Lane-GIF).
- `shots/m10-passive-math-*.json` im Worktree modified (fremd, nicht angefasst).
- Farb-Histogramm im JSON misst Frame 0; Frames 1–3 per Unit-Test gedeckt (Muster
  der Kette).

## Merge-Verifikation (28.11.2026, #8976)

Merge 063623a wurde von einem parallelen Merge-Job ausgefuehrt (Rebase auf main inkl.
Revert 34e97d3; zweiter Job rebasste waehrend eines laufenden Merge-Jobs erneut und
mergte, Lane-Worktree dabei entfernt — Duplikat-Ausfuehrung, kein Datenverlust, Lane-Karten
#8877-#8881 done). Eigene Nachkontrolle auf main @ 8bef481: 6 Kontroll-Shots
`shots/m10-evo-fx-dornensturm-rebase-{960,1280,1920}-{start,60s}.png` (Start + 60 s echtes
Laufen, Level-Ups auto-bestaetigt) + `...-rebase-blackcheck.json`. Befund: Terrain
vollstaendig intakt, keine schwarzen Terrain-Loecher; gemessene Schwarz-Pixel
(0,25-0,30 %) liegen ausschliesslich in HUD-Leiste/Text und Props und sind in den
Start-Shots identisch (statisch). Build + Suite auf main: 145 Dateien / 1522 Tests gruen.
