# M10-ui-text-cost — UI-/Textkosten im Endgame senken

Lane: `m10-ui-text-cost`, Worktree `/home/ai/games/lf-lanes/m10-ui-text-cost`, Branch `m10-ui-text-cost`.
Ausgangslage: `m10-perf-rootcause` hat UI/PostFX als groessten Einzelposten belegt (50,7 → 60,1 FPS,
+18,5 % bei UI-Szene aus). Renderbreite kostet −15,6 %, Partikelreduktion ist neutral.
Ursache im Code: `PixelText.setText` (src/gfx/font.ts) zerlegt bei JEDEM Aufruf den String, ruft
`ensureGlyph`, setzt pro Zeichen `setTexture` und `layout()` — auch wenn der Text identisch ist.
`UI.update()` ruft `refreshHud` 60x/s mit meist unveraenderten Werten.

Hebel dieser Lane: **Text-/Layout-Arbeit nur bei echter Aenderung** (Dirty-Gates), nicht Renderbreite
und nicht PostFX. Erwarteter Gewinn: messbar weniger `setText`-/`setTexture`-/`ensureGlyph`-Aufrufe
und ≥30 % weniger UI-Update-Zeit; das sichtbare Bild bleibt unveraendert (AE=0 auf dem HUD-Crop).

Geaenderte/neue Dateien: `src/gfx/font.ts`, `src/scenes/UI.ts`, `tests/pixel-text-cache.test.ts`,
`scripts/m10-ui-cost.mjs`, diese Doku, `shots/m10-ui-text-cost-*`.
Nicht angefasst: `src/scenes/Run.ts`, `src/systems/CombatSystem.ts`, `src/gfx/textures.ts`,
`src/systems/FxSystem.ts`, `GAME.md`, Board, kein push.

## K1 — Messbasis (`scripts/m10-ui-cost.mjs`)

Instrumentierung (verhaltensneutral): `textStats` in `src/gfx/font.ts` zaehlt `setText`-Aufrufe,
tatsaechliche `setTexture`-Aufrufe und `ensureGlyph`-Eintritte; das Messskript wrappt `UI.sys.sceneUpdate`
fuer die Update-Zeit der UI-Szene (Patch auf `ui.update` greift nicht, Phaser cacht die Referenz).
Last: 500 `bog_rat` (Nachspawn auf 500), god + autoPlay, 6 Waffen Lv8, Seed 1, timeScale 1; zusaetzlich
ein eingefrorenes, deterministisches HUD (timeScale 0, feste Werte) fuer die Bildprobe.

Kommandos (FPS-Anteile unter flock, sonst ohne):

```
flock /home/ai/games/.lf-perf.lock timeout 240 node scripts/m10-ui-cost.mjs \
  --tag before --out shots/m10-ui-cost-before.json
```

| Config | FPS avg | FPS min (1-s-Bucket) | setText/s | setTexture/s | ensureGlyph/s | UI-Update ms/Frame |
|---|---|---|---|---|---|---|
| 640×360@1, laufend | 60,1 | 60,0 | 353,1 | 2686,4 | 2686,4 | 0,169 |
| 640×360@1, stehendes HUD | — | — | 299,7 | 1019,0 | 1019,0 | 0,098 |
| 780×360@3, laufend | 54,5 | 50,2 | 322,8 | 1519,1 | 1519,1 | 0,144 |
| 780×360@3, stehendes HUD | — | — | 263,1 | 894,7 | 894,7 | 0,116 |

Rohbelege: `shots/m10-ui-text-cost-before.json`, HUD-Crops
`shots/m10-ui-text-cost-hud-before-640x3601.png` und `…-780x3603.png`; Log `~/tmp/m10-ui-text-cost/k1.log`.
Alle Laeufe 0 JS-Fehler.

## K2 — `setText`-Cache in `src/gfx/font.ts`

(noch offen)

## K3 — Dirty-Gates in `src/scenes/UI.ts`

(noch offen)

## K4 — Regressionstest `tests/pixel-text-cache.test.ts`

(noch offen)

## K5 — Nachher-Messung + Abnahme

(noch offen)
