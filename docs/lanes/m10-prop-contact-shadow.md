# Lane m10-prop-contact-shadow — Kontakt-Schatten unter Props

Restthema des m9-art-world-Ziels "Props mit Tiefe" (art-director-FAIL 2,3/5:
"Bodenschatten unter Props nicht sichtbar (Canvas2D-Ellipse)"). Props (Steine,
Knochen, Büsche, Bäume, Ruinen — inkl. Varianten aus m10-props-variety) wirkten
flach und "schwebten" im Moor.

## Umsetzung

- **Schatten-Generator** in `src/gfx/gen-props.ts` (`propShadowFor`,
  `propShadowClassFor`, Konstanten `PROP_SHADOW_COLOR/ALPHA_CORE/ALPHA_RIM`):
  deterministische, elliptische Pixel-Silhouette je Prop-Klasse aus der
  Fussbreite des generierten Sprites; Palette 0 (ink), Kern α 0,35, Rand α 0,18,
  3-4 Zeilen hoch (1-px-Kontakt, kein weicher Gradient-Blob). Varianten
  (`prop_boulder_b/_c`, `prop_bones_b/_c`, `prop_reeds_b`, `prop_post_b`)
  werden auf ihre Basis-Klasse abgebildet — Platzierung, LOD-Tiers,
  CLUSTER_PROPS und Batch-Struktur blieben unangetastet.
- **Zeichnung** in `GroundRenderer.addProp`: alle Schatten-Silhouetten werden in
  EINE Canvas-Textur gepackt (`prop_contact_shadow`, Frames `ps_<Klasse>`,
  `ensurePropShadowTexture()`) — alle Schatten teilen sich weiterhin genau
  einen Batch (`shadowBatches` unverändert 1). Image je Prop bei `(wx+1, wy-1)`
  (leicht versetzt, 1 px unter dem Fusspunkt), kein Scale/Blur. Fallback auf
  den alten Soft-Schatten, falls der Atlas-Frame fehlt.
- **Guard-Test** `tests/prop-shadow.test.ts` (30 Tests): alle 13 Klassen + alle
  Varianten-Keys, Palette 0, Alpha > 0 und < opak, Ellipse/spiegelsymmetrisch,
  max. 2 Alpha-Stufen, Determinismus (identisches Objekt), Atlas < 1024 px.

## Vorher/Nachher (Seed 7, Cluster bei 2453/2096, 12 Props)

- Vorher: `shots/abnahme/m10-prop-shadow-before-{640,960}{,-crop}.png` — Probe:
  527 Props, alter weicher Blob ("shadow"-Textur) nicht als Kontakt erkennbar.
- Nachher: `shots/abnahme/m10-prop-shadow-after-{640,960}{,-crop}.png` — Probe:
  **527/527 Props mit Kontakt-Schatten am Fusspunkt (0 ohne Schatten)**,
  Schatten-Textur-Key ausschließlich `prop_contact_shadow`, 0 JS-Fehler.
  JSON: `shots/abnahme/m10-prop-shadow-{before,after}.json` (Kopien in
  `~/games/.evidence/m10-prop-contact-shadow/`).
- Palette: die Shadow-Textur enthält nur PAL[0]-Pixel mit Alpha (Guard-Test);
  im Frame ist der Schatten eine Alpha-Überblendung über dem Terrain — wie
  Licht/Vignette eine erlaubte Overlay-Ausnahme der Palettenregel.

## Performance-Gegenprobe (Burst 640x360, 500 Gegner, `flock /home/ai/games/.lf-perf.lock`)

| Messung | Baseline (K1-Stand, 3c4edfba) | Nachher (#10158) | AK |
|---|---|---|---|
| FPS (10 s Burst) | 60,1 | 60,1 | >= 55 ✓ |
| Draw-Calls/Frame (Median/P95) | 6 / 6 | 6 / 6 | <= Baseline + 2 ✓ |
| Schatten-Batches | 1 | 1 | Batch-Pfad nicht aufgebrochen ✓ |
| Gegner (avg/min) | 500 / 500 | 500 / 500 | — |
| Renderer-String | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) | dito | iGPU, kein SwiftShader ✓ |

JSON-Belege: `~/games/.evidence/m10-prop-contact-shadow/m10-prop-shadow-drawcalls-{before,after}.json`
(Delta 0 Draw-Calls — Schatten bleiben eine Textur/ein Batch.)

## Qualitäts-Tor

- npm run build rc=0, npm test 1793/1793 grün (ground-props-batch /
  prop-density-lod / props-wiring unverändert grün), 0 JS-Fehler in allen
  Probe-Läufen.
- art-director-Urteil: siehe Karten-Notiz #10160 / Board.

## Offene Punkte

- Keine. Die gemalten Boden-Säume (s/t) der Sprites bleiben unberührt — der
  Kontakt-Schatten ergänzt sie (Abstimmung per art-director geprüft).
