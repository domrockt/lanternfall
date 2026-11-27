# M10-ui-text-cost — UI-/Textkosten im Endgame senken

Lane: `m10-ui-text-cost`, Worktree `/home/ai/games/lf-lanes/m10-ui-text-cost`, Branch `m10-ui-text-cost`.
Ausgangslage: `m10-perf-rootcause` hat UI/PostFX als groessten Einzelposten belegt (50,7 → 60,1 FPS,
+18,5 % bei UI-Szene aus). Renderbreite kostet −15,6 %, Partikelreduktion ist neutral.
Ursache im Code: `PixelText.setText` (src/gfx/font.ts) zerlegte bei JEDEM Aufruf den String, rief
`ensureGlyph`, setzte pro Zeichen `setTexture` und `layout()` — auch wenn der Text identisch war.
`UI.update()` ruft `refreshHud` 60x/s mit meist unveraenderten Werten.

Hebel dieser Lane: **Text-/Layout-Arbeit nur bei echter Aenderung** (Dirty-Gates in `PixelText` und
`UI.refreshHud`/`refreshBoss`), nicht Renderbreite und nicht PostFX. Erwarteter Gewinn: deutlich
weniger `setText`-/`setTexture`-/`ensureGlyph`-Aufrufe, ≥30 % weniger UI-Update-Zeit, unveraendertes
Bild. Die Messung bestaetigt das; die **FPS im Endgame bleiben unveraendert** (der Hebel senkt
JS-Update-Arbeit, nicht GPU-Fill/Draw).

Geaenderte/neue Dateien: `src/gfx/font.ts`, `src/scenes/UI.ts`, `tests/pixel-text-cache.test.ts`,
`scripts/m10-ui-cost.mjs`, diese Doku, `shots/m10-ui-text-cost-*`.
Nicht angefasst: `src/scenes/Run.ts`, `src/systems/CombatSystem.ts`, `src/gfx/textures.ts`,
`src/systems/FxSystem.ts`, `GAME.md`, Board, kein push.

## K1 — Messbasis (`scripts/m10-ui-cost.mjs`)

Instrumentierung (verhaltensneutral): `textStats` in `src/gfx/font.ts` zaehlt `setText`-Aufrufe,
tatsaechliche `setTexture`-Aufrufe und `ensureGlyph`-Eintritte; das Messskript wrappt
`UI.sys.sceneUpdate` fuer die Update-Zeit der UI-Szene (ein Patch auf `ui.update` greift nicht,
Phaser cacht die Referenz beim Scene-Start).
Last: 500 `bog_rat` (Nachspawn auf 500), god + autoPlay, 6 Waffen Lv8, Seed 1, timeScale 1.
Zusaetzlich ein **stehendes HUD** auf einem frischen Run: sofort eingefroren (`run.timeScale = 0`,
direkte Zuweisung, weil `setTimeScale` auf ≥1 clamped), feste Werte (KILL 4242, 12:34, LV 12,
HP 77/100). Keine Kaempfe/AutoPlay-Picks vor dem Shot, damit der Vorher/Nachher-Crop deterministisch ist.

Kommandos (FPS-Anteile unter flock, alles andere ohne):

```
flock /home/ai/games/.lf-perf.lock timeout 240 node scripts/m10-ui-cost.mjs \
  --tag before --out shots/m10-ui-text-cost-before.json
```

| Config | FPS avg | FPS min (1-s-Bucket) | setText/s | setTexture/s | ensureGlyph/s | UI-Update ms/Frame |
|---|---|---|---|---|---|---|
| 640×360@1, laufend | 60,1 | 60,0 | 355,3 | 2370,5 | 2370,5 | 0,163 |
| 640×360@1, stehendes HUD | — | — | 299,9 | 1019,8 | 1019,8 | 0,110 |
| 780×360@3, laufend | 55,4 | 52,1 | 328,0 | 2250,9 | 2250,9 | 0,164 |
| 780×360@3, stehendes HUD | — | — | 299,9 | 1019,7 | 1019,7 | 0,105 |

