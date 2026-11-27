# M10-Enemy-Palette — Gegner-Farbfamilien je Biom

Ziel (Dom, 21:45Z Punkt 7): Die Gegner-Palette ist zu einfarbig (viel Grau/Weiß +
Rotbraun) — bei 300–500 Gegnern liest sich die Masse als dunkler Block. Mehr
Farbfamilien je Biom-Thema, damit Typen auch in Masse unterscheidbar bleiben.

## Mess-Methode (`scripts/m10-enemy-palette.mjs`)

Headless-Lauf des echten Spiels (Playwright, iGPU):
1. **Kontaktbogen**: alle 30 Gegner-Typen (Frame 0, 3x nearest) → `shots/m10-enemy-palette-<tag>-sheet.png`
2. **Chaos-Frame**: 500 Gegner aus 22 Typen (Stufen 0–4, mehrere Biome) gleichmäßig
   über die sichtbare Fläche verteilt (Minute 25, Boss/Banner ausgeblendet,
   Level-ups abgeräumt) → `shots/m10-enemy-palette-<tag>.png`
3. **Familien-Zählung** aus den echten Sprite-Pixeln (Runtime-Texturen, nicht
   Screenshot), Klassifikation über **Palettenindex** (deterministisch, identisch
   in Skript und Test):
   0 Kontur | 1–2 Nacht-Schwarz | 3–7 Blaugrau/Nacht | 8–9 Dunst |
   10–13 Knochen/Licht | 14–19 Glut/Flamme | 20–22 Gold | 23–27 Blut | 28–31 Grün.
   - `countedFamilies`: Familien mit >= 5 % Pixelanteil
   - `strongFamilies`: Familien mit >= 8 % Anteil, ohne Kontur und dunkle/mittlere
     Neutraltoene; "hell-neutral" (Knochen/Licht) zählt als eigene Familie, da sie
     in der Masse klar als helle Gruppe lesbar ist
   Belege enthalten den iGPU-Renderer-String (`rendererName`).

## Vorher / Nachher (identische Metrik, gleiche Chaos-Mischung)

| Metrik (500er-Frame) | Vorher (K1-Sprites) | Nachher (K2-Sprites) |
|---|---|---|
| **strongFamilies** | **3** (hell-neutral 15,6 %, gruen 11,6 %, glut-braun 11,4 %) | **5** (gruen 14,9 %, hell-neutral 13,5 %, glut-braun 12,1 %, blut-rot 10,0 %, blau 9,0 %) |
| blau (Nacht-Thema) | 6,7 % | 9,0 % |
| blut-rot (Kult-Thema) | 6,1 % | 10,0 % |
| mittel-neutral (Grau-Masse) | 24,6 % | 16,4 % |
| gold (Laternen-Thema) | 4,2 % | 4,3 % |
| JS-Fehler / lebende Gegner | 0 / 518 | 0 / 517 |

- Vorher-Belege: `shots/m10-enemy-palette-before2.*` (K1-Sprites, finale Metrik)
  und `shots/m10-enemy-palette-before.*` (erste Messung, HSL-Cluster-Metrik:
  strongFamilies 2 — Blau/Bone-Buckets fielen dort unter die Sättigungsschwelle)
- Nachher-Belege: `shots/m10-enemy-palette-after.png`, `-after-sheet.png`, `-after.json`
- Renderer (alle Belege): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU)
- Visuell: die Masse liest sich nachher in Rot (Fledermäuse/Kult), Grün (Moor),
  Weiß (Knochen), Warm-Braun (Glut) und Blaugrau (Nacht) statt als ein Block.

## Änderungen

- `scripts/art/gen_enemies.py`: 6 Familien-Rampen (`FAMILIES`) mit 5 Tier-Stufen
  (Tier-Fortschritt hebt Sättigung/Helligkeit: t0 dunkler, t4 heller), Zuordnung
  `ENEMY_FAMILY` je Typ nach Biom-Thema (Moor→gruen, Friedhof→knochen,
  Wald/Nacht→nacht, Höhle/Glut→glut, Kult→blut, Laterne/Stroh→gold). Wisp als
  Laternen-Geist → Gold-Familie; Slime/Mudling/Toad/Ghoul → Moor-Grün;
  Crow/Wolf/Spider/Knight/Wraith → Blaugrau; Bat/Witchling/Cultist/Horror/Abom → Rot;
  Skeleton/Banshee/Harpy/Centipede → Knochen; Bog_Rat/Golem/Bomber/Treant/Imp → Glut.
- `src/gfx/gen-enemies.ts`: NUR regeneriert (+ Familien-/Rampen-Export
  `GEN_ENEMY_FAMILIES` für Tests). Silhouetten-Masken bitidentisch zum Vortag
  (Masken-Diff: keine Unterschiede).
- `src/gfx/enemySprites.ts`: **unverändert** (K3) — Regeneration erforderte keine
  Anpassung; Elite-Rim (`eliteRimGrid`, `eliteRimFrame`, `ELITE_RIM_COLOR`) und
  Elite-Marker unberührt, `tests/elite-rim.test.ts` grün.
- `tests/enemy-palette.test.ts` (neu, 6 Tests): 30/30 Typen mit Familien-Eintrag
  aus den Daten, binaeres Alpha, 0 Off-Palette-Pixel, Familien-Zugehörigkeit je
  Typ (Anteil >= 0,20), Tier-Progression der Rampen, Chaos-Mischung >= 4 Familien
  mit >= 8 %.

## Abnahme

- art-director: ausstehend (Chaos-Shot + Kontaktbogen liegen in shots/)
- Tests: `npm test` 699/699 grün, `npx tsc --noEmit` grün
- >= 4 Familien im 500er-Frame: belegt (5 starke Familien, s. o.)
- iGPU-Renderer-String in jedem Beleg-JSON

## Offene Punkte

- art-director-Abnahme (Lesbarkeit der Masse im Chaos-Shot) steht aus; die
  after-Shots liegen bereit.
- Wisp- und Scarecrow-Gold liegt mit 4,3 % knapp unter der 8-%-Schwelle — die
  Gold-Familie ist im 500er-Frame nur schwach vertreten (2 Typen mit kleinen
  Sprites); falls art-director eine stärkere Gold-Gruppe will, wären 2–3 weitere
  Gold-Typen nötig (neue Karte).
- Wraith/Voidcaller/Abom nutzen feste Literal-Paletten (nacht/blut passend), aber
  ohne Tier-Progression über Rampen — kosmetisch, ggf. eigene Karte.
