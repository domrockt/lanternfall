# Lane m10-menu-art-crisp — Menü-/HUD-Art-Qualität (Mixel / Palette / Kontrast)

**Ziel:** A10 „Menü-/HUD-Qualität 4/5 → 5/5": Titel-, Icon- und UI-Texturen auf dem Sprite-Pixelraster
(0 Mixel, ganzzahlige Kanten), Icon-Kontrast ≥ 3:1, 0 Off-Palette, binäres Alpha. Keine Layout-/Text-/Balance-Änderungen.

## Methode (Karte 1, `scripts/m10-menu-art-crisp.mjs`)

Laufzeit-Messung im echten Spiel (headless Chromium, iGPU-Renderer
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`, in jedem JSON):
5 Screens (Titel, Options-Overlay, CharSelect, Pause, Results) × 2 View-Profile:
**640x360@2** (Viewport 1280x720, dpr 1) und **780x360@3** (Viewport 780x360, dpr 3).

- **Mixel:** alle sichtbaren Texturobjekte der Menü-Szenen; Befund = fraktionale
  Skalierung (additive Lichter `light_radius`/`vignette` nach GAME.md ausgenommen).
- **Subpixel:** fraktionale Kantenpositionen (weich — `roundPixels: true` rundet beim Rendern).
- **Off-Palette / binäres Alpha:** echte Frame-Pixel aller sichtbaren Texturen gegen `src/palette.ts` (exakt).
- **Icon-Kontrast:** Icons verbergen → Backdrop per `snapshotArea` lesen →
  WCAG-Kontrast des Icon-Körpers (Median-Luminanz, 1-px-ink-Kontur ausgenommen) gegen den
  Backdrop-Median; Grenzwert **3:1**. Waffen/Powerups wurden per Debug gesetzt, damit
  HUD und Pause-Build alle 12 Icon-Klassen zeigen.

Belege: `shots/m10-menu-art-crisp-before.json` (Rohdaten) + `shots/m10-menu-art-crisp-before-<profil>-<screen>.png`
(12 Screenshots). Commit `18947ba`.

## Befund-Liste (Karte 2)

Beide Profile liefern **identische Befunde** — die Mängel sind also view-unabhängig echt:

### F1 — Titelbild fraktional hochskaliert (Screens: Titel, Options-Overlay) — MIXEL
- `title_background` ist als 480x270 generiert und wird in `src/scenes/Title.ts`
  per `setDisplaySize(W, H)` auf die View-Breite gestreckt:
  **1.333x bei 640x360** und **1.625x bei 780x360** (frameW 480 → displayW 640/780).
- Wirkung: Texelgrößen wechseln (1/2 px-Muster), feine Kanten (Horizont, toter Baum,
  Laternenpfähle) werden ungleichmäßig gedehnt — exakt der Mixel-Befund aus Dom 21:45Z.
- **Hebel:** Hintergrund in Zielgröße zeichnen bzw. ganzzahlige Skalierung mit Kanten-Füllung.
  Dateien: `src/gfx/gen-title.ts` (Lane-Claim) **und** die Anzeigezeile in `src/scenes/Title.ts`
  (kein aktiver Claim — Anfrage in `/home/ai/games/.dispatch/requests.md`, 2026-11-27T23:5xZ).
- Hinweis: im 4:3-Fit-Fallback (480x360) wäre der Befund 0 — er entsteht erst durch breite Views.

### F2 — Truhe im Pause-Panel 2.4x hochskaliert (Screen: Pause) — MIXEL, TABU
- `chest_closed` (16x16) wird in der UI-Szene mit `setScale(2.4)` gezeichnet
  → displayW/H **38.4 px**, d. h. Texel flackern zwischen 2 und 3 Gerätepixeln.
- **Hebel** wäre `src/scenes/UI.ts` — in dieser Lane laut Briefing **tabu**
  (Truhen-Reveal-Nachlauf). Der Befund wird deshalb dokumentiert und NICHT hier gefixt;
  Empfehlung für eine Folge-Lane: Zielgröße 32/40 px zeichnen (`gen-ui.ts`) oder Scale auf 2.
- (Beobachtung am Rand: im Pause-Scan tauchen viele unsichtbare `__MISSING`-Pool-Objekte
  mit `visible: false, y=0` auf — kein sichtbarer Mangel, nicht als Befund gewertet.)

### F3 — 4 Passive-Icons mit Körperkontrast < 3:1 (Screens: Pause HUD + Pause-Build) — KONTRAST
| Icon | HUD (bg ≈ #090c10) | Build-Panel (bg #101724 nightMid) | dunkelste Körperfarbe |
|---|---|---|---|
| `icon_passive_boots` | **1.59** | **1.45** | #0a0e16 (nightDeep) |
| `icon_passive_tome` | **2.16** | **1.98** | #101724 (nightMid ≡ Panel!) |
| `icon_passive_heart` | **1.20** | **1.12** | #2b1410 (emberShadow) |
| `icon_passive_charm` | **1.57** | **1.45** | #0a0e16 (nightDeep) |

- Wirkung: Die Körperfüllung der 4 Icons liegt fast auf dem Untergrund; lesbar bleiben sie
  nur über helle Akzentpixel (maxContrast 13–18.5). Auf dem Pause-Panel (nightMid) sind
  `tome`-Körper und Panel **farbidentisch**.
- **Hebel:** `src/gfx/gen-icons.ts` (Lane-Claim): Körperhelligkeit der 4 Passive-Icons
  über Palette-Töne anheben (z. B. bone/boneLight/mist/paleMist/amber), Kontur bleibt 1 px ink,
  Icon-Größe/Distinktheit unverändert. → Karte 4.
- Nicht betroffen: `icon_passive_whetstone` (7.1) und `icon_passive_hourglass` (11.3),
  alle 6 Waffen-Icons (3.1–11.5) und alle Results-Icons (4.2–13.0).

### Keine Befunde (positiv gemessen)
- **0 Off-Palette-Pixel** in allen sichtbaren Menü-/Icon-/UI-Texturen (beide Profile).
- **0 weiche Alpha-Pixel** — binäres Alpha überall.
- **0 Subpixel-Kanten** (alle ganzzahligen Kantenpositionen; `roundPixels` aktiv).
- Ganzzahlige Skalen: `title_logo` 2x, `ui_frame` 1x, Portraits 2x, Glyphen 1–3x.

## Karten-Mapping
- F3 → Karte 4 (`gen-icons.ts`, Lane-Claim).
- F1 → Karte 4, nur wenn Title.ts-Freigabe kommt (Anfrage gestellt); sonst dokumentiert bleiben.
- F2 → tabu, bleibt dokumentiert (Folge-Lane-Empfehlung oben).

## Nachher-Stand (Karte 5)
> Wird nach dem Fix-Scan ergänzt.
