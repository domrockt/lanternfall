# Lane m10-evo-fx-zornpendel — Zornpendel-FX neu

Dom-Wunsch 21:45Z, Punkt 1 (Evolutions-Effekte neu, 4/5): Das Zornpendel las sich als
**blockiger Ring** — grobe hochskalierte Effekt-Texturen statt lesbarer Zorn-Waffe.
Vorlage: `docs/lanes/m10-evo-fx-phoenix.md` (Regelwerk „Eine Pixelgröße für alles"
1:1 übernommen), Nachfolger von `docs/lanes/m10-evo-fx-soulpyre.md`. Vierte von fünf
Evo-Effekt-Lanes. Läuft nach soulpyre, damit gen-fx.ts/FxSystem.ts seriell bleiben.

## Regelwerk „Eine Pixelgröße für alles" (aus der Phönix-Vorlage)

1. **Textur in Zielgröße backen, mit Draw-Scale 1 zeichnen** — nie > 1x hochskalieren.
2. **Klare Farbe je Element**: Zorn-Treppe Kern hell-bernstein Glow(22)/Lantern(21)/
   Amber(20) → Glut rot FleshWarm(27)/HotRed(26)/Crimson(25), geschlossene 1-px-Kontur
   Blutnacht(23) statt Ink. **Kein Ink(0), keine Nacht-/Grau-Stufen (1–9)** an den
   Zorn-Effekt-Texturen (ZORN_RAMP in gen-fx.ts).
3. **Aufbau (Anticipation) → Impact → Ausklang** als eigener Frame-Fortschritt.
4. **Lesbarkeit vor Menge**: wenige, große, gestufte Formen; Schwung über 3 Frames.

## Ist-Zustand (Vorher, Commit 4c26b5a)

Skript: `node scripts/m10-evo-fx-zornpendel.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("wrath_pendulum", 8)` + 20 Gegner; 640x360 (Viewport 1280x720) und 960x540@1).
Belege: `shots/m10-evo-fx-zornpendel-before.json` (+ PNGs `-before-640/-before-960/
-swing`), Renderer **ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**,
0 JS-Fehler.

Mängel:
| Effekt | Vorher | Problem |
|---|---|---|
| `fx_evo_death_wrath_pendulum` | 32x32 @ **4,33x** | **176 Ink-Pixel** = schwarzer Blockring |
| `fx_halo` am Kugelkopf | 24x24 @ **radius/18 ≈ 5,3x** (tint fogBlue!) | Mixel + falsche Farbe |
| `fx_halo` am Spieler | 24x24 @ **radius/12→/9 ≈ 8–10,7x** | fetter Mixel-Ring |
| `fx_smear` am Spieler | 44x16 @ **radius/20 ≈ 4,8x** | Mixel-Bogen |
| `flail_ball` | 9x9 @ **1,69x** | hochskalierte Eisenkugel |
| Phasen | keine | statischer Ring, kein Aufbau/Ausklang |

## Fix (Commits b424891 + Tests 4fb34d7)

**gen-fx.ts**
- `pendulumRingFrame(stage)` — **Pendel-Ring in Zielgröße 208x208** (Radius 96 + 8 px
  Rand, Zornpendel Lv 8), 3 Schwung-Frames: Bogen wächst mit dem Schwung (0,32π → π,
  Aufbau → Impact), Kern flächig hell-bernstein (22) über den ganzen Bogen, Glut-Treppe
  27/26/25 nur an den Bändern zum Schwungstart, organische Zungen-Flicks mit Taper
  außen, 1-px-Kontur 23. Grenz-Jitter ±0,05 **nur an den Band-Kanten** (1–2 px), nie
  als Flächen-Raster. Spitze bei +x → Rotation = Kugelwinkel; side −1 spiegelt via
  `setScale(1, side)`. Keys `fx_wrath_ring(_2|_3)`.
- `wrathGlowFrame()` — Glut-Glow **17x17** am Kugelkopf (ADD), ramp 22/21/20/27/26.
- `wrathSignatureFrame(kind, stage)` — Treffer-/Todes-Signatur in **Zielgröße 96x96**:
  geschlossener Glutring mit unregelmäßigen Zungen (Taper), zentraler flächiger Kern
  22, Death mit 9 Zungen + golden-angle Glutkörnern, Kontur 23 statt `outlineAndRim`.
- `ZORN_RAMP = [22,21,20,27,26,25,23]`; Registration in `createFxTextures` +
  `FX_FRAME_COUNTS` (fx_wrath_ring: 3, fx_wrath_glow: 1).
- Signatur `wrath_pendulum`: `drawScale: [1,1]` + Eintrag in `BAKED_SIGNATURES`
  (Mechanismus aus phoenix/soulpyre). Alt-Pfad der 4 anderen Signaturen unberührt.

