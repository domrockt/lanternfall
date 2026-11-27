# Lane m10-chest-arrow-onscreen — Randpfeil zur Truhe (Beleg + Fix)

Worktree `/home/ai/games/lf-lanes/m10-chest-arrow-onscreen`, Branch `m10-chest-arrow-onscreen`.
Ziel: Der Bildschirmrand-Pfeil in `src/systems/ChestSystem.ts` muss ab Truhenspawn sichtbar sein,
korrekt auf die Truhe zeigen (alle Rand-/Eckfälle, View 640×360 und 780×360) und beim Eintritt der
Truhe in den View sauber verschwinden. Doms Auftrag: alle 5 min ein Boss → Truhe.

Hinweis: Die Lane-Doku liegt unter `docs/lanes/m10-chest-arrow.md` (Disponent-Claim); gemergt wird
sie wie in den Lane-Regeln beschrieben in GAME.md.

## K1 — Fehlerfälle (Code-Lesen: ChestSystem.ts, Run.ts-Aufrufer nur lesen)

Aufrufer: `Run.ts` — Spawn beim Boss-Tod (Z.914), Debug (Z.1344), Boss-Tod-Sekundärdrop (Z.1657),
`chests.update(realDt, cameras.main, posX, posY)` (Z.1141). Kamera: Follow 0.18/0.18, kein Dauerzoom,
aber **Zoom-Puls** beim Boss-Intro (`Run.ts:1596–1601`, zoom 1.14 → 1, ~550 ms) und Shake beim Boss-Tod
(worldView folgt — ok).

Gefundene Fehlerfälle in `ChestSystem.update()` (Z.79–94):

1. **Eck-Winkel falsch (Randklemme statt Strahlprojektion):** `ax = Clamp(sx, 24, W-24)` und
   `ay = Clamp(sy, 24, H-24)` werden **einzeln** geklemmt. Liegt die Truhe diagonal weit hinter einer
   Ecke, sitzt der Pfeil exakt in der Ecke, aber die Richtung Zentrum→Ecke ≠ Richtung Zentrum→Truhe.
   Beispiel 640×360, Truhe 2000 px diagonal unten-rechts: Soll 45°, Ist `atan2(156, 296)` ≈ 27,8° →
   **Abweichung ~17°** (Abnahme-Limit 5°). Die frühere Lane `m10-chest-timing` hatte nur *einen*
   Fall geprüft (Truhe unten-rechts knapp außerhalb) — dort ist die Klemme zufällig korrekt.
2. **Kamera-Zoom ignoriert:** Beim Boss-Intro pulst zoom auf 1.14.
   a) `inside` vergleicht worldView-Koordinaten gegen `camera.width` (Z.81). Bei zoom>1 ist die
      sichtbare Breite in worldView-Einheiten aber `camera.width / zoom` → der Pfeil bleibt
      **verborgen, obwohl die Truhe außerhalb** des sichtbaren Bereichs liegt ( ganze Zoom-Phase,
      ~550 ms je Boss-Intro).
   b) Die Pfeil-Position wird in unzoomten Screen-Koordinaten gesetzt (Z.90–93). ScrollFactor-0-Objekte
      werden in Phaser um die Kameramitte mit zoom skaliert → der Pfeil liegt radial verschoben
      (bei 640×360 Randbereich bis ~40 px daneben).
3. **Winkel-Basis:** `angle = atan2(sy - cy, sx - cx)` nutzt die geklemmte Position statt der
   wahren Truchenrichtung — in Eckfällen additionally verfälscht (siehe 1).
4. **Verschwinden beim Eintritt:** Der 8-px-Einzug ist bei zoom=1 korrekt; bei zoom>1 verschwindet
   der Pfeil zu früh (gleiche Ursache wie 2a).

Fix (K3): Screen-Position der Truhe aus `camera.worldView`-Mitte × zoom bilden, Strahl von der
View-Mitte zur Truhe mit dem Rand-Rechteck (margin 24) schneiden, Pfeil-Renderposition für
scrollFactor 0 zoom-kompensiert setzen. Ausgelagert als reine Funktion `computeChestArrow` in
`ChestSystem.ts` (unit-testbar, Phaser-Szene bleibt dünn).

## K2 — Harness + Baseline (Messung bestätigt die Fehlerliste)

Skript: `scripts/m10-chest-arrow.mjs` (`node scripts/m10-chest-arrow.mjs --out
shots/m10-chest-arrow-baseline.json`); Truhe an 4 Rand- + 4 Eckpositionen (je 640×360 und 780×360),
Zoom-Fall (zoom 1.14, Truhe 10 px hinter dem *sichtbaren* Rand) und Eintritts-Fall; 24 Frames je Fall.
0 JS-Fehler.

| Fall (640×360 / 780×360) | Ergebnis Baseline |
|---|---|
| Rand links/rechts/oben/unten | grün — Winkel 0°, Pfeil ab Spawn sichtbar |
| 4 Ecken (Truhe 1500 px diagonal dahinter) | **FAIL — Winkel 14,99° (640) / 18,66° (780) daneben, Position bis 191,2 px vom Soll-Randpunkt** (Fehler 1) |
| zoom 1.14, Truhe knapp außerhalb | **FAIL — 0/12 Frames sichtbar, obwohl die Truhe off-screen ist** (Fehler 2a) |
| Eintritt in den View | grün — Pfeil verschwindet ≤ 1 Frame nach View-Eintritt (Phaser aktualisiert `worldView` im preRender, `update()` liest den Vorframe; bei smoother Kamera ≤ 2 px Lag — Messartefakt, kein Fix-Kandidat) |

Fehler 2b (zoom-radiale Pfeilposition) behandelt der Fix mit, ist im Baseline-Set aber nicht
separat sichtbar, weil der Pfeil im Zoom-Fall gar nicht erst erscheint.

## K3 — Fix + Unit-Tests

Fix in `src/systems/ChestSystem.ts` (einzige Code-Datei): `computeChestArrow` (rein) + Nutzung in
`update()`. Tests: `tests/chest-arrow.test.ts` — Eck-Winkel ≤ 5°, Randfall rechts, Zoom-Fall sichtbar
+ Position am Rand, Eintritt → `visible:false`.

## K4 — Nachmessung + Abschluss

`node scripts/m10-chest-arrow.mjs --out shots/m10-chest-arrow-after.json --shots` → alle Fälle grün,
Screenshots `shots/m10-chest-arrow-edge.png` / `shots/m10-chest-arrow-inside.png`, `npm test` grün.
