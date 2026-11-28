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

## K2 — Fix (umgesetzt, a6b6bad0)

`src/scenes/UI.ts`: Slot-Icon-Skala 2.4 → neue Export-Konstante `CHEST_SLOT_ICON_SCALE = 2`
(ganzzahlig; Stufe 3 = 48 px passt nicht in den 44-px-Slot und würde in die Slot-Texte ragen).
chestSprite-Draw unverändert (Stufe 3). tsc + chest-icon-crisp/chest-panel-ui/chest-hint-wrap
(44 Tests) grün.

## K3 — Guard + Nachher (umgesetzt)

`tests/chest-closed-ui-crisp.test.ts` (12 Tests): ganzzahlige Skalen (Panel-Icon-Stufe ==
`chestPanelLayout().iconScale`, Slot-Icon ganzzahlig und passend im 44-px-Slot), Gerätepixel je
Texel ganzzahlig je Profil (640x360@2, 780x360@3, 1920x1080), 0 Icon-Überlappungen mit
Titel-/Untertitel-/Hint-Ink und Icon im Panel-Rahmen, `chestPanelBoxes` überlappungsfrei.

Nachher-Lauf (TAG=after, JSON in `~/games/.evidence/m10-chest-closed-crisp-ui/`):

| Format | chestSprite | Slot-Icons | Crop frakt. Runs (Icon/Slot) | Overlaps | Verdict |
|---|---|---|---|---|---|
| 640x360@2 | Scale 3, DevPx/Texel 6 | Scale 2, DevPx/Texel 4 | 0 / 0 | 0, Gap Untertitel 5 px, im Rahmen | **passed** |
| 780x360@3 | Scale 3, DevPx/Texel 9 | Scale 2, DevPx/Texel 6 | 0 / 0 | 0, Gap Untertitel 5 px, im Rahmen | **passed** |

Renderer je JSON (iGPU `Mesa Intel(R) Graphics (RPL-S)`, kein SwiftShader), 0 JS-Fehler,
`roundPixels: true`. Abnahme-Bilder: `shots/abnahme/m10-chest-closed-ui-after-640x360@2.png` und
`...-780x360@3.png` (Sichtprüfung: Icon + 3 Slot-Icons sauber gerastert, klare Gaps).

## K4 — art-director + Kontrolleure + Abschluss

- **art-director: PASS, 4,5/5** (beide Formate): Truhen-Icon nur vollständige Texelblöcke
  (nonMultipleRuns 0, Unit 24/36 Device-px), Silhouette lesbar, Slot-Icons ganzzahlig/zentriert,
  0 Überlappungen, Formate konsistent (nur Texeldichte 6 vs. 9). Nicht-blockierende Notiz:
  5-px-Gap Untertitel↔Icon knapp, ggf. künftig ≥ 6 px.
- **reviewer: PASS** (Lane-Diff 0ce7164a..HEAD): nur claimed Dateien, UI.ts-Änderung minimal
  (CHEST_SLOT_ICON_SCALE), Guard-Test 12 passed, Modellierung korrekt (chestPanelLayout =
  Laufzeit, Glyph-Origin 0/0), keine Secrets/Temp-Dateien, GAME.md unberührt, je Karte ein Commit.
  Nits: Commit-Message #13127 „DevPx/Texel 6" für Slots war der Wert des Panel-Icons
  (Slots @2 = 4 — in dieser Doku korrigiert); redundante Assertions im Guard-Test;
  overlapText wird runtime nicht gemessen (statisch über Slot-Passung abgedeckt, real ~10 px Luft).
- **verify:final:** 7/7 PASS (unverändert grün). `npm run build` + `npm test` (230 Dateien,
  2506 Tests) grün.

**Ergebnis:** menu-art-crisp F2 UI-Teil abgeschlossen — 0 fraktionale Skalen im Truhen-UI
(beide Abnahme-Formate, Pixel-Scan belegt), 0 Icon-/Text-Überlappungen, Inszenierung unberührt.
Offene Punkte: keine aus dieser Lane; fx_coin/chestBeam bleiben als animierte FX/additives Licht
außerhalb der statischen Crisp-Semantik (GAME.md-Ausnahme).
