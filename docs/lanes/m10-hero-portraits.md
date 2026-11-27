# M10-Lane: Helden-Porträts (m10-hero-portraits)

Fix-Job (Dom, 21:45Z, Punkt 5 — Porträts): Das Kael-Porträt in der Heldenauswahl las sich
nicht als Mönch („Kopf über Kasten mit Zacken"), das Mira-Porträt war grob.
`after: m10-hero-contrast` — dieselbe Gen-Pipeline (`scripts/art/gen_chars.py` → `src/gfx/gen-chars.ts`).

## Ist festgehalten (vorher, Commit 867cb3b — Karte #6198)

- Porträts aus der Pipeline (exakt das, was die CharSelect-Textur zeigt), 2x/4x nearest:
  `shots/m10-hero-portraits-before-portrait-{mira,kael}-{2x,4x}.png`
- Auswahl-Szene headless (Playwright, 640x360, 0 JS-Fehler): `shots/m10-hero-portraits-before-select.png`
- Metrik: `shots/m10-hero-portraits-before.json` (Canvas 48x48, BBox + genutzte Pixel-Fläche)

Sichtbefund (Vision, 4x): Kael = Gesichtsfenster über flacher dunkler Kiste mit zwei
Kettenbändern als Kanten — Grabstein-Look, kein Mönch. Mira = Hut als Zacken-Slab, kaum
Haar, asymmetrischer Mund, Laterne gequetscht in der Ecke.

## Fix (Commit e0b9336 — Karte #6199, Owner: pixel-artist)

`scripts/art/gen_chars.py`, Funktion `portrait()` komplett neu (Lauf-Sprites unangetastet);
`_bust_base` ersetzt durch `_trapezoid()` (schräge Schultern) + `_lantern()` (7x10, Bügel+Glut).

- **Kael (Eisen-Mönch):** spitze Kapuze über ausgehängten Kuttenklappen, schräg
  auslaufende Schultern (keine Box), Robe mit Falten, Strickgürtel mit Knoten,
  grauer Haar-Rand/kahle Stirn über Eisenreif (IRON 5/4/7 + Rost-Niete), grauer Bart
  (8/9/10), Hand + Laterne rechts unten. Kettenbänder entfernt.
- **Mira (Laternen-Hexe):** glatter Hexenhut (Kegel mit Knick, GOLD-Borte, glatte
  3-stufige Krempe), Pony + Wellen-Locken, feines symmetrisches Gesicht
  (2x2-Rouge, 3px-Mund mittelsymmetrisch, 2px-Nase), rotes Tuch (SCARF 20) mit Knoten,
  Ärmel + Hand + Laterne mit Bügel.
- Nur Paletten-Indizes 0..31, exakt 48x48 (eine Pixelgröße), Augenlinie y=23/24 bei beiden.

**Rollen-Anmerkung:** Das Briefing nannte für Mira „Jägerin/Bogenschützin"; laut
`src/data/characters.ts` ist Miras Rolle im Spiel aber **„Laternen-Hexe"** (junge Hexe mit
rotem Tuch und Laterne, Startwaffe ember). Das Porträt folgt der Spieldaten-Rolle —
Abweichung vom Briefing bewusst, damit Kunst und CharSelect-Untertitel übereinstimmen.

**Fremd-Edit (begründet, minimal):** `tests/hero-contrast.test.ts` — die Laterne-Glut-Region
des Kael-Porträts (x38..46, y36..48) wurde an das neue Layout angepasst. Die Kontrast-Lane
ist gemerged/abgeschlossen, keine parallele Nutzung.

## Tests (Commit eb10d33 — Karte #6200)

`tests/hero-portraits.test.ts` (3 Tests): beide Porträts existieren mit exakt 48x48/1 Frame,
nur Palettenfarben (0..31, binäre Alpha), CharSelect-Textur-Key `portrait_<id>` löst für
jeden Charakter aus `CHARACTER_LIST` auf (keine Fehltextur). Stand nach K2:
`npx tsc --noEmit` rc=0, 13/13 Tests grün (inkl. hero-contrast + char-frames).