Rohbelege: `shots/m10-ui-text-cost-before.json`, HUD-Crops
`shots/m10-ui-text-cost-hud-before-640x3601.png` und `…-780x3603.png`; Log `~/tmp/m10-ui-text-cost/k1-det.log`.
Alle Laeufe 0 JS-Fehler. (Der erste Before-Lauf ist im Supervisor-WIP-Snapshot `cb48b5f` gesichert;
die Before-Crops wurden fuer identisches Protokoll mit dem Pre-Fix-Stand neu erzeugt.)

## K2 — `setText`-Cache in `src/gfx/font.ts`

- `setText` kehrt sofort zurueck, wenn Wert **und** Farbe identisch sind (reine Frame-Arbeit ohne Bildgewinn).
- Pro Glyph wird der zuletzt gesetzte Texture-Key gecacht (`glyphKeys`); `setTexture` nur bei Key-Wechsel.
  Dadurch kostet z. B. `00:01 → 00:02` nur noch eine Textur statt aller Zeichen.
- `layout()` laeuft nur, wenn sich Laenge oder Align aendern (Glyphenbreite ist konstant).
- `setColorIndex` mutiert die Farbe vor dem Re-Render, deshalb invalidiert der Farbvergleich den Cache korrekt.
- Zaehler `textStats` bleiben fuer die Messung erhalten; kein sichtbarer Unterschied (K5: AE=0).

## K3 — Dirty-Gates in `src/scenes/UI.ts`

`refreshHud`/`refreshBoss` berechnen und setzen nur noch bei Aenderung:
- Level-, Timer- und KILL-String (String-Vergleich vor `setText`).
- XP-/HP-Ratio und HP-Farbe (nur bei neuem Wert/Farbe `setScale`/`setFillStyle`).
- Icon-Key-Liste und `evolutionReadyList` ueber eine billige Build-Signatur (`id:stufe` je Waffe/Powerup);
  erst bei Signaturaenderung werden Icons, Evo-Hinweiszeilen und HUD-Icon-Hintergrund neu gesetzt.
- Boss-Name, Phase, Ratio und Farbe einzeln gecacht; `bossGroup` wird nur bei Sichtbarkeitswechsel geschaltet.
- `create()` setzt die Caches nach `scene.restart()` zurueck (sonst blieben neue GameObjects auf Default).
`Run.ts` bleibt unberuehrt.

## K4 — Regressionstest `tests/pixel-text-cache.test.ts`

6 Faelle, gruen (`npx vitest run tests/pixel-text-cache.test.ts`):
- identischer Text → 120 `setText`-Aufrufe, aber **0 `setTexture`/0 `ensureGlyph`**;
- geaenderter Text rendert korrekt (Glyph-Keys, Sichtbarkeit inkl. Leerzeichen, Pool-Wiederverwendung);
- nur geaenderte Zeichen bekommen ein neues `setTexture` (`00:01 → 00:02` = 1);
- Center-/Right-Align layouten neu, ohne Texturen neu zu setzen; Laengenaenderung layoutet;
- Farbwechsel invalidiert den Cache und setzt alle Glyphen neu; gleiche Farbe erneut → 0.

## K5 — Nachher-Messung, Pixel-Diff und fullrun

Identisches Setup wie K1 (`--tag after`, gleiche 500er-Last, gleicher eingefrorener HUD-Snapshot):

