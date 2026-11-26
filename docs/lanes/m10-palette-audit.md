# Lane m10-palette-audit — harte Pixelqualitaets-Zahlen

Basis-SHA: **f26dc4b** (Worktree `/home/ai/games/lf-lanes/m10-palette-audit`, Branch `m10-palette-audit`).
Alle Zahlen unten gelten fuer genau diesen Stand. Der Merge der Lane `m8-display` lief waehrend der
Messung noch; deshalb ist jede Tabelle mit der Basis-SHA zu lesen.

Ziel: Augenmass durch Messung ersetzen. Jedes gerenderte Sprite-/FX-/UI-Frame wird gegen die
32 Farben aus `src/palette.ts` geprueft: Off-Palette-Pixel, Halbtransparenz-Kanten und fehlende
1-px-Kontur. Ergebnis ist eine priorisierte Verstossliste fuer die naechsten Art-Karten.

## Checkliste (Karten-Plan)

- [x] **K1 Harness** — Node-Skript `~/tmp/m10-palette-audit/audit.mjs` liest die Grids aus
  `src/gfx/gen-enemies.ts`, `gen-bosses.ts`, `gen-chars.ts`, `gen-fx.ts`, `gen-icons.ts`, `gen-ui.ts`
  und die 32 Indizes aus `src/palette.ts`. Es zaehlt je Frame Pixel, Off-Palette, transparente
  Loecher und Kontur-Randpixel. Laeuft auf HEAD ohne Schreibzugriff im Worktree (rc=0).
  Beleg-Kopie: `shots/m10-palette-audit-harness.mjs`, Lauf-Log `shots/m10-palette-audit-harness.log`.
- [x] **K2 Lauf ueber alle Assets** — `shots/m10-palette-audit.json` (155 Assets, 259 Frames,
  122.102 opake Pixel). Jede Asset-Klasse hat Pixelzahlen, Summenzeile unten, Befehl unten.
- [x] **K3 Report** — diese Datei. `npx vitest run`: **192/192 Tests gruen** (12 Dateien, 1,36 s).

## Reproduzierbarer Befehl

```bash
cd /home/ai/games/lf-lanes/m10-palette-audit
BASE_SHA=f26dc4b node ~/tmp/m10-palette-audit/audit.mjs "$PWD" shots/m10-palette-audit.json
```

Das Skript schreibt nur nach `shots/m10-palette-audit.json` (bzw. nach `~/tmp/...` fuer die
FX-Transpilierung). Es liest `src/**` und `scripts/**` ausschliesslich.

## Messverfahren

- **Pixel gesamt**: opake Pixel im Frame-Grid (`.` ist transparent, `0-9`/`a-v` sind Palettenindizes 0–31).
- **Off-Palette**: Zeichen ausserhalb `0-9a-v`, Indizes ausserhalb 0–31 oder Hex-Werte, die nicht in
  `PAL` stehen. Bei `gen-fx.ts` werden die zur Laufzeit erzeugten Canvas-Pixel ueber ihre Hex-Farbe
  zurueck auf den Palettenindex geprueft.
- **Loecher**: transparente Pixel, die von aussen per Flood-Fill (4-Nachbarn) nicht erreichbar sind,
  also echt in der Silhouette eingeschlossen. Grosse Loecher in Ringen/Halos sind gewollt, in
  Figuren meist nicht — die Liste ist eine Kandidatenliste, kein Auto-Fail.
- **Kontur**: Randpixel = opak mit mindestens einem transparenten 4-Nachbarn. `contourMissing` zaehlt
  Randpixel, deren Index nicht 0 (`ink`) ist. `contourGlow` sind davon Index 12/13 (Glow-Kern).
  Ausnahmen laut `ART.md`: Bodenschatten/Partikel und additive Glow-FX duerfen ohne Tinte sein.
- **Halbtransparenz**: die Grids haben nur transparent oder voll opak, das Boot-Rendering nutzt
  `fillRect` ohne Smoothing. Gemessen: **0 Halbtransparenz-Kanten** in allen 259 Frames. Runtime-Alpha
  (Fades, Trails, Licht) ist gewollt und nicht Teil dieser Textur-Messung.

## Tabelle je Asset-Klasse (Basis f26dc4b)