## Supervisor-Iteration (r2/r3, Commits f1d4943 + cbb99e5)

- r2: art-director-Korrekturen — Kael: fleischfarbener Hand-Block über dem
  Laternendeckel → Metall-Laternenkopf (GOLD_L/GOLD/emberOrange); Mira: Glutkern
  (13/13) nach dem Shading explizit nachgezogen (vorher 1 px auf Knochen 10
  verdunkelt = schwebende helle Einzelpixel). Frische after-Belege gegen neuen
  Build (after-select md5 73bef5cb… ≠ before 792240a0…, 0 JS-Fehler).
- r3 (1 Iterationsschritt, Supervisor-Vorgabe): Kael Tonsure-Kranz durchgehend
  (keine Stirn-Noppen); Mira Brim-Tipp-Experiment zurückgenommen (schwebende
  Punkte) — Mira bleibt Stand r2.
- Abbruchkriterium (Silhouetten bei 2x nicht unterscheidbar) NICHT erfüllt —
  Kriterium 3 war mit art-director PASS (Note 5) belegt; Karte nicht blocked.
- **Rollen-Entscheidung bleibt:** Mira = Laternen-Hexe laut
  `src/data/characters.ts`; kein Bogen (würde der Spieldaten-Rolle widersprechen).

## Nachher + Abnahme (Karte #6201)

- `shots/m10-hero-portraits-after-portrait-{mira,kael}-{2x,4x}.png`,
  `shots/m10-hero-portraits-after-select.png` (0 JS-Fehler),
  `shots/m10-hero-portraits-after.json` — Kael BBox 43x48/1363 px, Mira BBox 41x47/1219 px.
- **art-director-Sichtprüfung (Vision):** siehe Urteil unten (PASS/FAIL + Belege).

### art-director-Urteil

**PASS** (Re-Check nach r2, alle 5 Kriterien mit Beleg):

1. **Kael als Mönch — PASS:** spitze Kapuze, kahle Stirn über Stirnband, grauer
   Bart, Strickgurt mit Knoten; Laterne mit Metall-Deckel (`#FFD77A/#A84A21`),
   Glutkern `#FFEEB0/#FFF8E6`; FleshWarm nur im Gesicht (x15–33, y16–28), null
   Fleischpixel an der Laterne. Beleg: `…after-portrait-kael-4x.png`.
2. **Mira fein/rollenklar — PASS:** Hut + Goldband, rotes Haar, symmetrisches
   Gesicht; helle Pixel ausschließlich im Laternenkern, keine isolierten
   Streupixel (Isolations-Check leer). Beleg: `…after-portrait-mira-4x.png`.
3. **Silhouetten 2x unterscheidbar — PASS:** Kael = schmales dunkles
   Kapuzen-Dreieck ohne Krempe + Bart; Mira = roter Hut mit breiter Krempe
   + Haar + Laterne.
4. **Palette/Grid — PASS:** alle opaken Farben ⊆ `src/palette.ts` (Kael 21,
   Mira 14 Farben), 0 opake #000000, 0 nicht-uniforme 4x-Blöcke (exaktes
   nearest, keine Mixel).
5. **Auswahl-Szene — PASS:** `after-select.png` md5 `73bef5cb…` ≠ before
   `792240a0…` (echte Neuaufnahme nach frischem Build, 0 JS-Fehler); beide
   Panels zeigen die neuen Porträts, keine Fehltexturen, kein Blur.

Nicht-blockierende Restnotiz: Kaels Stirn-Kontur hat 2 kleine Noppen (reine
Politur, ggf. eigene Karte).

## Offene Punkte

- SCARF=20 ist palettenseitig Amber und liest sich gold-orange statt tiefrot; falls Dom
  „klares Rot" will, wäre die Rampe 24/25 die Alternative (eine Karte).
- Kaels Kapuzen-Rampe 4/3 ist sehr dunkel; auf dem Nacht-Panel tragen Gesicht + Laterne
  die Lesbarkeit. Alternativ Rampe 5/4/6 erwägen.
