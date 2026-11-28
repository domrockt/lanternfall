# Lane m10-chest-arrow-texture-r2 — Textur "arrow_chest" wiederhergestellt

**Bedarfsmeldung:** m10-atlas-gutter (2026-11-28T03:05Z, `~/games/.dispatch/requests.md`) —
`src/systems/ChestSystem.ts` bindet den Truhen-Randpfeil an die Textur `arrow_chest`
(`makeImage(scene, 0, 0, "arrow_chest")`, heute Zeile 316). Das Grid ist im M6-robust-Refactor
aus `SPRITE_GRIDS` verloren gegangen; der Pfeil renderte als Phaser-`__MISSING`-Fehlertextur.

**Fix:** `arrow_chest`-Grid (16×16) wieder in `SPRITE_GRIDS` (`src/gfx/textures.ts`) ergänzt.
Der Atlas-Präfix `arrow_chest` existierte weiter in `ATLAS_PREFIXES` (`src/gfx/atlas.ts`) — die
Textur wird damit automatisch in den Runtime-Atlas gepackt; `ChestSystem.ts` und `atlas.ts`
wurden nicht angefasst (Verweis unverändert, per Test gesichert).

## Pfeil-Design (16×16, rotation 0 = Spitze rechts)

- Kontur 0 (ink), Füllung 22 (glow, oben), Schattierung 21 (lantern, unten — Licht von oben-links),
  Spitzen-Highlight 13 (lanternWhite). Binäres Alpha (nur `.` oder Palettenindex).
- Wird ingame mit ADD-Blend + Tint `PAL[C.lantern]` + Scale 1.35 gerendert → goldener Pfeil.
- Hinweis (Argus 08:52Z) beachtet: `SPRITE_GRIDS.projectile_ice` & Co. nicht berührt; Runtime-
  Wahrheit für die überschriebenen Keys bleibt `WEAPON_SHOT_SIGNATURES` in `src/gfx/gen-fx.ts`.

## Messwerte / Belege

Belege liegen nach `~/games/.evidence/m10-chest-arrow-texture-r2/` (Dom-Regel 27.11.: Belege
nicht in git; nur Abnahme-Bilder in `shots/abnahme/`).

| Probe | Format | exists('arrow_chest') | Pfeil-Textur | Pfeil sichtbar | JS-Fehler |
|---|---|---|---|---|---|
| before (`before.json`) | 640×360@2 | **false** | `__MISSING` / `__BASE` | ja (als grüner Fehlerkasten, arrowX 616, rot 0) | 0 |
| before | 780×360@3 | **false** | `__MISSING` / `__BASE` | ja (Fehlerkasten, arrowX 756) | 0 |
| after (`after.json`) | 640×360@2 | **true** | `runtime_atlas` / `arrow_chest` | ja (goldener Pfeil, arrowX 616, rot 0) | 0 |
| after | 780×360@3 | **true** | `runtime_atlas` / `arrow_chest` | ja (arrowX 756, rot 0) | 0 |

Probe-Skript: `scripts/m10-chest-arrow-texture.mjs` (kein flock — keine FPS-/Echtzeit-Messung).

Abnahme-Bilder (git): `shots/abnahme/m10-chest-arrow-texture-r2-after-640x360.png`,
`-after-780x360.png`, `-after-zoom-4x.png` (4× nearest), `-after-zoom-780-3x.png`,
`-before-zoom-4x.png` (Kontrast: __MISSING-Kasten).

## Tests

- `tests/chest-arrow-texture.test.ts` (neu, 6 Tests): Grid existiert mit 16×16, Palette-Compliance
  (nur `.`/Index 0–31), Lantern-Look-Zeichen (0/22/21/13), Blickrichtung rechts, ChestSystem-Verweis
  `makeImage(scene, 0, 0, "arrow_chest")` unverändert, `shouldAtlasKey("arrow_chest") === true`.
- `npx tsc --noEmit` grün; `npm test` **179 Dateien / 1952 Tests grün** (inkl.
  `tests/palette-compliance.test.ts` weiter grün); `npm run build` grün.

## Art-Director-Abnahme

- **PASS** (2026-11-28, Grenze ≥ 4/5): after-zoom-4x **4**, after-zoom-780-3x **4**,
  after-640x360 (Vollbild) **4,5**. Befund: Pfeil auf dunklem Moor/Void sofort als Richtungs-
  Marker lesbar, Spitze eindeutig rechts (rotation 0 korrekt), warmes Gold im 32er-Nacht-Look,
  0 Off-Palette, binäres Alpha sauber, nearest 4×/3× scharf. Kein „muss neu", keine Blocker.
- Optionale Politur (nicht abnahmewirksam): obere Diagonale könnte gleichmäßigere 1–2-px-Stufen
  nutzen; Shaft-Knick an Spalte 0–3/row 9 ist bei ADD-Blend harmlos (Kontur ohnehin unsichtbar).

## Offene Punkte

- Keine. Der Pfeil ist eine restitution des M2-Zustands in der vom Briefing geforderten 16×16-Größe;
  das Original-9×9-Grid (Commit `58645ecc`) diente als Formreferenz.
