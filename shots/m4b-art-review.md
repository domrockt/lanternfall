# Lanternfall — M4b Art-Director-Abnahme, Runde 6

**Datum/Zeit:** 2026-11-25, 19:07–19:17 UTC (frische Belegrunde; Datei-mtimes 19:04–19:07 UTC)
**Prüfer:** art-director (Subagent, unabhängig; außer dieser Datei nichts im Repo geändert)
**Runde:** M4b, Runde 6 — vollständige Neubewertung des **aktuellen** Stands nach Reviewer-Befund und Neugenerierung.
**Verbindlich:** GAME.md „Grafik-Qualitätslatte“ (Z. 92–102), ART.md Regeln 1–11, `src/palette.ts` (32 Farben; additive Licht-/Vignette-Überblendungen als Ausnahme).
**Hinweis:** Diese Datei ersetzt die Runde-5-Fassung vollständig. Keine Note wird fortgeschrieben; jede Note ist am aktuellen Pixelstand neu begründet.

**Belege (aktueller Stand, alle neu erzeugt):**
- `shots/m4b-sheet-tiles.png` — 6 Kartenausschnitte 3× (Ufer West/Ost, Weg gerade/Kurve, See Mitte/Enge), ohne Spielerlicht; Quellen `shots/tmp/m4b/nolight/{shore,path,water}.png` (960×540 = 2×).
- `shots/m4b-water.gif` — 36 Frames, 480×270, 12/13 ms; mit `convert -coalesce` in `/tmp` extrahiert.
- `shots/m4b-sheet-props.png`, `m4b-ref-prop_{tree_a,ruin,post,mushroom_ring}.png`.
- `shots/m4b-sheet-chars.png`, `m4b-kael-dark-6x.png`, `m4b-sheet-skin.png`.
- `shots/m4b-sheet-bosses.png`, `m4b-pale-shepherd-f0f1-6x.png`, `m4b-hollow-king-f0f1-6x.png`.
- `shots/m4b-sheet-enemies-dark.png`, `m4b-dark-{spider,crow,wolf,voidcaller}-f*-dark.png`.
- In-Game: `m4b-run-minute2/12/22.png`, `m4b-boss-fight.png`, `m4b-probe-terrain.png`, `m4b-enemy-roster.png`, `m4b-levelup.png`, `m4b-chest.png`, `m4b-title.png`, `m4b-charselect.png`.

**Methode:** Alle Crops mit ImageMagick `-filter point` 3×/5×/6×/8×/12×/18× nearest vergrößert, nie verzerrt. Zusätzlich Pixel-Audit direkt auf den generierten Grids (`src/gfx/gen-chars.ts`, `gen-bosses.ts`, `gen-enemies.ts`): Palettenindizes, 2×2-21-Blöcke, 22-Nachbar-27, isolierte Pixel, Frame-Hashes. Wasser-Diffs pixelgenau auf den coalesced GIF-Frames (Lichtkreis r=50 um 240,145 ausgeschlossen). Ufer/Schaum und Weg auf den 480×270-nativen Quellen gemessen. `python3 scripts/art/test_lib.py` ausgeführt: **OK** (2×2-Reduktion, 1-px-Linie erhalten, kein Haut-Fallback).

---

## Notentabelle

