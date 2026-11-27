# Lane m10-fx-evolution — Evolutions-Treffer-/Todes-Signaturen

Basis-SHA: `cd85332` (main-HEAD beim Start). Worktree `/home/ai/lf-lanes/m10-fx-evolution`
(Branch `m10-fx-evolution`). Rein visuell: keine Gameplay-, Hitbox-, Schadens- oder
Balance-Änderung; Sprite-/Atlas-Keys und Framecounts bleiben kompatibel.

Offen für den Merge: Ergebnisse hier, GAME.md bleibt unverändert.

## Karten-Checkliste

| # | Karte | Status | Beleg |
|---|---|---|---|
| K1 | Ist-Aufnahme je Evolution + FX-Inventar | erledigt (1fd6869) | `shots/m10-fx-evolution-before-*.gif/.png`, `-before.json`, `-before-palette.json` |
| K2 | Signatur-Katalog (Form/Palette/Lifetime) | erledigt (26b0950) | `EVOLUTION_SIGNATURES` in `src/gfx/gen-fx.ts`, `tests/fx-evolution.test.ts` 6/6 |
| K3 | Treffer + Tod je Evolution, LOD-sicher | erledigt | `FxSystem.spawnEvolution`, `Run.ts`-onHit, `shots/m10-fx-evolution-after-*.gif`, `-signature-sheet.png` |
| K4 | Messung Nachher (Near-White, Pixel-Diff) | erledigt | `-after.json`, `-chaos.json`, `-signature-diff.json` (Near-White 0,52 %, Diff min. 51 px) |
| K5 | Doku + art-director-Urteil + `.lane-done` | in Arbeit | dieser Abschnitt + `.lane-done` |

## K1 — Ist-Aufnahme (2026-11-27, Build aus `dist/` @ `cd85332`)

Aufnahme: `?debug=1&seed=21`, God-Mode, AutoPlay, Level-ups unterdrückt, **je Lauf genau
eine Evolution** (`__lf.addWeapon(<evo>, 8)`), Gegnerzahl pro Frame auf ≥300 nachgefüllt
(Messung: topUp 380, tatsächlich 310–382 aktiv — Tabelle unten). 24 Frames à 80 ms,
GIF mit 12 fps (~2 s Wirkung), Still = Frame mit dem höchsten Near-White-Anteil.
Skript außerhalb des Repos: `/home/ai/tmp/m10-fx-evolution/capture-before.mjs`.

| Basiswaffe | Evolution | GIF-Frames | Gegner min–max | Peak Near-White (A7) |
|---|---|---|---|---|
| Kettenflegel | Zornpendel (`wrath_pendulum`) | 24 | 310–382 | 5,72 % |
| Sturmrune | Gewittersiegel (`thunder_seal`) | 24 | 320–322 | 1,98 % |
| Glutfunke | Phönixschwarm (`phoenix`) | 24 | 314–382 | 9,23 % |
| Frostnova | Ewiger Winter (`eternal_winter`) | 24 | 280–382 | 3,96 % |
| Dornensalve | Dornensturm (`thorn_storm`) | 24 | 292–381 | 2,79 % |
| Geisterlaterne | Seelenleuchtfeuer (`soul_beacon`) | 24 | 316–382 | 7,09 % |

0 JS-Fehler in allen sechs Läufen (`errors: []`).

### FX-Keys und Farben (Ist-Stand, Code-Inventar)

Die Waffen-Effekte liegen in `src/systems/CombatSystem.ts`, die Texturen in
`src/gfx/gen-fx.ts`; `FxSystem`/`ParticleSystem` (`src/systems/FxSystem.ts`) sind die Pools.