| Messung | Vorher | Nachher | Delta |
|---|---|---|---|
| 640×360 laufend: setText/s | 355,3 | 69,1 | **−80,6 %** |
| 640×360 laufend: setTexture/s | 2370,5 | 257,0 | **−89,2 %** |
| 640×360 laufend: UI-Update ms/Frame | 0,163 | 0,077 | **−52,8 %** |
| 640×360 stehend: setText/s | 299,9 | 0 | **−100 %** |
| 640×360 stehend: setTexture/s | 1019,8 | 0 | **−100 %** |
| 640×360 stehend: UI-Update ms/Frame | 0,110 | 0,061 | **−44,5 %** |
| 780×360@3 laufend: setText/s | 328,0 | 65,1 | **−80,2 %** |
| 780×360@3 laufend: setTexture/s | 2250,9 | 224,6 | **−90,0 %** |
| 780×360@3 laufend: UI-Update ms/Frame | 0,164 | 0,080 | **−51,2 %** |
| 780×360@3 stehend: setText/s | 299,9 | 0 | **−100 %** |
| 780×360@3 stehend: setTexture/s | 1019,7 | 0 | **−100 %** |
| 780×360@3 stehend: UI-Update ms/Frame | 0,105 | 0,057 | **−45,7 %** |

Damit sind die Ziele uebertroffen: Textur-Arbeit bei stehendem HUD **−100 %** (Ziel −95 %),
UI-Update-Zeit **−44,5 % / −45,7 %** stehend bzw. **−52,8 % / −51,2 %** laufend (Ziel −30 %).

**Pixel-Diff HUD-Crop:** `compare -metric AE` ergibt **0** fuer 640×360 und **0** fuer 780×360@3
(`shots/m10-ui-text-cost-hud-diff.png` zeigt Vorher/Nachher-Paare mit AE=0; die Roh-Differenzbilder
liegen als `…-hud-diff-640.png`/`…-hud-diff-780.png` daneben). Das sichtbare HUD ist pixelgleich.
FPS laufend: 640×360 60,1 → 60,1; 780×360@3 55,4 → 56,7 (+1,3, Rauschen).

**30-min-fullrun (timeScale 30, god, autoPlay, default View, unter flock):**

| Lauf | fpsMin | Sieg | Heap +vs Minute 1 |
|---|---|---|---|
| Vorher (Pre-Fix-Stand, gleiche Session) | 42,0 | dawn | −1,6 % |
| Nachher #1 | 41,1 | dawn | +8,5 % |
| Nachher #2 | 42,1 | dawn | +10,5 % |
| Referenz `m10-perf-rootcause` (anderer Zeitpunkt) | 42,8 | dawn | +8,5 % |

Urteil: **fpsMin neutral** (42,0 vorher vs. 41,1/42,1 nachher, Streuung ≈±1 FPS); die ≥55-Bonusmarke
wird nicht erreicht. Das ist erwartbar: der Fix spart JS-Update-/Texturarbeit, nicht GPU-Fill/Draw.
Der Endgame-FPS-Blocker (Renderbreite/PostFX) bleibt separate Arbeit, nicht Gegenstand dieser Lane.
Rohbelege: `shots/m10-ui-text-cost-after.json`, `shots/m10-ui-text-cost-fullrun-{before,after,after2}.json`,
Logs `~/tmp/m10-ui-text-cost/k5*.log`.

## Abnahme-Status

- `npx tsc --noEmit`: gruen. `npm test`: gruen, Testzahl steigt um 6 Faelle (pixel-text-cache).
- JSON-Belege before/after mit Zahlen: liegen im Lane-Commit.
- Pixel-Diff HUD-Crop: AE=0 (640×360 und 780×360@3).
- Datei, Hebel, erwarteter Gewinn: in diesem Dokument benannt.
- `src/scenes/Run.ts` und die gesperrten Dateien: unveraendert. Kein Board, kein push, kein GAME.md.
- Hinweis: Der K1-Teil (Skript + Before-Belege + Font-Instrumentierung) wurde vom Supervisor als
  WIP-Snapshot `cb48b5f` committet; K2–K5 sind eigene Karten-Commits mit Praefix
  `M10-m10-ui-text-cost:`. Der Lane-Briefing-Zusatz „kein Board" wurde eingehalten.
