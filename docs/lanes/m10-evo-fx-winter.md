# Lane m10-evo-fx-winter — Ewiger-Winter-FX neu (Versuch 2)

Dom-Wunsch 21:45Z, Punkt 1 (Evolutions-Effekte neu, 2/5). Vorlage: `docs/lanes/m10-evo-fx-phoenix.md`
(Muster „Eine Pixelgröße für alles"). Regelwerk: Textur in Zielgröße backen, nie > 1x hochskalieren,
klare Farbe je Element, Aufbau (Anticipation) → Impact → Ausklang, Lesbarkeit vor Menge.

## Ist-Zustand (Vorher, Commit ece50bb)

Skript: `node scripts/m10-evo-fx-winter.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("eternal_winter", 8)` + 20 Gegner; 640x360@2x und 960x540@1.5x). Belege:
`shots/m10-evo-fx-winter-before.json` (+ PNGs `-before-640/-aura/-960/-aura`), Renderer
**ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**, 0 JS-Fehler, 22/23 lebende Gegner.

Mängel (Mixel + Farbfehler):

| Effekt | Vorher | Problem |
|---|---|---|
| `fx_evo_hit_eternal_winter` | 32x32 @ **Draw-Scale 3.26x**, **95/299 Ink-Pixel** | graue Blob-Wolke mit schwarzem Rand |
| `fx_evo_death_eternal_winter` | 32x32 @ **Draw-Scale 4.03x**, **105/497 Ink-Pixel** | graue Blob-Wolke mit schwarzem Rand |
| `ring_frost` (Aura-Siegel) | 96x96 @ **Draw-Scale 2.01x** | Mixel-Blöcke (Radius/47) |
| `fx_ice` (Partikel/Trail) | 15x21 @ **Draw-Scale 1.25–1.5x** | Matsch-Pixel |
| `projectile_ice` (Eisspitze) | 7x7, **12/25 Ink-Pixel** + bone(10)-Grau | schwarze Raute, grauer Kern |

## Fix (Commits 548405e, d58364f, 0b3b563)

**gen-fx.ts**
- `EvoSignature.drawScale?: [from, to]` (Muster Phönix): gesetzt → Signatur-Textur in
  Zielgröße 128x128 + Draw-Scale 1. `eternal_winter` erhält `drawScale: [1, 1]`.
- `winterSignatureFrame(kind, stage)` — 4 Frames à 128x128: zentraler Hexagon-Eiskern
  (klare Kanten statt runder Blobs), 7/11 Kristall-Scherben mit heller Spine und kalter
  Spitze, Eis-Splitter, 2-px-Schnee-Flocken. Farbtreppe **lanternWhite(13) → candleWhite(12)
  → boneLight(11) → paleMist(9) → mist(8) → fogBlue(6)**, kein Ink/Grau-Rand.
  Registrierung über `EVO_SIGNATURE_FRAME_GENS` (eigene Generatoren je Evolution).
- `ring_frost` ist jetzt **Mixel-Bake-Basis** (maxLevel 3): `frostRingFrame(size, density)`
  ersetzt die Canvas-Textur aus textures.ts (identische Geometrie: 2-px-Eisband
  mist/paleMist + candleWhite-Innenkante + 12 lanternWhite-Zacken). Level 1 bleibt 96x96.
- `FxSystem.spawnEvolution` folgt `sig.drawScale` (Scale 1 statt 3.2–4.6).

**textures.ts** — `projectile_ice` neu: 7x7 Eis-Treppe, Kern lanternWhite/boneLight →
paleMist → fogBlue-Rand, **0 Ink-Pixel**. (Achtung Zeichencodes: Ziffern = direkter
Palettenindex; die erste Version mit `g/j` war pal16/19 = orange — durch Ziffern 6/9/b/d
ersetzt, per Histogramm re-gemessen.)

**data/evolution-weapons.ts** — `WINTER_FX`: alle FX-Parameter (Aura/Partikel/Windup/
Impact/Spikes/Signatur) an einem Ort. Der Windup (Anticipation ≤ 0,3 s, kalter Halo vor
der Eisspitzen-Volley) und die Partikel-Scale-Anpassung liegen vorbereitet im
CombatSystem-Diff, wurden aber **auf Supervisor-Anweisung aus K2 geparkt** (siehe Offene Punkte).

## Nachher (Commit d58364f/0b3b563, `after`-Lauf)

`shots/m10-evo-fx-winter-after.json` (gleicher Renderer, 0 JS-Fehler, 22 lebende Gegner):

| Effekt | Nachher | Kriterium |
|---|---|---|
| Signaturen hit/death | **128x128, Draw-Scale 1**, Histogramm nur pal13/12/11/9/8/6, **0 Ink** (vorher 95/105) | Mixel-Regel + Farbtreppe ✓ |
| `projectile_ice` | 7x7, **0 Ink** (vorher 12/25), Histogramm pal13/11/9/6 | Farb-Treppe ✓ |
| `ring_frost` | Bake-Stufe `@3`, **live Scale 0.671** (vorher 2.013) | Mixel-Regel ✓ |
| Signaturen-Spin/Timing | unverändert (cloud 0.7, hit 0.22 s / death 0.75 s) | Timing-Signatur ✓ |

