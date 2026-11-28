# Lane m10-menubg-crisp-rest — Menü-Hintergründe pixelgenau (CharSelect / Results / Credits)

**Auftrag:** Befundklasse F1 aus m10-menu-art-crisp (fraktionale `setDisplaySize`-Skalierung von
Hintergrund-Texturen) auf die übrigen Menü-Szenen ausweiten, belegte Fälle fixen.
**Owner:** Lead · **Karten:** #6938 (Ist-Messung), #6939 (Fix), #6940 (Tests), #6941 (Abnahme/Doku).

## Befund (K1, `shots/m10-menubg-before.json`)

- **Frisch-Load je Format (640×360, 780×360@3, 960×540): 0 fraktionale Fälle.** Die Vignette-Textur
  wird beim Boot *nach* `setGameView()` in der aktuellen View-Größe erzeugt und passt exakt (Scale 1×1).
- **Live-Resize-Probe: 3 belegte Fälle.** Der Texture-Manager hält die Vignette über Resizes hinweg
  (`createVignetteTexture` bricht bei `textures.exists` ab, `src/scenes/Boot.ts` + `src/gfx/textures.ts`).
  Nach Resize 640→780 restartet die Szene und streckt die alte 640×360-Textur per
  `setDisplaySize(780, 360)` → **fraktional 1.21875× in CharSelect, Results und Credits**
  (PNG-Belege `shots/m10-menubg-before-resize-*.png`).
- Sonstige Bilder in den 3 Szenen: Portraits 2× (ganzzahlig), `ui_frame` 1×, Icons 1× — sauber.
  `light_radius` 0.55× (ADD-Blend) ist ein weiches Licht-Glow, kein Hintergrund/Panel — out of scope
  (wie in m10-menu-art-crisp), in Title.ts steht zusätzlich 0.9×.

## Fix (K2, Commit #6939)

Neues Modul `src/gfx/vignette-bg.ts` (Muster m10-title-bg-crisp #6739):

- `vignetteBgLayout()`: ganzzahliger Texel-Scale `max(1, floor(min(W/texW, H/texH)))`, Kern zentriert,
  Rest-Rand als `left/top/right/bottom`; Crop-Fall (Textur größer als View, Resize nach unten) deckt
  die View allein über den Kern (x ≤ 0).
- `vignetteBgCoversView()`: Vertragsprüfung (Identität `left + texW·scale + right = gameW`, alles ganzzahlig).
- `addVignetteBg()`: zeichnet Kern + Kanten-Füllung aus **echten 1px-Rand-Texeln** (einmalig erzeugte
  `vignette_col_l/col_r/row_t/row_b/px_*`-Texturen; `setCrop` samplet unzuverlässig — Erfahrung #6739),
  depth −1 wie bisher.
- CharSelect/Results/Credits rufen `addVignetteBg(this, W, H)` statt `.setDisplaySize(W, H)`.
- **After-Scan `shots/m10-menubg-after.json`: 0 fraktionale Fälle** in allen 3 Formaten UND im
  Resize-Probe (vorher 1.21875×). Frisch-Load bleibt AE = 0 (Textur passt exakt, keine Füllung nötig);
  Füllstreifen nur im Resize-Pfad, ganzzahlig (1px-Spalte ×70/×110 bzw. ×160/×90 senkrecht bei 960×540-View).
- **Nicht angefasst (fremde Lanes, nur dokumentiert):** `src/scenes/Title.ts` (m10-title-bg-crisp —
  dort ist die Vignette weiterhin per `setDisplaySize` gezeichnet, Kern-Befund `title_background` ist
  abgearbeitet) und `src/scenes/Run.ts` (In-Game-Vignette, `setDisplaySize(GAME_WIDTH, GAME_HEIGHT)`;
  gleiche Mangel-Klasse beim Live-Resize möglich — Folge-Karte-Empfehlung unten).

## Regressionsschutz (K3, Commit #6940)

`tests/menu-bg-crisp.test.ts` (21 Tests): Layout-Vertrag ganzzahlig + Fuellung deckt View
(640/780/960×540/860/480 + Crop-Fall), Exaktwerte 640 (AE = 0) und 780 (70 px Füllung statt 1.21875×),
Quell-Checks: die 3 Szenen nutzen `addVignetteBg` ohne verbliebenes `setDisplaySize` auf der Vignette.
Suite: 954/954 grün, `tsc --noEmit` rc = 0.

## Abnahme (K4)

- After-Shots + 4×-Zoom (nearest): `shots/m10-menubg-after-resize-*-780-zoom.png` — keine sichtbare
  Naht/Banding an der Füllgrenze (Vignette ist ein radiales Alpha-Gradient; die Rand-Texel sind
  plateauförmig ~0.72 Alpha, die Streckung ist daher stufenlos).
- **art-director: PASS, 4,5/5** — Kern pixelidentisch zur 1×-Referenz (7 Unique-Farben, identische
  Nachbar-Diffs im 60×60-Patch), Naht-Differenz 0/0/0 an der Füllgrenze (col 69↔70, 709↔710),
  fraktionale Fälle 3 → 0, Füllbänder pro Zeile konstant. Feiner Dither im Gradienten ist
  textur-immanent (GAME.md-Ausnahme), kein Resize-Artefakt.
- **reviewer: PASS** — tsc rc = 0, Suite 954/954; Crop-Fall testbelegt, Edge-Texturen idempotent,
  ein Karten-Thema pro Commit, GAME.md-konform. Nit (Edge-Cache-Größenprüfung) umgesetzt
  (`src/gfx/vignette-bg.ts`, `mk` prüft Kanten-Textur-Maße und entfernt veraltete).
- Mess-Skript: `scripts/m10-menubg-crisp.mjs before|after` (ohne flock, keine FPS-Messung).

## Offene Punkte / Empfehlungen

1. **Run.ts** (`src/scenes/Run.ts` Zeile ~282): In-Game-Vignette per `setDisplaySize(GAME_WIDTH, GAME_HEIGHT)`
   — dieselbe Mangel-Klasse beim Live-Resize im Run. Gehört nicht in diese Lane (Disponent: Run.ts fremd);
   Empfehlung: Folge-Karte, Fix wäre derselbe (`addVignetteBg`).
2. **Title.ts**: Vignette dort weiterhin `setDisplaySize(W, H)` (Tabu dieser Lane). Nach Merge von
   m10-title-bg-crisp ebenfalls auf `addVignetteBg` umstellbar.
3. `light_radius`-Glows (0.55×/0.9×, ADD): bewusst nicht angefasst — weiche Glühen, kein Mixel-Objekt.
