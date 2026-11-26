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
- [x] **K2 Lauf ueber alle Assets** — `shots/m10-palette-audit.json` (155 Assets, 257 Frames,
  112.102 opake Pixel). Jede Asset-Klasse hat Pixelzahlen, Summenzeile unten, Befehl unten.
- [x] **K3 Report** — diese Datei. `npx vitest run`: **192/192 Tests gruen** (12 Dateien, 1,36 s).

## Reproduzierbarer Befehl

```bash
cd /home/ai/games/lf-lanes/m10-palette-audit
BASE_SHA=f26dc4b node ~/tmp/m10-palette-audit/audit.mjs "$PWD" shots/m10-palette-audit.json
```

Das Skript hat zwei Aufrufmodi:
- **ohne outPath**: schreibt nichts im Worktree (die FX-Transpilierung geht nach `~/tmp/...`);
- **mit outPath** (Befehl oben): schreibt ausschliesslich die genannte JSON-Datei — das ist der
  gewollte Beleg-Pfad `shots/m10-palette-audit.json`. `src/**`, `scripts/**`, `public/**`, `dist/**`
  werden nie beschrieben, nur gelesen. Die committete Beleg-Kopie
  `shots/m10-palette-audit-harness.mjs` ist seit dem Nachzug (Versuch 2) byte-identisch mit dem
  ausgefuehrten `~/tmp/m10-palette-audit/audit.mjs` (siehe unten).

## Nachpruefung Versuch 2 (Basis a02b492)

- Harness auf HEAD erneut gelaufen (Ausgabe nach `~/tmp/m10-palette-audit/verify.json`, ausserhalb
  des Worktrees), rc=0.
- `summary` ist bit-identisch zum committeten `shots/m10-palette-audit.json`; 155/155 Assets,
  257/257 Frames, **0 abweichende Assets**, 0 Off-Palette.
- Korrektur 1: K2/Summenzeile nannten zuvor 259 Frames; korrekt sind **257** (96+18+42+18+2+81).
- Korrektur 2: Die Pixel-Summe war mit 122.102 um 10.000 zu hoch; nachgerechnet aus dem JSON sind
  es **112.102** (28.113+43.064+21.608+2.527+2.154+14.636). Die Per-Klasse-Zeilen waren richtig.
- Korrektur 3: Die Spalte „Groesstes Loch" enthielt teils die Summe aller Lochpixel. Sie heisst
  jetzt „Loecher gesamt / groesstes" und nennt beide Zahlen; Figuren mit 0 Kontur-Luecke stehen in
  einer eigenen Loch-Kandidaten-Liste statt zwischen den Kontur-Verstoessen.
- Korrektur 4: „0 Halbtransparenz" und FX-„0 Off-Palette" sind Konstruktions-Eigenschaften, nicht
  separat gemessen — Wortlaut im Messverfahren und in Befund 1/2 entsprechend praezisiert.
- Harness ergaenzt um einen harten Zeilenbreiten-/Zeilenzahl-Check (`fromGrid`), damit
  zu kurze Grid-Zeilen nicht stillschweigend als Loecher zaehlen; erneuter Lauf danach weiterhin
  bit-identisch.
- `npx tsc --noEmit` rc=0; `npx vitest run` 192/192 gruen.

## Messverfahren

- **Pixel gesamt**: opake Pixel im Frame-Grid (`.` ist transparent, `0-9`/`a-v` sind Palettenindizes 0–31).
- **Off-Palette**: Bei den Grid-Klassen (enemies, bosses, chars, icons, ui) echte Messung: Zeichen
  ausserhalb `0-9a-v` werden `-2` (invalid) und als Off-Palette gezaehlt; zusaetzlich werden Indizes
  ausserhalb 0–31 abgewiesen. Bei `gen-fx.ts` werden die Canvas-Pixel ueber ihre Hex-Farbe zurueck
  auf den Palettenindex geprueft — dort ist die Pruefung aber **per Konstruktion tautologisch**:
  `gen-fx.ts` setzt `fillStyle` ausschliesslich aus `hex(idx)` mit `idx` aus `PAL`, und ungueltige
  Zeichen werden vorher zu `NaN` und via `continue` stillschweigend transparent (nicht Off-Palette).
  FX-Off-Palette 0 ist deshalb kein Qualitaetsbeleg, sondern eine Folgerung.
