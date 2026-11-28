# Lane m10-evo-fx-soulpyre-w2 — Seelenleuchtfeuer: Kältefeuer-Identität

Anlass (Argus 08:00Z, Claude-Sichtung main 45c198d, 08:15Z, Punkt 2 — Vorrang vor Doms Sichtabnahme):
Nach m10-evo-fx-soulpyre + m10-evo-fx-form-polish las sich das Leuchtfeuer im Standbild
**fast unsichtbar** — keine Element-Identität "Seele/Kältefeuer" mehr.

Ziel (Dom-Regel 02:00Z): Das Seelenleuchtfeuer muss im Standbild **OHNE Beschriftung** als
Seele/Kältefeuer erkennbar sein: kalt-türkis/weißes Leuchtfeuer mit aufsteigenden Funken,
Kerne flächig hell (kein Grau/Ink, kein Raster), organische Flammenform (Zungen statt
Platten), eine Pixelgröße (Zielgröße, Draw-Scale 1), Dither nur 1–2 px an Übergangskanten.

## Karte 1 — Vorher-Beleg (Commit 0734757e, #11718)

Skript: `node scripts/m10-evo-fx-soulpyre-w2.mjs before` (Vorlage `scripts/m10-evo-fx-soulpyre.mjs`,
Playwright, `?debug=1&seed=7`, `addWeapon("soul_beacon", 8)` + 20 Gegner, 640x360@2x und 960x540@1x).
Belege: `shots/abnahme/m10-evo-fx-soulpyre-w2-before-{640,640-wisp,960,960-wisp}.png` + `-before.json`,
Renderer **ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)** (nicht SwiftShader),
0 JS-Fehler, 18 Gegner lebend.

Befund (Standbild, Crop 3x):
| Element | Vorher | Problem |
|---|---|---|
| Halo `fx_halo_cold@2` | Ring 6/9 @ alpha 0.3 ADD | liest sich als **graue Blase/Seifenring** um jede Seele — dominante Form im Standbild |
| Seele `orb_soul` | 22x32 @1, Rampe 13/11/10/31/30/29 | blasser **grün-weißer Streifen**, keine Flammenform lesbar, Grün liest sich moorwarm, nicht kalt |
| Signaturen | 96x96 @1, Satz {13,11,31,30,29} | gleiche grün-moorige Treppe |
| Funken | sparkTint 31 (grün) | kollisioniert mit XP-Kristall-Farbcode |

Mixel-Messung war bereits i.O. (orb 22x32 @1, Halo @0.9, Signaturen 96x96 @1) — das Problem war
reine **Farb-/Form-Identität**, nicht Skalierung.

## Karte 2 — Fix (Commits e308bb0b, dd621095, d6d6add7, #11719)

**gen-fx.ts**
- `SOUL_RAMP = [13, 11, 9, 6, 5]` — flächig heller Kern lanternWhite(13) → boneLight(11) →
  paleMist(9, kalt-cyan) → fogBlue(6, kalte Außenflamme) → Kontur blueGrey(5).
  **Kein Grün mehr** (28–31 entfernt), kein Ink, kein warmes 10/12. Die 32er-Palette hat keine
  echte Türkis-Stufe (art-director-Hinweis aus der Alt-Lane) — die kälteste verfügbare Rampe ist
  weiß → cyan-grau (9) → blau (6/5); im Standbild liest sie sich als Kältefeuer.
- `orbSoulFrame`: Geometrie unverändert (organische Zunge, Sway, 3 Flacker-Frames, 22x32),
  Farbbänder rekoloriert (13 flächig bis d<0.52, 1–2 px Kantenbänder 11/9/6, Kontur 5).
- `soulSignatureFrame`: gleiche Rampe; Death-Funken jetzt kalt (Fuß 9, Kontur 5).
- `coldHaloFrame` (fx_halo_cold, Level 1 + Mixel-Bakes): **stufiges Kalt-Glow** statt Hohlring —
  paleMist(9)-Kern → mist(8) → fogBlue(6)-Außenstufe, gefüllt, keine Ring-Kante.
  Iteration 2: bewusst **KEIN Weißkern (13)** im Halo — der ADD-Weißkern wusch die
  Flammenform der Seele zu einem weißen Blob (Befund aus dem ersten After-Shot).