| Asset-Klasse | Assets | Frames | Pixel | Off-Palette | Off-Palette % | Loecher | Kontur fehlt | Kontur % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| enemies (30 Gegner) | 30 | 96 | 28.113 | 0 | 0,000 % | 129 | 418 / 7.577 | 5,5 % |
| bosses (6) | 6 | 18 | 43.064 | 0 | 0,000 % | 2.154 | 1.850 / 7.999 | 23,1 % |
| chars (16 Player-Sheets + 2 Portraits) | 18 | 42 | 21.608 | 0 | 0,000 % | 1 | 440 / 4.022 | 10,9 % |
| icons (18) | 18 | 18 | 2.527 | 0 | 0,000 % | 3 | 20 / 780 | 2,6 % |
| ui (Logo + 9-Slice) | 2 | 2 | 2.154 | 0 | 0,000 % | 0 | 106 / 432 | 24,5 % |
| fx (19 Motive, 81 Texturen) | 81 | 81 | 14.636 | 0 | 0,000 % | 3.007 | 5.138 / 5.267 | 97,6 %* |
| **Summe** | **155** | **259** | **122.102** | **0** | **0,000 %** | **5.294** | **7.972 / 26.077** | **30,6 %** |

\* FX sind laut `ART.md`/`GAME.md` additive Glow-Effekte ohne Tinten-Kontur; die 97,6 % sind
deshalb **erwartet und keine Verstossliste**. Die Loecher in Ringen/Halos sind gewollt (hohle
Mitte). Fuer FX ist nur Off-Palette relevant: 0.

Damit sind **155/155 Assets gemessen** (0 Assets ohne Messung). Die 38 Figuren-Sprites im Sinne
des Briefings (30 Gegner + 6 Bosse + 2 Portraits) sind vollstaendig enthalten.

## Befund

1. **Off-Palette: 0 Pixel in 122.102 Pixeln (0,000 %).** Die Generatoren sind palette-treu; es gibt
   keinen einzigen Nicht-Paletten-Farbwert in den Texturen. Das ist die haerteste Zahl dieses Audits.
2. **Halbtransparenz: 0 Kanten.** Kein Anti-Aliasing in den Grid-Texturen.
3. **Kontur ist das reale Problem**: 7.972 von 26.077 Randpixeln sind nicht `ink` (30,6 %).
   Hauptlast liegt bei Bossen (23,1 %), Portraits (22,9–29,3 %) und der Spinne (59–62 %).

## Top-20-Verstoesse (priorisiert, Basis f26dc4b)

Rangfolge: Figuren mit fehlender Kontur vor eingeschlossenen Loechern vor UI/FX-Sonderfaellen.
Koordinaten sind `(x,y)` im Frame-Raster; bei Kontur zusaetzlich der gefundene Palettenindex.