Tests: `tests/evo-fx-winter.test.ts` (9 Guards: drawScale-Quelltext-Guard, Zielgrößen,
0 Ink/Fremdfarben, ring_frost-Stufenwahl 2.013→3, WINTER_FX-Parameter). Suite: 32/32 in
den betroffenen Dateien grün, `npx tsc --noEmit` rc=0. 0 JS-Fehler im Probe-Lauf.

## Fremd-Datei-Berührung (begründet)

- `tests/evo-signature-calls.test.ts`, 1 Assertion: Death-Scale 4.0 → `sig.drawScale?.[1] ?? 4.0`.
  Unumgänglich, da die Winter-Signatur-Scale bewusst von 4.0 auf 1 geändert wurde (Mixel-Regel);
  Phönix brauchte denselben Einzeiler. Request in `/home/ai/games/.dispatch/requests.md`.

## Mess-Artefakte sind Werkzeuge

`scripts/m10-evo-fx-winter.mjs` startet einen **kollisionsfreien lokalen Server (Port 0)**
statt des Harness-Zufallsports: Bei Port-Kollision in 5400–5800 lief ein Probe-Lauf
stillschweigend gegen die dist einer anderen Lane (Befund 28.11., alter Stand gemessen).
Der erste fixprobe-Lauf (falsche Messung) ist als Lernfall in `~/tmp/m10-evo-fx-winter/` archiviert.

## Abnahme

- **art-director Runde 1: FAIL (knapp)** — Signaturen 4.5/4.0, projectile_ice 4.5, ring_frost 4.0,
  Aura/Halo **3.5** (Kontrast auf hellem Moor-Grund; Verwechslungsgefahr mit Lampenschein).
  Grau-Blob-Problem bestätigt behoben: „radiale Kristall-Spike-Signaturen — heller Kern,
  lange dünne Nadelstrahlen", „keine amorphe Fläche mehr".
- **Korrektur Runde 2 (Commit 33ff51b)**: `frostRingFrame` mit 1-px-kühler Außenkante
  blueGrey(5) unter dem Eisband (art-director-Hebel 1). Hebel 2 („Glow kalt") betrifft
  `light_radius` = Spieler-Lampenschein (Fremd-Asset, nicht Teil des Winter-Effekts);
  Hebel 3 (Siegel-Sterne) = Hit-Signaturen spawnen nur bei Treffern — im Volley-Shot lesbar.
- **art-director Runde 2: FAIL, eng eingegrenzt** — Signaturen 4.5 PASS, projectile_ice 4.5 PASS,
  ring_frost-Handwerk 4.0; **Aura-Siegel-Lesbarkeit auf hellem Moor-Grund 3.5 FAIL**.
  Root Cause (art-director, belegt): der **multiplikative fogBlue-Tint** im FX-Spawn
  (`CombatSystem.updateWinter`, `tint: PAL[C.fogBlue]`, Zeile ~698; Frostnova-Pfad ~503)
  drückt paleMist (#8fa0a6) auf ≈ #2c3540 — die autorierte Band-Treppe erreicht den Screen
  nicht; die pal5-Kante kann unter dem Tint nichts reißen. Die Textur-Arbeit selbst ist
  laut art-director sauber und bleibt stehen.
- **Status K4: blocked** — der wirksamste Fix ist ein Zeilen-Fix im FX-Pfad
  (`src/systems/CombatSystem.ts`, geparkte Datei): fogBlue-Tint am ring_frost-Spawn
  streichen oder auf paleMist/mist abschwächen (und Aura-Alpha 0.55→0.2 anheben).
  Request in `/home/ai/games/.dispatch/requests.md`; gehört zusammen mit dem geparkten
  CombatSystem-Diff (Partikel-Scale ≤ 1, Windup) in die Folgelane `m10-evo-fx-winter-w2`.
- **Build-/Test-Evidenz (Endstand):** `npm run build` rc=0, `npx tsc --noEmit` rc=0,
  32/32 Tests grün (evo-fx-winter + fx-mixel + evo-signature-calls), 0 JS-Fehler in allen
  Probe-Läufen, gültiger WebGL-Renderer-String in jeder JSON.

## Offene Punkte

1. **Aura-Siegel auf hellem Grund (art-director Runde 2 FAIL 3.5/5):** Root Cause ist der
   multiplikative fogBlue-Tint im FX-Spawn (`CombatSystem.updateWinter`, `tint: PAL[C.fogBlue]`),
   nicht die Textur. Fix (1 Zeile + optional Alpha): Tint streichen/abschwächen — in der
   geparkten Datei `src/systems/CombatSystem.ts`, Request gestellt. Zusammen mit
2. **fx_ice-Partikel live @ 1.25x** (Aura-Partikel, Scale steht in `CombatSystem.updateWinter`;
   Frostnova-Pfad sogar 1.5x): CombatSystem-Diff (Scale → 1, Windup-Anticipation mit
   `winterWindup`-Flag, WINTER_FX-Verdrahtung) ist fertig konzipiert, wurde aber auf
   Supervisor-Anweisung aus K2 geparkt („CombatSystem gehört nicht zu K2"). → beide Punkte
   in Folgelane `m10-evo-fx-winter-w2`.
3. Signaturen wirken auf dunklem Grund eher weiß als blau — Histogramm belegt aber die
   kalte Treppe (pal6-Anteil 33–40 %). art-director Runde 2: 4.5 PASS, kein Handlungsbedarf.
4. `windupAt`/`windupLife` liegen in WINTER_FX bereit, sind aber ohne CombatSystem-Wiring
   inert (Tests prüfen nur die Parameter).
