# Lane m10-chest-hint-wrap — Wortumbruch im Truhen-Panel

Anlass: Rest aus `docs/lanes/m10-chest-panel-ui.md` (Karte 4, art-director PASS 4/5 mit
nicht blockierender Meldung): Slot-Label „SEELENLEU/CHTFEUER“ bricht ohne Trennstrich
mitten im Wort; vom Evo-Satz rendert nur eine Zeile (`chestHintChars` = 72), die zweite
Hint-Zeile bleibt leer. Board-Karte #3424 (m10-results-layout) deckt den Ergebnis-Screen
ab — dieser Job nur das Truhen-Panel.

## Karte 1 — Ist-Messung (#6798)

`scripts/m10-chest-hint-wrap.mjs` (Muster `m10-chest-panel.mjs`: Glyph-Boxen über
`valueText`/`textWidth`, kein Container-`getBounds`) misst in **640x360@2** und
**780x360@3** (seed 101, `lantern` 8 + `charm` → Evolution `soul_beacon`, 3 Rewards):

- Slot-Label-Zeilen (text/text2, y 202/213+oy) je Slot, Bruchart (`fits` /
  `word-boundary` / `hyphen` / `mid-word`), Zeichenverlust, Slot-Breite (±48 px).
- Beide Evo-Hint-Zeilen (`chest-hint-0/1`, y 122/130+oy): Texte, Vollständigkeit des
  Satzes `AUS <desc> WIRD <name>.`, Überlappung vs. Truhen-Icon und Slot-Boxen,
  Panel-Rahmen (±2 px) und Viewport.

**Ist-Befund** (`shots/m10-chest-hint-wrap-before.json`, PNGs `-640.png`/`-780.png`,
EIN Lauf; ein abgebrochener erster Versuch ohne Messwerte — statischer Server startete
nicht, kein Skript-Edit):

| Profil | mid-word Cuts | Evo-Hint Zeile 0 | Zeile 1 | Überlappungen | JS-Fehler |
|---|---|---|---|---|---|
| 640x360@2 | `SEELENLEUCHTFEUER` (`SEELENLEU`/`CHTFEUER`) | voller Satz (58 Z.) | leer | 0 | 0 |
| 780x360@3 | `SEELENLEUCHTFEUER` (`SEELENLEU`/`CHTFEUER`) | voller Satz (58 Z.) | leer | 0 | 0 |

`chestHintChars` = 72 in beiden Profilen (`min(452, W-24)` → 452-Rahmen), der 58-Zeichen-Satz
passt deshalb auf eine Zeile — keine Abschneidung, aber die für zwei Zeilen angelegte
Hint-Zone bleibt zur Hälfte leer. Keine Überlappung der Hint-Zone (167/175) mit Icon
(bottom 157.8) oder Slots (top 195).

Akzeptanzgrenze (vor dem Fix festgelegt): **after** muss zeigen — 0 mid-word Cuts,
0 Zeichenverlust, Slot-Zeilen ≤ 13 Zeichen innerhalb ±48 px Slot-Breite, Evo-Satz
verlustfrei über beide Hint-Zeilen, 0 Überlappungen, alles im Panel-Rahmen/Viewport,
0 JS-Fehler. Höchstens eine Wiederholung pro Messlauf.

## Karte 2 — Fix (#6799, Commit 22c9faa)

- `src/gfx/text.ts`: `slotLabelLines(text, maxChars)` — Name passt → 1 Zeile; zwei Worte →
  Bruch an Wortgrenze; ein Compound-Wort > maxChars → **ausbalancierter Schnitt mit
  Trennstrich „-“** am Ende von Zeile 1 (`SEELENLEUCHTFEUER` → `SEELENLEU-`/`CHTFEUER`),
  nie Zeichenverlust; Ellipsis-Fallback (fitBanner) nur im unerreichbaren Überlauf-Fall.
  `wrapHintLines(text, maxChars)` — Evo-Satz verlustfrei an Wortgrenzen auf **beide
  Hint-Zeilen** ausbalanciert (kein `slice`-Satz-Abbruch mehr), Ein-Wort-Texte einzeilig.
- `src/scenes/UI.ts`: Slot-Labels (Roll- und Settle-Pfad) nutzen `slotLabelLines` mit neuer
  Konstante `CHEST_SLOT_LABEL_CHARS = 13` (statt Inline-13), `evolutionSentence` nutzt
  `wrapHintLines`. **Keine Anker/Konstanten verschoben** — Untertitel- (58+oy), Icon- (92+oy
  @2.6) und Hint-Anker (122/130+oy) unverändert, idempotent zu `applyPanelFix`
  (Review verifiziert: UI-Diff berührt nur die Wrap-Pfade + Konstante).
