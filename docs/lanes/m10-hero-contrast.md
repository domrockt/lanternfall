# M10-Lane: Helden-Kontrast (m10-hero-contrast)

Briefing (Dom, 21:45Z, Punkt 5): Zwei Helden lesen sich nicht — (a) Kael-Portraet in der
CharSelect liest sich nicht als Moench („Kopf ueber Kasten mit Zacken"), Mira-Portraet grob;
(b) im Lauf geht Kael (grau) zwischen grauen Gegnern unter.

## Befund (vorher, Commit cc024ad)

- Chaos-Frame (320 Gegner dicht um Kael, Minute-25-Mischung, 0 JS-Fehler):
  `shots/m10-hero-contrast-before.png` + `-before.json`. Der Spieler war im Haufen praktisch
  unlesbar; Harness-Befunde waehrend der Messung: God-Mode-I-Frames zeichnen den Spieler mit
  **alpha 0.55** (`Run.updateVisuals`), die Follow-Kamera steht bei Screenshots noch nicht —
  beides im Mess-Skript deterministisch neutralisiert (alpha-Reset + `centerOn`).
- Kael-Portraet: kahl rasierter Kopf + Stirnreif ueber Kettengewand-Kasten mit
  Zackenmustern (`shots/m10-hero-contrast-before-portrait-kael.png`) — kein Mönch-Lesbild.

## Geaenderte Dateien (Disponent-Bereich)

- `scripts/art/gen_chars.py`: `portrait()` — Kael neu (Kapuzenkalotte mit Gesichtsfenster,
  Moenchskutte mit zwei Kettenbaendern, Stirnreif, grauer Bart 8/9/10 nach GAME.md,
  Haut-Rampe 16/27/21 vollstaendig, Mund ohne INK, brennende Laterne rechts als
  Silhouetten-Akzent); Mira verfeinert (durchgezogene Haarkontur, sauberes Hutband).
  Neu: `warm_rim()` — 1-px-warme Lichtkante oben-links (Glow 22) auf beiden Spieler-Sprites.
- `src/gfx/gen-chars.ts`: NUR durch Pipeline-Regeneration (`python3 scripts/art/gen_chars.py`).
- `scripts/m10-hero-contrast.mjs` + `scripts/art/m10_hero_portraits.py`: Mess-/Beleg-Pipeline.
- `tests/hero-contrast.test.ts`: harte Schranken (siehe unten).

## Messwerte

Textur-Metrik (deterministisch, in Tests abgesichert): warme Akzent-Pixel (nicht in der
grauen Gegner-Familie 1–11, r-b >= 40) an Kaels Koerperpixeln:

| Charakter | ohne Rim (Baseline) | mit Rim (Fix) |
|---|---|---|
| Kael (down/side/up, Mean) | **0.192** | **0.270** |
| Mira (Mean) | 0.576 | 0.584 |

Chaos-Frame (320 Gegner, gleiche Mischung/Seed/Pipeline): Rim-Pixel in der Spieler-Box
**19 -> 37**, warmSharePlayer **0.23 -> 0.27** (`shots/m10-hero-contrast-before.json` /
`-after.json`). 4x-Zoom-Schnitte: `m10-hero-contrast-{before,after}-center-4x.png` — vorher
halbtransparenter Grau-Schleier, nachher klarer warmer Umriss mit Laterne/Axt-Akzent.

Hinweis zur Ehrlichkeit: Der additive Lichtkreis um den Spieler tinct auch die naechsten
Gegner warm, deshalb bleibt `heroRarity` (Farb-Seltenheit in der Umgebung) mit ~2 % in
beiden Laeufen aehnlich; die Aussagekraft liegt in Rim-Pixel/warmShare + Texture-Metrik
und im Bild. Gegner-Sprites wurden nicht umgefaerbt (nur Spieler-Texturen).

## Tests

`tests/hero-contrast.test.ts` (5 Tests, gruen):
1. Beide Helden, 4 Richtungen (links = gespiegeltes side) + Idle/Hit/Portraet: binaere Alpha,
   0 Off-Palette-Pixel.
2. Kaels warme Akzent-Quote je Richtung >= 0.22, Mean >= 0.25 (Baseline vor Fix 0.19).
3. Rim-Lichtkante: >= 30 Pixel (21/22 an Kontur/Transparenz oben-links) in jedem Lauf-Frame.
4. Kael-Portraet liest sich als Moench: Kapuze >= 120 px, Laterne mit Glutkern, grauer Bart
   (8/9/10) ohne rote Reste, kein Konturschwarz im Gesicht.
5. Beide Portraets auf gemeinsamer Augenlinie (Pupillenposition identisch).

## Abnahme

- art-director: Mira **4/5 PASS**; Kael Runde 1 **3/5 FAIL** mit 3 Korrekturen (Mund ohne INK,
  Haut-Rampe vollstaendig, grauer Bart statt rot) — alle umgesetzt, Runde 2 **4/5 PASS**
  (Pixel-Verifikation: 0 INK-Pixel innen, Bart 8/9/10 ohne Rot-Anteile, Augenlinie identisch
  zu Mira). Restpoint (kein FAIL): Gesichtsschatten liegt nach shade_edges auf 17/14 statt
  16 — beim naechsten Anlass entweder auf 16 normalisieren oder ART.md Regel 11 um 17 als
  Zwischenton ergaenzen.
- `npx tsc --noEmit` gruen; `npm test` **698/698** gruen; `npm run build` gruen.
- Kein FPS-Beleg noetig (keine Engine-Aenderung); Chaos-Shots ohne flock (keine Echtzeitmessung).
- Tabus eingehalten: `Run.ts`/`UI.ts`/CharSelect-Logik unveraendert.

## Offene Punkte

- In-Games-Portraet (CharSelect) zeigt die neuen Buesten; ein 2x-Screenshot der CharSelect mit
  beiden neuen Portraets liegt unter `shots/m10-hero-contrast-after-charselect.png`.
- Der Rim ist bei 1.5x-Anzeige 1 px duenn; falls Dom staerkeren Pop will, waere eine 2-px-Rampe
  (13/22) der naechste Schritt (Karte noetig, bewusst nicht gemacht: Gefahr der-effect-artigen
  Optik).
