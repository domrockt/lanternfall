# Lane m10-props-variety — Prop-Vielfalt am Boden

Ziel: Doms Karte „schöner Pixelgrafik-Draufsicht“ — freie Flächen wirken leer /
Wiederholungen fallen auf. Die Prop-Klassen (Steine, Knochen, Büsche/Schilf,
Lanternen-Reste) bekommen 4–6 weitere Sprite-Varianten, damit Cluster weniger
kopiert wirken. **Nur Sprite-Varianten**: Platzierung/LOD/Draw-Pfad bleiben
inhaltlich unverändert.

## Karte 1 — Vorher-Befund (K1, Commit M10-m10-props-variety #8438)

Messung: `node scripts/m10-props-variety.mjs --tag before` (seed 7, debug-Run,
god+autoPlay; frueh ≈ 45 s Spielzeit, Chaos = 21:30 via `skipTo(1290)` —
bossenfreier Zeitpunkt, Bosse liegen im 5-Minuten-Raster). Prop-Zusammensetzung
über alle geladenen Chunks (`ground.chunks`), ohne Schatten/Glow.

| Abschnitt | Props gesamt | Häufigstes Prop | Anteil |
|---|---|---|---|
| früh   | 541 | `prop_boulder` | **22,6 %** |
| Chaos  | 693 | `prop_boulder` | **23,7 %** |

Komplette Verteilung (Chaos-Lauf): boulder 171, stump 109, bones 86, grave 79,
tree_b 41, tree_a 42, reeds 39, column 29, ruin 28, lilypad 25, mushroom_ring 29,
cross 24, post 22.

**Befund:** `prop_boulder` (Findling) ist mit ~23 % das mit Abstand häufigste
Prop — jede vierte Platzierung ist derselbe 26x20-Findling (nur flipX variiert).
`prop_stump` (15 %) und `prop_bones` (12 %) folgen. Genau diese drei Klassen
plus `prop_reeds` (Ufer-Buschwerk) und `prop_post` (Lanternen-Reste) bekommen
Varianten.

Belege: `shots/m10-props-variety-before-{early,chaos}-{1x,2x}.png` +
`shots/m10-props-variety-before.json` (jsErrors: []).

Messlauf-Konvention (Argus): Skript EINMAL gebaut, 3 Läufe zur Kalibrierung des
Banner-/Boss-Overlays (Boss-Banner bei 25:00 verdeckte den ersten Chaos-Shot →
Chaos-Zeitpunkt auf 21:30 verlegt, Banner-Alpha der UI-Szene wird abgewartet).
Ab jetzt ist das Skript eingefroren; before/after laufen mit identischem Aufruf.

## Fremd-Datei-Bedarf (Disponent)

Die Platzierung (`GroundRenderer.placeProps`) setzt feste Textur-Keys; ohne
Verdrahtung wären neue Varianten im Spiel unsichtbar und die After-Belege wären
leer. Beantragt in `/home/ai/games/.dispatch/requests.md`:

- `src/gfx/GroundRenderer.ts` — **3 Zeilen** in `addProp()`: deterministische
  Variantenwahl (tileHash der Position) über einen Helper aus `gen-props.ts`.
  Keine Änderung an Platzierung, CLUSTER_PROPS, LOD-Tiers oder Batch-Struktur.
- NICHT angefasst: `propLayers.ts` (PROP_KEYS/PROP_TIERS bleiben 13 Einträge —
  tests/ground-props-batch.test.ts und tests/prop-density-lod.test.ts bleiben
  unberührt grün), `textures.ts` (durch m10-chaos-fix-raster-glow belegt).

Begründung: ohne die 3 Zeilen ist das Kartenziel (sichtbare Vielfalt,
art-director ≥ 4/5) technisch unerreichbar; der Patch ist additiv, nur-lesend
bezüglich Spiellogik und ohne FPS-Effekt (gleiche Sprite-Anzahl, gleiche Layer).

## Karte 2 — Generator + Varianten

*(folgt)*

## Karte 3 — Guard-Test

*(folgt)*

## Karte 4 — After-Belege + art-director

*(folgt)*
