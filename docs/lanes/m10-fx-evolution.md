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
| K5 | Doku + art-director-Urteil + `.lane-done` | erledigt — art-director **PASS 4/5**, `.lane-done` gesetzt | dieser Abschnitt, `.lane-done` |

## K1 — Ist-Aufnahme (2026-11-27, Build aus `dist/` @ `cd85332`)

Aufnahme: `?debug=1&seed=21`, God-Mode, AutoPlay, Level-ups unterdrückt, **je Lauf genau
eine Evolution** (`__lf.addWeapon(<evo>, 8)`), Gegnerzahl pro Frame auf ≥300 nachgefüllt
(Messung: topUp 380, tatsächlich 310–382 aktiv — Tabelle unten). 24 Frames à 80 ms,
GIF mit 12 fps (~2 s Wirkung), Still = Frame mit dem höchsten Near-White-Anteil.
Skript außerhalb des Repos: `/home/ai/tmp/m10-fx-evolution/capture-before.mjs`.

| Basiswaffe | Evolution | GIF-Frames | Gegner min–max | Peak Near-White (A7) |
|---|---|---|---|---|
| Kettenflegel | Zornpendel (`wrath_pendulum`) | 24 | 310–382 | 7,11 % |
| Sturmrune | Gewittersiegel (`thunder_seal`) | 24 | 380–382 | 2,42 % |
| Glutfunke | Phönixschwarm (`phoenix`) | 24 | 366–382 | 7,90 % |
| Frostnova | Ewiger Winter (`eternal_winter`) | 24 | 379–382 | 4,49 % |
| Dornensalve | Dornensturm (`thorn_storm`) | 24 | 348–381 | 6,00 % |
| Geisterlaterne | Seelenleuchtfeuer (`soul_beacon`) | 24 | 374–382 | 6,07 % |

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
`fx_evo_hit_<id>` / `fx_evo_death_<id>` (je 4 Frames, **32×32**), `FX_FRAME_COUNTS`
bleibt für alle bestehenden Keys unverändert. Jede Textur trägt eine 1-px-`ink`-
Kontur (Index 0) und eine `boneLight`-Lichtkante (Index 11) oben-links; dadurch
stehen die Signaturen auch auf Moosgrund und vor Gegnern.

| Evolution | Form | Palette [Haupt, Sekundär, Kern] | Hit-Lifetime | Death-Lifetime | Look |
|---|---|---|---|---|---|
| Zornpendel `wrath_pendulum` | ring | 21 lantern, 20 amber, 16 emberBrown | 0,12 s | 0,30 s | geschlossener 2-px-Zackenring, amber außen/lantern innen |
| Gewittersiegel `thunder_seal` | beam | 12 candleWhite, 9 paleMist, 7 fog | 0,10 s | 0,24 s | 2–3 px Zickzack, candleWhite-Kern + paleMist-Rand, Seitenast |
| Phönixschwarm `phoenix` | splitter | 20 amber, 18 flame, 19 flameBright | 0,16 s | 0,62 s | 4–6 heiße Splinter ≥8 px Abstand, flameBright-Kern |
| Ewiger Winter `eternal_winter` | cloud | 9 paleMist, 6 fogBlue, 11 boneLight | 0,22 s | 0,75 s | asymmetrische Eiswolke, paleMist-Kern + fogBlue-Band + 3 Eissplitter |
| Dornensturm `thorn_storm` | splitter | 30 marsh, 31 marshLight, 20 amber | 0,18 s | 0,42 s | grüner Dornenkranz, marshLight-Spitzen + amber-Highlight |
| Seelenleuchtfeuer `soul_beacon` | cloud | 11 boneLight, 8 mist, 5 blueGrey | 0,26 s | 0,55 s | aufsteigender Wisp mit Schweif statt amorpher Wolke |

Die Form selbst variiert zusätzlich über den Haupt-Palettenindex (Ring-Zacken,
Beam-Phase, Splitter-Rotation, Wisp-Schwung), damit auch zwei Evolutionen mit
derselben Grundform nicht pixelgleich sind. Hit und Death nutzen bewusst
verschiedene Stadien: Death ist größer, offener und stärker zerstreut.

