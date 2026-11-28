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

(folgt)

## K3: GroundRenderer — cameraWorldView/screenAnchoredX

(folgt)

## K4: Nachher-Messung + Fazit

(folgt)
