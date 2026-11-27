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