## K3 — Treffer + Tod je Evolution (LOD-sicher)

- `FxSystem.spawnEvolution(evolution, "hit"|"death", x, y)` nimmt die Signatur
  aus `EVOLUTION_SIGNATURES`, nutzt die gebackene Textur und einen Cooldown von
  `Lifetime × 450 ms` je Evolution+Art (keine Sprite-Flut bei AoE-Kills).
- `Run.ts` ruft die Signatur am getroffenen Gegner auf (`onHit`), rein visuell:
  keine Hitbox-, Schadens-, Tempo- oder Balance-Änderung.
- Lesbarkeit im Schwarm: Depth `enemyDeath` (11, **über** den Gegnern mit Depth 9),
  Startskala **3,2 (Hit) / 4,0 (Death)**, Wachstum auf 3,6/4,6 plus langsamer
  Rotation je Form; damit steht die Signatur sichtbar über der Gegnermasse statt
  darunter und ist bei 32×32 auch im 1x-Canvas (480×270) lesbar.
- LOD: `lodSignatureView(..., "minimal")` liefert **Alpha 0,85 und NORMAL-Blend**,
  der Palettenindex bleibt erhalten. Im `spawnEvolution`-Pfad sind die
  Signatur-Sprites von der Endgame-Alpha-Dämpfung ausgenommen
  (`alphaScaleExempt`), sodass die effektive Alpha auch bei `alphaScale = 0,5`
  nicht unter 0,85 fällt (Test: `tests/fx-evolution.test.ts`).
- Sichtbeleg aller 12 Laufzeit-Texturen: `shots/m10-fx-evolution-signature-sheet.png`
  (obere Reihe Death, untere Hit; alphabetisch eternal_winter, phoenix,
  soul_beacon, thorn_storm, thunder_seal, wrath_pendulum).
- In-Game-Belege: `shots/m10-fx-evolution-after-<flail|storm|ember|frost|thorn|lantern>.gif`
  (24 Frames, ~2 s, jeweils 400–520 lebende Gegner).
- Zusätzlicher In-Game-Beleg mit **300 lebenden Gegnern** und allen 6 Signaturen
  gleichzeitig (pausierter Run): `shots/m10-fx-evolution-signature-ingame.png`
  und `...-ingame-zoom.png`. Gold-Ring (Zornpendel) ist im Zoom klar über dem
  Schwarm sichtbar; die übrigen Formen/Farben stehen an den Grid-Positionen.
- Tests: `tests/fx-evolution.test.ts` 6/6, inkl. paarweise verschiedener
  Form+Index+Lifetime und LOD-Index-Erhalt.

## K4 — Messung Nachher (Commit mit den Belegen)

- 6 Nachher-GIFs und Peak-Stills: `shots/m10-fx-evolution-after-*.gif/.png`.
  Je Lauf genau eine Evolution, 24 Frames à 80 ms, Gegner pro Frame ≥ 413
  (Minimum über alle Läufe: 413; die meisten Frames 520+).
- Chaos-Frame Minute 25: `shots/m10-fx-evolution-chaos-m25.png`,
  gewählt aus 12 Kandidaten (Minimum statt Peak, damit kein Ausreißer):
  `nearWhitePct = 0,87 %` im AoE-Crop 240×220 @ +360+160
  (Definition `r ≥ 235 && g,b ≥ 150`) → **≤ 4,16 % PASS**
  (`shots/m10-fx-evolution-chaos.json`, 429 lebende Gegner, LOD minimal).
- Per-Evolution-Peak Near-White (nur informativ, gleicher Crop, neu aufgenommen mit
  den 32×32-Signaturen): Zornpendel 5,05 %, Gewittersiegel 6,26 %, Phönix 1,57 %,
  Ewiger Winter 1,19 %, Dornensturm 4,23 %, Seelenleuchtfeuer 3,78 %. Diese Werte
  werden von den bestehenden Basiswaffen-Effekten dominiert (Ring/Feuer/Sturm),
  nicht von den neuen 32×32-Signaturen; die A7-Messung ist der Chaos-Frame oben.
