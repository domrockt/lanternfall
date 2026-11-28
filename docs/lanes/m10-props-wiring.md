# Lane m10-props-wiring — Verdrahtung der Prop-Varianten

Ziel: Nachtrag der Lane m10-props-variety — die 6 neuen Prop-Varianten
(`prop_boulder_b/_c`, `prop_bones_b/_c`, `prop_reeds_b`, `prop_post_b`) sind
ohne Verdrahtung im Spiel unsichtbar. Der in `docs/lanes/m10-props-variety.md`
dokumentierte 3-Zeilen-Patch (deterministische Variantenwahl in
`GroundRenderer.addProp` via `propVariantKeyFor` aus `gen-props.ts`, tileHash
der Position, Fallback auf Basis-Textur) wird eingearbeitet.

Harte Grenzen: Platzierung/CLUSTER_PROPS/LOD-Tiers/Batch-Struktur unveraendert;
`propLayers.ts`/`textures.ts` unangetastet; `gen-props.ts` wird nur importiert.

## Board-Korrektur (Supervisor-Steer 2026-11-28)

#8598 (m10-boss-portrait-crisp K1) und #8606 (m10-boss-lure-fair K1) gehoeren
nicht zum Karten-Plan dieser Lane und wurden auf Supervisor-Anweisung aus
`doing` zurueck ins `backlog` verschoben (fremde Lanes, WIP-Grenze).
Diese Lane haelt strikt eine Karte in `doing`: #8798 (K1).

## K2 — Vorher/Nachher-Shots (#8799)

`scripts/m10-props-wiring.mjs` (vor dem ersten Lauf eingefroren, identischer
Aufruf fuer beide Tags): seed 7, debug-Run, god+autoPlay; Abschnitte frueh
(~45 s) und Chaos (21:30 via `skipTo(1290)`, bossenfrei). Je Tag 4 Shots:
`-early-1x`/`-chaos-1x` (640x360) und `-early-3x`/`-chaos-3x` (260x120-Crop,
`convert -sample 300%` = nearest 3x -> 780x360, unverzerrt).

- Vorher (ohne Patch): `shots/m10-props-wiring-before-{early,chaos}-{1x,3x}.png`
  + `before.json` — Boden wiederholt denselben 26x20-Findling
  (Split 161/0/0, Top 22,9 %/21,9 %).
- Nachher (mit Patch): `shots/m10-props-wiring-after-{early,chaos}-{1x,3x}.png`
  + `after.json` — flache/spitze Findlinge, Wirbelsaeulen-/Gebein-Haufen,
  krummes Schilf, abgebrochene Laternen sichtbar gemischt; alle 6 Varianten
  im Zaehler (siehe K1-Tabelle), jsErrors: [].

Sichtpruefung: Chaos-3x zeigt Formvielfalt bei gleicher Platzierungsdichte;
Boss-Banner (Glockenturm-Golem) verdeckt nur die Bildmitte, Randbereiche
belegen die Vielfalt.

## K1 — Patch einarbeiten (#8798, Commit M10-m10-props-wiring #8798)

Der in `docs/lanes/m10-props-variety.md` (Karte 2, offener Punkt) dokumentierte
Patch ist eingearbeitet — exakt der dokumentierte Umfang:

- Import `propVariantKeyFor` aus `gen-props.ts` (1 Zeile, Datei selbst unangetastet).
- In `addProp()` nach dem PROP_KEYS-Guard: deterministische Variantenwahl
  `propVariantKeyFor(key, tileHash(round(wx), round(wy), seed + 463))`, Fallback
  auf die Basis-Textur via `textures.exists()`; `add.image(..., texKey)`,
  `propLayerFor(texKey)`, Glow-Bedingung `texKey === "prop_post"`.
- Unveraendert: Platzierung/CLUSTER_PROPS, LOD-Tiers (`propTierFor` bleibt
  klassenbasiert auf dem Basis-Key), Batch-Struktur, Schatten, Besitz-Regel.
  `propLayers.ts`/`textures.ts` nicht angefasst —
  tests/ground-props-batch (10) + prop-density-lod (4) + props-variety (6)
  bleiben gruen, `npx tsc --noEmit` rc=0.

**Wirkprobe** (`node scripts/m10-props-wiring.mjs --tag after`, seed 7, Chaos
21:30 — identischer Aufruf wie der Vorher-Lauf, Skript vorher eingefroren):

| Metrik | before (ohne Patch) | after (mit Patch) |
|---|---|---|
| Haeufigstes Prop (frueh / Chaos) | `prop_boulder` 22,9 % / 21,9 % | `prop_stump` 13,8 % / 15,0 % |
| `prop_boulder`-Split (frueh) | 161 / 0 / 0 | **51 / 61 / 49** |
| Neue Varianten im Chaos-Frame | 0 | boulder_b 57, boulder_c 53, bones_b 29, bones_c 24, reeds_b 26, post_b 12 |
| jsErrors | 0 | 0 |

Vorgaenger-Wirkprobe (~46/55/54, Top 23 % -> 15 %) reproduziert: Split
51/61/49, haeufigstes Prop `prop_stump` 15,0 %. Pluralitaet-Nachweis: alle 6
neuen Varianten im Spiel sichtbar. Die Schatten bleiben klassenbasiert
(`ownerKey` = Basis-Key), Schatten-/Prop-Anzahl unveraendert (nur
Textur-Auswahl, kein FPS-Relevanz-Pfad).
