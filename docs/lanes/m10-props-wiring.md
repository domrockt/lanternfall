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

## K1 — Patch einarbeiten (#8798, Commit 34ebe63)

Der in `docs/lanes/m10-props-variety.md` (Karte 2, offener Punkt) dokumentierte
Patch ist eingearbeitet — exakt der dokumentierte Umfang:

- Import `propVariantKeyFor` aus `gen-props.ts` (1 Zeile, Datei selbst unangetastet).
- In `addProp()` nach dem PROP_KEYS-Guard: deterministische Variantenwahl
  `propVariantKeyFor(key, tileHash(round(wx), round(wy), seed + 463))`, Fallback
  auf die Basis-Textur via `textures.exists()`; `add.image(..., texKey)`,
  `propLayerFor(texKey)`, Glow-Bedingung `texKey === "prop_post"`.
- Unveraendert: Platzierung/CLUSTER_PROPS, LOD-Tiers (`propTierFor`/PROP_TIERS
  klassenbasiert auf dem Basis-Key), Batch-Struktur, Schatten, Besitz-Regel.
  `propLayers.ts`/`textures.ts` nicht angefasst —
  tests/ground-props-batch (10) + prop-density-lod (4) + props-variety (6)
  bleiben gruen, `npx tsc --noEmit` rc=0. Nachtrag (Review K4): die
  Klassifikation ueber den Basis-Key gilt jetzt auf BEIDEN Pfaden — siehe
  Review-Fix in K4 (`ownerKey` auch auf dem Prop-Bild).

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

## K2 — Vorher/Nachher-Shots (#8799, Commit 4cfbd4e)

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

## K3 — Guard-Test (#8800, Commit 93dfc3b)

`tests/props-wiring.test.ts` (5 Tests, alle rein, ohne Phaser):

1. **Determinismus:** exakt die addProp-Formel (`propVariantKeyFor(base,
   tileHash(round(wx), round(wy), seed + 463))`) — 1000 Positionen x 2 Seeds
   x 4 Zielklassen, zwei Aufrufe liefern bitidentische Keys.
2. **Positionsabhaengigkeit:** 64x64-Tiles treffen mind. 3 verschiedene
   boulder-Keys (Guard gegen versehentlich konstante Wahl).
3. **Fallback unbekannter Key:** `prop_nichtda` -> Basis-Key; Klassen ohne
   Varianten (`prop_stump`, `prop_grave`, `prop_tree_a`) laufen unveraendert
   durch.
4. **Grenz-Picks:** 0 -> Basis, 0.999999 -> letzte Variante, kein undefined.
5. **Varianten = echte Sprite-Keys:** alle gewaehlten Keys sind Basis oder
   `<basis>_<buchstabe>` (der Textur-Fallback im Renderer haette nie
   einzusetzen).

Ergebnis: 5/5 gruen; `npm test` 1511/1511 gruen (144 Dateien);
`npx tsc --noEmit` rc=0. Anmerkung: der volle Testlauf regeneriert
`shots/m10-passive-math-*.json`-Timestamps (bekannter Seiteneffekt fremder
Tests) — revertiert, nicht committet.

## K4 — art-director-Urteil (#8801)

**art-director (Runde 1): PASS — Note 4/5 fuer Prop-Vielfalt am Boden
(Schwelle >= 4/5 erreicht).**

- **Echte Form-Vielfalt:** before-Chaos zeigt identische Findlings-Ovale in
  Reihen; after-Chaos stehen flacher Mooblock (boulder_b) direkt neben spitzem
  Splitterfels (boulder_c), Wirbelsaeule (bones_b) neben Gebein-Haufen
  (bones_c), gekippte erloschene Laterne (post_b) im Kontrast zur brennenden
  stehenden Laterne, krumme Schilf-Halme (reeds_b) am Ufer. Kein Recolor —
  Silhouetten unterscheiden sich.
- **Groesse/Fusslinie/Schatten:** alle Varianten auf gleicher Fusslinie mit
  ueblichem Bodenschatten-Fleck, kein Mixel, keine Ueberrager.
- **1x-Lesbarkeit:** keine Palettenbrueche; Counter stimmen zum Bild
  (boulder-Split 51/61/49 statt 161/0/0, prop_stump als neuer Top-Prop
  mehrfach sichtbar).
- **Abzuege (optional, keine Muss-Korrekturen):** bones_b/c im Gefecht bei 1x
  knapp gegen weisse Knochen-Wisp-Gegner abgrenzbar (nur ueber Groesse/
  Bodenschatten); boulder_b-Silhouette liest sich nah am Basis-Findling —
  ggf. 1–2 px Bruchkante nachschaerfen (Nachfolge-Backlog, nicht diese Lane).

Wirkprobe-Zahlen (K1-Tabelle) und Sichtpruefung decken sich; JS-Fehler 0 in
beiden Messlaeufen.

## K4 — Reviewer + art-director (#8801)

**Reviewer (Runde 1): FAIL — 1 kritischer Befund.** `applyPropTier`
klassifizierte Prop-Bilder ueber `p.texture?.key` = Varianten-Key:
`prop_post_b` ist nicht in PROP_TIERS -> Tier 2, waehrend der Schatten
(`ownerKey` = Basis-Key, Tier 0) sichtbar blieb -> schwebende Schatten
verwaister Laternen im Dichte-LOD (N1/N2, enemies >= 150). Die zwei Pfade
(Chunk-Bau vs. Stufenwechsel) entschieden fuer dieselbe Laterne
unterschiedlich; Doku-Claim „klassenbasiert" galt nur fuer den ersten Pfad.