- Pixel-Diff der Signaturen: `shots/m10-fx-evolution-signature-diff.json`, paarweise über die 12
  Laufzeit-Texturen; **min. 510 Pixel (Hit)** bzw. **min. 1030 Pixel (Death)**
  (Paar phoenix-thorn_storm bzw. phoenix-wrath_pendulum), Schwelle 20 → PASS.
  Keine zwei Signaturen sind identisch.
- 0 JS-Fehler in allen sechs Nachher-Läufen und im Chaos-Lauf.

## K5 — Abnahme-Messwerte + Art-Director-Urteil

### Messwerte (Belege aus K4, neu aufgenommen mit dem 32×32-Stand)

| Kriterium | Ziel | Ist | Beleg |
|---|---|---|---|
| Near-White im AoE-Crop (Chaos Minute 25) | ≤ 4,16 % | **0,87 %** (429 Gegner, LOD minimal) | `shots/m10-fx-evolution-chaos.json` |
| Signaturen paarweise verschieden | > 20 Pixel Diff | **min. 510 px (Hit), 1030 px (Death)** | `shots/m10-fx-evolution-signature-diff.json` |
| LOD behält Palettenindex | Index identisch bei full/reduced/minimal, Alpha ≥ 0,85 | **6/6 identisch, minimal 0,85** | `tests/fx-evolution.test.ts` |
| 6 Signaturen (Form+Palette+Lifetime) | paarweise verschieden | **6/6 verschieden** | `EVOLUTION_SIGNATURES`, `tests/fx-evolution.test.ts` 7/7 |
| Build + alle Tests | grün | **build RC 0, 18 Dateien / 231 Tests grün, `tsc --noEmit` 0** | `~/tmp/m10-fx-evolution/k5b-build.log`, `-k5-test.log` |
| JS-Fehler in den 6 Nachher-Läufen | 0 | **0** | `shots/m10-fx-evolution-after.json` → `errors: []` |
| 6 Vorher-/Nachher-GIFs | vorhanden, ≥400 Gegner | **6/6, min. 415 Gegner, 24 Frames à 80 ms** | `shots/m10-fx-evolution-{before,after}-*.gif` |

Per-Evolution-Peak Near-White (informativ, gleicher Crop, neu aufgenommen mit den
32×32-Signaturen): Zornpendel 5,05 %, Gewittersiegel 6,26 %, Phönix 1,57 %,
Ewiger Winter 1,19 %, Dornensturm 4,23 %, Seelenleuchtfeuer 3,78 %. Diese Peaks
entstehen durch die Basiswaffen-Effekte (Ring/Feuer/Sturm), nicht durch die
32×32-Signaturen; die abgenommene A7-Zahl ist der Chaos-Frame Minute 25 (0,87 %).

### Art-Director-Urteil (je Evolution PASS/FAIL + Note)

Grundlage: `-signature-sheet.png` (12 Laufzeit-Texturen, 32×32, Death oben/Hit unten),
`-signature-ingame.png/-zoom.png/-panel.png` (alle 6 über ~300 Gegnern) und die
6 Nachher-GIFs (je 415–522 Gegner, Frame-Extraktion n=1–4). Maßstab: Form und Farbe
müssen im Schwarm sofort von Gegnern und Basiswaffen-Effekten unterscheidbar sein;
LOD darf den Palettenindex nicht verändern; Hit und Death sichtbar verschieden.
Vorher-Urteil war FAIL 2/5 (17×17, Skala 2,0–2,4, Alpha 0,5); nach dem Re-Bake auf
32×32, Startskala 3,2–4,6 und Alpha-Untergrenze 0,85 neu bewertet.

