# Lane m10-chest-panel-ui — Untertitel-Anker im Truhen-Panel

Worktree `/home/ai/games/lf-lanes/m10-chest-panel-ui`, Branch `m10-chest-panel-ui`.
Fix-Job aus der Bedarfsmeldung von m10-chest-reveal (requests.md): Untertitel-Position
im Truhen-Panel war unbeauftragt geblieben. Nur UI-Panel-Layout (Disponent-Dateien),
kein Touch an ChestSystem.ts / src/logic/evolution.ts.

## Ergebnis in einem Satz

Der Untertitel hängt jetzt an der Titel-Unterkante als Anker (GLYPH_H × Scale + 6 px
statt Hartwert 54+oy) — Gap Titel→Untertitel **6 px** (vorher 2 px, Kriterium ≥ 4 px),
Untertitel→Truhen-Icon **6.2 px**, **0 Überlappungen** in 640x360 und 780x360@3,
Regressionstest über 3 Viewport-Profile grün (855/855), art-director PASS.

## Karte 1 — Ist-Messung (#6578, Commit d48a88b)

`timeout 300 node scripts/m10-chest-panel.mjs before` (kein flock — Screenshot-/Messlauf,
kein FPS). EIN Skript, je Tag ein Lauf (`before`/`after`-Tag als Argument). Misst
Glyph-Boxen (PixelText: 5x7, Origin 0/0 am Container-Y — Container-`getBounds()` sind
durch Atlas-Frames aufgebläht, siehe Lektion m10-chest-reveal) von Titel, Untertitel,
Truhen-Icon und Evo-Slot-Namen und schreibt `shots/m10-chest-panel-before.json` (+PNGs).

**Ist-Befund (beide Viewports identisch):** Titel „TRUHE GEÖFFNET" (Scale 2) endet bei
y 97, Untertitel „BELOHNUNGEN ROLLEN ..." beginnt bei y 99 → **Gap 2 px < 4 px**.
Ursache: Glyphen liegen mit Origin (0,0) am Container-Y, der Untertitel-Hartwert 54+oy
rechnete mit visuell zentrierter Glyphen-Box. Untertitel→Icon 5.4 px, sonst 0 Überlappungen,
0 JS-Fehler, Evo-Name „SEELENLEUCHTFEUER" 2-zeilig in den Slots gemessen.

## Karte 2 — Fix (#6579, Commit 295ea32)

`src/scenes/UI.ts`: Untertitel-Y = Titel-Baseline + `GLYPH_H * this.chestTitle.scale` +
`CHEST_SUBTITLE_GAP_PX` (6) — Anker relativ zur Panel-Box/Titel, kein Auflösungs-Hartwert.
Panel-Icon 92+oy @ 2.6, Evo-Hinweiszeilen 122/130+oy: **gespiegelte Werte** aus der
verifizierten Inszenierung m10-chest-reveal (`applyPanelFix`, lane-done 22:49) — nach dem
Merge setzt deren Laufzeit-Fix dieselben Zahlen, idempotent, kein visueller Sprung.
`onChestOpen` setzt Sprite-Position/-Skalierung pro Öffnen auf den Anker zurück
(Laufzeit-Zustand). Nachher: Gap 6 / 6.2 px, 0 Überlappungen, beide Viewports, 0 JS-Fehler
(`shots/m10-chest-panel-after.json`).

## Karte 3 — Regressionstest (#6580, Commit 5e8c645)

`tests/chest-panel-ui.test.ts` (18 Tests) über die neue reine Export-Funktion
`chestPanelBoxes(width, height)` in UI.ts (gleiche Konstanten wie `createChestUI`,
Muster wie `hudAnchorBoxes`). 3 Profile (640x360, 780x360, 1920x1080):
Untertitel-Oberkante ≥ Titel-Unterkante + 4 px (= Gap 6), 0 Überlappungen der Inhalte
(Titel, Untertitel, Icon, beide Hint-Zeilen), alles innerhalb Panel-Rahmen (±2 px) und
Viewport. Einmal geschrieben, einmal gelaufen, grün ohne Fix-Iteration (Supervisor-Notiz
eingehalten: keine weiteren UI.ts-Edits). `npx tsc --noEmit` grün, `npm test` 855/855.

## Karte 4 — Nachher-Messung + Abnahme (dieser Commit)

`shots/m10-chest-panel-after.json` final gegen den Endstand (Konstanten-Refaktor K3
verändert die Renderwerte nicht — belegt durch identische Messwerte):
0 Überlappungen, Gap 6 px (Titel→Untertitel) / 6.2 px (Untertitel→Icon) in **640x360**
und **780x360@3**, alles im Viewport, 0 JS-Fehler. Screenshots
`shots/m10-chest-panel-after-640.png` / `-780.png` von art-director geprüft:
**PASS, 4/5** — Titel/Untertitel klar getrennt (6 px Luft), Untertitel frei vom Icon,
Evo-Hinweiszeile frei von Icon und Slots, Panel zentriert, Palette konsistent.
Nicht blockierend (separates Ticket gemeldet): Slot-Label „SEELENLEU/CHTFEUER" bricht
ohne Trennstrich mitten im Wort (Ist-Zustand, nicht Teil dieses Fixes); vom Evo-Satz
rendert eine Zeile (Satz passt in `chestHintChars`, zweite Hint-Zeile bleibt leer).
`npm run build` rc=0.

## Messwerte (before → after)

| Profil | Gap Titel→Untertitel | Gap Untertitel→Icon | Überlappungen |
|---|---|---|---|
| 640x360 (dpr 2) | 2 px → **6 px** | 5.4 px → **6.2 px** | 0 → 0 |
| 780x360 (dpr 3) | 2 px → **6 px** | 5.4 px → **6.2 px** | 0 → 0 |

## Koordination / offene Punkte

- Kein Touch an ChestSystem.ts / src/logic/evolution.ts (Tabu, merge-m10-chest-reveal).
  Die gespiegelten Icon-/Hint-Werte bedeuten: nach dem Merge beider Branches liefern
  UI.ts und `applyPanelFix` dieselben Panel-Werte (kein Konflikt, kein Flip).
- Die Messskript-Anker (Glyph-Boxen) sind absichtlich dieselbe Methode wie in
  m10-chest-layout.mjs / m10-chest-reveal — Container-`getBounds()` nicht verwenden.
- Offen: nichts.
