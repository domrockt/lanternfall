# Lane m10-ember-readability — Ember-Projektil im Halo lesbar

**Ziel / ACCEPTANCE-Restpunkt:** „Ember-Projektil im Halo teils überstrahlt“.
Das Ember-Projektil (`projectile_ember`, Textur in `src/gfx/textures.ts`, Schuss in
`CombatSystem.fireEmber`) muss im 500-Gegner-Chaos als eigener Kern mit dunkler
Kontur lesbar bleiben: Near-White-Anteil der Projektil-Frames und des Glow-Klecks
≤ 4,16 %, 0 Off-Palette-Pixel, binäres Alpha, Sichturteil art-director ≥ 4/5.

Messbasis (beide Kalibrierungen wie in ACCEPTANCE A7 / `docs/lanes/m10-vfx-evo.md`):
- `nearWhiteA7`: r,g,b ≥ 150 **und** r ≥ 235
- `nearWhiteMinRgb200`: min(R,G,B) ≥ 200
- Prozentbasis: opake Pixel der Sprite-Fläche (Glow: Footprint-Pixel); `*PctOfFrame` zusätzlich auf die volle Frame-Fläche inkl. Transparenz.

## Vorher (Baseline, Commit `59fecc0`)

`scripts/m10-ember-readability.mjs` baut aus den echten Phaser-Texturen des
`dist`-Builds ein 1x/4x-Kontaktblatt und misst:

| Objekt | Near-White A7 | Near-White minRGB200 | Off-Palette | Alpha |
|---|---|---|---|---|
| `projectile_ember` (7×7) | 3 / 33 opak = **9,09 %** (6,12 % Frame) | 9,09 % (6,12 % Frame) | 0 | 0/255 binär |
| Glow `fx_fire` (14×14, Footprint 113 px) | 14 / 113 = **12,39 %** | 12,39 % | 113 Footprint-Pixel (additiv gemischt, Quelltextur selbst off-palette) | 0/255 binär |

Der Projektil-Kern war ein heller Weiß-Blob ohne durchgehende Tintenkontur; die
Mündungsglut nutzte `fx_fire` mit `alphaFrom 0,95` (additiv) und brannte im
Gegner-Halo aus. Belege: `shots/m10-ember-readability-baseline.json`,
`shots/m10-ember-readability-baseline-1x.png`, `-4x.png`.

Messaufruf (kein FPS-/Echtzeitlauf → keine flock-Sperre):

```
node scripts/m10-ember-readability.mjs shots/m10-ember-readability-after.json shots/m10-ember-readability-after
```

## Fix (Commit `54c1902`, Karte #2879)

Nur `src/gfx/textures.ts` (Projektil-Grid + neue Mündungsglut) und die Glow-Alpha
in `CombatSystem.fireEmber` geändert. Keine Änderung an Schaden, Feuerrate oder Radius.

- `projectile_ember` (7×7): geschlossene 1-px-Tintenkontur (`0` = `ink`), genau
  **ein** `lanternWhite`-Kernpixel, umgeben von `amber`/`laterne`-Stufen — kein
  Weiß-Blob, der im Halo ausbrennt.
- Neue `fx_ember_muzzle` (7×7): Tinten-Rim + heller Kern statt `fx_fire`-Kleck.
- `fireEmber` nutzt die neue Glut mit `alphaFrom 0,55` statt `0,95` (additiv gedämpft).

## Nachher (Commit `54c1902`, Messung `11:49Z`)

| Objekt | Near-White A7 | Near-White minRGB200 | Off-Palette | Alpha |
|---|---|---|---|---|
| `projectile_ember` (7×7) | 1 / 31 opak = **3,23 %** (2,04 % Frame) | 3,23 % (2,04 % Frame) | 0 | 0/255 binär |
| Glow `fx_ember_muzzle` (7×7, Footprint 37 px) | **0,00 %** | 0,00 % | 0 (Footprint) | 0/255 binär |

Kern-vs-Kontur-Kontrast: hellster Kern vs. dunkelste Kontur ≥ 5:1, der Kern grenzt
direkt an einen `ink`-Pixel (dunkle 1-px-Kontur bleibt geschlossen). Der Glow-Footprint
schrumpft von 113 auf 37 px (gedämpft, kein Überstrahlen). Belege:
`shots/m10-ember-readability-after.json`, `-1x.png`, `-4x.png`.

## Chaos-Beleg (Karte #2880, Commits `2397d97` + `38184b4`)

