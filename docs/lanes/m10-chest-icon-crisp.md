# Lane m10-chest-icon-crisp — Truhen-Icon im offenen Panel: ganzzahlige Draw-Stufe

**Quelle:** menu-art-crisp Befund F2 (chest_closed-Mixel im Truhen-Panel), gleiche
Mixelklasse wie title_background F1 (m10-title-bg-crisp). Der Textur-Teil
(`src/gfx/textures.ts`) bleibt bis zum Ende der Evo-FX-Kette gesperrt — dieser
Job fixt nur den disjunkten UI-Draw-Pfad (`src/scenes/UI.ts`).

## Befund (vorher, shots/m10-chest-icon-before.json)

Das Panel-Icon wurde mit dem Layout-Wert `CHEST_ICON_SCALE = 2.6` gezeichnet:

| Format | Renderer | Scale | Gerätepixel je Texel | gerastert? |
|---|---|---|---|---|
| 640x360@2 | ANGLE Intel RPL-S (iGPU, swiftShader=false) | 2.6 | 5.2 | **NEIN** |
| 780x360@3 | ANGLE Intel RPL-S (iGPU, swiftShader=false) | 2.6 | 7.8 | **NEIN** |

Zentrierung (x=320/390, y=137) und Clipping-Freiheit waren bereits korrekt.
4x-nearest-Crops zeigen ungleichmäßige Kanten/Mixelzeilen (schwarzer Rand
asymmetrisch, Kanten matschig).

## Fix (K2, Commit 2e30dc3)

- `CHEST_ICON_SCALE = 2.6` bleibt der **Layout-/Anker-Wert** (chestPanelBoxes,
  tests/chest-panel-ui.test.ts pinnt 2.6) → Panel-Layout und Anker-Boxen unverändert.
- Neu: `CHEST_ICON_DRAW_SCALE = 3` (nächste ganzzahlige Stufe zum Layout-Wert)
  an **beiden** Draw-Stellen (`createChestUI` + `onChestOpen`-Reset in UI.ts).
  Platz verifiziert: 3 px unter dem Untertitel, 6 px über dem Hint-Band,
  innerhalb des Panel-Rahmens.

## Nachher (shots/m10-chest-icon-after.json)

| Format | Scale | Gerätepixel je Texel | gerastert? | Zentriert | Clipping |
|---|---|---|---|---|---|
| 640x360@2 | 3 | 6 | JA | ja (320/137) | nein |
| 780x360@3 | 3 | 9 | JA | ja (390/137) | nein |

Skript-Verdict `passed: true`, 0 JS-Fehler, Renderer-String-Pflicht erfüllt (iGPU).

## Tests

- `tests/chest-icon-crisp.test.ts` (neu, 14 Tests): Stufe ganzzahlig + nächste
  Stufe zu 2.6, Gerätepixel/Texel ganzzahlig (+Befund-Kontrast: 2.6 wäre es
  nicht), Fit unter Untertitel/über Hint-Band/im Rahmen je Profil (640x360,
  780x360, 1920x1080), Zentrum ganzzahlig, Anker-Box-Beweis (icon-Box bleibt
  2.6), Quell-Scan (`setScale(CHEST_ICON_SCALE)` verboten).
- Regression: chest-panel-ui, chest-hint-wrap, hud-anchor, hud-safearea,
  chest-arrow — zusammen 68/68 grün (K2, tsc sauber).

## Abnahme (K3)

- after-JSON beide Formate: Scale ganzzahlig belegt (before/after oben).
- 4x-Zoom-Crops beider Formate (after): uniforme Texel, sauber gestufte Kanten.
- art-director streng (>= 4/5 nötig): siehe unten.

## art-director-Urteil (K3, streng)

**PASS — Note 5/5 je Format** (640x360@2 und 780x360@3, 4x-nearest-Crops):

- Uniforme Texelgröße: Run-Length-Analyse über alle Zeilen — alle Läufe sind
  Vielfache der Texeleinheit (8 px @640@2 / 12 px @780@3), keine Zwischenlängen,
  9 Farben = reine Palette ohne Interpolations-Grautöne.
- Silhouette (Deckel/Band/Schloss) klar lesbar, >= 3 Schattierungsstufen, Licht von oben.
- Zentrierung: Icon-Zentrum == Untertitel-Zentrum in beiden Formaten (639.5 / 1169.5),
  klare Abstände, kein Clipping, kein Overlap.
- AE-Pixeldiff: alle UI-Diffs liegen in der Icon-Bbox; Titel, Untertitel,
  Belohnungsreihe und Hinweistexte pixelidentisch (Rest ±1-Flackern der live
  gedimmten Welt, keine UI-Aenderung).
- Gegenprobe vorher: Schlagschatten asymmetrisch, Bandkanten versetzt — Fix wirkt.

## Offene Punkte

- Bleibt im 4x-Zoom ein Rest-Mixel sichtbar, wäre die Textur selbst defekt
  (`src/gfx/textures.ts`) — Befund + 4x-Beleg stehen hier; der textures.ts-Rest
  wird nach der Evo-FX-Kette als eigener Job geschnitten (Briefing, Zeile 6).
