# Lane m10-damage-calm — Schadenszahlen-Flut

Ziel: Bei Massen stehen Dutzende kleiner Schadenszahlen ("26/30") übereinander.
Zusammenfassen/Drosseln, nur Krits groß. Keine Balance-Änderung, keine Schadenswerte.

## K1 — Vorher-Beleg (#5858)

Skript: `scripts/m10-damage-calm.mjs` (Seed 1, god + autoPlay, 6 Waffen Stufe 8,
Probe 6 s, Report-Hook zählt gemeldete Treffer/Schaden; keine FPS-Messung → ohne flock).
Erwartete Chaos-Bedingung Minute 25 laut Briefing (300+ Gegner) plus zwei
ergänzende Regimes, um die Flut-Quelle einzugrenzen:

| Tag | Setup | max sichtbare Labels | avg | Überlappungs-Paare | Einträge (max) | reports/s |
|---|---|---|---|---|---|---|
| `before` | Minute 25 (1490 s), 340 Gegner verteilt | **6** | 5.39 | 0 | 8 | 796 |
| `before-sub` | Minute 8 (480 s), 110 Gegner verteilt | 4 | 3.34 | 0 | 6 | 311 |
| `before-tight` | Minute 2:30 (150 s), **115 Gegner dicht um den Spieler** | **24** | **23.62** | 0 | 48 (MAX_ENTRIES) | 121 |

Belege: `shots/m10-damage-calm-before.png/-json`, `-before-sub.*`, `-before-tight.*`.

### Befund

- **Minute-25-Aggregat-Frame ist bereits ruhig**: ab 120 Gegnern bündelt das
  bestehende Aggregat (`shouldAggregateDamage`, Zonen-Gruppe 3×3,
  `MAX_VIEWS_AGGREGATE=10`) auf ≤ 8 Zonen-Labels mit Summenwerten (z. B. "1645!").
- **Die Flut lebt im Sub-Threshold-Regime** (< 120 Gegner, LOD "full",
  `damageAggregate: false`): dort ein Label pro Gegner bis `maxViews=24`,
  dauerhaft gesättigt (`before-tight`: 24/24 Frames ~23.6 sichtbar, 48 Einträge).
  Kleine Einzelwerte ("26/30") an engen Positionen — genau die Dom-Meldung.
- Grenzfall 119/120-Gegner: Massenkämpfe pendeln um die Schwelle → Modus
  springt zwischen gebündelt (≤ 10) und ungebündelt (24).
- Wichtig für K2/K3: im nicht-aggregierten Regime startet jeder Treffer den
  Label-Tween neu (`view.life=0.8`, Position auf letzten Treffer) — Labels
  zittern/zirkeln bei anhaltendem Feuer.

### Konsequenz für die Karten

- K2 (Logik): hartes Sichtbar-Cap pro Bildschirmzone/Frame + Drossel/Staffelung
  je Labeldichte, wirksam in beiden Regimes; Krits bleiben groß + hervorgehoben
  (amber, Scale 1.6), Normaltreffer klein oder gebündelt; Summen-Erhalt
  (gebündelte Einträge tragen die Summe ihrer Treffer).
- K3 (System): Anzeige-Cap umsetzen, niedrigste/älteste Labels zuerst ersetzen,
  kein Tween-Neustart je Treffer.

Abnahme-Kriterium K1: Frame rendert (kein JS-Fehler), Zählung in der JSON — erfüllt.

## K2 — Logik (#5859)

`src/logic/damage-numbers.ts` (reine Funktionen, keine Balance-Berührung):

- `MAX_VISIBLE_LABELS = 12` — hartes globales Sichtbar-Cap (Krits + Normaltreffer).
- `MAX_NORMAL_PER_ZONE = 2` — je Bildschirmzone (3×3-Raster) max. 2 Normaltreffer-Labels.
- `LABEL_BURST_PER_FRAME = 3` — Staffelung: max. 3 NEU aktivierte Normal-Labels je Frame
  (Krits ausgenommen, kein Flackern des Bestands).
- `planLabels(candidates, previouslyVisible, opts?)` — deterministische Anzeige-Planung:
  Krits zuerst (nur globales Cap, Zonen-Cap/Burst gelten nicht), Normaltreffer nach
  Schaden absteigend (Gleichstand nach Key) → niedrigste/älteste werden zuerst ersetzt.