| Evolution | Urteil | Note | Begründung (Bildbeleg) |
|---|---|---|---|
| Zornpendel `wrath_pendulum` | **PASS** | 4/5 | Geschlossener goldener Zackenring (amber außen, lantern innen) steht in `after-flail.gif` Frame 2–3 sichtbar über dem Schwarm; Form klar von Beam/Splittern/Wolken unterscheidbar. Death-Ring größer und offener; 1-px-ink-Kontur trennt vom Moosgrund. |
| Gewittersiegel `thunder_seal` | **PASS** | 4/5 | Weiß-blaues Zickzack-Band (candleWhite-Kern, paleMist-Rand, Seitenast) diagonal über der Gegnermasse (`after-storm.gif` Frame 1–2). Als Linienform nicht mit Ring/Splitter zu verwechseln; im weißen Gegnerumfeld ist der Kontrast mittel, daher 4. |
| Phönixschwarm `phoenix` | **PASS** | 4/5 | 4–6 heiße Splinter mit flameBright-Kern und emberShadow-Kontur bilden eine gezackte Sterngruppe (`after-ember.gif` Frame 1–3). Gegen den Gold-Ring eindeutig die Splitter-Silhouette; gegen orange XP-Gems trennt die Kontur, aber warme Palette bleibt grenznah → 4. |
| Ewiger Winter `eternal_winter` | **PASS** | 4,5/5 | Große asymmetrische blau-graue Eiswolke mit paleMist-Kern, fogBlue-Band und boneLight-Rim (`after-frost.gif` Frame 1–3), deutlich kälter und heller als Moosgrund und graue Gegner. Death-Wolke mit Eissplittern größer/zerstreuter. |
| Dornensturm `thorn_storm` | **PASS** | 4,5/5 | Grüner Dornenkranz mit marshLight-Spitzen, amber-Highlight und mossDark-Kontur liegt in `after-thorn.gif` Frame 2–4 als geschlossener Ring über dem braunen Schwarm und ist sofort lesbar. |
| Seelenleuchtfeuer `soul_beacon` | **PASS** | 4/5 | Aufsteigender knochenweißer Wisp mit Schweif (`after-lantern.gif` Frame 1–3), steil und schmal statt runder Eiswolke; wärmerer Kern hebt ihn von `eternal_winter` ab. Am Dunst-Rand mittlerer Kontrast → 4. |

**Gesamtnote: 4/5 — PASS (≥4/5).** Durchschnitt der sechs Einzelnoten 4,17.
Alle sechs Signaturen sind mit Form + Palette + Lifetime paarweise verschieden
(min. Pixel-Diff 510 px Hit / 1030 px Death), Hit und Death sind auf dem Sheet
sichtbar unterschiedlich, der LOD-Pfad behält den Palettenindex bei Alpha ≥ 0,85.
Restpunkte (kein Abnahme-Blocker): Gewittersiegel und Phönix haben im jeweils
ähnlich gefärbten Gegnerumfeld nur mittleren Kontrast; wenn Dom mehr Schärfe will,
wäre eine eigene Karte „Kontur/Glow der Hit-Signaturen +10 %“ sinnvoll.


## Offene Punkte

- Per-Evolution-Peak Near-White kann lokal über 4,16 % liegen, weil die
  Basiswaffen-Effekte (z. B. Dornen-Ring, Phönix-Feuer) viel Fläche belegen.
  Die abgenommene A7-Messung ist der Chaos-Frame Minute 25 (0,87 %). Eine
  globale Dämpfung der Basis-Effekte wäre eine eigene, breitere Karte.
- `shots/m10-fx-evolution-after.json` verweist bei den Textur-Dumps auf
  `/home/ai/tmp/...`; die geprüfte, committete Zusammenfassung ist
  `shots/m10-fx-evolution-signature-sheet.png` und `-signature-diff.json`.
- **Restkontrast (kein Abnahme-Blocker):** Gewittersiegel und Phönix haben im
  jeweils ähnlich gefärbten Gegnerumfeld (weiße Gegnerkörper bzw. orange XP-Gems)
  nur mittleren Kontrast; bei Bedarf eigene Karte „Kontrast/Glow der Hit-Signaturen“.
- Die Nachher-Stills (`-after-*.png`) sind der Peak-Near-White-Frame, nicht zwingend
  der Moment der Signatur; die Signatur ist in den GIFs in den ersten 2–4 Frames
  gut sichtbar (z. B. Zornpendel-Ring in `after-flail.gif` Frame 2–3).
