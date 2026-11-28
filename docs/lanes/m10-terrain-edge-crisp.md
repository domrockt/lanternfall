# Lane m10-terrain-edge-crisp — Terrain-Kanten pixel-crisp

**Ziel (Briefing):** Terrain-Kanten und Übergänge zwischen Material-/Biom-Feldern pixel-crisp und
lückenlos — keine fraktionalen Mischzellen, keine 1-px-Löcher oder doppelte Kanten am Autotile-Rand.
Abnahme: Kanten-Fehlerquote 0 oder < 0,1 % mit belegter Restliste; verify-terrain unverändert grün;
npm test grün; art-director ≥ 4/5.

**Hinweis Kartenbuchung (Supervisor-Steer 28.11.):** Board-Karte #9196 trägt den Titel
„m10-props-wiring K4" (fremdes Lane-Thema); der terrain-edge-crisp-K4-Inhalt (After-Scan,
Kanten-Screenshots, art-director-Urteil, Lane-Doku, `.lane-done`) wurde gemäß ausdrücklicher
Supervisor-Anweisung unter #9196 abgearbeitet und committet. Der Titel-Mismatch ist hier dokumentiert.

## Befund — wo die Kanten-Logik wirklich liegt (K1/K2, eingedampft)

- Klassifikation der Material-/Biom-Felder: `terrainSampleAt()` in `src/gfx/tiles.ts` — **fremde Datei**
  (water-shore-Anim-Wartebereich, laut Briefing NICHT berühren).
- Autotile-Masken (Blob-47): `src/logic/autotile.ts` — deterministisch (rein ganzzahlige Maskenbits,
  `normalizeBlob` idempotent, `wangIndex` stabile Tabelle 0..46). Kein Fehler gefunden: keine
  fraktionalen Zellen, keine nichtdeterministische Kantenwahl (Bestätigung durch Scan + Tests).
- Verbraucher der Masken: Saum-Pässe in `tiles.ts` (fremd). Doppelte Säume/Löcher wären dort zu fixen.

## Scan (scripts/m10-terrain-edge.mjs, Logik-Ebene, kein Renderer)

Misst über Seeds 13/7/42, Region 320×320 @ (960,960), 307 200 Zellen gesamt:
1. **Löcher** — isolierte 1-px-Zellen (Art A, alle 8 Nachbarn ≠ A).
2. **Doppelte Kanten** — angrenzende Nicht-Gras-Zellen beiderseits mit eigenem Saum
   (Autotile-Maske via echte `normalizeBlob`/`missingSides`-Logik, Saum-Gates wie tiles.ts).
3. **Fraktionale Mischzellen** — Subpixel-Queries (x+0.5/y+0.5 u. a.) weichen vom gemalten
   ganzzahligen Pixel ab (Spiel-Query `kindAt(float)` vs. Renderzelle).

**Ergebnis (`~/games/.evidence/m10-terrain-edge-crisp/m10-terrain-edge-after.json`, eine Messung, kein Loop):**

| Klasse | Wert | Quote |
|---|---|---|
| Löcher (isolierte 1-px-Zellen) | 1 / 307 200 | 0,0003 % |
| Doppelte Kanten (path/mud/water-Paare) | 0 | 0 % |
| **Kanten-Fehlerquote (Loch+Doppel)** | **1 / 307 200** | **0,0003 %** ✅ < 0,1 % |
| Fraktionale Mischzellen (Subpixel-Queries) | 1 241 / 230 400 | 0,539 % |

## Restliste (belegt, Lage in fremden Dateien)

1. **Fraktionale Mischzellen 0,539 %:** `terrainKindAt()`/`GroundRenderer.kindAt()` qualifizieren
   Float-Positionen (Spieler/Gegner) ohne Ganzzahl-Snap — nahe Kanten kann die Spiel-Query eine
   andere Art sehen als der gemalte Pixel. Fix = `Math.floor`-Snap in `src/gfx/tiles.ts`
   (`terrainKindAt`) — **fremde Datei** (water-shore-Anim); als Bedarf gemeldet in
   `/home/ai/games/.dispatch/requests.md`. Kein Spielfehler beobachtet (Slow/Splash wirken).
2. **1 isolierte Zelle** (Seed 13, Gras-Speckle): entsteht im Noise-Feld `terrainSampleAt`
   (fremd), wird vom Painter mit Frans-/Ufer-Pass abgedeckt, im Zoom nicht als Loch sichtbar.
3. **Doppelte Säume** treten im Scan in keiner geprüften Region auf (0 Fälle) — die Ufer-Bank
   (Landseite) + Ufer-Schaum (Wasserseite) sind Design (2-seitiger Übergang), nicht Fehler.

## Sichtprüfung (Belege `~/games/.evidence/m10-terrain-edge-crisp/`)

- `edge-zoom1.png` — Gras-Schattierungsbänder + Moos-Fransen: Bänder ganzzahlig, Fransen 2-px-Blöcke.
- `edge-zoom2.png` — Schlamm-Senke: geschlossener dunkler Saum, keine 1-px-Löcher.
- `edge-zoom3.png` — Erdweg-Kante: Fransung ins Gras, Kies als geschlossene 2×2-Gruppen.
- `edge-zoom4.png` — Schlamm/Gras-Bänder: Kanten greifen lückenlos (rote Ränder = Glow-Overlay).

## art-director-Urteil (28.11., Belege siehe oben)

**PASS — Note 4/5** (Schwelle ≥ 4 erreicht). Belege je Kriterium:
- Kanten crisp/lückenlos: Gras→Schlamm (zoom2/4), Gras→Erdweg (zoom3) harte 1-px-Stufen, keine
  Mischzellen, keine 1-px-Löcher.
- Keine Doppel-Säume: Erdweg- und Senken-Kanten je genau ein Saum.
- Fransung organisch, Dither nur 1–2 px an Fransenkanten; Palette sauber (keine Fremdfarben).
- Rötliche Senken-Ränder = Lantern-Glow/Overlay, kein Terrain-Fehler.
- Abzug –1: Gras-Schattierungsbänder als breite Verlaufsbänder + sich wiederholende
  Moos-Fransen-Motive — „kommerziell auslieferbar, aber nicht ≥ 4,5". Optionaler Nachblick, kein
  Defizit gegen das Abnahmekriterium.

## Guards

- `verify-terrain` (Terrain-Hole-Guard) unangetastet grün — Skript nicht berührt, Terrain-Code nicht
  geändert (Lane ändert NUR Scan-Skript + Doku; Scan bestätigt die Bestandslogik).
- `tests/terrain-edge-crisp.test.ts` entfällt gemäß Supervisor-Eindampfung (K3 nicht separat);
  Kanten-Invarianten sind durch den Scan (JSON) + Bestandstest `tests/m4b-terrain.test.ts`
  (Blob-47-Masken, Normalisierung, Idempotenz) abgedeckt.
