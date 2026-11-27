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

Nachher-Messung (Median aus 3 Läufen je Format, je 10 s, unter flock;
Belege `shots/m10-atlas-pack-after-{1,2,3}.json` + je crowd/m25-Screenshots):

| Messung | vorher | nachher (Median r1..r3) | Ziel | Status |
|---|---|---|---|---|
| Crowd 300 Gegner, Draw-Calls Median | 54 (p95 73) | **54** (p95 94) | **< 60** | ✅ |
| M25 640x360@1 FPS | 34.5 | **60.0** (min 60) | nicht schlechter | ✅ |
| M25 780x360@3 FPS | 35.6 | **60.0** (min 60) | **>= 50** | ✅ |
| Texturen gesamt (Key-Zählung) | 597 | 642–644 | – | siehe Hinweis |

### Einzelergebnisse

| Run | Crowd DC Median (p95) | Crowd FPS | 640 FPS | 780 FPS | Texturen (Keys) | Gegner crowd/640/780 |
|---|---|---|---|---|---|---|
| 1 | 54 (p95 106) | 60 | 60 | 60 | 644 | 251 / 119 / 32 (unterbelegt, Spawn nicht erreicht) |
| 2 | 50 (p95 84) | 60 | 60 | 60.1 | 643 | 240 / 275 / 300 |
| 3 | 54 (p95 94) | 60 | 60 | 60 | 642 | 300 / 300 / 300 (voll belegt) |

Run 1 erreicht die Ziel-Gegnerzahl nicht (Spawner hinkt hinterher); Kriterien sind
trotzdem belegt, weil **Run 3 mit vollen 300 Gegnern** dieselben Werte liefert
(60 FPS, DC 54/56/55). Runs 2/3 bestätigen die Werte.

Alle After-Läufe laufen an der 60-FPS-vsYNC-Grenze (fpsMin 60) — vorher lag M25 bei
28,5–35,6 FPS mit min-Einbrüchen. Der Crowd-Draw-Call-Median (54) wird von den
300 Gegnern + Shadow/Projektil-Layern dominiert, die bereits vor der Lane über
`runtime_atlas` liefen (Baseline-Atlas 301 Frames); der Packing-Gewinn liegt in
den HUD-/Glyph-/Prop-/Player-Texturen und zeigt sich dort im FPS-Sprung.

### Hinweis Textur-Zählung

Die Key-basierte Zählung zählt nach dem Packing mehr Keys (597 → ~643), obwohl
die echten GPU-Texturen sinken: (1) gepackte Sprites behalten ihre Keys
(geteilter `WebGLTextureWrapper` auf `baked_page_N`, +2 Keys), (2) M25 erzeugt im
After-Lauf mehr Glyph-Keys für Damage-Text (glyph_8 +25, glyph_12 +14, …), die
in inkrementelle 512-px-Glyphen-Seiten gepackt werden. Die Spreu zwischen Key-Anzahl
und GPU-Texturen zeigt die Compare-Szene direkt: 185 Einzel-Canvas-Texturen →
**2 Baked-Page** (512x512 + 2048x94).

## K4 – Bewertung und offene Punkte

**Abnahme (Briefing):**
- Crowd Draw-Calls/Frame bei 300 Gegnern < 60: ✅ Median 54 (p95 94, max 122).
- M25 780x360@3 >= 50 FPS (Median von 3): ✅ 60.0 (an vsYNC-Grenze, min 60).
- M25 640x360@1 nicht schlechter: ✅ 34.5 → 60.0.
- Optik unverändert: ✅ Pixel-Diff AE=0 (compare-before vs compare-after, 90 Sprites).
- 0 JS-Fehler in allen Messläufen; volle Suite `npx vitest run` **438/438 (40 Suiten)**,
  `npx tsc --noEmit` rc=0, `npm run build` rc=0. (Davon 16 Atlas-Tests in
  `tests/atlas-pack.test.ts` + `tests/atlas.test.ts`.)