- **Loecher**: transparente Pixel, die von aussen per Flood-Fill (4-Nachbarn) nicht erreichbar sind,
  also echt in der Silhouette eingeschlossen. Grosse Loecher in Ringen/Halos sind gewollt, in
  Figuren meist nicht — die Liste ist eine Kandidatenliste, kein Auto-Fail.
- **Kontur**: Randpixel = opak mit mindestens einem transparenten 4-Nachbarn. `contourMissing` zaehlt
  Randpixel, deren Index nicht 0 (`ink`) ist. `contourGlow` sind davon Index 12/13 (Glow-Kern).
  Ausnahmen laut `ART.md`: Bodenschatten/Partikel und additive Glow-FX duerfen ohne Tinte sein.
- **Halbtransparenz**: Grids kennen nur `.` (transparent) oder einen Palettenindex, das
  Boot-Rendering nutzt `fillStyle` + `fillRect` ohne Smoothing und ohne `rgba()`/`globalAlpha`.
  Der Harness parst deshalb keine Alpha-Werte (das JSON hat kein Alpha-Feld): **0
  Halbtransparenz-Kanten ist eine Konstruktions-Eigenschaft der Texturen**, keine separate Messung.
  Runtime-Alpha (Fades, Trails, Licht) ist gewollt und nicht Teil dieser Textur-Messung.

## Tabelle je Asset-Klasse (Basis f26dc4b)

| Asset-Klasse | Assets | Frames | Pixel | Off-Palette | Off-Palette % | Loecher | Kontur fehlt | Kontur % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| enemies (30 Gegner) | 30 | 96 | 28.113 | 0 | 0,000 % | 129 | 418 / 7.577 | 5,5 % |
| bosses (6) | 6 | 18 | 43.064 | 0 | 0,000 % | 2.154 | 1.850 / 7.999 | 23,1 % |
| chars (16 Player-Sheets + 2 Portraits) | 18 | 42 | 21.608 | 0 | 0,000 % | 1 | 440 / 4.022 | 10,9 % |
| icons (18) | 18 | 18 | 2.527 | 0 | 0,000 % | 3 | 20 / 780 | 2,6 % |
| ui (Logo + 9-Slice) | 2 | 2 | 2.154 | 0 | 0,000 % | 0 | 106 / 432 | 24,5 % |
| fx (19 Motive, 81 Texturen) | 81 | 81 | 14.636 | 0 | 0,000 % | 3.007 | 5.138 / 5.267 | 97,6 %* |
| **Summe** | **155** | **257** | **112.102** | **0** | **0,000 %** | **5.294** | **7.972 / 26.077** | **30,6 %** |

\* FX sind laut `ART.md`/`GAME.md` additive Glow-Effekte ohne Tinten-Kontur; die 97,6 % sind
deshalb **erwartet und keine Verstossliste**. Die Loecher in Ringen/Halos sind gewollt (hohle
Mitte). FX-Off-Palette ist per Konstruktion 0 (siehe Messverfahren), also kein Qualitaetsbeleg.

Damit sind **155/155 Assets gemessen** (0 Assets ohne Messung). Die 38 Figuren-Sprites im Sinne
des Briefings (30 Gegner + 6 Bosse + 2 Portraits) sind vollstaendig enthalten.

## Befund

1. **Off-Palette: 0 Pixel in 112.102 Pixeln (0,000 %).** Fuer die Grid-Klassen ist das gemessen
   (Zeichen ausserhalb `0-9a-v` werden als invalid gezaehlt); fuer FX folgt es aus dem Generator
   (nur `hex(idx)` aus `PAL`). Es gibt keinen Nicht-Paletten-Farbwert in den Texturen — das ist die
   haerteste Zahl dieses Audits, mit dem genannten FX-Vorbehalt.
2. **Halbtransparenz: 0 Kanten** — Konstruktions-Eigenschaft der Grids (nur `.` oder Palettenindex),
   nicht als Alpha-Messung erhoben.
3. **Kontur ist das reale Problem**: 7.972 von 26.077 Randpixeln sind nicht `ink` (30,6 %).
   Hauptlast liegt bei Bossen (23,1 %), Portraits (22,9–29,3 %) und der Spinne (59–62 %).

## Top-20-Verstoesse: fehlende Kontur (priorisiert, Basis f26dc4b)

