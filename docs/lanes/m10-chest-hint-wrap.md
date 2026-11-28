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
