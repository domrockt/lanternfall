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
  einen Batch (`shadowBatches` unverändert 1). Image je Prop bei `(wx+1, wy+1)`
  (leicht versetzt, Ellipsen-Zentrum 1 px UNTER dem Fusspunkt — siehe
  art-director Runde 1), kein Scale/Blur. Fallback auf den alten Soft-Schatten,
  falls der Atlas-Frame fehlt.
- **Guard-Test** `tests/prop-shadow.test.ts` (30 Tests): alle 13 Klassen + alle
  Varianten-Keys, Palette 0, Alpha > 0 und < opak, Ellipse/spiegelsymmetrisch,
  max. 2 Alpha-Stufen, Determinismus (identisches Objekt), Atlas < 1024 px.

## art-director Runde 1: FAIL (1–2/5) — Ursache + Fix

Befund: „Schatten-Pixel kommen nicht im Frame an" (Δ=0 an Fußpunkten in dessen
Pixelproben), Belege nicht eingefroren, Crops nicht ganzzahlig.

Root-Cause-Analyse (Bounds-Probe + Shadows-only-Render + gefrorene Diffs):
1. **Okklusion durch die eigene Basis:** Schatten-Zentrum lag bei `wy-1` — die
   opaken Basis-Pixel des Props (Säule, Findling, Ruine) verdeckten die
   Ellipse; nur schmale Ränder traten seitlich heraus. Bei Bäumen (schmaler
   Stamm) sichtbar, bei breiten Basen praktisch nicht. Fix: Schatten-Zentrum
   jetzt `wy+1` (untere Ellipsen-Hälfte bleibt unter der Basis sichtbar).
2. **Messartefakt der Runde 1:** die Δ=0-Proben stammten aus *nicht
   eingefrorenen* Läufen (Kamera-/Licht-Puls-Phase differiert) und trafen im
   ADD-Glow-Bereich des Spielerlichts, der Basis-Unterschiede wegaddiert
   (Sättigung). Deltas sind nur mit eingefrorener Sim und an nicht
   glow-gesättigten Props aussagekräftig.

## Evidenz nach Fix (eingefrorene Sim, `setTimeScale(0)`, Seed 7, Cluster 2453/2096)

- Texture-Dump aus dem laufenden Spiel: `prop_contact_shadow` 306x4, 793
  belegte Pixel, rgba(6,7,12,α) — Palette 0, Frames `ps_*` für alle 13 Klassen.
- Schatten-Image-Bounds: z. B. ps_prop_boulder 20x3 @ (wx+1, wy+1), Scale 1,
  Alpha 1, alle 527 Schatten sichtbar mit `ps_`-Frame (0 Fallbacks).
- **Fußpunkt-Delta (5x5-Patch unter dem Fuß, nachher − vorher, n=78 Props):**
  gesamt −4,9/−7,2/−5,5 (R/G/B), heller Boden (n=21) −6,4/−8,5/−8,2, dunkler
  Boden (n=57) −4,4/−6,7/−4,5; 88 % aller Fußpunkte messbar abgedunkelt
  (`~/games/.evidence/m10-prop-contact-shadow/m10-prop-shadow-fusspunkt-delta.json`).
- Diff-Bild: koherente Ellipsen unter den Props; Rest-Rauschen = Wasser-Glints
  und Glow-Puls-Phase (`~/games/.evidence/m10-prop-contact-shadow/m10-prop-shadow-frozen-diff.png`).
- Ganzzahlige 3x-Detailpaare (vorher/nachher, nearest): Baum (dunkler Boden),
  Säule, Findling, Stumpf —
  `shots/abnahme/m10-prop-shadow-detail{0..3}-{before,after}.png`.
- art-director-Urteil Runde 2: siehe Karten-Notiz #10160 / Lane-Abschluss.

## Vorher/Nachher (Seed 7, Cluster bei 2453/2096, 12 Props)

- Vorher: `shots/abnahme/m10-prop-shadow-before-{640,960}{,-crop}.png` — Probe:
  527 Props, alter weicher Blob ("shadow"-Textur) nicht als Kontakt erkennbar.
- Nachher (nach Fix): `shots/abnahme/m10-prop-shadow-after-{640,960}{,-crop}.png`
  — Probe: **527/527 Props mit Kontakt-Schatten am Fußpunkt (0 ohne Schatten)**,
  Schatten-Textur-Key ausschließlich `prop_contact_shadow`, 0 JS-Fehler.
  JSON: `shots/abnahme/m10-prop-shadow-{before,after}.json` (Kopien in
  `~/games/.evidence/m10-prop-contact-shadow/`).
- Palette: die Shadow-Textur enthält nur PAL[0]-Pixel mit Alpha (Guard-Test);
  im Frame ist der Schatten eine Alpha-Überblendung über dem Terrain — wie
  Licht/Vignette eine erlaubte Overlay-Ausnahme der Palettenregel.

## Performance-Gegenprobe (Burst 640x360, 500 Gegner, `flock /home/ai/games/.lf-perf.lock`, finaler Stand)

| Messung | Baseline (K1-Stand, 3c4edfba) | Nachher (#10160, final) | AK |
|---|---|---|---|
| FPS (10 s Burst) | 60,1 | 60,1 | >= 55 ✓ |
| Draw-Calls/Frame (Median/P95) | 6 / 6 | 6 / 6 | <= Baseline + 2 ✓ |
| Schatten-Batches | 1 | 1 | Batch-Pfad nicht aufgebrochen ✓ |
| Gegner (avg/min) | 500 / 500 | 500 / 500 | — |
| Renderer-String | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) | dito | iGPU, kein SwiftShader ✓ |

JSON-Belege: `~/games/.evidence/m10-prop-contact-shadow/m10-prop-shadow-drawcalls-{before,after}.json`
(Delta 0 Draw-Calls — Schatten bleiben eine Textur/ein Batch.)

## Qualitätstore (Build/Tests)

- npm run build rc=0, npm test 1794/1794 grün (ground-props-batch /
  prop-density-lod / props-wiring unverändert grün), 0 JS-Fehler in allen
  Probe-Läufen.

## Reviewer (PASS, Findings eingearbeitet)

- Sollte 1 (Kommentar propFootWidth): Kommentar präzisiert — ink-Kontur '0'
  zählt bewusst nicht zur Fußbreite (liest sich bereits als Schattenrand).
- Sollte 2 (Regressionsschutz Wy+1): neuer `PROP_SHADOW_OFFSET` (x=1, y=1) in
  gen-props.ts, von addProp() genutzt und im Guard-Test gepinnt.
- Nit 3 (Textur-Lifecycle): Feld-Kommentar dokumentiert die bewusste
  Nicht-Zerstörung (deterministisch, Wiederverwendung über textures.exists).
- Nit 5/6: benannte Konstante `PROP_FOOT_FALLBACK_WIDTH`, triviale
  Determinismus-Assertion entfernt, Test-Iteration auf `prop_*`-Keys begrenzt.

## Offene Punkte

- Keine. Die gemalten Boden-Säume (s/t) der Sprites bleiben unberührt — der
  Kontakt-Schatten ergänzt sie.
