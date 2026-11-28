# Lane m10-crowd-variant-tone — Variantenton skeleton/centipede/harpy kräftig trennen

Board-Karte #7327 (Follow-up zu m10-crowd-variety): die crowd-variety-Lane lieferte
>= 2 Sprite-Varianten je Typ, aber die Ton-Varianten einzelner Typen lagen zu dicht
an der Basis (art-director 4,4/5, Nachbesserung: skeleton/centipede/harpy kräftiger
trennen — „Weiß-auf-Weiß-Rampe"). Ziel: messbar unterschiedliche Hue-/Helligkeits-
Lage je Variante, palettetreu, ohne Silhouetten-/Rahmen-Verträge zu verletzen.

## Mechanik

- `enemyVariantFrames` (src/gfx/enemySprites.ts) mischt Körperpixel schwacher Typen
  jetzt zu 80 % (statt 55 %) Richtung eines festen Palette-Zieltons
  (`VARIANT_TONE_OVERRIDES`, 20 Typen). Die Zielton-Tabelle ist das Ergebnis des
  Suchlaufs `scripts/m10-crowd-tone-search.ts` (tsx, echte Grids, exakte
  Pipeline-Mathematik inkl. ausgesparter 1-px-Lichtkante): EIN deterministischer
  Greedy-Durchlauf, 32 Palette-Kandidaten je Typ, Nutzungsdeckel 6 je Ton,
  Kollisions-Guard >= 40 RGB zu fremden Typ-Basen, Ziel >= 60 RGB — kein
  Hand-Tuning-Loop.
- Unangetastet: Kontur (0), Augen/Glow (13), 1-px-Lichtkante, Silhouetten,
  binäres Alpha, Key-Satz (4 Frames je Typ), Elite-Rim. Nicht gelistete Typen
  bleiben bytegleich zum crowd-variety-Stand. `enemyVariantColor` (Familien-Rampe)
  bleibt unverändert und wird weiter als Fallback genutzt (Vertrag
  tests/crowd-variety.test.ts).
- Tabu-Dateien (gen-fx.ts, textures.ts, FxSystem.ts, CombatSystem.ts,
  palette-compliance.test.ts, gen-enemies.ts): nicht angefasst.

## Messung

Skript: `scripts/m10-crowd-tone.mjs` (Atlas-Canvas-Readback aus dem laufenden Spiel;
Körper-Mittelton je Typ aus Frame `<spriteKey>` vs. `<spriteKey>_3`, ohne Kontur
0x06070c und Augen/Glow 0xfff8e6; Primärmetrik RGB-Distanz, keine FPS-Anteile →
ohne flock). Belege: `shots/m10-crowd-tone-before.json` + 4 PNGs,
`shots/m10-crowd-tone-after.json` + 4 PNGs, `shots/m10-crowd-tone-before-after-640.png`,
`shots/m10-crowd-tone-before-after-zoom4x.png`.

**Wichtiger Messhinweis:** bog_rat/wisp/bogzombie stellen im Spiel handgezeichnete
2-Frame-Sets dar (textures.ts `SPRITE_GRIDS`/`SPRITE_FRAMES` überschreiben die
generierten Frames). Deren Atlas-Messung ist verzerrt (Basis = Hand-Sprite,
Variante = generierter Frame) und ihre Varianten-Frames werden nie gerendert —
diese 3 Typen sind in Messung und Guard ausgenommen (27 gerenderte Typen).
Fremd-Datei textures.ts ist tabu/belegt, deshalb keine Lane-Fixes dort.

### Vorher → Nachher (schwache Paare, RGB-Distanz Körper-Mittelton)

| Typ | vorher | nachher | + % |
|---|---|---|---|
| wolf | 7,6 | 103,2 | +1257,9 % |
| spider | 10,0 | 110,8 | +1008,0 % |
| centipede | 11,2 | 142,8 | +1175,0 % |
| ghoul | 19,8 | 90,9 | +359,1 % |
| harpy | 19,8 | 186,9 | +843,9 % |
| bat | 24,3 | 69,0 | +184,0 % |
| imp | 25,6 | 87,5 | +241,8 % |
| slime | 27,2 | 90,6 | +233,1 % |
| reaper_bat | 27,2 | 118,7 | +336,4 % |
| toad | 31,6 | 81,4 | +157,6 % |
| skeleton | 33,0 | 139,6 | +323,0 % |
| cultist | 37,1 | 66,1 | +78,2 % |
| scarecrow | 37,5 | 63,8 | +70,1 % |
| witchling | 37,7 | 77,5 | +105,6 % |
| voidcaller | 38,6 | 137,2 | +255,4 % |
| horror | 39,1 | 69,0 | +76,5 % |
| mudling | 42,1 | 97,9 | +132,5 % |
| treant | 42,5 | 111,5 | +162,4 % |
| banshee | 48,1 | 82,1 | +70,7 % |
| golem | 49,0 | 70,1 | +43,1 % |

- **Zielwert (fixiert vor dem Suchlauf):** min. RGB-Distanz je gerendertem
  Typ-Paar >= 60 UND jede zuvor-schwache Paarung mindestens +40 % gegenüber
  Vorher. Nachher: **min 60,8 über alle 27 gerenderten Typen** (Vorher-Minimum
  der gerenderten schwachen Paare 7,6), kleinste Verbesserung +43,1 % (golem).
  Beide Zielwerte erfüllt.
- Guard-Test (K3): `tests/crowd-variant-tone.test.ts` — rgbDist >= 60 je
  gerendertem Typ, klare Helligkeits-/Farb-Lage-Verschiebung, umgefärbte
  Varianten >= 40 RGB von fremden Basen entfernt, Silhouetten/Key-Satz/
  Framezahl unverändert, Palette + binäres Alpha, Determinismus.

## Kontrolleur-Urteile

- **Reviewer:** offen (K4).
- **Art-director:** offen (K4).

## Offene Punkte

- bog_rat/wisp/bogzombie: handgezeichnete 2-Frame-Sets ohne sichtbare Variante
  (Vorbestand aus textures.ts, tabu) — falls Dom dort auch Varianten will,
  eigene Karte (textures.ts + die 3 Sprites neu zeichnen).
- skeleton/centipede/harpy/banshee/voidcaller tragen flameBright-Varianten
  (helles Flammenorange) — im Side-by-side lesbar, aber die warme Fracht im
  Swarm ist auffällig; falls der art-director das als zu laut einstuft,
  Zielton je Typ in der Tabelle tauschen und den Suchlauf erneut laufen lassen
  (guard prüft die Zielmarke automatisch).