| # | Punkt | Note | Kurzbegründung (Bildstelle/Prüfwert) |
|---|-------|------|--------------------------------------|
| 1 | **Terrain** (organisch/Autotiling, Wegkanten/-breite/Kies, Wasser mit Ufer/Schaum/Lücken/Animation, Props gruppiert+Schatten, ruhige Variation, keine Chunk-Nähte) | **4** | Autotiling organisch (Blatt „UFER WEST/OST“, „WEG GERADE/KURVE“); Weg-Unterbrechungen 12–16 px im geraden Stück (234 Messzeilen 10–16 px, keine 16-px-Kachelkanten). Kies vorhanden: 269 Kies-Pixel (5/6/8) in 80 Clustern nahe Weg, 2×2-Gruppen belegt. Schaum: 356/536 Uferkontakte 1 px, 24×2 px, 29×3 px, **91 echte Lücken (17 %)** — die „Lücken“-Behauptung stimmt, die GAME.md-„2 px“-Aussage nur teilweise. Wasser-Diff 13–108 px/Frame im Wasser, kumulativ 203 px (2,9 % der Wassermaske), in allen Seebereichen messbar; tiefe Mittelbänder bewegen sich aber nur schwach. Chunk-Naht: Spalten-Scan in `m4b-run-minute12/2.png` zeigt keine 1-px-Gerade an x=240/256 (Spitzen nur an Props/Effekten) → Detailzellen-Fix wirkt. **Rest:** 1-px-Schaum wirkt an ruhigen Uferstücken wie eine geschlossene helle Linie; einige Wegkanten tragen Index-0-Pixel (s. u.); große Gras-Loben sind bei 6× sehr flach. |
| 2 | **Bruder Kael** | **4** | Breite Schulter-/Saum-Silhouette, Eisenreif/Tonsur-Rand, drei Kettenbänder mit 1-px-Robe dazwischen, zwei Akzentfamilien (Rot 23–25, Gold 20/21), 4 unterscheidbare Laufposen (Frame-Hashes alle verschieden), Hit-Rückstoß; auf Nightdeep (`m4b-kael-dark-6x.png`) bei 6× klar lesbar, Kontur 1 px/Index 0. **Rest:** Das rote Mundtuch (25) ist bei 32 px ein 6×3-Block und liest als breite Maske; die beiden Gold-Fäuste sind 5×3-Blöcke ohne Handgelenk; das Porträt hat ein 8-px-Stirnband in 21 (row14, x15–22), das eher wie ein Visier als eine Lichtkante wirkt. |
| 3 | **Warme Haut 16/27/21 (21 höchstens 1 px dick, kein 22 auf Haut)** | **4** | Mira/Kael/Kultist/Witchling nutzen sauber 16/27/21; **0** 2×2-21-Blöcke in Hautflächen, **0** 22 neben 27 bei Mira/Kael/Witchling/Kultist. 21 auf Haut ist bei Mira/Kael ausschließlich 1 px (Augenglanz/Tempel), bei Witchling/Cultist 1-px-breite senkrechte Linien (4–6 px lang). Coven: **7** 22-Pixel berühren Hand-27 (F1 (51,44),(27,61),(75,61); F2 (51,46),(21,52),(27,63),(75,63)) — Glow, aber wörtlich ein Verstoß. **Rest:** Coven-Flammen; Kael-Stirnband-Länge. |
| 4 | **Bosse** | **4** | Alle 6 mit F0 Ruhe/F1 Atmen/F2 Wind-up (3 verschiedene Frames je Boss), Rumpf-Bob 2 px, pulsierender Glutkern; Fahler Hirte als Kapuzen-/Bart-/Stab-Silhouette, Hohler König mit Schädel, leeren Glutaugen, schiefer Zackenkrone und zerrissenem roten Umhang; Coven als drei Figuren mit kreuzenden Strahlen in F2. Lesbar auf Nightdeep bei 4×/6×. **Rest:** brauner Fell-Slab am Fahlen Hirten ist eine flache 10×14-Fläche ohne Fellstruktur; Königstorso bleibt eine große Platte, Schwertarm unsichtbar; Glocken-Golem-Korpus flächig; Moorkönigin ohne Augen. |
| 5 | **Gegner auf Nightdeep** | **4** | 30/30 Silhouetten auf Index 1 lesbar (`m4b-sheet-enemies-dark.png`), 0 Off-Palette-Indizes in den Grids, Tier-Akzente 2×1/2×2 auf Augenhöhle 2, Lichtkante oben-links bei Spinne/Krähe/Wolf/Leerenrufer; 2–4 Frames, keine identischen Frames. **Rest:** Spinne liest mit dünnen 1-px-Beinen und zwei Loben wie 6 Beine; Krähenfuß ist ein 4×3-Braunblock ohne Zehen; Wolfsohren 1 px spitz; Leerenrufer-Innenfläche fast einfarbig; Mudling-Silhouette schwach. |

**Abnahme-Ergebnis: BESTANDEN** — alle fünf Punkte ≥ 4. Kein Asset muss komplett neu gebaut werden; die Korrekturen sind lokal und nicht blockierend.

---

## Explizit geprüfte Claims dieser Runde

### 1) 21-Lichtkanten: 2×2-Blöcke, 1-px-Linien, Haut

