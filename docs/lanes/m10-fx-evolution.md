# Lane m10-fx-evolution — Evolutions-Treffer-/Todes-Signaturen

Basis-SHA: `cd85332` (main-HEAD beim Start). Worktree `/home/ai/lf-lanes/m10-fx-evolution`
(Branch `m10-fx-evolution`). Rein visuell: keine Gameplay-, Hitbox-, Schadens- oder
Balance-Änderung; Sprite-/Atlas-Keys und Framecounts bleiben kompatibel.

Offen für den Merge: Ergebnisse hier, GAME.md bleibt unverändert.

## Karten-Checkliste

| # | Karte | Status | Beleg |
|---|---|---|---|
| K1 | Ist-Aufnahme je Evolution + FX-Inventar | erledigt | `shots/m10-fx-evolution-before-*.gif/.png`, `-before.json`, `-before-palette.json` |
| K2 | Signatur-Katalog (Form/Palette/Lifetime) | offen | – |
| K3 | Treffer + Tod je Evolution, LOD-sicher | offen | – |
| K4 | Messung Nachher (Near-White, Pixel-Diff) | offen | – |
| K5 | Doku + art-director-Urteil + `.lane-close` | offen | – |

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
