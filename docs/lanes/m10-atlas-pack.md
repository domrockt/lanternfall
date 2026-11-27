# Lane m10-atlas-pack – Runtime-Atlas-Pack (M10)

Ziel (Wunsch von Dom): 581 Einzeltexturen und 383–499 Draw-Calls/Frame (Android-Audit m10-android-perf)
drücken, indem alle massenhaft gezeichneten prozeduralen Sprites nach der Erzeugung in wenige
Atlas-Seiten (<= 2048 px) gepackt werden, damit Phaser im Batch zeichnet.

## K1 – Baseline (`shots/m10-atlas-pack-before.json`, Commit 7fb966a)

Mess-Skript `scripts/m10-atlas-pack.mjs` (Playwright, echter drawArrays/drawElements-Hook vor
Spielstart, Median/p95 pro rAF-Frame; FPS unter `flock /home/ai/games/.lf-perf.lock`).

| Messung | Wert |
|---|---|
| Texturen gesamt | 597 (Atlas-Frames: 301, nicht-atlas Keys: 596 gemessen am Key-Bestand) |
| Crowd 300 Gegner (960x540@1) | FPS 38.5, Draw-Calls Median **54**, p95 73, max 74 |
| M25 640x360@1 | FPS 34.5, Draw-Calls Median 41 (p95 80) |
| M25 780x360@3 | FPS 35.6, Draw-Calls Median 62 (p95 108) |

Größte Textur-Gruppen: ~30 Glyph-Fonts (je 25–39 Einzelsprites), 24 Enemy-Typen à 3–5,
player_kael/mira je 25, fx_evo 48, fx_death 16, enemy_shot 9.

## K2 – Packer (Commits c55e141, 5040fc4, 91f84e3)

- `src/gfx/atlas.ts`: **packPages** – pure, deterministische Shelf-Sortierung (Höhe abwärts, dann Key),
  Seiten <= 2048 px, GUTTER 2 px + PAD 1 px (Bleeding-Schutz), NEAREST. Überlauf wirft (Test abgesichert).
- `src/gfx/bakeAtlas.ts`: **bakeStaticAtlas(scene)** – kopiert die erzeugten Canvas-Texturen
  (props, icons, player, portraits, glyphs, …) nach der prozeduralen Erzeugung in `baked_page_N`-Seiten
  und registriert die Frames unter den **Original-Keys** → Aufrufer bleiben unverändert.
  Restart-fest: `ensurePagesValid()` erkennt geleerten TextureManager (baked_page_0 fehlt) und
  resettet `bakedPages` + `staticBaked`; `CanvasTexture.refresh()` nach jedem Glyphen-Zeichnen
  (Seite war sonst beim Preload-Upload eingefroren); inkrementelle Glyphen-Seiten 512 px
  (Refresh kostet dann 1 MB statt 16 MB).
- Umleitung minimal: `textures.ts` +1 Import + `bakeStaticAtlas(scene)` am Ende von `createAllTextures`;
  `font.ts` 2 Zeilen (`ensureGlyph` → `packCanvasTexture`) – liegt außerhalb der Lane-Fläche,
  begründet in `/home/ai/games/.dispatch/requests.md` (~250 Glyph-Einzeltexturen sind die Hauptquelle
  der Texturwechsel bei HUD/Damage-Text).
- `src/gfx/gen-fx.ts` wurde **nicht** angefasst (m20-fx-overdraw-cap läuft dort; FX-Texturen folgen
  nach dessen Merge in einem Folgejob).
- Tests: `tests/atlas-pack.test.ts` + `tests/atlas.test.ts` **16/16 grün**, `npx tsc --noEmit` rc=0,
  `npm run build` rc=0. Test deckt ab: 0 Überlappung (inkl. Pad-Zellen), Seiten <= 2048,
  Determinismus gegen umsortierte Eingabe, Overflow, Coverage.

### Baked pages in der Compare-Szene

90 Sprites (13 props, 18 icons, 52 player, 2 portraits, 101 glyphs), `missing: []`:
`baked_page_0` 512x512, `baked_page_1` 2048x94 → **2 Seiten** statt 185 Einzeltexturen
in dieser Szene.

## K3 – Messen nachher + Optik

Vergleichsbild: `shots/m10-atlas-pack-compare-before.png` vs `...-compare-after.png`,
kontrollierte statische Szene vor/nach Baking → **Pixel-Diff AE=0** (Optik unverändert,
Beleg in Commit df0633f).

Nachher-Messung (Median aus 3 Läufen je Format, je 10 s):

| Messung | vorher | nachher (Median r1..r3) | Ziel |
|---|---|---|---|
| Texturen gesamt | 597 | TBD | – |
| Crowd 300 Gegner, Draw-Calls Median | 54 (p95 73) | TBD | **< 60** |
| M25 640x360@1 FPS | 34.5 | TBD | nicht schlechter |
| M25 780x360@3 FPS | 35.6 | TBD | **>= 50** |

### Einzelergebnisse

| Run | Crowd DC Median (p95) | Crowd FPS | 640 FPS | 780 FPS | Texturen |
|---|---|---|---|---|---|
| 1 | TBD | TBD | TBD | TBD | TBD |
| 2 | TBD | TBD | TBD | TBD | TBD |
| 3 | TBD | TBD | TBD | TBD | TBD |

## K4 – Bewertung und offene Punkte

- TBD nach Messung.
- Reviewer-Hinweise (nicht blockierend, PASS #3998/#3999): (1) Canvas-Renderer-Fallback in
  `bakeAtlas.ts` wirft bei `HTMLImageElement`-Quellen – praktisch nur WebGL-relevant; (2)
  Restart-Reset setzt `bakeStats` nicht zurück (nur Doku/Audit); (3) exakt 2048 px breite Zelle
  geht als Overflow durch – Randfall, konservativ dokumentiert.
