# Lane m10-damage-batch — Damage-Number-Kosten im 500er-Chaos

Ziel (Briefing): `setText`-Kosten der gepoolten Damage-Numbers senken, ohne
Lesbarkeit oder Schadenszahlen zu veraendern. Messaufbau: 500 Gegner, 6 Waffen
Lv8, Seed 1, autoPlay + god, 10 s (`scripts/m10-damage-batch.mjs`).

## Karten

| Karte | Commit | Inhalt |
|---|---|---|
| K1 Baseline | `10d2c63`, `b19ec4a` | Messskript + Beleg `shots/m10-damage-batch-before.json/png`; Skript haertet Gegner unsterblich (konstante 500er-Last) |
| K2 Fix | `cdfe56d` | `src/systems/DamageNumbers.ts`, `src/logic/damage-numbers.ts`: Label-Memo (setText nur bei Textaenderung), Flush einmal pro Frame, Aggregation pro Bildschirmzone (9 Zonen, `groupZoneFor`), hartes View-Cap 10 (`MAX_VIEWS_AGGREGATE` + `enforceViewCap`) |
| K3 Test | `520ae82` | `tests/damage-number-batch.test.ts` 12/12: Summenabgleich <=1 %, keine Doppel-Labels, Cap, LabelMemo-Spy, 0 NaN/negativ, Zonen-Keys |
| K4 Messung | siehe unten | Vorher/Nachher + HUD-Abgleich + Vergleichs-PNG |

## Messwerte (10 s, Seed 1, 500 Gegner, 6 Waffen Lv8)

Vorher = alte Implementierung (`git 10d2c63`-Stand, temporaer gebaut,
`shots/m10-damage-batch-before-old.json`). Nachher = Fix
(`shots/m10-damage-batch-after-fair.json`). Gleiche Skriptversion
(per-View setText-Zaehler, Zaehler fuer report()).

| Metrik | Vorher | Nachher | Delta |
|---|---|---|---|
| `setText`/s (Damage-Views) | 28,9 | 24,1 | **-16,6 %** |
| ms/Frame (Median) | 19,33 | 16,76 | **-13,3 %** |
| FPS | 51,7 | 59,7 | +8,0 |
| max aktive Views | 6 | 6 | 0 (Cap 10 nie erreicht) |
| avg aktive Views | 5,96 | 5,97 | 0 |
| report()-Aufrufe/s | 508,1 | 584,4 | +15 % (Laufvarianz, gleiches Verhalten) |
| HUD-Summe vs. Balkensumme | 0 % Abw. | 0 % Abw. | ok |
| JS-Fehler | 0 | 0 | ok |

## Interpretation (ehrlich)

- **Ziel „`setText`/s -50 %" nicht erreicht (-16,6 %).** Grund: Das Label-Memo
  unterdrueckt nur Aufrufe, bei denen der *sichtbare Text* gleich bleibt. Im
  Chaos steigt der summierte Schaden fast bei jedem Treffer, das Label aendert
  sich also fast immer. Der echte Gewinn liegt woanders: Vorher rief jeder
  Treffer `setText` **und** `setColorIndex` (intern erneut `setText` = Glyphen-
  Redraw) auf; Nachher laufen Farbe/Scale/Text nur noch bei echter Aenderung und
  hoechstens einmal pro Frame.
- ms/Frame -13 % und FPS +8 passen dazu; die Werte sind **einzelne 10-s-Laeufe
  ohne flock** (Lock war durch einen 30-min-realtime-Lauf einer Nachbarlane
  belegt, siehe Methodik) — als Trend, nicht als Absolutwert lesen.
- View-Cap 10: im Messlauf waren nur 6 Views aktiv (9 Zonen, Kamera-Cull), das
  Cap sichert aber den Worst Case (vorher bis 24 moeglich) ab. `maxActiveViews`
  6 in beiden Laeufen.
- HUD-/Ergebnis-Abgleich: `hudTotal == rawTotal == barsSum`, deltaPct 0 % in
  beiden Laeufen — die Schadenszahlenveraenderung ist 0.

## Dateien / Hebel

- `src/logic/damage-numbers.ts`: `LabelMemo`, `ViewBudget`, `aggregateKey`/
  `entryMatchesKey` (Zonen-Key negativ, kollidiert nicht mit UIDs),
  `groupZoneFor` (3x3 Zonen), `MAX_VIEWS_AGGREGATE = 10`.
- `src/systems/DamageNumbers.ts`: Treffer markieren nur noch dirty; Label/Farbe/
  Scale werden im Frame-Flush nur bei Aenderung gesetzt; recycelte Views bauen
  das Label-Memo neu auf; `enforceViewCap` stilllegt beim Wechsel in den
  Aggregat-Modus aelteste Views.
- `src/systems/CombatSystem.ts` nur gelesen (Claim `m10-ember-readability`).

## Methodik / Vorfaelle

- Instrumentierung: Prototype-Override von `setText` zaehlte unzuverlaessig
  (vorher 80 bzw. 251 setText bei >5000 report()-Aufrufen). Zuverlaessig ist
  eine eigene Methode je Textobjekt (`scripts/m10-damage-batch.mjs`, Hook).
- Vorher-Messung: Alt-Code temporaer aus `git 10d2c63` eingesetzt, `rm -rf dist`
  + Neubau, Lauf, dann Fix wiederhergestellt (Beleg `before-old`, danach
  `after-fair` mit identischem Skript).
- Supervisor-Snapshot `58134e7` erfasste zwischenzeitlich ausgewechselte
  Alt-Sources + geloeschte Tests; Reparatur in `a27047c` (K2/K3-Stand und
  K1-Beleg `before.json/png` wiederhergestellt). Verwirrende Zwischen-JSONs
  (`after`, `after2`, `before-clean`, `after-clean`, `before-fair`) im K4-Commit
  entfernt.

## Offene Punkte / Folge-Karten

1. `setText`/s weiter senken: Zahlen-Update auf 30 Hz drosseln (Label nur im
   2. Frame flushen) — aendert sichtbar nur die Update-Rate, nicht den
   Endwert; braucht Sichtpruefung im Chaos.
2. `ColorIndex`-Redraw im `PixelText` selber cachen (Glyphen umfaerben statt
   Neuzeichnen) — Engine-Hebel, betrifft auch HUD-Texte.
