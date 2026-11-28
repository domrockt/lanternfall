# Lane m10-4658-camera-width (M10: Kamera-Projektions-Fix, camera.width-Leser)

Folge-Karte #4658 aus m10-dpr-budget-cap: bei gesenktem ganzzahligen Render-Teiler
s ist `camera.width = W/s` (Viewport W/s x H/s, Zoom 1/s — enforceCameraProjection,
src/config.ts). Code, der `camera.width` als LOGISCHE Screen-/Weltbreite liest,
rechnet bei Teiler 2/3 mit der halben/dritten Breite. Der WIP aus Lane
m10-dpr-budget-cap (Commit a6e69fc, nie nach main gemergt; Patches zz/*-4658-wip-*
sind verloren) wird hier auf dem heutigen main-Stand neu umgesetzt.

Wichtiger Unterschied zum WIP: Karta m10-boss-onscreen (#2544 K6, Merge 6fbb38d,
23:25 — NACH dem dpr-budget-cap-Merge 20:36) hat den Inline-Spawn-Guard
(`bossHudRects(this.camera.width)` nach dem Spawn) durch `composedBossCenterY(...)`
VOR dem Spawn ersetzt. Der WIP-Patch passt deshalb nicht 1:1; der Fix wird an die
neue Struktur angepasst (gleiche Semantik: HUD-Mathe in LOGISCHEN Screen-Pixeln).

## K1: Ist-Stand (HEAD vor Fix) — Befund

Vorher-Messung: `shots/m10-4658-camera-width-before.json`
(scripts/m10-dpr-budget.mjs, M25-Last, 780x360 dpr3, iGPU — Renderer-String
"ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)" ab jetzt Pflicht
in den JSON-Belegen; --force-scale 3 faehrt den Nachher-Lauf mit festem Teiler 3):

- before-rbscale0 (Teiler 1, Buffer 780x360): **60,0 FPS**, minEnemies 300, 0 JS-Fehler.
- after rbscale=3 (Buffer 260x120): **60,0 FPS**, minEnemies 300, 0 JS-Fehler.

FPS ist vsync-gekapselt (60) — der Bug ist Verhaltens-, kein Performance-Bug:
die falschen camera.width-Leser aendern Cull/Spannen/Positionen bei Teiler 2/3.

### Falsche camera.width-Leser auf HEAD (vor Fix)

1. `src/systems/BossSystem.ts` spawn(): `bossSpawnDistance(this.camera.width,
   this.camera.height)` — Spawning-Ring bei Teiler 2 mit 72 statt 144 px
   Abstand (min(390,180)*0.4, Klammer 130), Boss spawnt sichtbar zu nah am Spieler.
2. `src/systems/BossSystem.ts` spawn(): `composedBossCenterY(..., this.camera.width,
   this.camera.height, ...)` — (a) HUD-Rects/SafeTop aus halber/drittel Breite;
   (b) y-Eingaben sind Welt-Offsets, safeTop ist logischer Screen — bei Teiler s
   weicht der Vergleich um H*(s-1)/(2s) (Teiler 2: 90 px): der Guard schiebt den
   Boss-Sprite deutlich zu tief nach unten.
3. `src/gfx/GroundRenderer.ts` update(): Ripple-Cull `scrollX .. scrollX+camera.width`
   — bei Teiler 2/3 wird die rechte Bildschirmhaelfte/2/3 gecullt (Popping am Rand).
4. `src/gfx/GroundRenderer.ts` ambient(): Fireflies spannen `baseX * camera.width`
   (bei Teiler 3 nur 1/3 der sichtbaren Breite), Fog ist screen-verankert und
   wird unter Zoom um den Viewport-Mittelpunkt verschoben (Pivot unkompensiert).
5. Chunk-Cull (minCx..maxCx aus camera.width + 1 Chunk Margin): bei Teiler 2
   gedeckt (rechte Kante enqueue 646 >= sichtbar 585), bei Teiler 3 4 px Spalt
   (516 < 520) — **dokumentiert, kein Fix** (WIP-Entscheid: Margin deckt Teiler
   2/3 praktisch; der 4-px-Randfall laesst ein einzelnes Chunk-Aufeinander an
   der äussersten rechten Kante selten POPPen, kosmetisch).

### Offene Punkte (fremde Dateien, nicht Teil dieser Lane)

- `src/systems/Spawner.ts` (124/151): `spawnRingRadius(this.camera.width, ...)` —
  Spawn-Ring bei Teiler 2 halb so gross; Gegner spawnen sichtbar im Bild.
  Gleiches Bug-Muster, eigene Karte.
- `src/systems/DamageNumbers.ts` (284): OnScreen-Cull gegen camera.width —
  bei Teiler 2/3 verschwinden Damage-Numbers frueh (kosmetisch, Buffer-Space).

## K2: BossSystem-Fix + tests/boss-camera-width.test.ts

Die WIP-Patches (a6e69fc) passten nicht 1:1 — m10-boss-onscreen (#2544 K6) hatte
den Inline-Spawn-Guard inzwischen durch `composedBossCenterY` ersetzt. Der Fix
wurde an die neue Struktur angepasst (gleiche Semantik, Umsetzung Commit in
dieser Lane):

1. `bossSpawnDistance(GAME_WIDTH, GAME_HEIGHT)` statt `(camera.width, height)`:
   Die sichtbare WELT ist bei jedem Teiler GAME_WIDTH x GAME_HEIGHT (Zoom 1/s
   kompensiert den W/s-Viewport). Bei Teiler 1 bitgleich (GAME_* == camera.*).
2. Spawn-Komposition in logischen Screen-Pixeln:
   `camTopLog = camTop + camera.height/2 - GAME_HEIGHT/2` — der Midpoint ist
   `scrollY + camera.height/2` bei jedem Teiler, camTopLog ist damit
   teilerunabhaengig (= Midpoint - GAME_HEIGHT/2) und `composedBossCenterY`
   bekommt `(desiredY - camTopLog, playerY - camTopLog, index, GAME_WIDTH,
   GAME_HEIGHT, camTopLog, BOSS_INTRO_ZOOM)`; Welt-Y = `camTopLog +
   composedScreenY`. Vorher mischte der Vergleich Welt-Offsets (camera.height-
   Raum) mit logischen HUD-Rechtecken und klemmte um H*(s-1)/(2s) zu frueh
   (Teiler 2: 90 px zu tief gepusht); safeTop/Banner-Kette war aus W/s gerechnet.

Neue Tests `tests/boss-camera-width.test.ts` (14 Faelle, vi.mock phaser):
- Projektion/Midpoint-Erhaltung fuer 640x360, 780x360@3, 960x540, 1920x1080
  (cameraWorldView bei Teiler 1/2/3 identisch, Teiler-1-Identitaet),
- Ground-Cull-Halbierung (Sonde-Werte rbscale2: alt [1853,2243] vs. View
  [1658,2438]), Ripple-Marge 16 px je Teiler,
- Fireflies-Spanne volle Weltbreite, Chunk-Cull-Margin (Teiler 2 gedeckt,
  Teiler 3 4-px-Randfall, s. K1),
- Nebel: CSS-Position Teiler 1/2/3 identisch (Pivot), CSS-Drift 46 px bei jedem
  Teiler (alter Bug: 46*s), screenAnchoredX-Identitaet bei Zoom 1,
- BossSystem: bossSpawnDistance(GAME_*) == Skala-1-Wert (Bug: 130 statt 144),
  camTopLog teilerunabhaengig, Spawn-Komposition Welt-Y bei Teiler 1/2/3
  identisch in allen 4 Formaten (Guard-Fall: alter Code klemmt anders),
  bossHudRects(GAME_WIDTH) == Teiler-1-Layout,
- renderBufferSize(780,360,3) == 260x120 (Sonde).

## K3: GroundRenderer — cameraWorldView/screenAnchoredX

Wie WIP (a6e69fc), an den prop-density-lod-Stand (propTierFor/propDensityMaxTier,
Commit 54c1590) angepasst:
- `cameraWorldView(camW, camH, scrollX, scrollY, zoom)` (export, rein): linker/
  oberer Rand und Groesse des TATSAECHLICH sichtbaren Weltausschnitts — bei
  Teiler s ist camera.width = W/s, der Ausschnitt bleibt W breit und ist um den
  Viewport-Mittelpunkt zentriert. Bei Zoom 1 Identitaet mit dem alten Verhalten.
- Ripple-Cull gegen `view` (vorher `scrollX .. scrollX + camera.width`: bei
  Teiler 2 wurde die rechte Bildschirmhaelfte gecullt — Popping am Rand).
- Fireflies: Spanne `view.left + baseX * view.width` (vorher nur W/s breit).
- Fog (screen-verankert, scrollFactor 0): Pivot-Kompensation ueber
  `screenAnchoredX(...)`; Drift (46/8 px SCREEN-Pixel) erst NACH der
  Kompensation addieren (sonst CSS-Drift 46*s — Reviewer-Befund aus #5362).
- Chunk-Cull (minCx..maxCx + 1 Chunk Margin): NICHT geaendert — Margin deckt
  Teiler 2 voll (enqueue 646 >= sichtbar 585) und Teiler 3 bis auf einen
  4-px-Randfall (516 < 520, kosmetisch, einzelnes Chunk-Aufblitzen an der
  aeussersten rechten Kante moeglich); dokumentiert statt Fix (WIP-Entscheid).

tests/scale-budget.test.ts unveraendert, bleibt gruen (21/21).

## K4: Nachher-Messung + Fazit

Nachher: `shots/m10-4658-camera-width-after.json` (gleiche Methodik wie before,
flock, iGPU): before-rbscale0 **60,1 FPS**, after rbscale=3 (Buffer 260x120)
**60,0 FPS**, minEnemies 300, 0 JS-Fehler, Renderer "ANGLE (Intel, Mesa
Intel(R) Graphics (RPL-S), OpenGL ES 3.2)". **Kriterium erfuellt: >= 60 FPS
bzw. unveraendert zur Baseline** (before.json: 60,0/60,0).

Pixel-Beleg bei Teiler 2 (scripts/m10-dpr-pixel-proof.mjs, unverändert; Ausgaben
nach shots/m10-4658-camera-width-pixel*.png/json umgeleitet):
`uniformAE 0` (hartes nearest-Upscaling), `structVerdict PASS (Struktur
identisch)` (structAE 17354 <= structBaselineAE 17404), contentAE 69649 vs.
Jitter-Baseline 69352 (+297 px = 0,4 %, Rest-Tween-Jitter). Beim ersten Lauf
(killAll-Tweens fehlte) lag contentAE +33333 ueber Baseline — Ursache war der
XP-Bar-Fill-Tween, nicht Projektion; Sichtpruefung A-vs-B-Crop bestaetigt
deckungsgleiche HUD-/Terrain-/Deko-Lage. screenshots: pixel.png (Teiler 2),
pixel-full.png (Teiler 1), pixel-zoom.png (4x Crop).

### Fazit / Abnahme

- `npm test`: 947/947 gruen (inkl. tests/boss-camera-width.test.ts, 14).
- `npm run build`: rc=0.
- M25 780x360@3: 60 FPS, unveraendert zur Vorher-Baseline (iGPU, Renderer-String
  in beiden JSONs).
- Verhalten bei Teiler 1 bitgleich (camTopLog-Identitaet + cameraWorldView-
  Identitaet durch Tests abgedeckt); Pixel-Paritaet bei Teiler 2 belegt.

### Offene Punkte (Folge-Karten, fremde Dateien)

- `src/systems/Spawner.ts` (124/151): spawnRingRadius(camera.width, ...) —
  Spawn-Ring bei Teiler 2 halb; Gegner spawnen sichtbar im Bild. Gleiches
  Bug-Muster wie der Boss-Fix, eigene Karte.
- `src/systems/DamageNumbers.ts` (284): OnScreen-Cull gegen camera.width —
  Damage-Numbers verschwinden bei Teiler 2/3 frueh (kosmetisch).
- `src/systems/ChestSystem.ts` worldView-Kommentare pruft bereits auf die
  sichtbare Flaeche — bei naechster Beruehrung gegen cameraWorldView vereinfachen.

