# m10-burst-cloud-calm — burst-Tod-Klasse global ruhiger (2026-11-28)

## Bedarf

Dom 03:00Z: „grüne Dither-Wolken an Zornpendel-Treffpunkten". Befund der Lane
m10-evo-fx-form-polish (2026-11-28T05:3xZ, `~/games/.dispatch/requests.md`):
die Wolken sind die **burst-Tod-Klasse** aus `BASE.burst` in
`src/logic/death.ts` (`fx_death_blob`, 16 Shards @ 2.4x Scale, marshLight,
additiv). Form-polish dämpft sie nur lokal bei Zornpendel-Kills (deren Claim in
`CombatSystem.ts`); diese Lane entschärft die Wolken **global** — auch für
Glutfunke (ember) und alle anderen Killer.

## Vorher (#8718, Commit 9f136ec)

Repro: `node scripts/m10-burst-cloud.mjs --prefix shots/m10-burst-cloud-before`
— Glutfunke (ember 8), 5 Spawn-Wellen Swarm/Splitter (Todesklasse burst)
direkt am Helden, Screenshot mitten in den Wolken. Configs 640x360@1 und
780x360@3, je 4x-nearest-Lupe.

Code-Beleg `src/logic/death.ts` (BASE.burst, alt): `count: 16`,
`dustCount: 8`, `scaleFrom: 2.4`, `scaleTo: 1.0`, `dustScale: 1.2`,
`additive: true`, `tint: C.marshLight`, `spread: 130`.

| Metrik | 640x360@1 | 780x360@3 |
|---|---|---|
| fx_death_blob-Sprites live | 71 | 39 |
| max. Sprite-Scale | 2.61 | 2.62 |
| Near-White A7 im Tod-Crop | 0.95 % | 0.64 % |
| jsErrors | 0 | 0 |

Sichtbefund (`shots/m10-burst-cloud-before-1x-view_4x.png`): zwei flächige
hellgrün-dithrige Wolkendeckel (jede mehrere Sprite-Flächen groß), die die
Gegner und den Untergrund überstrahlen.

## Fix (#8719, Commit 62762e6)

Nur die VFX-Parameter in `BASE.burst` (`src/logic/death.ts`):

| Parameter | Vorher | Nachher |
|---|---|---|
| count (Shards) | 16 | 9 |
| dustCount | 8 | 4 |
| scaleFrom | 2.4 | 1.0 |
| scaleTo | 1.0 | 0.5 |
| dustScale | 1.2 | 0.8 |
| additive | true | **false** (Alpha-Boden, Normal-Blend) |

Unverändert (bitgleich, per Test eingefroren): shard/dust/rim-Texturen
(eine Textur `fx_death_blob`, kein Mixel), rimScale 1.14, spread 130, life
0.35/0.28, Tints (marshLight/mossDark/nightDeep, alle Palettenindizes),
Klassen-Mapping aller 30 Gegner, Boss-Spec, Todeslogik/Loot/XP (die Spec
trägt weiterhin keine Gameplay-Werte).

## Regressionstest (#8720, Commit 2db8fda)

`tests/burst-cloud-calm.test.ts` (5 Tests): Deckel count 8–10 / dustCount ≤ 6 /
scaleFrom ≤ 1 / dustScale ≤ 1, `additive === false`, eine Textur (kein Mixel),
Paletten-Treffer der Tints, bitgleiche restliche Dimensionen + Boss-Spec,
Mapping-Integrität + keine Gameplay-Felder in der Spec.

`npx tsc --noEmit` rc=0; `npm test` 142 Dateien / **1499 Tests grün**
(inkl. bestehender death-fx-/boss-death-shards-Tests).

## Nachher (#8721)

`node scripts/m10-burst-cloud.mjs --prefix shots/m10-burst-cloud-after`
(gleiche Repro-Bedingungen):

| Metrik | 640x360@1 | 780x360@3 |
|---|---|---|
| fx_death_blob-Sprites live | 52 | 35 |
| max. Sprite-Scale | **1.09** | **1.10** |
| Near-White A7 im Tod-Crop (Gate ≤ 4,16 %) | 0.91 % | 0.66 % |
| jsErrors | 0 | 0 |

Wolken-Größe messbar kleiner: max. Sprite-Scale 2.61 → 1.09 (640x360@1) bzw.
2.62 → 1.10 (780x360@3), Sprite-Fläche (scale²) damit auf **~17 %** der
Vorher-Fläche; Shards pro Tod 16 → 9. Near-White bleibt mit 0,91 % / 0,66 %
weit unter dem Gate 4,16 %.

Sichtbefund (`shots/m10-burst-cloud-after-1x-view_4x.png`, gleiche Spielsituation
wie Vorher): keine flächigen Deckel mehr; der Tod bleibt als kleiner Burst mit
dunklem Rim und hellem Kernpunkt lesbar.

## art-director-Urteil (K4)

**PASS — Wolken-Lesbarkeit 4,5/5** (Kriterium >= 4/5 erfüllt; Urteil 2026-11-28):

| Bild | Note | Beobachtung |
|---|---|---|
| before-1x | 2 | flächige grüne Deckel mit regelmäßigem Schachbrett-Dither, kein Kernpunkt, kaum vom Terrain unterscheidbar |
| before-3x | 2 | Checkerboard-Platten + verwaschene Ränder (Mixel-Wirkung), Burst-Silhouette null |
| after-1x | **4,5** | organischer Burst mit heller Kern-Punkt-Gruppe, Shards locker radial, keine Musterwiederholung |
| after-3x | **4,5** | eine Pixelgröße im Crop, scharf gerastert, helle Kerne verankern den FX gegen Moorgrün |

Zusatzkriterien: palettetreu (keine Off-Palette-Farbe, Alpha-Boden erzeugt keine
Grau-/Braunstümpfe mehr), kein Mixel (im After durchgängiges Pixelraster),
Abhebung vom Untergrund über helle Kernpunkte. Nicht blockierender Verbesserungsvorschlag:
dunkler Shard-Residuum im 3x-Crop könnte eine Stufe heller Richtung Spitzenfarbe gehen (Kosmetik).

## Offene Punkte

- Keine. CombatSystem.ts (lokale Zornpendel-Dämpfung) wurde — wie ausgemacht —
  nicht angefasst; die globale Entschärfung ersetzt den visuellen Überhang auch
  für Glutfunke und alle anderen Killer.