Sortierung: fehlende Konturpixel absolut absteigend, bei Gleichstand groesstes Loch.
Figuren mit 0 fehlender Kontur, aber eingeschlossenen Loechern, stehen in der separaten
Loch-Liste darunter. Koordinaten sind `(x,y)` im Frame-Raster; Kontur-Koordinaten nennen
zusaetzlich den gefundenen Palettenindex. Die Loch-Spalte zeigt immer
`Loecher gesamt / groesstes Loch` (px @ x,y), damit Summe und Einzelkomponente nicht verwechselt werden.

| # | Asset / Frame | Raster | Kontur fehlt | Loecher gesamt / groesstes | Erste Koordinate | Empfehlung (Lane → Datei) |
|---:|---|---|---:|---|---|---|
| 1 | `boss_hollow_king_2` | 96×96 | 643 / 1098 (58,6 %) | 415 / 24 px @ (44,54) | (44,5) idx22 | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| 2 | `boss_hollow_king_1` | 96×96 | 597 / 1024 (58,3 %) | 395 / 24 px @ (44,52) | (44,3) idx22 | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| 3 | `boss_hollow_king_0` | 96×96 | 596 / 1028 (58,0 %) | 397 / 24 px @ (44,54) | (44,5) idx22 | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| 4 | `ui_frame_0` | 24×24 | 92 / 92 (100,0 %) | 0 | (0,0) idx7 | m9-art-fx-ui → `src/gfx/gen-ui.ts` |
| 5 | `portrait_kael_0` | 48×48 | 44 / 150 (29,3 %) | 0 | (2,47) idx3 | m10-art-chars → `src/gfx/gen-chars.ts` |
| 6 | `enemy_spider_0` | 24×24 | 42 / 68 (61,8 %) | 4 / 1 px @ (4,11) | (14,7) idx9 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 7 | `enemy_spider_1` | 24×24 | 42 / 68 (61,8 %) | 2 / 1 px @ (12,12) | (15,7) idx9 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 8 | `enemy_spider_2` | 24×24 | 42 / 68 (61,8 %) | 4 / 1 px @ (4,11) | (14,7) idx9 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 9 | `portrait_mira_0` | 48×48 | 40 / 175 (22,9 %) | 0 | (4,47) idx25 | m10-art-chars → `src/gfx/gen-chars.ts` |
| 10 | `enemy_spider_3` | 24×24 | 39 / 66 (59,1 %) | 7 / 5 px @ (11,15) | (13,7) idx9 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 11 | `player_mira_side_0` | 32×32 | 15 / 102 (14,7 %) | 0 | (31,23) idx17 | m10-art-chars → `src/gfx/gen-chars.ts` |
| 12 | `enemy_lich_2` | 28×28 | 14 / 122 (11,5 %) | 0 | (8,0) idx21 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 13 | `title_logo_0` | 96×56 | 14 / 340 (4,1 %) | 0 | (95,32) idx7 | m9-art-fx-ui → `src/gfx/gen-ui.ts` |
| 14 | `enemy_treant_2` | 28×28 | 13 / 134 (9,7 %) | 8 / 8 px @ (21,5) | (2,0) idx31 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 15 | `enemy_knight_1` | 28×28 | 11 / 103 (10,7 %) | 1 / 1 px @ (13,21) | (12,0) idx27 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 16 | `player_mira_hit_0` | 32×32 | 11 / 110 (10,0 %) | 1 / 1 px @ (16,27) | (19,0) idx25 | m10-art-chars → `src/gfx/gen-chars.ts` |
| 17 | `evo_thorn_storm_0` | 16×16 | 11 / 63 (17,5 %) | 0 | (15,2) idx30 | m9-art-fx-ui → `src/gfx/gen-icons.ts` |
| 18 | `boss_moor_queen_2` | 56×56 | 10 / 187 (5,3 %) | 40 / 40 px @ (22,21) | (9,55) idx28 | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| 19 | `enemy_treant_0` | 28×28 | 10 / 130 (7,7 %) | 8 / 8 px @ (21,7) | (3,27) idx14 | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| 20 | `enemy_treant_1` | 28×28 | 10 / 131 (7,6 %) | 8 / 8 px @ (21,6) | (4,27) idx14 | m10-art-enemies → `src/gfx/gen-enemies.ts` |

