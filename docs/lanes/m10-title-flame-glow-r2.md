# Lane m10-title-flame-glow-r2 — Titelflammen sichtbarer machen (Glut-Akzente)

Folgekarte aus m10-title-flame-crisp (Backlog-Vermerk dort): Die Laternen-Flammen sind
nach dem Crisp-Fix korrekt, aber zu unauffällig. Ziel: Flammen sichtbarer machen
(stärkere Glut-Akzente, Kern-Pixel heller Palette-Stufe) — **nur Optik, keine
Layout-/Text-Änderungen**; Title.ts/menu.ts bleiben unangetastet.

Constraint-Erklärung: Title.ts tauscht nur die Texturen f0→f1→f0→f2 an den
TITLE_FLAME_SPOTS — jede Sichtbarkeits-Verbesserung ohne Title.ts muss therefore über
die **generierten Assets** laufen (title_background + title_flame_f0/f1/f2 in
gen_title.py → gen-title.ts). Das ist genug: die helle Glut wird in der Basis gebacken
(F0 = Zellkopie), der 2-fps-Wechsel liefert die Animation.

## Karte K1 — Vorher-Belege + Glut-Messung (2026-11-28)

Aufnahme: `node scripts/m10-title-flame.mjs before` (vorhandenes Skript der
crisp-Lane, unverändert verwendet; 0 JS-Fehler in allen 3 Viewports).

Belege: `~/games/.evidence/m10-title-flame-glow-r2/`
- `m10-title-flame-before-640x360.png`, `m10-title-flame-before-780x360.png`,
  `m10-title-flame-before-1920x1080.png`
- Zoom Flammenbereiche (Lanterne 1/3, 4x nearest): `before-640-zoom4x-lantern1.png`,
  `before-640-zoom4x-lantern3.png`, `before-1920-zoom1x-lantern1.png`
- `before-glow.json` (Messung)

**Metrik Glut-Flächenanteil:** Anteil der Texel mit Palette 13 (lanternWhite) oder
22 (glow) innerhalb der 4 Glas-Patches (je 8x6 Texel, Anker TITLE_FLAME_SPOTS + 5):
- **Vorher: 0,125** (6 von 48 Texeln je Laterne: 5x22 + 1x13)
- Rest: Amber-Rand (20) + Übergangsfläche (21) = 42/48

Befund (4x-Zoom): Das Glas ist ein gedämpfter, fast brauner Block — die helle
Palette-Stufe 13 sitzt nur auf **einem** Texel in der Mitte. Bei Scale 1 (640x360,
Standard-Viewport) wirkt die Lampe wie Deko, nicht wie eine brennende Lichtquelle.

**Zielkorridor (vor dem Fix festgelegt):** Glut-Flächenanteil (13+22) je Glas-Patch
>= 0,30 nach dem Fix; organischer Flammenkern (flächige 13-Gruppe, keine Symmetrie),
Dither nur an Übergangskanten (1–2 px Stufe 21 zwischen 22/13 und 20).
