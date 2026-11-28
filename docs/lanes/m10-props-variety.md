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

## Karte 2 — Generator + Varianten (K2, Commit b899587 + Follow-up)

`scripts/art/gen_props.py` erzeugt jetzt 21 Sprites — 6 neue Varianten:

| Klasse | Basis | Neu | Grösse | Charakter |
|---|---|---|---|---|
| Steine | `prop_boulder` | `prop_boulder_b`, `prop_boulder_c` | 26x20 | flacher Mooblock / spitzer Splitterfels |
| Knochen | `prop_bones` | `prop_bones_b`, `prop_bones_c` | 23x14 | Wirbelsäule mit Schädel / Gebein-Haufen |
| Büsche (Schilf) | `prop_reeds` | `prop_reeds_b` | 18x24 | 5 krumme Halme, trockener Halm, dichtes Herz |
| Laternen-Reste | `prop_post` | `prop_post_b` | 20x32 | abgebrochen, Glas erloschen, Scherben |

Alle palettentreu (32er-Palette, binäres Alpha), gleiche Grösse wie die Basis,
`_finish()`-Vertrag (Kontur + gebackener Bodenschatten) identisch. Tuning gemäss
Abbruchkriterium: 1 Iteration an `bones_b` (Schädel/Wirbelkante lesbar gemacht),
dann eingefroren.

**Verdrahtung — OFFENER PUNKT (Supervisor-Entscheid 2026-11-28):**

Neue Varianten sind ohne Änderung an `GroundRenderer.addProp` im Spiel
*sichtbar ungenutzt* (Platzierung setzt feste Textur-Keys). Der zwischenzeitlich
getestete 3-Zeilen-Patch in `addProp` (Commit b899587, jetzt revertiert) war:

```ts
// nach dem PROP_KEYS-Guard in addProp():
const variantKey = propVariantKeyFor(key, tileHash(Math.round(wx), Math.round(wy), this.seed + 463));
const texKey = this.scene.textures.exists(variantKey) ? variantKey : key;
// add.image(wx, wy, texKey), propLayerFor(texKey), Glow-Bedingung texKey === "prop_post"
```

Wirkprobe mit Patch (Messlauf, Beleg im Commit b899587): alle 6 Varianten im
Spiel sichtbar; `prop_boulder`-Split 46/55/54 statt 124; häufigstes Prop fiel
von 22,6 %/23,7 % (`prop_boulder`) auf 15,2 %/15,3 % (`prop_stump`, unveränderte
Klasse). Kein Einfluss auf Platzierungszahl, LOD-Tiers oder Schatten.

**Offen für Lead/Merge:** Patch oben (3 Zeilen + 1 Import) als Folgekarte in
`GroundRenderer.ts` einbringen. `propVariantKeyFor` liegt fertig in
`gen-props.ts` (pure, getestet); `propLayers.ts`/`textures.ts` bleiben unangetastet
(PROP_KEYS/PROP_TIERS unverändert — tests/ground-props-batch und
prop-density-lod bleiben grün).

## Karte 3 — Guard-Test (K3)

`tests/props-variety.test.ts` (6 Tests): Variantenzahl je Zielklasse ≥ Ziel
(4–6 gesamt), Grössen-/Klassenvertrag, 0 Off-Palette-Pixel + binäres Alpha +
Kontur, Varianten ≠ Basis-Kopie, deterministische Gleichverteilung von
`propVariantKeyFor` (keine tote Variante). Alle grün; prop-density-lod-Test
unverändert grün.

## Karte 4 — After-Belege + art-director (K4)

**Wahrheitssicherung:** Der zwischenzeitliche 3-Zeilen-Patch war Teil von Commit
b899587 und wurde nach dem Supervisor-Steer in Commit 71fc2f4 *dokumentiert,
aber nicht aus dem Quellstand entfernt* (git checkout -- stellte HEAD wieder
her, der den Patch enthielt). Vor der After-Messung wurde GroundRenderer.ts
real auf den Stand vor b899587 zurückgesetzt (diff vs HEAD: −10/+3) und
`npm run build` neu gebaut (neuer Bundle-Hash Cz10jgJp). Der reine
`git checkout`-Revert war eine Falle: HEAD enthielt den Patch bereits.

