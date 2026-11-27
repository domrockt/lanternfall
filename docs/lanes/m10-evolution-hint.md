# Lane m10-evolution-hint — Evolutionspfad sichtbar machen

Ziel: Sobald eine Waffe Stufe 8 hat und das passende Powerup ≥ 1, zeigen
Level-up-Panel und HUD „EVOLUTION BEREIT“ (max. 2 Zeilen, kein Überlappen mit
Panelrand oder Trennlinie). Die Truhe erklärt in einem Satz, was evolviert.
Keine Änderung an `logic/levelup.ts`-Angebotslogik, keine Daten-/Balanceänderung.

Vier Karten: (1) Ist-Beleg, (2) reine Logik `evolutionReadyList`, (3) UI-Hinweis,
(4) Doku + `.lane-done`.

## K1 — Ist-Beleg (vor dem Fix)

Debug-Run je Evolution: Basiswaffe Stufe 8, passendes Powerup Stufe 1, Level-up
per `giveXp`, danach Truhe per `openChest`. Zwei View-Formate:
`640×360` und `780×360` (CSS, `deviceScaleFactor 2` → logisch 640/780 × 360).

Belege:
- `shots/m10-evolution-hint-before.json` — 12 Szenarien (6 Evolutionen × 2 Views)
- `shots/m10-evolution-hint-before-<evo>-levelup-<view>.png`
- `shots/m10-evolution-hint-before-<evo>-chest-<view>.png`

**Befund:** `evolutionsWithoutHint: 6` — alle 6 Evolutionen bekommen im Level-up
weder Badge noch Zeile; die Truhe zeigt nur „EVOLUTION“ und den Namen, aber
keinen erklärenden Satz. Die Evolution ist als Angebot vorhanden
(`evolutionOffered: true`), der Pfad ist aber nicht als solcher lesbar.

## K2 — Reine Logik

`evolutionReadyList(weapons, passives)` in `src/logic/evolution.ts`:
nutzt `canEvolve`-Regeln (`evolvableList`), keine Duplikate, deterministische
Reihenfolge aus `EVOLUTIONS`-Tabellenreihenfolge. Tests in
`tests/evolution-hint.test.ts`.

## K3 — UI-Hinweis

Badge/Zeile in `src/scenes/UI.ts` für Level-up-Karten und HUD; Text über
`slotNameLines`/`wrapText` auf ≤ 2 Zeilen; Hit-/Fokusflächen unverändert
bedienbar per Tastatur und Touch. Pixel-Check: Randabstand ≥ 2 px, keine
Überlappung mit Trennlinie (beide View-Formate).

**Nachher-Belege** (`shots/m10-evolution-hint-after.json`, 12 Szenarien):
- `shots/m10-evolution-hint-after-<evo>-levelup-<view>.png` — Panel-Zeile
  `EVOLUTION BEREIT: <NAME>` zwischen Untertitel und Karten.
- `shots/m10-evolution-hint-after-<evo>-chest-<view>.png` — Truhen-Satz
  `AUS <BASIS> + <POWERUP> WIRD <EVOLUTION>.`
- **6/6 Evolutionen mit Hinweis**, `maxHintLines: 1` (Limit 2).
- **0 Überlappungen mit Panelrand/Trennlinie**: kleinster Randabstand
  Level-up **42 px**, Truhe **52 px**; kleinster Abstand zur Trennlinie
  **49,5 px** (Ziel ≥ 2 px).
- Tastatur (`pickLevelUp` via Taste 3) und Touch (Karte antippen) schließen
  das Panel weiterhin; `keyboardPickOk: true`, `touchPickOk: true`.
- 0 JS-Fehler.


## K4 — Doku + `.lane-done`

Vorher/Nachher-Belege, 6/6 Evolutionen mit Hinweis, Messwerte in dieser Datei.

## Ergebnis

| Kriterium | Vorher | Nachher | Beleg |
|---|---|---|---|
| Evolutionen mit Hinweis | 0/6 | **6/6** | `shots/m10-evolution-hint-before.json` / `-after.json` |
| Level-up-Panel-Hinweis | fehlt | `EVOLUTION BEREIT: <NAME>` | `-after-<evo>-levelup-<view>.png` |
| HUD-Hinweis | fehlt | `EVOLUTION BEREIT` + Name | dieselben Shots (oben rechts) |
| Truhen-Erklärung | fehlt | `AUS <BASIS> + <POWERUP> WIRD <EVOLUTION>.` | `-after-<evo>-chest-<view>.png` |
| Zeilenlimit | – | max. **1** Zeile (Limit 2) | `maxHintLines` im JSON |
| Randabstand Panel | – | min. **42 px** (Ziel ≥ 2) | `minLevelupMarginPx` |
| Randabstand Truhe | – | min. **52 px** (Ziel ≥ 2) | `minChestMarginPx` |
| Abstand Trennlinie | – | min. **49,5 px** | `minDividerGapPx` |
| Überlappungen (640×360 + 780×360) | – | **0** | `overlapIssues: 0` |
| Tastatur / Touch | – | beide OK | `keyboardPickOk`, `touchPickOk` |
| JS-Fehler | – | **0** | `jsErrors: []` |

**Build/Tests:** `npm run build` grün; `npm test` **247 Tests / 20 Dateien grün**
(davon 7 neue in `tests/evolution-hint.test.ts`).
`npx tsc --noEmit` grün.

**Nicht geändert:** `src/logic/levelup.ts`-Angebotslogik, `src/data/*` (keine
Daten-/Balanceänderung), GAME.md.

**Offene Punkte (ehrlich):**
- Der HUD-Hinweis sitzt rechts neben der Icon-Leiste (x=330) und zeigt bei
  mehreren bereiten Evolutionen nur die erste; das Level-up-Panel nennt die
  konkrete Evolution des Angebots. Für 6 gleichzeitig bereite Pfade steht dort
  `EVOLUTION BEREIT (n)` + `U.A. <erste>`.
- Der Pixel-Check misst Text-/Rahmen-Bounds aus der laufenden UI-Szene
  (Playwright), nicht per OCR; die Shots sind zusätzlich gesichtet.
- Keine Änderung an der Angebotslogik: der Hinweis beschreibt nur den Zustand,
  er erzwingt keine zusätzliche Evolution im Level-up.

