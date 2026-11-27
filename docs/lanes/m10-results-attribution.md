# M10-Lane: results-attribution

Ziel: Der Ergebnis-Screen belegt korrekt, dass die Schadensbalken je Waffe/
Evolutionswaffe sich auf den im HUD gezeigten Gesamtschaden summieren
(Toleranz 1 %), absteigend sortiert sind, alle 12 Waffennamen vollstaendig auf
max. 2 Zeilen ohne Ueberlappung passen und der Bestwert-Banner nichts
ueberdeckt. Rein Anzeige/Logik, keine Balance-Aenderung.

## Vorher / Nachher

| Punkt | Vorher (Commit 78cdf03) | Nachher (eab1d1a) |
|---|---|---|
| Zeilen bei Evolutionslauf | 9 (Basis- **und** Evolutionszeile) | 6 (Evolution ersetzt Basis-Slot) |
| Summe Balken vs. HUD | pro Zeile `Math.round`, Delta je nach Bruchteilen moeglich | Largest-Remainder, Summe exakt = gerundeter Gesamtschaden |
| Waffenname | eine Zeile ab `cx-2`, lief in Balken/Zahlen | `slotNameLines`, max. 2 Zeilen, endet vor `barBg.x` |
| Wertspalte | `cx+204`, kollidierte mit dem Balken | `cx+214`, 5 px Abstand zum Balkenende |
| Header | ueberdruckte den Untertitel „NIEDERLAGE/SIEG" | Header bei `50+oy`, unter dem Untertitel (endet `49+oy`) |
| 12-Zeilen-Stress | nicht geprueft | 12 Namen, 0 Overlaps, letzte Icon-/Textunterkante `<= 258` (Panel-Unterkante 261) |

## Messwerte (Belege im Commit eab1d1a)

- `shots/m10-results-attribution.json`: 15 Spielminuten AutoPlay (timeScale 30,
  God, 6 Waffen + 6 Passives + Truhen), 51 Samples.
  - Final: `totalDamage=176104`, `barsSum=176104`, `deltaPct=0` (Toleranz 1 %).
  - `stressProof`: `rowCount=12`, `overlaps=0`, alle Namen vollstaendig, max. 2 Zeilen.
  - `jsErrors=0`.
- `scripts/m10-results-layout-check.mjs` (deterministisch, kein PNG-Sicht):
  prueft Text-Rechtecke (`slotNameLines`) gegen Trennlinie, Banner, Balken/Zahlen,
  Untertitel **und Panel-Unterkante** bei 640x360 und 1920x1080. Ergebnis:
  `iteration=1 totalOverlaps=0`, `RESULT PASS` (12 rows, maxLines 2, fullNames true).
  Festes Iterationslimit 3; bei Ueberlappung waere die Karte `blocked`.
- Screenshots (Belege, je 1920x1080 und 640x360):
  `shots/m10-results-attribution-{1920x1080,640x360}.png` (echter 15-min-Lauf)
  und `shots/m10-results-attribution-stress12-{1920x1080,640x360}.png`
  (alle 12 moeglichen Waffennamen).
- `tests/results.test.ts`: 14/14 gruen (0/1/viele Waffen, Largest-Remainder,
  Evolutions-Slot-Ersetzung, 0 Overlaps bei 640/1920, Header unter Untertitel).
- Gesamt: `npm run build` gruen, `npm test` 238/238 gruen.

## UX-/Layout-Urteil

**ux-check: PASS** (Re-Check bei Commit 55bf9c4; Erstlauf FAIL wegen alter
Screenshots + Panel-Unterkante, beides behoben).

- Sortierung absteigend, Gleichstand deterministisch nach id.
- Alle 12 Waffennamen vollstaendig, max. 2 Zeilen; `SEELENLEUCHTFEUER` bricht
  verlustfrei auf `SEELENLEU` / `CHTFEUER` (einzelnes 16-Zeichen-Wort,
  Zeichenumbruch noetig; vollstaendig und lesbar, rein kosmetisch).
- Kein Text ueberlappt Trennlinie, Balken, Zahlen oder Bestwert-Banner.
- Header kollidiert nicht mehr mit dem Szenen-Untertitel (Untertitel endet
  y=94, Header beginnt y=95 in 640x360).
- Letzte Namenszeile/Icon endet y<=256, Panel-Unterkante 261: goldener Rahmen
  schneidet keine Glyphen mehr.
- Belege: `shots/m10-results-attribution-{1920x1080,640x360}.png`,
  `-stress12-*`, `shots/m10-results-attribution.json` (05:46, HEAD).

## Offene Punkte

- `layoutResultRows` nimmt `width` als Parameter, alle Rechtecke sind aber
  relativ zur Mitte; die Ueberlappungspruefung ist daher skaleninvariant
  (640/1920 liefern dieselbe Zahl). echtes Szenen-Layout bleibt 480x270.
- Keine Balance-Aenderung; Totals kommen unveraendert aus dem Run-Result.