- `applyLabelFold(entries, foldedInto, sink?)` — unterdrückte Normaltreffer werden in den
  nach Schaden größten Eintrag derselben Zone gefaltet (Schaden, Hits, Crit-Flag,
  lastTime = max). **Summen-Erhalt exakt**: Summe aller `damage` ändert sich nicht.

## K3 — System (#5860)

`src/systems/DamageNumbers.ts`:

- `report()` meldet nur noch (Cull + addDamage) — **kein View-Zugriff mehr**, damit
  startet ein Treffer keinen Label-Tween neu und die Caps gelten pro Frame statt pro Treffer.
- `update()` ruft einmal pro Frame `applyDisplayPlan()`: Kandidaten aus Einträgen
  (Screen-Position → Zone), `planLabels`, Falten, Views synchron halten.
- Aktivierung setzt Position/Tween nur beim (Erst-)Aufblitzen; Größe/Farbe je Frame aus
  dem (ggf. gefalteten) Eintrag: Krit groß + amber + Scale 1.6, Normal klein/weiß,
  Großtreffer (hits > 3 && damage > 20) lantern-gelb.
- Nicht-aggregiertes Regime: `viewLimit` von 24 auf `MAX_VISIBLE_LABELS` (12) gekappt;
  Aggregat-Regime unverändert (MAX_VIEWS_AGGREGATE = 10).

## K4 — Tests, Nachher-Belege, Fazit (#5861)

`tests/damage-calm.test.ts` (15 Tests): globales Cap, Zonen-Cap, Krit-Priorisierung
(einschl. Krits > Cap), Burst-Staffelung + Flackern-frei, Summen-Erhalt exakt beim Falten,
Krit-Flag-Erhalt, **Sim 10 s @ 60 fps gegen ungedrosselte Referenz ≤ 1 % Abweichung**
(gemessen: 0.00 %, gemessen über Zeitintegral der dargestellten Summen), Grenzfälle
0/1/Cap+1, Ersetzungs-Reihenfolge. Gesamtsuite: 708/708 grün, `npm run build` grün.

Nachher-Messung (gleiches Skript, gleiche Setups):

| Tag | max sichtbare Labels | avg | Überlappungen | Einträge (max) |
|---|---|---|---|---|
| `after` (Minute 25, 340 Gegner) | **6** (vorher 6) | 5.63 | 0 | 7 |
| `after-sub` (Minute 8, 110 verteilt) | **5** (vorher 4) | 3.98 | 0 | 5 |
| `after-tight` (Minute 2:30, 115 dicht) | **12** (vorher **24**) | 10.7 | 0 | 48 |

Belege: `shots/m10-damage-calm-after.png/-json`, `-after-tight.*`, `-after-sub.*`.

### Fazit

- Die "26/30"-Flut im dichten Sub-Threshold-Haufen ist gekappt: 24 → 12 sichtbare Labels,
  dazu Zonen-Bündelung (max. 2 klein pro Zone) — der Rest steht als Summe im gebündelten
  Label ("968" im after-tight-Shot statt Dutzender Einzelwerte).
- Minute-25-Aggregat unverändert ruhig (6 Labels, 0 Überlappungen) — keine Verschlechterung.
- Krits: amber + Scale 1.6 + "!"-Suffix, immer zuerst sichtbar — optisch klar getrennt
  von kleinen weißen Normaltreffern.
- Summen: Falten erhält die Schadenssumme exakt; die Anzeige-Zahlen sind weiterhin
  die wahren gemeldeten Werte (keine Balance-Änderung).

### Offene Punkte

-reports/s im Probe-Setup sind niedrig (~120–800/s) gegenüber dem alten
  damage-batch-Lauf (6786/s, direkt nach Run-Start); die Caps greifen aber dichteunabhängig
  (hartes Frame-Cap), ein Höchstlast-Lauf würde das gleiche Sichtbar-Cap zeigen.
- Überlappungen waren auch vorher 0 (Labels folgen Gegner-Positionen); das Chaos-Problem
  war die Anzahl kleiner Einzelwerte, nicht buchstäbliche Pixel-Überlappung.