**data/evolution-weapons.ts** — `SOUL_FX.sparkTint: 9` (kalt) statt 31 (grün); Rest unverändert
(orbFrames, haloTexture `fx_halo_cold@2`, haloScale 0.9, haloAlpha 0.3, anticipation 0.28 s,
fadeOut 0.35 s, sparkInterval 0.34 s).

Geometrie/Draw-Scales wurden NICHT angefasst (Mixel-Regel war bereits erfüllt, FX-Guard-Fixture
bestätigt unveränderte Scale-Coverage). `textures.ts` und `FxSystem.ts` waren nicht betroffen.

**Tests**
- `tests/evo-fx-soulpyre-w2.test.ts` (neu, 8 Guards): kalte Rampe exakt [13,11,9,6,5], kein
  kaltfremder Index in Orb/Signaturen, Kern-Dominanz 13, kalte Kantenbänder sichtbar, Halo
  stufig gefüllt mit paleMist-Zentrum und ohne Weißkern/Ink, Bake-Stufe 2 verfügbar,
  Funken kalt (sparkTint 9), Signaturen 96x96.
- `tests/evo-fx-soulpyre.test.ts` (Alt-Lane, Fremd-Datei — siehe Dispo-Request): Farb-Sätze der
  Guards von {13,11,31,30,29} auf die kalte Rampe aktualisiert; Größen-/Scale-Guards unverändert.
- `tests/fixtures/palette-fx-guard.json`: mit `node scripts/m10-palette-fx-guard.mjs` regeneriert
  (dokumentierter Workflow). Dither-Bänder bleiben ≤ 2 px; die gepinnten >2px-Befunde sind
  unverändert (Geometrie nicht angefasst). fx_halo_cold#1: 1 → 2 (weiterhin ≤ 2, Ratchet angepasst).

**Dispo-Request** (`/home/ai/games/.dispatch/requests.md`, 28.11.): `tests/evo-fx-soulpyre.test.ts`
und `tests/fixtures/palette-fx-guard.json` mussten angefasst werden — Dom-Regel 02:00Z (kalte
Rampe) widerspricht der in der Alt-Lane getesteten grün-moorigen Treppe; der Fix selbst liegt in
den claimed Dateien gen-fx.ts/evolution-weapons.ts. Beim Merge: Testfarbsätze + neue Fixture behalten.

## Karte 3 — Nachher + Abnahme (Commits da12cdb6, #11720)

`node scripts/m10-evo-fx-soulpyre-w2.mjs after` → `shots/abnahme/m10-evo-fx-soulpyre-w2-after-*.png/json`:
- Renderer RPL-S (valid), 0 JS-Fehler, 18 Gegner lebend.
- Histogramm `orb_soul`: nur {13:115, 11:33, 5:33, 9:28, 6:24} — Kern 13 dominant, 0 Ink/0 Grau-Block/0 Grün.
- Histogramm `fx_evo_death_soul_beacon`: nur {13:439, 5:238, 9:118, 6:95, 11:80} — 0 Ink/0 Grün.
- Draw-Scales live: alle soul-Sprites 1/1 (Halo 0.9/0.9) — eine Pixelgröße.

Messwerte: `npx tsc --noEmit` rc=0; `npm test` **2210/2210 grün** (198 Dateien); `npm run build` rc=0.
Vorher/Nachher im selben Szenario (seed=7, gleiche Spawns, gleiche Aufnahme-Timings).

art-director-Sichtprüfung (EINMAL, Maßstab kommerziell auslieferbar): siehe Urteil unten.

## art-director-Urteil

<!-- ART_DIRECTOR_VERDICT -->

## Offene Punkte

- Echte Türkis-Stufe fehlt weiter in der 32er-Palette; die Kälte-Identität nutzt die kälteste
  verfügbare Rampe (13/11/9/6/5). Eine Palette-Erweiterung bleibt Dom/Rhea-Entscheidung.
- `fx_halo_cold` Level 1 (24x24) wird auch als Winter-Windup-Textur genutzt; die stufige
  Glow-Optik gilt damit auch dort (bleibt kalt — passt zur Eis-Identität des Winters).
- Winter/Alt-Lanes, die `fx_halo_cold` direkt zeichnen, erben die neue Optik (visuell kälter,
  Mixel-/Scale-Verhalten unverändert).