- `npx tsc --noEmit` rc=0, `tests/text-wrap.test.ts` 6/6.

## Karte 3 — Regressionstest (#6800, Commit d363ad8)

`tests/chest-hint-wrap.test.ts` (12 Tests, 3 Viewport-Profile 640x360 / 780x360 / 1920x1080,
Phaser-Mock wie chest-panel-ui.test.ts): alle 6 Evo-Sätze verlustfrei auf beide
Hint-Zeilen (`join(" ") === Satz`, keine Ellipsis, Zeilenbreite ≤ Hint-Zone), alle
6 Evo-Namen als Slot-Labels ohne mid-word Cut und ohne Zeichenverlust, gerenderte
Glyph-Boxen: 0 Überlappungen (Hint vs. Icon/Slot-Labels), innerhalb Panel-Rahmen (±2 px)
und Viewport, Untertitel-Anker unverändert. Einmal geschrieben, einmal gelaufen, 12/12.
`npm test` **893/893**, tsc rc=0.

## Karte 4 — Nachher-Messung + Abnahme (dieser Commit)

`shots/m10-chest-hint-wrap-after.json` + PNGs (`-640.png`, `-780.png`), EIN Lauf:

| Profil | mid-word Cuts | Evo-Hint Zeile 0 / Zeile 1 | Überlappungen | im Rahmen | JS-Fehler |
|---|---|---|---|---|---|
| 640x360@2 | 0 | `AUS GEISTERLATERNE + MAGNETAMULETT` / `WIRD SEELENLEUCHTFEUER.` | 0 | ja | 0 |
| 780x360@3 | 0 | `AUS GEISTERLATERNE + MAGNETAMULETT` / `WIRD SEELENLEUCHTFEUER.` | 0 | ja | 0 |

`passed: true` in beiden Profilen; Slot-Label `SEELENLEU-`/`CHTFEUER` mit Trennstrich,
Satz vollständig über beide Zeilen. `npm run build` rc=0.

**Abnahmen:**
- Reviewer (Commits 22c9faa/d363ad8): **PASS** — Off-by-one geprüft, keine Panel-Position
  verändert, Box-Mathematik des Tests exakt gegen `PixelText.layout()` verifiziert.
  Nits (optional, keine Folge-Karte erzwungen): Test-Metriken hardcoded;
  `wrapHintLines` splittet Kurz-Mehrwort-Texte auf 2 Zeilen (dokumentiertes Verhalten).
- Art-Director (beide after-Shots, 2x nearest): **PASS ~4.5/5** — Slot-Umbruch mit
  Trennstrich (4/5), Evo-Hinweis 2 Zeilen (5/5), Anker unverändert (5/5), Gesamteindruck
  (5/5). Nicht blockierender Verbesserungsvorschlag: Trennstrich idealerweise an
  Silbengrenze (`SEELEN-`/`LEUCHTFEUER` statt `SEELENLEU-`/`CHTFEUER`) — bewusst
  dokumentiert statt per Wörterbuch-Heuristik poliert; kann als Folge-Karte, nicht in
  dieser Lane.

## Messwerte (before → after)

| Profil | mid-word Cuts | Hint-Zeilen belegt | Überlappungen |
|---|---|---|---|
| 640x360@2 | 1 → **0** | 1/2 → **2/2** | 0 → 0 |
| 780x360@3 | 1 → **0** | 1/2 → **2/2** | 0 → 0 |

## Koordination / offene Punkte

- Kein Touch an Tabu-Dateien (`src/systems/ChestSystem.ts`, `src/logic/evolution.ts`,
  `src/logic/text.ts` — `slotNameLines` bleibt für `levelUpEvolutionHint` unverändert).
- `applyPanelFix`-Idempotenz: Anker unverändert, Review bestätigt.
- Fremde Dateien: die Mess-/Build-Läufe re-timestampen `shots/m10-passive-math-*.json`
  (nur `generatedAt`, bekannt von fe51683) — nicht von dieser Lane committet, zurückgesetzt.
- Offen (optional, Folge-Karte): Silbengrenzen-Heuristik für den Trennstrich-Umbruch
  (art-director-Vorschlag, nicht blockierend).