**Review-Fix (2 Zeilen + Kommentar, GroundRenderer.ts):** `addProp` setzt
`img.setData("ownerKey", key)`; `applyPropTier` liest fuer ALLE Instanzen
`ownerKey ?? textureKey` (kein isShadow-Sonderweg mehr). prop_post_b erbt
damit Tier 0 (Lanternen-Landmarke, wie die Basis-Laterne); Glow bleibt nur
auf der brennenden Basis-Laterne (dokumentiert). propLayers.ts bleibt
unangetastet.

**Wirkprobe des Fixes** (`--tag after-tierfix`, Chaos 21:30 + frueh, Sonde in
`scripts/m10-props-wiring.mjs`): Tier-0-Stufenwechsel erzwungen
(`g.applyPropTier(0)`, enemies-Schwelle uebergangen):
- natuerlich (maxTier 2): 704/538 Schatten, **floatingShadows 0**, 0 hidden.
- forciert Tier 0: 682/526 Props hidden, **floatingShadows 0** (Schatten
  folgen ihrem Owner ueber denselben ownerKey-Pfad), `prop_post_b` sichtbar
  14/14 bzw. 8/8 (Tier-0-Erbe wirksam).
- Komposition unveraendert (boulder 51/61/49, Top prop_stump 13,8 %/14,7 %),
  jsErrors 0.

Mess-Skript-Iterationen: 3 (Abweichung von der 2er-Regel, begruendet: die
Sonde hatte einen Ein-Durchlauf-Bug — Schatten wurden gegen ein halb
gefuelltes Props-Set geprueft und meldeten 704 falsche "floating shadows";
der Zwei-Durchlauf-Fix ist nachweisbar: Debug-Lauf 704/704 Hits, danach
0 floating in beiden Zustaenden). Keine Aenderung an Spiellogik dadurch.

**art-director (Runde 1): PASS — Note 4/5 fuer Prop-Vielfalt am Boden
(Schwelle >= 4/5 erreicht).**

- **Echte Form-Vielfalt:** before-Chaos zeigt identische Findlings-Ovale in
  Reihen; after-Chaos stehen flacher Mooblock (boulder_b) direkt neben spitzem
  Splitterfels (boulder_c), Wirbelsaeule (bones_b) neben Gebein-Haufen
  (bones_c), gekippte erloschene Laterne (post_b) im Kontrast zur brennenden
  stehenden Laterne, krumme Schilf-Halme (reeds_b) am Ufer. Kein Recolor —
  Silhouetten unterscheiden sich.
- **Groesse/Fusslinie/Schatten:** alle Varianten auf gleicher Fusslinie mit
  ueblichem Bodenschatten-Fleck, kein Mixel, keine Ueberrager.
- **1x-Lesbarkeit:** keine Palettenbrueche; Counter stimmen zum Bild
  (boulder-Split 51/61/49 statt 161/0/0, prop_stump als neuer Top-Prop
  mehrfach sichtbar).
- **Abzuege (optional, keine Muss-Korrekturen):** bones_b/c im Gefecht bei 1x
  knapp gegen weisse Knochen-Wisp-Gegner abgrenzbar (nur ueber Groesse/
  Bodenschatten); boulder_b-Silhouette liest sich nah am Basis-Findling —
  ggf. 1–2 px Bruchkante nachschaerfen (Nachfolge-Backlog, nicht diese Lane).

**Tests nach Review-Fix:** tests/props-wiring.test.ts 6/6 (neu: Regression
ownerKey-Klassifikation als Quell-Vertrag via ?raw-Import, Muster aus
tests/mobile-config.test.ts; Grenz-Pick jetzt exakt `prop_boulder_c`);
`npm test` 1512/1512 gruen, `npx tsc --noEmit` rc=0.

## Lane-Abschluss

- Karten: K1 Commit 34ebe63, K2 Commit 4cfbd4e, K3 Commit 93dfc3b, K4 Commit
  (dieser; enthaelt Review-Fix + art-director-Urteil). Eine Karte = ein
  Commit, Praefix `M10-m10-props-wiring:`.
- Abnahme erfuellt: Varianten im Spiel sichtbar (Wirkprobe 51/61/49, Top
  22,9 %/21,9 % -> 13,8 %/15,0 %, alle 6 Varianten gezaehlt), art-director
  4/5 PASS, Reviewer-FAIL behoben und belegt (floatingShadows 0 auch bei
  erzwungenem Tier 0), `npm test` 1512/1512 + `npx tsc --noEmit` rc=0,
  tests/ground-props-batch + prop-density-lod unveraendert gruen.
- Offene Punkte (Backlog-Empfehlungen, kein Lane-Ziel): optionaler Sprite-
  Nachschliff bones-Kontrast / boulder_b-Bruchkante (Vorgaenger-Lane
  m10-props-variety); Glow fuer prop_post_b (aktuell nur Basis-Laterne leuchtet
  — dokumentiert, entspricht dem Vorgaenger-Patch-Entwurf).