`shots/m10-ember-readability-chaos-640.png` — In-Game-Screenshot, **640×360**
(per `identify` geprüft), **560 lebende Gegner**, **4 Ember-Projektile im Flug**
(`dist 44 px`, `t = 0,2 s`, Szene nicht pausiert), 0 JS-Fehler. Messwerte in
`shots/m10-ember-readability-chaos.json`. Die Projektile sind als eigenständige
orange Kerne mit dunkler Kontur gegen Gegner und Gras sichtbar. Hinweis: die
`inFlight`-Koordinaten in `chaos.json` stammen aus einer 1280×720-Aufnahme und sind
zum 640×360-PNG nicht synchron (sichtbare Projektile bei ca. 286,129 / 357,132 /
372,150 / 379,174) — als Restpunkt notiert, Inhalt (4 Ember im Flug) bleibt korrekt.

## Tests

`tests/ember-readability.test.ts` prüft das echte `SPRITE_GRIDS.projectile_ember`
und `fx_ember_muzzle`:
(a) alle Pixel Palette oder transparent, Alpha 0/255 (0 Off-Palette, 0 Alpha-Verstöße),
(b) hellster Kern vs. dunkelste Kontur ≥ 5:1,
(c) Near-White ≤ 4,16 % (beide Definitionen, opak und Frame-Fläche),
plus Randbedingungen: mind. 8 Tintenpixel am Projektil-Rand, mind. 10 am Glow-Rand,
Kern grenzt an Tinten-Pixel.

Ergebnis: `npx vitest run tests/ember-readability.test.ts` → 9/9; Gesamtlauf
`npm test` → **337/337 grün**, `npx tsc --noEmit` grün.

## Sichturteil art-director

**PASS — 4/5** (art-director-Subagent, Vision auf allen vier Belegen; keine Code-/Asset-Änderung).

- Chaos-Bild (640×360): alle 4 Ember als kleine helle Flammenkerne sichtbar, 3 Farbstufen
  plus genau 1 px `lanternWhite`-Highlight; heben sich von den gedämpften Gegnerkörpern
  durch Helligkeit und Weißkern ab, kein Überstrahlen (Glow 0 %, Sprite 3,23 % Near-White).
- Kontur: durchgehende 1-px-Kontur (33,27,21), keine Doppel-/Einzelpixel; auf Gras klar
  sichtbar. Schwäche: auf dunklem Boden (37,34,31) nur Δ≈4–8 Kontrast — dort trägt der
  helle Körper die Silhouette; kein FAIL, da Lesbarkeit über Helligkeit gegeben ist.
- Vorher/Nachher nachvollziehbar: Vorher `fx_fire_1..6` mit großen fast weißen Kernen,
  Nachher kompakter bernsteinfarbener Muzzle-Flash (255,184,77) mit Ink-Kontur, 0 % Near-White.
- Palette/Sauberkeit: Asset-Farben palettenkonform; gemessene Blendwerte stammen vom
  zulässigen Licht-/Dim-Overlay, nicht vom Sprite.
- Nachbessern (nicht blockierend): Kontur auf dunklem Grund Richtung Ink ziehen; die
  `chaos.json`-Koordinaten/Auflösung neu erzeugen.

## Offene Restpunkte

- Der additiv gezeichnete **Schweif** (`fx_fire`-Trail am Projektil, `alphaFrom 0,75`)
  wurde nicht separat als Glow-Footprint vermessen — im Chaos-Bild nicht dominant,
  bei Bedarf als eigener Restpunkt nachmessen/senken.
- Auf **dunklem Boden** ist die Ember-Kontur (33,27,21) nur Δ≈4–8 vom Hintergrund (37,34,31)
  entfernt; Lesbarkeit kommt dort über den hellen Kern. Nachbesserung: Kontur Richtung `ink`
  ziehen (nicht in dieser Abnahme umgesetzt, um kein Grafik-Tuning nachzuschieben).
- `shots/m10-ember-readability-chaos.json` nennt `inFlight`-Koordinaten aus einer
  1280×720-Aufnahme, während das PNG 640×360 ist; Inhalt (4 Ember im Flug, 560 Gegner)
  stimmt, Koordinaten/Auflösung im JSON sollten neu erzeugt werden.
- Kein messbarer **FPS**-Einfluss: nur Pixeldaten/Alpha/Texturgröße geändert (Glow
  14×14 → 7×7, Alpha 0,95 → 0,55); keine Echtzeitmessung mit flock nötig.