| # | Asset / Frame | Raster | Kontur fehlt | Groesstes Loch | Erste Koordinate | Empfehlung (Lane → Datei) |
|---:|---|---|---:|---:|---|---|
| 1 | `boss_hollow_king_2` | 96×96 | 643 / 1.098 (58,6 %) | 24 px @ (44,54) | (44,5) idx22 | Boss-Kontur schliessen → `m10-art-bosses` → `src/gfx/gen-bosses.ts` |
| 2 | `boss_hollow_king_1` | 96×96 | 597 / 1.024 (58,3 %) | 24 px @ (44,52) | (44,3) idx22 | wie #1; Mantel-/Dornenrand auf Index 0 legen |
| 3 | `boss_hollow_king_0` | 96×96 | 596 / 1.028 (58,0 %) | 24 px @ (44,54) | (44,5) idx22 | wie #1; alle drei Frames gemeinsam fixen |
| 4 | `boss_coven_0` | 96×96 | 0 / 481 (0 %) | 235 px @ (56,54) | – | Loch zwischen Figuren/Aermen pruefen, sonst schliessen → `gen-bosses.ts` |
| 5 | `boss_pale_shepherd_0` | 72×72 | 0 / 305 (0 %) | 166 px @ (49,12) | – | Sichel-/Kapuzen-Loch pruefen → `gen-bosses.ts` |
| 6 | `boss_coven_1` | 96×96 | 0 / 480 (0 %) | 227 px @ (56,52) | – | wie #4 |
| 7 | `boss_pale_shepherd_1` | 72×72 | 0 / 317 (0 %) | 158 px @ (49,12) | – | wie #5 |
| 8 | `portrait_kael_0` | 48×48 | 44 / 150 (29,3 %) | 0 | (2,47) idx3 | Rahmen-Unterkante auf Tinte → `m10-art-chars` → `src/gfx/gen-chars.ts` |
| 9 | `portrait_mira_0` | 48×48 | 40 / 175 (22,9 %) | 0 | (4,47) idx25 | wie #8 |
| 10 | `enemy_spider_0` | 24×24 | 42 / 68 (61,8 %) | 4 px | (14,7) idx9 | Beine/Koerper mit 1-px-Tinte umziehen → `m10-art-enemies` → `src/gfx/gen-enemies.ts` |
| 11 | `enemy_spider_1` | 24×24 | 42 / 68 (61,8 %) | 2 px | (15,7) idx9 | wie #10 (alle Frames) |
| 12 | `enemy_spider_2` | 24×24 | 42 / 68 (61,8 %) | 4 px | (14,7) idx9 | wie #10 |
| 13 | `enemy_spider_3` | 24×24 | 39 / 66 (59,1 %) | 7 px | (13,7) idx9 | wie #10; Loch bei (11,15) schliessen |
| 14 | `enemy_lich_2` | 28×28 | 14 / 122 (11,5 %) | 0 | (8,0) idx21 | obere Kante/Krone auf Tinte → `gen-enemies.ts` |
| 15 | `enemy_treant_2` | 28×28 | 13 / 134 (9,7 %) | 8 px @ (21,5) | (2,0) idx31 | Rindenrand/Krone → `gen-enemies.ts` |
| 16 | `enemy_knight_1` | 28×28 | 11 / 103 (10,7 %) | 1 px | (12,0) idx27 | Helm-Rand → `gen-enemies.ts` |
| 17 | `enemy_treant_0` | 28×28 | 10 / 130 (7,7 %) | 8 px @ (21,7) | (3,27) idx14 | wie #15 |
| 18 | `boss_moor_queen_2` | 56×56 | 10 / 187 (5,3 %) | 40 px @ (22,21) | (9,55) idx28 | Maul-/Bauch-Loch und Unterkante → `gen-bosses.ts` |
| 19 | `evo_thorn_storm_0` | 16×16 | 11 / 63 (17,5 %) | 0 | (15,2) idx30 | Icon-Kontur unten rechts → `m9-art-fx-ui` → `src/gfx/gen-icons.ts` |
| 20 | `ui_frame_0` | 24×24 | 92 / 92 (100 %) | 0 | (0,0) idx7 | **Review**: 9-Slice ist laut ART Gold-Rahmen; wenn Tinte gewollt, Rand auf 0 → `m9-art-fx-ui` → `src/gfx/gen-ui.ts` |

## FX-Ausnahmen (gemessen, nicht als Verstoss gewertet)

Additive Glow-/Partikel-FX brauchen laut `ART.md` keine Tinten-Kontur. Die groessten
eingeschlossenen Loecher sind meist die hohle Ring-Mitte und damit korrekt:

| FX-Textur | Pixel | Kontur fehlt | Loecher | Groesstes Loch | Einordnung |
|---|---:|---:|---:|---:|---|
| `fx_shock_4` | 632 | 394 (100 %) | 706 | 458 px @ (23,11) | Explosionsring, hohle Mitte gewollt |
| `fx_seal_5` | 166 | 160 (100 %) | 331 | 331 px @ (11,6) | Siegel-Rune, Innenraum gewollt |
| `fx_halo_cold_2` | 176 | 116 (100 %) | 256 | 256 px @ (9,3) | Kalter Halo, Ring-Mitte gewollt |
| `fx_pillar_3` | 536 | 160 (100 %) | 0 | – | Lichtsaeule, Glow ohne Tinte gewollt |

Falls diese Effekte doch eine harte Aussenkante bekommen sollen, gehoert das in eine eigene
VFX-Karte (`m9-art-fx-ui` → `src/gfx/gen-fx.ts`), nicht in die Sprite-Karten.

## Empfehlung fuer die naechsten Art-Karten

1. **`m10-art-bosses`** (`src/gfx/gen-bosses.ts`): Hollow King (3 Frames) und Coven/Pale Shepherd
   Kontur und Loecher. Groesster Einzelhebel: 1.850 fehlende Konturpixel bei Bossen.
2. **`m10-art-enemies`** (`src/gfx/gen-enemies.ts`): Spinne (4 Frames), Lich, Treant, Ritter.
   Spider allein 165 fehlende Konturpixel; Beine duenn, daher Tinte aussen nachziehen.
3. **`m10-art-chars`** (`src/gfx/gen-chars.ts`): Portraits Mira/Kael Unterkante/Rahmen (84 Pixel).
4. **`m9-art-fx-ui`** (`src/gfx/gen-icons.ts`, `src/gfx/gen-ui.ts`): `evo_thorn_storm` und
   `ui_frame` — erst visuell pruefen, ob Gold-Rahmen bewusst ohne Tinte ist.

Off-Palette und Anti-Aliasing brauchen **keine** Karte: beide sind mit 0 belegt.