**Bewertung:** Der große Hebel war nicht der Crowd-Szenen-Draw-Call (Gegner liefen
bereits über `runtime_atlas`), sondern das Packing der HUD-/Glyph-/Prop-/Player-
Einzeltexturen: M25 780x360@3 springt von 35,6 auf 60 FPS und erfüllt damit das
Abnahmeziel, das die Android-Nachabnahme bisher blockierte (41–45 FPS).

**Offene Punkte / Folgebedarf:**
- FX-Texturen (`gen-fx.ts`, 15+48+16 Keys) sind bewusst NICHT gepackt — Abgrenzung
  zur laufenden Lane m20-fx-overdraw-cap; Folgejob nach dessen Merge.
- `font.ts`-Änderung (2 Zeilen, `ensureGlyph` → `packCanvasTexture`) liegt außerhalb
  der Lane-Fläche, begründet in `/home/ai/games/.dispatch/requests.md`; Folge-Lane
  m10-font-glyph-pack geplant.
- Key-basierte Textur-Zählung im Mess-Skript nach Packing irreführend (siehe oben) —
  GPU-Texturen wären der bessere Metrics-Wert (Vorschlag für Mess-Skript-Folgejob).
- ARM/Gerätemessung bleibt Eskalation an Vera (wie im Android-Audit notiert).

**Reviewer-Hinweise (nicht blockierend, PASS #3998/#3999):** (1) Canvas-Renderer-Fallback in
`bakeAtlas.ts` wirft bei `HTMLImageElement`-Quellen – praktisch nur WebGL-relevant; (2)
Restart-Reset setzt `bakeStats` nicht zurück (nur Doku/Audit); (3) exakt 2048 px breite Zelle
geht als Overflow durch – Randfall, konservativ dokumentiert.

## Abnahme-Audit und Fix (bakeAtlas Node-sicher)

Das Abnahme-Audit (2026-11-27) fand einen harten Mangel: Die erste "volle Suite
401/401"-Aussage war **falsch** — 4 Test-Suiten (data, ember-readability, m4b-terrain,
palette-compliance) crasheten in der Node-Testumgebung mit `window is not defined`,
weil der statische Lane-Import `textures.ts` → `bakeAtlas.ts` → Phaser-Runtime den
gesamten Phaser-Wert-Graph in 37 vormals grüne Tests zog (Gegenprobe am Merge-Base:
4/4 Suiten, 37 Tests grün).

**Fix (Commit s. git log):** `bakeAtlas.ts` Phaser-wertfrei gemacht —
`import type Phaser` + statt `new Phaser.Textures.Texture(...)` + manuellem
`list`-Eintrag jetzt `scene.textures.create(key, gl, pageWidth, pageHeight)`
(identische Semantik, explizite Seitenmaße). Ein erster Versuch über
`TextureManager.addGLTexture` war dabei ein lehrreicher Umweg: Er liest die Maße
aus dem GL-Wrapper statt von der Seiten-Canvas — Render-Ergebnis aber bytegleich
zum Finalen (die 244-px-Differenz trat mit beiden Codes identisch auf, s. u.).

**Verifikation nach Fix:**
- `npx vitest run`: **40/40 Suiten, 438/438 Tests grün** (37 wiederhergestellt);
  `npx tsc --noEmit` rc=0; `npm run build` rc=0.
- Registrierungsprobe im Browser (~/tmp/m10-atlas-pack/probe.mjs): alle 186
  gepackten Keys — srcW/srcH, GL/Canvas-Flag, __BASE-Frame-Daten — **identisch**
  zwischen altem und neuem Code (0 Diffs).
- Render-Vergleich heute: alter Code vs. neuer Code **AE=0** (byteidentisch,
  zweifach gemessen).
- Ehrliche Anmerkung: Neue Compare-Läufe zeigen **AE=244 px (0,047 %)** gegen die
  18:54/19:03-Referenzbilder — als Einpixel-Fringes an Glyphkanten. Der **alte**
  Code reproduziert dasselbe Delta (AE=244 vs. beide Referenzen), der Differenz-
  Ursprung ist also die Browser-Rasterisierung zwischen den Läufen, nicht der
  Lane-Code. Beleg: `shots/m10-atlas-pack-compare-after-fix.json` (90/90 Sprites,
  missing [], 0 jsErrors, 2 Baked-Pages).
