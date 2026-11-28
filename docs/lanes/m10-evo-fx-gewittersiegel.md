# Lane m10-evo-fx-gewittersiegel — Gewittersiegel-FX neu + Sichtbarkeits-Bug

Dom-Wunsch 21:45Z, Punkt 1: „Gewittersiegel wirkt nicht und ist nach 2 s nicht mehr
sichtbar". Vorlage: `docs/lanes/m10-evo-fx-phoenix.md` (Regel „Eine Pixelgröße für
alles"). Läuft nach zornpendel (gleiche Dateien, seriell).

## Regelwerk (aus der Phönix-Vorlage, auf Blitz übertragen)

1. **Textur in Zielgröße backen, Draw-Scale 1** — nie > 1x hochskalieren.
2. **Klare Farbe je Element**: kühle Blitz-Treppe lanternWhite(13)/candleWhite(12) →
   glow(22)/lantern(21) auf dunkler Siegel-Grundfläche night(2)/nightMid(3),
   1-px-Kontur nightSlate(4), Zwischenstufe boneLight(11). **Kein Ink(0), kein Grau (5–9).**
3. **Aufbau ≤ 0,6 s (Anticipation) → klarer Impact → Dauer-Puls → kurzer Ausklang.**
4. Lesbarkeit vor Menge: Rune + 8 Zacken + organischer Wobble-Rand statt Rauten-Platte.

## Ist-Zustand (Vorher, Commit 16b9803)

Skript: `node scripts/m10-evo-fx-gewittersiegel.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("thunder_seal", 8)` + 20 Gegner; Zeitreihe 24 Ticks à 200 ms, je 640x360@2x
und 960x540). Belege: `shots/m10-evo-fx-gewittersiegel-before.json` (+ PNGs `-640-t03/-t15/-t35`,
`-960x540-*`), Renderer **ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**,
0 JS-Fehler.

