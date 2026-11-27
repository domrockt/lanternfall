# m10-atlas-gaps — Runtime-Atlas vollständig & pixelgenau

Lane-Worktree: `/home/ai/lf-lanes/m10-atlas-gaps`, Branch `m10-atlas-gaps`.
Ziel: alle heissen Sprite-Klassen (Gegner, Gems, Projektile, Partikel) im
Runtime-Atlas, 2-px-Gutter ohne Bleeding, weniger Draw-Calls bei 0 Pixel-Differenz.

## Werkzeug

`scripts/art/atlas-audit.mjs` (Playwright, headless): liest `ATLAS_KEY`, `ATLAS_PREFIXES`, `ATLAS_DENY` aus
`src/gfx/atlas.ts` und die Frame-Listen aus `src/gfx/gen-enemies.ts` /
`gen-bosses.ts` / `src/data/enemies.ts`, bootet das Spiel und misst den echten
Atlas:

- Coverage: jeder erwartete Enemy-/Boss-/Prefix-Frame-Key muss als Atlas-Frame existieren.
- Gutter: kleinster Abstand zwischen zwei Frame-Rechtecken (horizontal + vertikal).
- Bleed: der 2-px-Ring ausserhalb jeder Frame-Zelle muss vollständig transparent sein.
- Zusätzlich: heisse Texturen, die existieren, aber nicht im Atlas landen.

Aufruf:

```bash
node scripts/art/atlas-audit.mjs --out shots/m10-atlas-audit.json
```

## Ist-Stand (vor Fix, Commit #K1)

Messung: Atlas `runtime_atlas` **1024×343 px**, **224 Frames**.
Audit-JSON: `shots/m10-atlas-audit.json`.
Beleg für #1679: Ist-Stand vollständig erfasst (Coverage, Gutter, Bleed, heisse Einzeltexturen) und mit Commit 3aba53e dokumentiert.

### a) Coverage

- Erwartete Enemy-/Boss-/Prefix-Keys: **224/224 vorhanden (100 %)**.
- Aber **3 heisse Texturen fehlen im Atlas** (`uncoveredHotKeys`):
  - `flail_ball` (Kettenflegel-Kugel, jede Schwung-Phase)
  - `chain_link` (Kettensegmente, mehrfach pro Schwung)
  - `puddle_poison` (Giftpfütze der Moorkönigin, Boss-Phase)
- Coverage damit effektiv **nicht complete**, weil diese Keys ausserhalb der
  Prefix-Liste liegen und je eigene WebGL-Texturen erzeugen → zusätzliche Draw-Calls.

### b) Gutter

- Kleinster Zellabstand: **0 px**, **358 Verstösse** gegen die 2-px-Anforderung.
- Ursache im Shelf-Packer in `src/gfx/atlas.ts`:
  - horizontal nur `x += p.w + 1` → 1 px,
  - vertikal `y += rowH` → **0 px** (kein Zeilenabstand).
- Beispiele: `boss_coven`↔`boss_coven_2` 1 px, `boss_coven`↔`elite_aura` 0 px,
  `boss_coven_2`↔`boss_bell_golem` 0 px.

### c) Bleed

- **131 Bleed-Fälle** (opake Pixel im 2-px-Ring einer Zelle), Verteilung:
  - enemy 72, fx 39, boss 6, projectile 4, ring 3, gem 2, orb 2, water 2, chest 1.
- Top-Beispiele: `ring_frost` 76 px, `boss_hollow_king_3` 20 px,
  `ring_burst` 14 px, `ring_soul` 12 px, `fx_pillar` 10 px, `fx_shock` 3 px.
- Zusätzlich **129 Frames mit opakem Randpixel** (eigene Kante der Zelle, z. B.
  Bosse/FX, die randlos gezeichnet sind). Ohne Puffer kann GPU-Sampling diese
  Nachbarpixel treffen.

## Fix-Plan (#K3)

1. `ATLAS_PREFIXES` um `flail_`, `chain_`, `bone_`, `puddle_` erweitern
   (deckt `flail_ball`, `chain_link`, `bone_boomerang`, `puddle_poison`).
2. Shelf-Packer: **2 px Gutter** horizontal und vertikal
   (`x += cellW + GUTTER`, `y += rowH + GUTTER`).
3. Jede Zelle bekommt **1 px transparentes Padding** um den Frame
   (Quelle nach `x+PAD, y+PAD` zeichnen, Atlas-Frame bleibt `w×h` an
   `x+PAD, y+PAD`) → effektiver Puffer ≥ 3 px, Frame-Origin/API unverändert.
4. Atlas-Key `runtime_atlas` und öffentliche API (`atlasTextureKey`,
   `applyTexture`, `currentFrame`, `makeImage`) bleiben unverändert.
5. Deterministische Packung: gleiche Eingaben → gleiche Masse/Rechtecke.

## Ergebnis nach Fix (#K3)

Neuer Audit-Lauf (`shots/m10-atlas-audit.json`):

| Messgrösse | vorher | nachher |
|---|---|---|
| Atlas-Frames | 224 | **227** (+ `flail_ball`, `chain_link`, `puddle_poison`) |
| Atlasgrösse | 1024×343 | 1024×387 |
| Coverage erwartete Keys | 224/224 | **227/227 (100 %)** |
| nicht-atlaste heisse Keys | 3 | **0** |
| Gutter min. | 0 px | **4 px** (2 px Gutter + 2×1 px Padding) |
| Gutter-Verstösse | 358 | **0** |
| Bleed-Fälle (2-px-Ring) | 131 | **0** |
| Frames mit opakem Randpixel (advisory) | 129 | 131 (durch Padding abgesichert) |
| Determinismus | – | `packAtlas` 2×/shuffled → identisch |

Coverage/API: `ATLAS_KEY` bleibt `runtime_atlas`; `atlasTextureKey`,
`applyTexture`, `currentFrame`, `makeImage` unverändert.

Beleg für #1680: Fix in Commit 815df54, Reviewer-Urteil PASS (Gutter effektiv
4 px h+v, Padding exklusiv je Zelle, 0 Bleed, API und 52 Aufrufstellen korrekt).

## Belege (#K5)

Kontrollierte Render-Szene `scripts/art/atlas-evidence.mjs`: 47 Sprites,
Reihenfolge wie im Flail-Kampf (Gegner/Gems/FX im Wechsel mit Kugel/Kette/Pfütze,
dazu 13 Glyph-Einzeltexturen). WebGL-Draw-Calls via `drawArrays`/`drawElements`-
Hook pro Frame gezählt.

| Messgrösse | vorher (alter Atlas) | nachher (neuer Atlas) |
|---|---|---|
| Renderer | WebGL (`renderer.type=2`) | WebGL (`renderer.type=2`) |
| distinkte Texturen in der Szene | 17 (> 16 Textureinheiten) | **14** |
| Draw-Calls/Frame (72 Frames) | 144 → **2.0** | 72 → **1.0** |
| PNG | `shots/m10-atlas-before.png` | `shots/m10-atlas-after.png` |
| Pixel-Diff (ImageMagick AE) | – | **0** (`compare -metric AE` = 0, RMSE 0) |
| JS-Fehler | 0 | 0 |

Belege:
- `shots/m10-atlas-before.png`, `shots/m10-atlas-after.png` (960×540, identisch)
- `shots/m10-atlas-before.json`, `shots/m10-atlas-after.json`
- `shots/m10-atlas-audit.json`
- Tests: `npx vitest run tests/atlas.test.ts` 7/7 grün, `npm test` 211/211 grün.
 

## Offene Punkte

- Keine offenen Punkte für diese Lane.

