# Lane m10-loading-screen — Ladescreen + GPU-Warmup (Dom-Ziel 2026-11-28)

Ziel: "Beim Start vom Spiel laden alle Sprites erst rein — das muss der Spieler nicht sehen."
Ladescreen (Laterne + Fortschrittsbalken), danach Titel. Kein sichtbares Nachladen/Popping danach.

## K1 — Inventar: alle lazy erzeugten Texturen/Atlanten/Glyphen/Audio

### A. Entsteht heute im Boot PRE-Title (kein Pop-in, bleibt dort bzw. wandert in Loading)
| Was | Quelle | Keys |
|---|---|---|
| Titel-Bilder | `createTitleTextures` (Boot.ts) über GEN_TITLE | `title_*` |
| Menü-Rahmen + Logo | GEN_UI Subset | `ui_frame`, `title_logo` |
| Licht/Vignette | Boot.ts Local-Kopien (eaf2ab6-Stufen) | `light_radius`, `vignette` |
| Audio-WAVs | `AudioSystem.preload` (Boot.preload) | `sfx_*` (Loader) |

### B. Entsteht heute NACH dem ersten Titel-Frame (Boot.scheduleWarmup → Pop-in-Risiko)
| Was | Quelle |
|---|---|
| Chars + Platzhalter-Sprites | `createCharTextures`, `SPRITE_GRIDS` (textures.ts `createAllTextures`) |
| Gegner (inkl. Elite-Rims), Bosse | `createEnemyTextures`, `createBossTextures` |
| Rest GEN_TITLE / GEN_UI (alle Frames) / GEN_PROPS | `createAllTextures` |
| Shadow, FX, Rings, Gegner-Projektile, Telegraphen, Icons | `createAllTextures` |
| Statischer Baked-Atlas | `bakeStaticAtlas` → `baked_page_0..n` |
| Runtime-Atlas (heiße Klassen) | `buildRuntimeAtlas` → `runtime_atlas` |

### C. Lazy-Glyphen (PixelText, pro Erstanzeige)
- `ensureGlyph` (src/gfx/font.ts): Key `glyph_{colorIndex}_{charcode}`, 5x7-Canvas, landet im
  inkrementellen Baked-Atlas. Zeichensatz = `GLYPHS` (src/gfx/glyphs.ts): A-Z, a-z, Ä Ö Ü ä ö ü ß,
  0-9, Satzzeichen (`: . , / % + - = & [ ] ! < > ? ( ) ' * ·`). Space erzeugt keine Textur.
- Farben in Benutzung (Scan `PixelText(` / `setColorIndex`): C.bone, C.lantern, C.candleWhite,
  C.mist, C.amber, C.fog, C.paleMist, C.nightMid, C.crimson, C.nightSlate, C.ink — plus dynamische
  Farben (DamageNumbers `v.color`, UI-Banner). → Warmup nimmt **alle 32 Palettenfarben**
  (770–2240 Glyphen; inkrementelle 512er-Seite fasst ~2.000 Glyphen, Ladekosten ein Häppchen).

### D. Titel-Laufzeit (View-abhängig, Title.create — vor erstem Titel-Frame, aber GPU-Upload beim 1. Draw)
- Kanten-/Ecken-Füllung: `title_bg_col_l`, `title_bg_col_r`, `title_bg_row_t`, `title_bg_row_b`,
  `title_bg_px_{tl,tr,bl,br}` (Title.ts).
- Dim-Lasur + gedimmte Vignette: `title_dim_lasur_{W}x{H}`, `title_vignette_dim_{W}x{H}`.

### E. Menü-Laufzeit (addVignetteBg in CharSelect/Results/Credits)
- `vignette_col_l`, `vignette_col_r`, `vignette_row_t`, `vignette_row_b`, `vignette_px_{tl,tr,bl,br}`
  (src/gfx/vignette-bg.ts, Basis `vignette` 480x270).

### F. Run-Laufzeit
| Was | Quelle | Warmen? |
|---|---|---|
| HD-Gegnerprojektile | `ensureHdShotTextures` (EnemyProjectiles-Konstruktor → Run.create) | JA (K2, Keys `HD_PREFIX+family`, `HD_GRIDS` ist exportiert) |
| Pillar-Bakes | `ensurePillarBake` (Run.ts): `fx_pillar_bake{2..8}_{0..4}`, erst ab Waffen-Stufe 2 | Nein — Bedarf erst nach Level-up, kein Start-Pop-in; inventorisiert als bekanntes Rest-Lazy |
| Hazard-Discs | `bakeFromMask` (hazardDisc.ts), erst bei erster Hazard-Aktivierung | Nein — sichtbar erst minuten nach Run-Start; Rest-Lazy, dokumentiert |
| Run-Vignette-Kanten | — | Run nutzt `addVignetteBg` nicht (nur CharSelect/Results/Credits) |

### G. Audio
- WAV-Preload (Boot.preload → wandert zu Loading.preload), `initAudio` nach Texturen.

## Beschlüsse K1
1. Loading-Szene erzeugt A+B+C+D+E+F(HD) in Häppchen mit sichtbarem Fortschritt, backt Atlanten
   und wärmt danach jede GL-Textur (alle Keys inkl. `runtime_atlas` + `baked_page_*`) mit alpha 0.
2. Rest-Lazy (Pillar-Bakes, Hazard-Discs) bleibt bewusst außerhalb: kein Start-Pop-in, Kosten pro
   Key winzig; Aufnahme hier als Inventarposition mit Begründung (Argus-Regel: Entscheidung
   festhalten statt Schleife).
3. Boot wird dünn: preload/audio wandert in Loading; Boot startet nur noch `loading`.

## Mess-/Beleg-Konventionen (Lane)
- Perf-Messungen nur mit `flock /home/ai/games/.lf-perf.lock`; Balance/Heap/Screenshots ohne.
- Belege nach `~/games/.evidence/m10-loading-screen/`, Abnahme-Bilder nach `shots/abnahme/`.