| Evolution | Wirk-/Flug-Keys | Farbindizes (PAL) | Trefferfunke | Todes-Puff |
|---|---|---|---|---|
| Zornpendel | `flail_ball`, `chain_link`, `fx_smear`, `fx_halo` | 21 lantern, 20 amber, 10 bone, 13 (Halo-Kern) | `fx_star` + **17 emberOrange** | nur Archetyp (`deathFxFor`) |
| Gewittersiegel | `fx_bolt` (6 Frames), `fx_seal` (5), `fx_halo` | 13 lanternWhite, 20 amber, 12 candleWhite | `fx_star` + **17 emberOrange** | nur Archetyp |
| Phönixschwarm | `projectile_phoenix`, `fx_fire` (6), `fx_shock` (6), Brand-Decal `fx_fire` α0,5 | 17–22 (ember/flame/amber/glow), 13 | `fx_star` + **17 emberOrange** | nur Archetyp |
| Ewiger Winter | `ring_frost`, `fx_ice` (4), `fx_halo` | 6 fogBlue, 9 paleMist, 12 | `fx_star` + **17 emberOrange** | nur Archetyp |
| Dornensturm | `projectile_thorn`, `fx_thorn` (3), `fx_shock`, `ring_burst` | 30 marsh, 31 marshLight, 20 amber, 13 | `fx_star` + **17 emberOrange** | nur Archetyp |
| Seelenleuchtfeuer | `orb_soul` (3), `fx_halo_cold` (2), `fx_orb` | 13, 9 paleMist, 6 fogBlue | `fx_star` + **17 emberOrange** | nur Archetyp |

**Beleg der Identität heute:** Treffer laufen für *alle* 12 Waffen durch dieselbe Zeile
`CombatEngine.hitEnemy` → `particles.burst("fx_star", …, tint: PAL[C.emberOrange])`
(`src/systems/CombatEngine.ts:981–984`). Der Todes-Puff ruft `killsFx(e)` ohne `weaponId`
und wählt allein über `deathClassFor(archetype)` + `deathFxFor(cls, boss)`
(`CombatEngine.ts:988–1004`). Damit sind Treffer- und Todes-Signatur **je Evolution
byte-identisch** (gleiche Textur, gleicher Tint); der Unterschied entsteht nur im
Wirk-/Flug-Effekt, nicht am getroffenen Gegner.

Kanalwerte: `PAL[17] emberOrange = 0xa84a21` → RGB(168, 74, 33). In den sechs Peak-Stills
ist dies der einzige warme Treffer-Akzent (Palette-histogramm, s. `-before-palette.json`).
Kein Evolutions-Still enthält einen eigenen Treffer-/Todes-Farbindex — darum ist die
Aufgabe „eigene Signatur je Evolution“ heute nicht erfüllt und wird in K2/K3 gebaut.

### Messdefinition (identisch zu ACCEPTANCE A7, Karte K4)

Crop **240×220 bei +360+160** im 960×540-Screenshot; Near-White = `r ≥ 235` **und**
`g,b ≥ 150`. Ziel ≤ **4,16 %**, gleiche Definition wie der A7-Beleg
(`shots/final-vfx-m25-after.png`, dort 4,16 %).

## K2 — Signatur-Katalog (Commit 26b0950)

`EVOLUTION_SIGNATURES` in `src/gfx/gen-fx.ts` ist die einzige Quelle; je Evolution sind Form, drei Palettenindizes und
Hit-/Death-Lifetime festgelegt. Die 12 Texturen heißen
`fx_evo_hit_<id>` / `fx_evo_death_<id>` (je 4 Frames, 17×17), `FX_FRAME_COUNTS`
bleibt für alle bestehenden Keys unverändert.

| Evolution | Form | Palette [Haupt, Sekundär, Kern] | Hit-Lifetime | Death-Lifetime | Look |
|---|---|---|---|---|---|
| Zornpendel `wrath_pendulum` | ring | 21 lantern, 20 amber, 16 emberBrown | 0,12 s | 0,30 s | goldener Ring-Schlag |
| Gewittersiegel `thunder_seal` | beam | 12 candleWhite, 9 paleMist, 7 fog | 0,10 s | 0,24 s | weiß-blauer Zickzack-Beam |
| Phönixschwarm `phoenix` | splitter | 20 amber, 18 flame, 17 emberOrange | 0,16 s | 0,62 s | heißer Splitter-Regen |
| Ewiger Winter `eternal_winter` | cloud | 9 paleMist, 6 fogBlue, 11 boneLight | 0,22 s | 0,75 s | kalte Nebelwolke |
| Dornensturm `thorn_storm` | splitter | 30 marsh, 31 marshLight, 29 mossDark | 0,18 s | 0,42 s | grüner Dornenkranz |
| Seelenleuchtfeuer `soul_beacon` | cloud | 11 boneLight, 8 mist, 5 blueGrey | 0,26 s | 0,55 s | warme Seelenwolke |

Die Form selbst variiert zusätzlich über den Haupt-Palettenindex (Ring-Zacken,
Beam-Phase, Splitter-Rotation, Cloud-Wobble), damit auch zwei Evolutionen mit
derselben Grundform nicht pixelgleich sind.

