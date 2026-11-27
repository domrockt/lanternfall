# m10-autoplay-budget — AutoPlay Threat-Scan-Budget

**Job:** Der AutoPlay-Bot (`src/logic/autoplay.ts`, `botDirection`/`offerScore`/`chooseBestOffer`)
scannt pro Frame alle Gegner + Projektile + Warnflächen (Gewichtung 1 / 2,2 / 3) — ein
O(n)-Scan pro Frame in jedem vollständigen Lauf (fullrun, Burst, Abnahme). Ziel:
Threat-Scan −40 % ms/Frame bei 500 Gegnern (Minimum −20 %), Entscheidung deterministisch
identisch (gleiche Seed-Eingaben → gleiche Entscheidung).

## Messaufbau

`scripts/m10-autoplay-budget.mjs` (deterministisch, Seed 20261127, kein Renderer → ohne
flock): 500 Gegner in Endgame-Ringen (50 % < 220 px, 30 % 220–420, 20 % > 420), 48
Projektile, 8 Warnflächen, 220 Gems, 2 Truhen, aktiver Boss, Spieler kreist; 300 Frames
pro Pass, 11 Passes, Kopfzahl = Minimum. Zusätzlich `chooseBestOffer` (3 Offers,
Mid-Game-Build). Belege: `shots/m10-autoplay-before.json`, `shots/m10-autoplay-after.json`.

## Zahlen

| Messgröße | vorher | nachher | Δ |
|---|---|---|---|
| `botDirection` ms/Frame (500 Gegner, min/11 Passes) | 0,0229 | 0,0039 | **−83 %** |
| `botDirection` ms/Frame (Median) | 0,0296 | 0,0059 | −80 % |
| `chooseBestOffer` ms/Call (3 Offers) | 0,0010 | 0,0002 | −80 % |
| Entscheidungs-Hash `botDirection` (bit-exakt, 300 Frames) | `0x64ae4b74` | `0x64ae4b74` | **identisch** |
| Entscheidungs-Hash `chooseBestOffer` | `0x2a4f29a5` | `0x2a4f29a5` | **identisch** |

Ziel (−40 %, Minimum −20 %) übertroffen: **−83 %**.

## Änderungen (K2/K3)

1. **`offerScore` ohne Per-Call-Allokationen:** `new Map(passives.map(...))`,
   `weapons.filter(...)` und `EVOLUTIONS.some/find` pro Aufruf ersetzt durch
   Modul-Level-Lookups (`EVOLUTION_IDS`-Set, `EVO_BY_BASE`-Map) und eine Schleife mit
   Startwaffen-Abbruch. Passiv-Level: letzter Treffer gewinnt (Map-Semantik erhalten).
2. **`botDirection` Hot-Path:** die `repel`-Closure (1 Allokation pro Call) ist in drei
   Inline-Schleifen aufgelöst; fjerne Bedrohungen werden per Quadrat-Distanz
   (`d² > rr²·(1+1e-7)`) ausgeschieden, **bevor** `Math.hypot` läuft. Im Grenzband
   entscheidet weiterhin `hypot` exakt wie vorher — alle Beiträge innerhalb der
   Reichweite sind bitidentisch zur alten Logik (daher der unveränderte Hash).

Nicht geändert: Aufrufstelle `src/scenes/Run.ts` (fremd geclaimed), Entscheidungsfrequenz
weiterhin jeder Frame (Staggering hätte Run.ts-State gebraucht; nach der Messung nicht
nötig — der Scan selbst ist jetzt ~0,004 ms/Frame).

## Äquivalenzbeleg (K4)

`tests/autoplay-budget.test.ts` (9 Tests, grün):
- **48 Seed-Szenen** (0/1/2/5/30/120/500 Gegner, melee an/aus, Boss/Truhen-Varianten):
  `botDirection` bitidentisch zum Vorher-Stand (`git cf85540^`), exakte Float-Gleichheit.
- **600 offerScore-Fälle** (6 Builds × 100 Offer-Konfigurationen) und **200
  chooseBestOffer-Entscheidungen**: identisch zum Vorher-Stand.
- Grenzfälle: 0 Gegner (Idle-Kreis), 1 Gegner weit/nah/auf dem Spieler (kein NaN,
  d==0-Fallback), Projektil mit lead, Hazard-Gewichtung schlägt Gegner-Gewichtung,
  Normalisierung der Ausgabe.

Generator (A/B alt/neu, rolldown-Bundles): `~/tmp/m10-autoplay-budget/gen-fixture.mjs`
(Worktree-extern, kein Hilfsordner im Repo).

## Offene Punkte

- Keine. Die verbleibenden Kosten von ~0,004 ms/Frame sind die ~90–150 Gegner innerhalb
  der 118-px-Reichweite (hypot + falloff, Verhalten unverändert).
- Seiteneffekt-Befund (nicht diese Lane): `npm test` schreibt Timestamps in
  `shots/m10-passive-math-caps.json` / `shots/m10-passive-math-matrix.json` (fremde
  Lane-Belege werden bei jedem Testlauf dirty). In der Worktree-Hygiene wiederhergestellt,
  hier nur dokumentiert.