- **Selbsttest:** `python3 scripts/art/test_lib.py` → `OK (2x2, 1-px-Linie, kein Haut-Fallback)`. Die Reduktion liest die Quellmaske und hält echte 1-px-Linien; der frühere Haut-Fallback 27 ist entfernt.
- **2×2-21-Blöcke (Grid-Audit, alle Frames):** Char 7 (Portrait Mira 5 an der Laternenflamme x35–43/y34–36; Portrait Kael 2 an Kettengold x13,y34 und x33,y34), Bosse 166 (Moorkönigin 27 Krone, Knochenfürst 48 Krone/Metall, Glockengolem 36, Hohler König 55), Gegner 4 (Lich-Krone). **Kein einziger Block liegt in einer Hautfläche oder entsteht aus Shading**; die Blöcke sind Gold-/Kronen-/Flammen-Geometrie. Nur **Portrait Mira (37,34)** berührt Hand-27 (Laternenflamme). Die wörtliche Formulierung „keine 2×2-21-Blöcke in den Sheets“ ist damit **nicht** erfüllt, die präzise Formulierung „keine aus Shading auf Haut“ **schon**.
- **1-px-21-Linien:** Kael-Stirn im 48er-Porträt: row14, x15–22, **8 px durchgehend, exakt 1 px hoch** (sichtbar in `m4b-kael-dark-6x.png`); Kael-32er-Stirnband 1 px hoch, aber als 3-px-L-Klammer (15–16/10–11). Kronen: Oberkante/Umriss 1 px, die Zacken selbst sind absichtlich 2 px breit (z. B. Moorkönigin 19–20/12–13). Keine gebrochenen, gepunkteten oder doppelten 21-Linien in den neuen Sheets.
- **22 auf Haut:** 0 bei Mira/Kael/Kultist/Witchling; Coven 7 Pixel (s. o.). Kein Hautton wurde zu 22 aufgehellt; die Coven-22 sind Flammenkern direkt an der Hand.

### 2) Wasser-Diff, Schaum-Lücken

- **Animation:** 36 Frames, je 12/13 ms. Wasser-Pixel-Diff (Licht ausgeschlossen): **13–108 px/Frame**, kumulativ **203 px**. Im 6×-Stack (`f000/f009/f018/f027`) sind verschobene 5–7-px-Wellengruppen sichtbar; in den tiefen 4er-Bändern bleibt die Bewegung dezent. Die Aussage „Animation in allen Messregionen“ ist knapp, aber messtechnisch belegt.
- **Schaum:** Pond `shore.png` (nativ x244–299, y82–202): 536 Uferkontakte, davon **356 × 1 px**, 24 × 2 px, 29 × 3 px, 18 × 4 px, 16 × ≥5 px (Props/Schatten), **91 Kontakte ohne Schaum = 17 % Lücken**. Die Lücken sind echte 14/15-Torfkanten, keine nur dunkleren Schaumtöne. Die 2-px-Vorgabe aus GAME.md ist nur an 24 Stellen erfüllt; visuell liest die Kante bei 1× als dünne helle Linie mit Unterbrechungen — akzeptabel, aber ausbaufähig.

### 3) Wegkanten, Kies, Chunk-Naht

- **Wegbreite:** gerade Nord-Süd-Stelle 12–16 px; 234 Zeilenlauf-Stücke im Bereich 10–16 px, keine 16-px-Kachelkante. Die im Sheet behauptete „±2 px“-Variation ist vorhanden.
- **Kies:** 269 Kies-Pixel (6=152, 5=77, 8=40) in 80 8-Nachbar-Clustern innerhalb 2 px um den Weg; Größen 4–19 px, 2×2-Gruppen belegt (z. B. 8/6/5). Einzelne Kiesel sitzen auf dem Grasrand, nicht auf dem Weg.
- **Kantenfarbe:** 161 Randpixel des Wegs sind Index **0** (ink), z. B. `path.png` nativ (421,106–120) als 15-px-Senkrechte, (127,24–25), (10,65–66). Das ist eine harte schwarze Bisskante, die wie eine gezeichnete Kontur wirkt; sie sollte 14/28 sein.
- **Chunk-Naht:** Spalten-Scan in `m4b-run-minute12.png` und `m4b-run-minute2.png` (native 480): keine systematische 1-px-Linie bei x=240/256; auffällige Spalten (350/456, 373/375) sind Props/Effekte. Der Detailzellen-Fix ist visuell sauber.

### 4) Animation/Stil-Konsistenz

- Frame-Hashes: alle Läufe 4× verschieden, Idle 2×, Treffer 1×; Bosse 3× verschieden; keine Frame 1 ≡ Frame 3. Beine verschieben 1–2 px, Details bleiben.
- Stil: gleiche 1-px-Kontur (Index 0), gleiche Lichtrichtung oben-links, gleiche Rampen pro Material über alle Assets; Props mit gebackenem 2–3-px-Schatten nach SO auf Moos 28/29.
- Palettenprüfung auf Grids: 0 Off-Palette-Indizes. Screenshots zeigen durch Vignette/Licht additive Mischfarben — laut GAME.md Ausnahme, nicht als Asset-Verstoß gewertet.

---

## Rest-Korrekturen (konkret, lokal)