Bug-Befund (Zeitreihe before.json):
| Symptom | Beleg |
|---|---|
| Siegel-Sprite (`fx_seal` 32x32) lebt nur 0,55 s (Anticipation) | Destroy bei `timer <= 0`, dann nur 0,8-s-Nachglüh-Fade |
| Dunkle Lücken im Zyklus | Ticks t=1.34 / 2.87 / 4.31 mit **0** sichtbaren Siegel-Sprites |
| Alpha fällt bis 0,04 (unlesbar) | Alpha-Verlauf 0.98 → 0.04 je ~1,4-s-Zyklus |
| Nachglühen mit Scale 2.0 → 2.6 (>1x, Mixel) | `spawnAnim("fx_seal", …, scaleFrom: 2.0, scaleTo: 2.6)` |
| Alte Textur warm verwaschen | Histogramm pal12/13/**pal16 (EmberBrown)** — kein Blitz-Lesbareich |

Schaden selbst funktioniert im Repro (20 → 7 Gegner in 5 s); „wirkt nicht" ist die
Wahrnehmung des unsichtbar gewordenen Effekts (Lücken + Alpha-Fade + Kleinteiligkeit).

## Fix

- **#7511 CombatSystem.ts** (Commit 3c45958 + Nachbesserung): `PendingSeal` bekommt
  `impacted`/`hold`; `hold = effectiveCooldown(cooldown)` = ganzer Wirkungszyklus.
  Phasen: Anticipation 0,55 s (Alpha 0,35→1, Frames 0→1) → Impact (Destroy GESTRICHEN,
  Impact-Flash als Pool-Effekt Frame 2, Kettenblitz unverändert) → Dauer-Puls (Frame 3,
  Alpha 0,9±0,1) → Fade letzte 0,3 s → erst dann Destroy. Scale-Puls 0,88–1,0 (nie > 1x).
- **#7512 gen-fx.ts** (Commit f85a3f9): `thunderSealFrame(stage)` — Zielgröße **64x64**,
  4 Frames (0/1 Anticipation, 2 Impact-Flash, 3 Dauer-Puls), Key `fx_seal_thunder` in
  `createFxTextures` + `FX_FRAME_COUNTS`. Dunkle organische Siegel-Grundfläche
  (Wobble-Rand, 1-px-Kontur 4), 8 gerade Zacken, gezackte Blitz-Rune mit 1-px-Kern.
  **data/evolution-weapons.ts**: `THUNDER_FX`-Parameterblock (Muster PHOENIX_FX).
- **#7513 tests/evo-fx-gewittersiegel.test.ts** (Commit e0616df): 8 Guards — Zielgröße
  64x64/4 Frames, Phasen unterscheidbar (Impact hellster Kern, Anticipation ohne
  Weiß-Kern), Scale-1-Guard am Quelltext (`setScale(1)`, keine 1.8/2.0/2.6 mehr),
  Regression 2-s-Bug (`hold: cycle`, Destroy nur nach `hold <= 0`), Farb-Treppe ohne
  Ink/Grau/warm (alle 4 Frames).

## Nachher (Commits 1abd036 + Nachbesserung nach art-director-PASS)

`node scripts/m10-evo-fx-gewittersiegel.mjs after`, gleicher Renderer, 0 JS-Fehler:
| Kriterium | Nachher | Vorher |
|---|---|---|
| Sichtbarkeit | **23/24 Ticks** (nur t=0 vor Erst-Spawn), Alpha **0,65–1,0** über 5 s | Lücken t=1.34/2.87/4.31, Alpha bis 0,04 |
| Sprite-Pixelgröße | `fx_seal_thunder` **64x64**, live Scale ≤ **1,0** (max 1.0) | 32x32 @ 1,8–2,6 |
| Farb-Treppe | Histogramm Frame 0: pal2/3/4/11, **0 Ink, 0 Grau**; Frames 1–3 per Unit-Test | pal16 (EmberBrown) in der Siegel-Textur |
| Wirkungsdauer | Siegel sichtbar solange die Waffe wirkt (Zyklus = Cooldown) | 0,55 s + 0,8 s Fade je 1,4 s |
| Schaden | 20 → 7 Gegner in 5 s | 20 → 7 (unverändert, Bug nur Optik/Sichtbarkeit) |

Tests: `tests/evo-fx-gewittersiegel.test.ts` 8/8, `npx tsc --noEmit` rc=0,
`npm run build` rc=0, Suite 1202/1202.
Belege: `shots/m10-evo-fx-gewittersiegel-after-{640,960x540}-t03/t15/t35.png` (Anticipation
~0,3 s / Impact-Folgezyklus ~1,5 s / Dauer-Puls ~3,5 s) + `-after.json`.

## art-director-Sichtprüfung

**PASS (4/5)** in Runde 1 (Belege nachher v1): Kern-Defekte der Vorversion (Mixel-
Hochskalierung, Platten-Geometrie, Verwaschen, Unsichtbarkeit nach 2 s) messbar
beseitigt; kein Dither, Kerne flächig, organisch, Palettentreue ok. Drei Minormängel
nicht blockierend: Einzelpixel-Funken in Frame 2, kontrastarme Anticipation-Rune,
uniforme Zackenlängen.

**Nachbesserung (Commit nach PASS, deterministisch in `thunderSealFrame`):**
1. Funken in Frame 2 zu 3-px-Tupfern (2 px + 1 Quer-Pixel) statt Einzelpixel.
2. Anticipation-Rune +1 Kontraststufe: Kante boneLight(11)→candleWhite(12),
   Start-Alpha 0,35→0,45 (gemessen: min Alpha 0,59→0,65).
3. Zackenlängen variieren deterministisch über den Winkel (r 27–29, i%3).

After-Belege nach der Nachbesserung (`-after.json`, `-after-*-t*.png`) zeigen
minAlpha 0,65/0,68, maxScale 1,0, Lücken nur t=0 — Criterion (1)–(3) weiter erfüllt.


## Offene Punkte

- **art-director-Sichtprüfung (verschärfte Skala)**: siehe unten.
- `fx_bolt` (Kettenblitz-Segmente) läuft generisch mit Streckung `segLen/16` (max ~1,6x):
  geteilter FxSystem-Pfad aller Blitzwaffen (auch Basis-Waffe storm), nicht Bestandteil
  der Siegel-Textur — gleiche Abgrenzung wie `fx_fire`-Burst in der Phönix-Lane. Die
  Mixel-Bake-Lane (m10-fx-mixel-fix) deckt FxSystem-Scales ab.
- Farb-Histogramm im JSON misst Frame 0 (Basis-Canvas); die Frames 1–3 sind über die
  Unit-Tests (alle 4 Grids, Ramp-Guard) abgedeckt.
- Fremd-Dateien: keine angefasst (CombatSystem/gen-fx/evolution-weapons/tests/skript
  liegen alle im Lane-Bereich).