## Loch-Kandidaten: Figuren ohne Kontur-Luecke

Diese Frames haben keine fehlende Kontur, aber eingeschlossene transparente Pixel — meist
gewollte Oeffnungen (Ring-Mitte, Finger-Zwischenraum) oder echte Silhouetten-Loecher. Kandidatenliste,
kein Auto-Fail.

| Asset / Frame | Raster | Loecher gesamt | Komponenten | Groesstes Loch | Empfehlung (Lane → Datei) |
|---|---|---:|---:|---|---|
| `boss_coven_0` | 96×96 | 235 | 2 | 119 px @ (56,54) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_coven_1` | 96×96 | 227 | 2 | 118 px @ (56,52) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_pale_shepherd_0` | 72×72 | 166 | 3 | 131 px @ (49,12) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_pale_shepherd_1` | 72×72 | 158 | 5 | 119 px @ (49,12) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_coven_2` | 96×96 | 89 | 13 | 25 px @ (84,53) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `enemy_imp_1` | 28×28 | 8 | 3 | 6 px @ (21,12) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_imp_2` | 28×28 | 8 | 3 | 6 px @ (21,11) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_voidcaller_1` | 32×32 | 6 | 4 | 3 px @ (18,2) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_voidcaller_0` | 32×32 | 5 | 3 | 3 px @ (18,3) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_voidcaller_3` | 32×32 | 5 | 3 | 3 px @ (18,2) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_cultist_0` | 24×24 | 3 | 1 | 3 px @ (17,10) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_cultist_1` | 24×24 | 3 | 1 | 3 px @ (17,9) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_cultist_2` | 24×24 | 3 | 1 | 3 px @ (17,8) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_cultist_3` | 24×24 | 3 | 1 | 3 px @ (17,9) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_banshee_2` | 24×24 | 2 | 1 | 2 px @ (8,18) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `weapon_thorn_0` | 16×16 | 2 | 2 | 1 px @ (10,9) | m9-art-fx-ui → `src/gfx/gen-icons.ts` |
| `enemy_golem_0` | 24×24 | 1 | 1 | 1 px @ (7,8) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_golem_1` | 24×24 | 1 | 1 | 1 px @ (7,7) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_golem_2` | 24×24 | 1 | 1 | 1 px @ (7,6) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_golem_3` | 24×24 | 1 | 1 | 1 px @ (7,7) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_imp_0` | 28×28 | 1 | 1 | 1 px @ (18,18) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `enemy_imp_3` | 28×28 | 1 | 1 | 1 px @ (18,17) | m10-art-enemies → `src/gfx/gen-enemies.ts` |
| `boss_bone_lord_0` | 64×64 | 1 | 1 | 1 px @ (24,28) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_bone_lord_1` | 64×64 | 1 | 1 | 1 px @ (24,26) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_bone_lord_2` | 64×64 | 1 | 1 | 1 px @ (24,28) | m10-art-bosses → `src/gfx/gen-bosses.ts` |
| `boss_bell_golem_2` | 80×80 | 1 | 1 | 1 px @ (23,50) | m10-art-bosses → `src/gfx/gen-bosses.ts` |

## FX-Ausnahmen (gemessen, nicht als Verstoss gewertet)

Additive Glow-/Partikel-FX brauchen laut `ART.md` keine Tinten-Kontur. Die groessten
eingeschlossenen Loecher sind meist die hohle Ring-Mitte und damit korrekt:

| FX-Textur | Pixel | Kontur fehlt | Loecher gesamt / groesstes | Einordnung |
|---|---|---:|---|---|
| `fx_shock_4` | 632 | 394 (100 %) | 706 / 458 px @ (23,11) | Explosionsring, hohle Mitte gewollt |
| `fx_seal_5` | 166 | 160 (100 %) | 331 / 331 px @ (11,6) | Siegel-Rune, Innenraum gewollt |
| `fx_halo_cold_2` | 176 | 116 (100 %) | 256 / 256 px @ (9,3) | Kalter Halo, Ring-Mitte gewollt |
| `fx_pillar_3` | 536 | 160 (100 %) | 0 / 0 | Lichtsaeule, Glow ohne Tinte gewollt |

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

Off-Palette (0 Pixel; Grids gemessen, FX konstruktionsbedingt) und Anti-Aliasing (Texturen sind
diskret) brauchen **keine** Karte.