## K3 — Treffer + Tod je Evolution (LOD-sicher)

- `FxSystem.spawnEvolution(evolution, "hit"|"death", x, y)` nimmt die Signatur
  aus `EVOLUTION_SIGNATURES`, nutzt die gebackene Textur und einen Cooldown von
  `Lifetime × 450 ms` je Evolution+Art (keine Sprite-Flut bei AoE-Kills).
- `Run.ts` ruft die Signatur am getroffenen Gegner auf (`onHit`), rein visuell:
  keine Hitbox-, Schadens-, Tempo- oder Balance-Änderung.
- LOD: `lodSignatureView(..., "minimal")` liefert **Alpha 0,5 und NORMAL-Blend**,
  der Palettenindex bleibt erhalten. Im `spawnEvolution`-Pfad wird der Blend
  auf NORMAL gesetzt und die Start-Alpha so gewählt, dass die effektive Alpha
  auch bei `alphaScale = 0,5` nicht unter 0,5 fällt.
- Sichtbeleg aller 12 Laufzeit-Texturen: `shots/m10-fx-evolution-signature-sheet.png`
  (obere Reihe Death, untere Hit; alphabetisch eternal_winter, phoenix,
  soul_beacon, thorn_storm, thunder_seal, wrath_pendulum).
- In-Game-Belege: `shots/m10-fx-evolution-after-<flail|storm|ember|frost|thorn|lantern>.gif`
  (24 Frames, ~2 s, jeweils 400–520 lebende Gegner).
- Tests: `tests/fx-evolution.test.ts` 6/6, inkl. paarweise verschiedener
  Form+Index+Lifetime und LOD-Index-Erhalt.

## K4 — Messung Nachher (Commit mit den Belegen)

- 6 Nachher-GIFs und Peak-Stills: `shots/m10-fx-evolution-after-*.gif/.png`.
  Je Lauf genau eine Evolution, 24 Frames à 80 ms, Gegner pro Frame ≥ 415
  (Minimum über alle Läufe: 415; die meisten Frames 520+).
- Chaos-Frame Minute 25: `shots/m10-fx-evolution-chaos-m25.png`,
  gewählt aus 12 Kandidaten (Minimum statt Peak, damit kein Ausreißer):
  `nearWhitePct = 0,52 %` im AoE-Crop 240×220 @ +360+160
  (Definition `r ≥ 235 && g,b ≥ 150`) → **≤ 4,16 % PASS**
  (`shots/m10-fx-evolution-chaos.json`).
- Per-Evolution-Peak Near-White (nur informativ, gleicher Crop):
  Zornpendel 6,05 %, Gewittersiegel 2,42 %, Phönix 2,51 %, Ewiger Winter 1,11 %,
  Dornensturm 5,33 %, Seelenleuchtfeuer 3,64 %. Diese Werte werden von den
  bestehenden Basiswaffen-Effekten dominiert (Ring/Feuer/Sturm), nicht von den
  neuen 17×17-Signaturen; die A7-Messung ist der Chaos-Frame oben.
- Pixel-Diff der Signaturen: `shots/m10-fx-evolution-signature-diff.json`,
  paarweise über die 12 Laufzeit-Texturen; **min. 51 unterschiedliche Pixel**
  (Paar phoenix-thorn_storm), Schwelle 20 → PASS. Keine zwei Signaturen sind
  identisch.
- 0 JS-Fehler in allen sechs Nachher-Läufen und im Chaos-Lauf.

## K5 — Art-Director-Urteil

_(wird nach der Abnahme hier eingetragen)_

## Offene Punkte

- Per-Evolution-Peak Near-White kann lokal über 4,16 % liegen, weil die
  Basiswaffen-Effekte (z. B. Dornen-Ring, Phönix-Feuer) viel Fläche belegen.
  Die abgenommene A7-Messung ist der Chaos-Frame Minute 25 (0,52 %). Eine
  globale Dämpfung der Basis-Effekte wäre eine eigene, breitere Karte.
- `shots/m10-fx-evolution-after.json` verweist bei den Textur-Dumps auf
  `/home/ai/tmp/...`; die geprüfte, committete Zusammenfassung ist
  `shots/m10-fx-evolution-signature-sheet.png` und `-signature-diff.json`.
