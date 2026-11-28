# Lane m10-evo-fx-soulpyre — Seelenleuchtfeuer-FX neu

Dom-Wunsch 21:45Z, Punkt 1 (Evolutions-Effekte neu, 3/5): Das Seelenleuchtfeuer las sich als
**graue Rechteck-Platte** — kein Feuer, keine Seele. Vorlage: `docs/lanes/m10-evo-fx-phoenix.md`
(Regelwerk „Eine Pixelgröße für alles" 1:1 übernommen). Dritte von fünf Evo-Effekt-Lanes.

## Regelwerk „Eine Pixelgröße für alles" (aus der Phönix-Vorlage)

1. **Textur in Zielgröße backen, mit Draw-Scale 1 zeichnen** — nie > 1x hochskalieren.
2. **Klare Farbe je Element**: Seelen-Treppe Kern lanternWhite(13)/candleWhite(12) →
   boneLight(11)/bone(10) → marshLight(31)/marsh(30) → Rand mossDark(29).
   **Kein Ink(0), keine Nacht-/Grau-Stufen (1–9)** an Effekt-Texturen.
3. **Aufbau ≤ 0,3 s (Anticipation) → Impact → kurzer Ausklang** als eigene Phasen.
4. **Lesbarkeit vor Menge**: wenige, große, gestufte Formen; Flackern über 3 Frames.

## Ist-Zustand (Vorher, Commit a342076)

Skript: `node scripts/m10-evo-fx-soulpyre.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("soul_beacon", 8)` + 20 Gegner; 640x360@2x und 960x540@1x). Belege:
`shots/m10-evo-fx-soulpyre-before.json` (+ PNGs `-before-640/-before-640-wisp/-before-960/-before-960-wisp`),
Renderer **ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**, 0 JS-Fehler.

Mängel:
| Effekt | Vorher | Problem |
|---|---|---|
| `orb_soul` | 15x22 @ **Draw-Scale 2** (30x44) | Mixel; 43 Ink-/59 Grau-Pixel, blockige Grau-Seele |
| `fx_halo_cold` | 24x24 @ **1.8** | Mixel; Alpha 0,09 → praktisch unsichtbar |
| `fx_evo_death_soul_beacon` | 32x32 @ **4,0–4,3** | 113 Ink-/225 Grau-Pixel = **graue Rechteck-Platte** |
| Phasen | keine | kein Aufbau, kein Ausklang, keine Funken |

## Fix (Commit d9f4477 + Tests 4db839f)

**gen-fx.ts**
- `orbSoulFrame` neu: **22x32 in Sprite-Pixelgröße**, 3 Flacker-Frames (Sway ±1 px,
  Zungenbreite je Frame), organische Silhouette (Spitze → Bauch → weicher Schweif).
  Farb-Treppe `SOUL_RAMP = [13,12,11,10,31,30,29]`, Kontur mossDark(29) statt Ink.
- `soulSignatureFrame(kind, stage)`: **Signatur in Zielgröße 96x96** (`SOUL_SIGNATURE_SIZE`),
  Flammenzungen mit Taper + Sway (Hit 1 große + 1 kleine Zunge, Death 3 Zungen +
  aufsteigende Seelen-Funken), Kern 13/12 → Rand 31/30, dunkle Rand-Kontur 29 statt Ink,
  **kein `outlineAndRim`** (kein Ink).
- `EvoSignature.drawScale?: [from, to]` (Mechanismus aus der Phönix-Lane hier zuerst
  landet): gesetzt → Signatur in Zielgröße + Draw-Scale 1; nicht gesetzt → Alt-Verhalten
  (32x32 @ 3,2–4,6). `soul_beacon: drawScale [1, 1]`.
- Registration: `addEvolutionSignatures` nutzt den Zielgrößen-Pfad für `drawScale`-Signaturen;
  `orb_soul` jetzt 22x32. **Merge-Hinweis:** dieselbe `drawScale`-Zeile kommt auch aus
  m10-evo-fx-phoenix (Konflikt in `spawnEvolution` erwartet, Auflösung: beide Pfade behalten).

**data/evolution-weapons.ts** — `SOUL_FX`: alle FX-Parameter an einem Ort (orbFrames,
orbFrameInterval 0,2 s, haloTexture `fx_halo_cold@2`, haloScale 0,9, haloAlpha 0,3,
anticipation 0,28 s, fadeOut 0,35 s, sparkInterval 0,34 s, sparkTexture fx_star, sparkTint 31).

**systems/FxSystem.ts** — `spawnEvolution` liest `sig.drawScale` (Zielgröße → Scale 1).

**systems/CombatSystem.ts** (`fireLantern`/`updateOrbs`)
- Orb: `setScale(1)` statt 2 (Mixel-Regel), 3 Flacker-Frames über `SOUL_FX.orbFrames`.
- Halo: gebackene Stufe 2 (48x48) mit Scale 0,9 statt 24x24 @ 1,8; Alpha 0,3 + Puls
  statt 0,09 — der Lichtkreis ist wieder sichtbar.
- **Anticipation ≤ 0,3 s**: Alpha-Ramp beim Erscheinen (0,28 s).
- **Ausklang**: Fade im letzten 0,35 s der Orb-Dauer.
- **Aufsteigende Seelen-Funken**: pro Orb alle 0,34 s ein kleiner additiver Spark
  (fx_star, 0,7→0,2, grün 31, vy −22) — kein ADD-Stack (1 Sprite je Takt).

## Nachher (Commit mit `-after`-Belegen)

`shots/m10-evo-fx-soulpyre-after.json` (gleicher Renderer, 0 JS-Fehler):
| Effekt | Nachher | Kriterium |
|---|---|---|
| `orb_soul` | **22x32, Draw-Scale 1**, 0 Ink-/0 Grau-Pixel | Mixel-Regel + Farb-Treppe ✓ |
| Halo | **fx_halo_cold@2 (48x48) @ 0,9** | nie > 1x ✓ |
| `fx_evo_death_soul_beacon` | **96x96, Draw-Scale 1**, 0 Ink-/0 Grau-Pixel | Mixel-Regel ✓ |
| Phasen | Anticipation 0,28 s → Orbit/Impact → Fade 0,35 s + Funken | Aufbau/Impact/Ausklang ✓ |
| Histogramm | orb_soul nur pal 10–13 + 29–31; Signatur ebenso | Seelen-Treppe ✓ |

Tests: `tests/evo-fx-soulpyre.test.ts` (10 Guards: Zielgrößen 22x32/96x96, Draw-Scale-1-Guard
am Quelltext, Seelen-Farb-Treppe ohne Ink/Grau/warm, hellflächiger Kern >60 %, Flacker-Frames
verschieden, drawScale nur bei soul_beacon). Suite **1050/1050 grün**, `npx tsc --noEmit` rc=0,
`npm run build` rc=0, 0 JS-Fehler im Probe-Lauf.

## art-director-Sichtprüfung

- (läuft — Urteil wird nach Rückspruch/Pass hier eingetragen)

## Offene Punkte

- `fx_halo_cold` Level-1 (24x24) bleibt für direkte Pfade fremder Lanes unverändert; die
  Mixel-Bake-Lane (m10-fx-mixel-fix) deckt die Stufen ab, ich nutze nur Stufe 2 am Soul-Halo.
- `evo-signature-calls.test.ts` blieb unverändert grün (phoenix/eternal_winter 3,2/4,0
  Alt-Pfad unberührt) — kein Fremd-Datei-Berührung nötig.
- Merge-Konflikt `FxSystem.spawnEvolution` (drawScale-Zeilen) mit m10-evo-fx-phoenix erwartet.
