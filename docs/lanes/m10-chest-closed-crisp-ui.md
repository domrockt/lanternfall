# Lane m10-chest-closed-crisp-ui — Truhen-UI ganzzahlig skaliert, mixel-frei (menu-art-crisp F2, UI-Teil)

**Ziel:** Letzter offener UI-Teil des menu-art-crisp-Befunds F2: Truhen-Icon bzw. Truhen-Darstellung im
In-Game-UI ganzzahlig skaliert und mixel-frei — 0 fraktionale Skalen, 0 Icon-/Text-Überlappungen,
bei **640x360@2 UND 780x360@3**. Keine Inszenierung (dafür ist m10-chest-reveal-staging zuständig),
keine Layout-Änderung außer der minimalen Skalierungs-Semantik.

**Dateien (Disponent):** src/scenes/UI.ts, tests/chest-closed-ui-crisp.test.ts,
scripts/m10-chest-closed-ui.mjs, diese Doku, shots/m10-chest-closed-ui-*, .lane-done.

## Messmethode (K1, scripts/m10-chest-closed-ui.mjs)

Muster: scripts/m10-chest-closed.mjs (Textur-Lane). Playwright-Harness, Truhen-Panel via
`debugTriggerEvent("chest")` geöffnet, `run.finishChest` im Mess-Kontext gesticct + auf Settle der
Slot-Icons gewartet (sonst schließt der Hide-Timer das Panel vor der Messung — erster Lauf lieferte
deshalb verfälschte Bounds). Gemessen je Viewport über die echten Laufzeit-Transforms:

- `chestSprite` (chest_closed): scaleX/scaleY, Anker, Gerätepixel je Texel (scale × pxPerGame).
- 5 Reward-Slot-Icons: Skala, Passung im 44-px-Slot, Zentrierung, Overlap mit Slot-Texten.
- Overlap: Icon-Box gegen Untertitel-/Titel-/Hint-Ink-Bounds (Glyphen 5x7, Origin 0/0,
  Container-Skala berücksichtigt) und NineSlice-Panel-Rahmen (Origin 0.5).
- Screenshots + 4x-nearest-Crops, Run-Length-Analyse (jede Run-Länge muss Vielfaches der
  Texeleinheit sein).
- Informativ, nicht Teil der statischen Crisp-Semantik: `chestBeam` (light_radius, ADD-Blend) und
  `fx_coin`-Münzen (Tween 1.4 → 0.4, animierte Partikel) — Ausnahme laut GAME.md
  (additive Lichter/VFX; animierte Partikel haben keine statische Texelgröße).

Belege: `~/games/.evidence/m10-chest-closed-crisp-ui/m10-chest-closed-ui-before.json` +
`*-panel.png` + 4x-Crops. Renderer: siehe JSON (`ANGLE ... Mesa Intel(R) Graphics (RPL-S)`, iGPU,
kein SwiftShader). 0 JS-Fehler.

## Befunde (K1, TAG=before)

| Objekt | 640x360@2 | 780x360@3 | Befund |
|---|---|---|---|
| chestSprite (chest_closed) | Scale 3, DevPx/Texel 6, Crop-Runs fraktional **0** | Scale 3, DevPx/Texel 9, **0** | **ok** (Fix aus m10-chest-icon-crisp hält) |
| Icon-Gaps | 5 px über Untertitel-Ink, im Rahmen | 5 px / im Rahmen | **ok** |
| Reward-Slot-Icons (3 sichtbar) | Scale **2.4**, DevPx/Texel **4.8**, Crop **1844** frakt. Runs | Scale **2.4**, DevPx/Texel **7.2**, Crop **3104** frakt. Runs | **Befund: fraktionale Skala → Mixel** (F2-Klasse) |

Slot-Anker selbst sind ganzzahlig (Slot-Pitch 86, Zentren ganzzahlig) — der Defekt ist nur die
Skala 2.4 (38.4 px Displaygröße). `chestPanelLayout().iconScale` (ChestSystem.applyPanelFix) setzt
das Panel-Icon zur Laufzeit bestätigt auf 3.

**Laufzeit-Notiz:** `ChestSystem.applyPanelFix()` überschreibt Panel-Icon (iconY 94+oy), Untertitel
(58+oy) und Hints (169/177) zur Laufzeit auf die Werte aus `chestPanelLayout` (src/logic/chest-reveal.ts).
Die UI-Erstellungs-Konstanten (CHEST_ICON_Y 92, CHEST_HINT_Y 122) sind dadurch nur Anker der
Erstellung; der Guard-Test (K3) prüft gegen `chestPanelLayout`, weil das der sichtbare Zustand ist.
fx_coin/chestBeam werden gemessen, aber als animierte FX/additives Licht nicht bewertet (GAME.md-Ausnahme).

**Akzeptanzgrenze vor dem Fix festgelegt:** after gilt als bestanden, wenn in beiden Formaten
(a) alle statischen Truhen-UI-Skalen ganzzahlig sind (chestSprite + Slot-Icons),
(b) Gerätepixel je Texel ganzzahlig,
(c) 0 fraktionale Run-Längen in den 4x-Crops von Truhen-Icon und Slot-Icon,
(d) 0 Icon-Überlappungen mit Untertitel/Titel/Hints/Slot-Texten und Icon im Panel-Rahmen.
Ein Wiederholungslauf ist nicht vorgesehen.

## K2 — Fix (geplant/umgesetzt)

`src/scenes/UI.ts`: Slot-Icon-Skala 2.4 → neue Export-Konstante `CHEST_SLOT_ICON_SCALE = 2`
(ganzzahlig; Stufe 3 = 48 px passt nicht in den 44-px-Slot und würde in die Slot-Texte ragen).
chestSprite-Draw unverändert (Stufe 3).

## K3 — Guard + Nachher (geplant/umgesetzt)

`tests/chest-closed-ui-crisp.test.ts`: ganzzahlige Skalen (chestSprite-Stufe 3, Slot-Icon-Konstante),
0 Overlaps via chestPanelBoxes-/chestPanelLayout-Mathematik je Profil (640x360, 780x360, 1920x1080).
Nachher-Lauf TAG=after → JSON + Crops in `~/games/.evidence/m10-chest-closed-crisp-ui/`.

## K4 — art-director + Abschluss

(offen)