**data/evolution-weapons.ts** — `WRATH_FX`: alle FX-Parameter an einem Ort (ringFrames,
ringSize 208, ringRadius 96, ringAlpha, fadeStart 0.75, fadeOut 0.18 s, glowTexture,
glowAlpha).

**systems/CombatSystem.ts** (`fireFlail`/`updateSwings`)
- Kugel: `setScale(evolved ? 1 : 1 + radius/140)` — Zorn-Kugel crisp 9x9 @ 1.
- Glow: gebackenes `fx_wrath_glow` (17x17) @ Scale 1 statt `fx_halo` @ 5,3x; der falsche
  fogBlue-Tint ist weg (Textur trägt die Zorn-Farben selbst).
- **Pendel-Ring**: eigenes Image in Swing-State (`ring?`), Rotation folgt dem
  Kugelwinkel, 3 Frames nach Schwung-Fortschritt (`applyTexture`), Alpha-Fade ab 75 %
  der Schwungdauer (Ausklang), am Ende kurzer Glut-Rest (`spawnAnim`, life 0,18 s).
  Ersetzt den Spieler-Smear @ 4,8x (jetzt nur Basisflegel) und den `fx_halo`-Puff
  @ 8–10,7x (entfernt).
- `clearWeaponState`/Reset räumen den Ring mit ab.

## Nachher (Commit 8b7e885)

`shots/m10-evo-fx-zornpendel-after.json` (gleicher Renderer, 0 JS-Fehler, 16 lebende
Gegner):
| Effekt | Nachher | Kriterium |
|---|---|---|
| `fx_wrath_ring` | **208x208, Draw-Scale 1 (live exakt 1.0)** | Mixel-Regel ✓ |
| `fx_wrath_glow` | **17x17, Draw-Scale 1** | Mixel-Regel ✓ |
| `fx_evo_hit/death_wrath_pendulum` | **96x96, Draw-Scale 1** (vorher 32x32 @ 4,33x) | Mixel-Regel ✓ |
| Ink/Grau | Ring + Signatur **0 Ink-, 0 Grau-Pixel** (vorher 176 Ink in der Signatur) | Farb-Regel ✓ |
| Kern | Ring-Histogramm 22:232 größte Stufe; Death-Sig 22:306 größte Stufe | Kern flächig ✓ |
| Phasen | Bogen wächst (3 Frames) → Alpha-Fade ab 75 % → Glut-Rest 0,18 s | Aufbau/Impact/Ausklang ✓ |

Tests: `tests/evo-fx-zornpendel.test.ts` (12 Guards: Zielgrößen, Draw-Scale-1-Guard am
Quelltext inkl. „keine >1x-Scales mehr am Zorn-Pfad", Zorn-Treppe ohne Ink/Grau/
Fremdfarben, Kern-22-Dominanz, 3 Schwung-Frames verschieden + Bogen wächst, Death>Hit,
Alt-Signaturen unverändert). Suite **1145/1145 grün**, `npx tsc --noEmit` rc=0,
`npm run build` rc=0, 0 JS-Fehler im Probe-Lauf.

## art-director-Sichtprüfung

- Urteil: siehe Karten-Notiz #7440 (Board); Maßstab „kommerziell auslieferbar",
  verschärfte Kriterien (1) Kanten-Dither, (2) flächige Kerne, (3) organische Formen —
  Selbstcheck vor der Abnahme: Ring/Signatur haben flächigen 22-Kern (testbelegt),
  Dither nur als Band-Kanten-Jitter, Zungen organisch mit Taper.

## Offene Punkte

- Basis-Flegel (nicht-evolviert) nutzt weiterhin `fx_halo` @ radius/18 und den Spieler-
  Smear @ radius/20 —absichtlich unberührt (Lane-Grenze Zornpendel); die generische
  Mixel-Bake-Lane (fx_fire/fx_halo/fx_shock-Bakes) deckt die Stufen ab.
- `flail_ball`-Sprite (9x9, Ink-Kontur, 2 Grau-Pixel) ist Waffen-Identität der
  Flegel-Familie, kein Effekt-Asset — bleibt.
- Merge-Hinweis: `EVOLUTION_SIGNATURES.wrath_pendulum.drawScale` + `BAKED_SIGNATURES`
  in gen-fx.ts berühren dieselben Zeilen wie phoenix/soulpyre (bereits gemerged) —
  weitere Evo-Lanes (eternal_winter/thorn_storm/thunder_seal) folgen dem Muster.
- Skript-Iterationen: 2 (FX_KEYS um wrath-ring/glow ergänzt, Probe in den Schwung
  gelegt) — innerhalb des Limits von 2.