**After-Messung auf HEAD (ohne Verdrahtung, `--tag after`):**

| Abschnitt | Häufigstes Prop | Anteil |
|---|---|---|
| früh   | `prop_boulder` | 23,3 % |
| Chaos  | `prop_boulder` | 22,9 % |

Identisch zur Vorher-Messung (22,6 %/23,7 % — Schwankung durch AutoPlay-
Position): **ohne die 3-Zeilen-Verdrahtung ändert sich am Boden nichts**; die
6 Varianten liegen fertig generiert, getestet und palettentreu in
`gen-props.ts`, werden aber von der Platzierung nicht referenziert.

**Wirkprobe (nicht HEAD, klar getrennt):** `shots/m10-props-variety-after-wired-*`
— gleicher Messlauf mit ausschließlich dem in der Lane-Doku (Karte 2) dokumentierten
3-Zeilen-Patches: häufigstes Prop fällt auf `prop_stump` 16,1 %/15,4 %,
`prop_boulder`-Split 47/52/47, alle 6 Varianten im Spiel sichtbar. Diese Belege
begründen den offenen Punkt für den Lead/Merge — sie sind kein Abnahme-/HEAD-Stand.

**Sprite-Belege:** `shots/m10-props-variety-after-variants.png` (Klassen bei 4x)
und `shots/m4b-sheet-props.png` (komplettes Sheet, 21 Sprites).

**art-director-Urteil (Runde 1, vor Korrektur): PASS — Note 4/5 für Bodenvielfalt.**
Programmatisch geprüft: Palette (alle 10 Sprites nur Indizes 0–31), Größen-/Klassenvertrag,
Kontur-/Schatten-Vertrag, Lesbarkeit in 1x-Crops; Vielfalt auf den Wire-Shots als echte
Formvielfalt bestätigt. Nachbesserungen priorisiert: (1) `prop_bones_b` Wirbelsäule als
durchgehende 2x2/2x3-Kette + 2-px-Knochen, (2) `prop_boulder_c` echte Bruch-Spitzen statt
Ellipsenbogen, (3) `prop_post_b` Glaskern 2x2 mit Bruchkante + Scherben als 2x2-Cluster.

**Korrektur-Runde (1 Iteration, alle 3 Punkte umgesetzt, Commit 6d39c07):**
Belege erneuert (`after-variants.png`, `m4b-sheet-props.png`, `after-wired-*`). Wirkprobe
auf Patch-Stand erneut: häufigstes Prop `prop_stump` 14,8 %/15,2 %. 

**art-director-Zweitprüfung: PASS — Note 4/5 für Bodenvielfalt (final).**
Pixel-Audit belegt: bones_b = 1 zusammenhängende Komponente, 0 Einzelpixel-Fragmente;
boulder_c mit Stufen-Spitzen + Riss ab Hauptspitze; post_b Glaskern 2x2 (Index 3) mit
Bruchkante, Scherben 2x2-Cluster. Anmerkung (dokumentiert, nicht umgesetzt): Glint im
post_b-Glas ist Index 11 (boneLight) statt Index 9 aus der Korrektur-Spezifikation —
funktional gleichwertig hell, Familienstil konsistent über alle Props.

**Tests:** npm test 1375/1375 grün (ein flaky Einzelfehllauf in
tests/fx-mixel.test.ts im ersten vollen Lauf, in Isolation und im Wiederholungslauf
grün — dokumentiert, kein Lane-Bezug). `npm run build` grün. FPS/Draw-Pfad:
unverändert (keine Code-Änderung im Draw-Pfad auf HEAD; Wirkprobe zeigen gleiche
Prop-Anzahl, nur Textur-Auswahl).
