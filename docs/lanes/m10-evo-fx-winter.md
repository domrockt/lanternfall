# Lane m10-evo-fx-winter — Ewiger-Winter-FX neu (Versuch 2, abgeschlossen Versuch 3)

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
  Verdacht: multiplikativer fogBlue-Tint im FX-Spawn (`tint: PAL[C.fogBlue]`) drückt die
  Pale-Töne auf ≈ #2c3540. (Runde 3 korrigierte die Diagnose teilweise: der Tint musste
  trotzdem weg, die dunkle Wolke stammte aber aus dem fx_ice-Zeichen-Bug, s. u.)
- **Versuch 3, Fix 1 (Commit 4787abc):** fogBlue-Tint an fx_ice-Partikeln (updateWinter
  ~710, Frostnova ~519) und am Frostnova-ring_frost (~506) gestrichen — autorierte
  Eis-Treppe zeigt unverfälscht. after re-gemessen (iGPU, 0 JS-Fehler, 22/24 Gegner).
- **art-director Runde 3: FAIL 2.7/5, ein Befund** — Aura-Siegel **4.5 PASS**, Signaturen
  4.5 PASS, projectile_ice 4.5 PASS; **fx_ice-Partikel 1.5 FAIL**: die komplette Textur
  renderte in Glut-/Flammen-Palette. Root Cause: `iceFrame` (`src/gfx/gen-fx.ts`) schrieb
  Einzelziffer-Indizes als Buchstaben — `"j"`→pal19 flameBright, `"i"`→pal18 flame,
  `"g"`→pal16 emberBrown (dieselbe charCode-Falle wie projectile_ice vor 0b3b563).
  Der Tint überlagerte den Bug nur (flameBright · fogBlue ≈ dunkles Oliv).
- **Versuch 3, Fix 2 (Commit ebf5a61):** `iceFrame` `"j"/"i"/"g"` → Ziffern `"9"/"8"/"6"`;
  Regressionstest in `tests/evo-fx-winter.test.ts` (10 Guards): alle 4 fx_ice-Frames nur
  Indizes ⊆ Eis-Treppe {13,12,11,9,8,6,5}, Kern 13 + Facette 9 je Frame, 8/6 über die
  Familie; `iceFrame` dafür exportiert. after re-gemessen: 0 Glut-Palettenpixel in den
  FX-Zonen (117.000 px geprüft), iGPU valid, 0 JS-Fehler, 22/24 Gegner.
- **art-director Runde 4: PASS 4.5/5 gesamt** — fx_ice 1.5→4.5, Aura-Siegel 4.5,
  Signaturen 4.5, projectile_ice 4.5. „Weiß-blau statt Glut ✓, Kristall-Kanten statt
  Blob-Wolke ✓, Aura-Siegel ≠ Lampenschein ✓“. Optionaler Polier-Hinweis (kein
  Abnahme-Thema): im dunklen 960-Shot entsättigt der Lampenglow die mist/fogBlue-Stufen —
  falls nachgeschärft wird, Facette paleMist(9)→bone(10) oder 1 px mehr Kernfläche.
- **Status K4: PASS — Lane abgeschlossen.** Belege: `shots/m10-evo-fx-winter-after.json`
  (+ PNGs `-after-640/-aura/-960/-aura`), Urteile Runde 3 + 4 in dieser Doku.
- **Build-/Test-Evidenz (Endstand):** `npm run build` rc=0, `npx tsc --noEmit` rc=0,
  **907/907 Tests grün** (88 Dateien, inkl. evo-fx-winter 10 Guards), 0 JS-Fehler in allen
  Probe-Läufen, gültiger WebGL-Renderer-String (iGPU ANGLE Mesa RPL-S) in jeder JSON.

## Offene Punkte

1. **Polier-Hinweis art-director Runde 4 (nicht blockierend):** im dunklen 960-Shot
   entsättigt der warme Lampenglow die mist/fogBlue-Stufen der fx_ice-Diamanten —
   Hebel: Facette paleMist(9)→bone(10) oder 1 px mehr Kernfläche. Nur falls nachgeschärft
   wird; Abnahme ist PASS.
2. **Geparkter CombatSystem-Diff (aus K2):** Windup-Anticipation (`winterWindup`-Flag,
   `windupAt/windupLife` liegen in WINTER_FX bereit, ohne Wiring inert) und Partikel-Scale
   ≤ 1 (fx_ice live @1.25x/1.5x, Mixel-Regel) — bewusst NICHT in Versuch 3 angefasst,
   braucht eigene Karte.
3. Signaturen wirken auf dunklem Grund eher weiß als blau — Histogramm belegt aber die
   kalte Treppe (pal6-Anteil 33–40 %). art-director Runde 4: 4.5 PASS, kein Handlungsbedarf.
