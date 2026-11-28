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

## K2 — Loading-Szene (Commit b220b426)
- **Szenen-Fluss neu:** `boot` (WAV-Preload + Titel-Basistexturen, unverändert) → `loading` → `title`.
  `scheduleWarmup` entfallen; Boot.ts Texturblock (LIGHT_EDGE_STEPS, Local-Kopien) bewusst NICHT
  angefasst — die Lane m10-texture-glow-swap-r2 (lane-done, Merge ausstehend) repointet diese Guards;
  Merge-Konfliktfläche minimal (Boot-Klasse schlanker, Guards/Tabellen bleiben).
- **src/gfx/warmup.ts:** Task-Liste (48 Häppchen, 1 Task pro Frame): glyphs-loading-ui, title-textures,
  chars, enemies, bosses, ui-frames, props, fx, icons, derived-atlas (createAllTextures + bakeStaticAtlas),
  32 Glyphen-Chunks (alle 32 Farben × alle GLYPHS-Zeichen inkl. ä ö ü ß Ziffern Satzzeichen),
  runtime-atlas, title-runtime (neue Export-Funktion `ensureTitleRuntimeTextures` in Title.ts,
  gleiche Keys/Guards wie create()), menu-vignette-edges (Keys wie addVignetteBg — Kopie, Datei fremd),
  hd-shots (Keys wie EnemyProjectiles.addHdShotTexture — Kopie, Datei fremd), gpu-warmup (jede Textur
  einmal alpha 0.0001 zeichnen) + cleanup. Danach `scene.start("title")`.
- **Loading.ts:** Laterne (9x14 Pixel-Textur, Palettenfarben) + Pulslicht (light_radius ADD),
  Fortschrittsbalken (bone/night/amber), "LADEN ..." + Prozent (PixelText, mist — Glyphen in Chunk 0).
- **Timing-Kontrakt:** `__bootTimings` bekommt loadingStart/loadingDone/tasks[] + kompatible Aliase
  warmStart/warmTexturesDone/warmDone/titleRendered (altes scripts/m10-boot-startup.mjs bleibt lauffähig).
- Guard-Tests: tests/loading-warmup.test.ts (Task-Struktur, Glyphensatz, Verdrahtung, Laterne).

## K3 — Run-Start-Gate (Commit f4921742, Review-Revision)
- Run.create: außer bei `?detstart` (Mess-Harness steuert selbst über resumeRun()) gilt:
  Start-Gate `startGate=true` bis `FADE_IN_COMPLETE` (~220 ms Fade). Das Gate friert über die
  freezeGate-Logik im update() (`frozen = paused || startGate`, Early-Return) — bewusst NICHT über
  `paused`, weil die UI-Szene das Pause-Panel direkt an `paused` blendet (Reviewer-Finding 2:
  sonst Pause-Panel-Blitz in den 220 ms). Timer steht bei 00:00, 0 Gegner-Updates.
- Beleg (lokal): Run-Sofort-Snapshot `time=0, enemies=0, gated=true`.
- Reviewer-PASS (ses_dde05cf9affenkxsROLQYzKq7U) mit Findings — alle 3 "Sollte"-Punkte behoben:
  (1) Loading.create resettet idx/started/glow (Restart-Sicherheit), (2) Gate-Design s.o.,
  (3) Key-Kontrakt-Tests für warmVignetteEdges/warmHdShotTextures gegen Quellen (tests/loading-warmup.test.ts).
  tests/pause-freeze.test.ts minimal repointet (Gate-String inkl. startGate; Präzedenz 10:55Z).

## K4 — Belege (Commit siehe git log, nach Reviewer-Runde)
Skripte: `scripts/m10-loading-screen.mjs` (lokal, Galaxy-Tab-Emulation 1280x800@dpr2, Touch),
`scripts/m10-loading-screen-device.mjs` (Geraet via Brücke 172.17.0.1:5181 + CDP :9333, Vorlage
device-probe.mjs; **APK auf dem Tablet ist noch ohne Loading-Szene — frische APK installieren ist
Lead-Sache, danach Skript laufen lassen**).
Belege: `~/games/.evidence/m10-loading-screen/` (m10-loading-screen-after.json, Serien-JPGs),
Abnahme-Bilder: `shots/abnahme/m10-loading-screen-{loading,title,runstart}-after.jpg`.

### Messwerte (lokal, geladene Maschine mit 20 Lanes — Device-Messung folgt nach Merge)
| Metrik | Wert (After-Lauf, 2 Runs) | Gate |
|---|---|---|
| bereit (erster Titel-Frame, lokal, geladene Maschine) | **2.78–2.89 s** | < 3 s ✓ lokal; Device-Messung folgt nach Merge (pending APK) |
| Pop-in nach Titel (Textur-/Glyphen-Zuwachs) | **0 / 0** | 0 ✓ |
| runtime_atlas beim Titel | **komplett** | ✓ |
| JS-Fehler | **0** | 0 ✓ |
| Run-Sofort (K3-Gate) | time 0 s, 0 Gegner, gated=true | ✓ |
| Run-Start 3 s (clean, ohne Aufzeichnung) | maxFrame 16.8 ms, **0 Hitches > 33 ms**, p99 16.8 ms | kein Ruckler ✓ |

Fruehere Probe-Laeufe (3.0–4.9 s) waren durch Screenshot-Overhead + Maschinenlast verfaelscht;
finaler Stand via CDP-Screencast-Serie + Clean-Lauf (Skript-Iterationen: 2, Argus-Regel eingehalten).

### Kostenprofil des Warmups (optimierungspotenzial, falls Tablet > 3 s)
fx ~1.0–1.6 s, runtime-atlas ~1.0 s, derived-atlas ~0.2–0.3 s, enemies ~0.15–0.5 s — Rest < 0.1 s je Chunk.
Bei Device-Messung > 3 s: Hebel wäre fx/Atlas (fremde Dateien gen-fx.ts/atlas.ts), nicht die Loading-Szene.

### Offene Punkte
1. Device-Messung mit frischer APK (Lead: `POST /install`, dann `node scripts/m10-loading-screen-device.mjs`).
2. Falls Tablet-Ladezeit > 3 s: fx-/Atlas-Kosten als eigene Karte (fremde Dateien).
3. Merge-Konflikt Boot.ts mit m10-texture-glow-swap-r2: deren Version (Import aus textures.ts) mit
   dieser schlanken Boot-Klasse zusammenführen; guards-Tests repointen (Details .dispatch/requests.md).