**1 Terrain**
- Schaum an ruhigen Uferstücken (z. B. Pond West y100–140) auf **2 px** verbreitern (7 innen, 8 außen) und die 17 % Lücken bewusst auf 2–4-px-Segmente setzen; nicht als geschlossene Linie.
- Wegkanten: Index-0-Pixel (421,106–120), (127,24–25), (10,65–66) durch 14/28 ersetzen und alle 6–10 px mit Moos 28/29 unterbrechen.
- Tiefe Seemitte: eine zusätzliche 5–7-px-Wellengruppe pro ~40 px in die 4er-Fläche, damit die Bewegung auch im Stillbild erkennbar ist.
- Gras-Loben: 1–2 zusätzliche 2×2-Büschel in den großen 30er-Flächen, nicht mehr Farbkontrast.

**2 Kael**
- 32-px-Mundtuch (25) von 6×3 auf 4×2 reduzieren (nur Mundlinie), Augen als 2×1-Sockel 2 mit je 1 px 21; die 3-px-21-Klammer am Stirnband (15–16/10–11) auf 2 px/1 px reduzieren.
- Fäuste: 1 px Handgelenk (16) zwischen Ärmel und Faust, 1-px-Kerbe in der Faust, damit sie nicht als Goldblock lesen.
- Porträt: Stirnband row14 x15–22 auf x15–19 kürzen, x20–22 auf 16 (gerichtete Lichtkante); Nase als 2×1 16 ergänzen.

**3 Haut**
- Coven-Flamme: die 7 22-Pixel, die 27 berühren (s. o.), auf 21/20 ändern oder die Flamme 1 px von der Hand abrücken. Kein 22 innerhalb 1 px eines 27-Pixels.
- Kael-Porträt: 8-px-Stirnband ist 1 px, aber visuell ein flaches Visier; auf 5 px kürzen und rechts 16 setzen (s. Punkt 2).

**4 Bosse**
- Fahler Hirte: brauner Fell-Slab (ca. x24–33/y20–40) in zwei 16/17-Fellloben mit 2–3-px-Zotteln und 1-px-14-Schatten brechen; Hand am Stab (x~48/y~46) als 2×2 9/10 sichtbar machen; Sichel als 6–8-px-Bogen mit 1-px-11-Kante.
- Hohler König: Torso (ca. x46–70/y28–60) in drei Platten mit 2-px-Fugen teilen, Pauldron vom Arm lösen, Schwertfaust vor die Klinge setzen.
- Glockengolem: Glockenmund 2 px breiter, Klöppel 2×3 mit Schatten; Moorkönigin: 2×2-Augen 20 auf 2, drei 2×2-Warzen 29.

**5 Gegner**
- Spinne: pro Seite 4 Beine mit 2-px-Oberschenkel + 1-px-Tarsus; keine 1-px-Enden, Fuß 2×1.
- Krähe: 4×3-Braunfuß durch zwei 1-px-Zehen + 2×2-Schatten ersetzen.
- Wolf: Ohrbasis 3×2, Spitze 1 px; Leerenrufer: zwei 2-px-Falten 3/7 und 1-px-Lichtkante am Oberarm; Mudling: 2×1-Akzent 31 als Augen und 2-px-Teilungsnaht.

---

## Listen

**muss neu:** — (nichts; kein Asset ist strukturell unbrauchbar)

**nachbessern:**
- Coven: 22 direkt an Hand-27 (7 Pixel) — harter Regelverstoß, lokal.
- Fahler Hirte: Fell-Slab, Sichel, Stabhand.
- Hohler König: Torso-Platte, Schwertarm.
- Kael: Mundtuch/Fäuste/Stirnband-Länge.
- Wegkanten mit Index 0; Schaum-2-px-Anteil; tiefe Wasserbänder.
- Spinne/Krähe/Wolf/Leerenrufer/Mudling-Details.

**ok:**
- Terrain-Makroform/Autotiling/Props/Chunk-Naht (Detailzellen-Fix belegt).
- Wasseranimation als Beleg (13–108 px/Frame, 36 Frames).
- Kael-Silhouette, 4 Laufposen, Kontur/Shading.
- Hautrampen Mira/Kael/Kultist/Witchling; 0 Shading-2×2 auf Haut.
- 5 von 6 Bossen (Moorkönigin, Knochenfürst, Glockengolem, Coven-Form, Hohler König-Silhouette).
- 30/30 Gegner-Silhouetten, 0 Off-Palette, Tier-Akzente, Frames.

**Grenzen dieser Prüfung:** Screenshots sind 2×/3×-Render mit Vignette; Palettenexaktheit wurde deshalb an den generierten Grids geprüft, nicht an Screenshot-Pixeln. Die Kontaktbögen sind Prüf-Artefakte, keine Laufzeit-Assets.
