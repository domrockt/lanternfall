# Lane m10-levelup-offers — Level-Up-Angebote korrekt und vollständig

- Worktree/Branch: `/home/ai/games/lf-lanes/m10-levelup-offers`, Branch `m10-levelup-offers`
- Basis-SHA: `55c930690fb5d5391b794bb6a5badc66b8365e4c`
- Bereich (Disponent): `src/logic/levelup.ts`, `src/logic/evolution.ts`, `src/systems/LevelUpSystem.ts`,
  `tests/levelup-offers.test.ts`, `docs/lanes/m10-levelup-offers.md`, `shots/m10-levelup-*`
- `src/scenes/Run.ts` ist Claim von `m9-art-polish` und wird **nicht** angefasst. Kein Push/Merge.
- GAME.md bleibt unverändert (Ergebnisse hier, Übernahme beim Merge).

## Karten

| # | Karte | Status |
|---|---|---|
| 01 | Audit `generateOffers` (30 Seeds × 4+1 Builds) | done |
| 02 | Test zuerst (RED) `tests/levelup-offers.test.ts` | offen |
| 03 | Fix in `src/logic/levelup.ts` | offen |
| 04 | Beleg + Abnahme (In-Game-Shot, verify-menus, build, vitest, `.lane-done`) | offen |

## Karte 01 — Audit (Vorher)

Methode: temporärer Vitest-Runner (`tests/m10-audit.tmp.test.ts`, nach dem Lauf entfernt) ruft
`generateOffers(weapons, passives, new SeededRng(seed), 3)` für Seeds 1–30 und fünf Build-Zustände auf.
Vergleich der Evolutions-Angebote gegen die Regeln aus `src/logic/evolution.ts` (`evolvableList`:
Basiswaffe Stufe 8, passendes Powerup ≥ 1, Evolution noch nicht im Slot).

Build-Zustände:

1. `leer` — keine Waffen/Powerups
2. `5-waffen` — ember 3, flail 2, frost 4, thorn 1, storm 5 + boots 2, heart 1
3. `6-waffen-ohne-passiv` — alle 6 Basiswaffen Stufe 4, keine Powerups
4. `6-waffen-stufe8-6-passives` — alle 6 Basiswaffen Stufe 8, alle 6 Powerups Stufe 2
5. `alles-maxed-plus-evolution` — alle 6 Waffen Stufe 8, alle 6 Powerups Stufe 5 (Pool erschöpft, Evolutionen einlösbar)

Ergebnis `shots/m10-levelup-offers-audit.json` (150 Aufrufe = 30 Seeds × 5 Builds):

| Metrik | Wert |
|---|---|
| Aufrufe | 150 |
| Anzahl-Verteilung | `3`: 120, `0`: 30 |
| Aufrufe mit doppelten IDs | **0** |
| Aufrufe mit Evolution ohne Voraussetzung | 0 |
| Aufrufe mit fehlender Evolution trotz erfüllter Voraussetzung | **60** |
| Aufrufe mit Upgrade einer nicht besessenen Waffe | 0 |
| Aufrufe mit falscher Upgrade-Stufe (≠ besessen+1) | 0 |
| Evolution-Angebote insgesamt | **0** |

**Befund Vorher:**

- **Keine Duplikate**, **keine Upgrades nicht besessener Waffen**, Upgrade-Stufen korrekt (`Ist+1`).
- **Evolutionen werden im Level-Up nie angeboten** (`generateOffers` kennt nur Waffen-Upgrades und neue
  Waffen/Powerups). In Build 4 (Voraussetzung für alle 6 Evolutionen erfüllt) fehlen sie in allen 30 Seeds;
  in Build 5 liefert `generateOffers` sogar **0 Angebote**, obwohl 6 Evolutionen einlösbar wären.
  Evolutionen gibt es bisher nur über Truhen (`chestRewards`).
- **3 Angebote** sind in den nicht erschöpften Builds stabil (120/120), aber Build 5 ist eine echte Lücke:
  Der Pool ist nicht erschöpft (Evolutionen verfügbar), trotzdem kommt kein Angebot.

Der Audit-Runner wird nach Karte 01 entfernt; das JSON bleibt als Beleg im Commit.

## Karte 02 — Tests zuerst (RED)

`tests/levelup-offers.test.ts` (9 Fälle, 30 Seeds × 4 Builds, Regeln aus `evolvableList`):

- exakt 3 Angebote für nicht erschöpfte Pools
- dokumentierte Ausnahme: alles maxed + Evolution einlösbar → mind. 1 Evolution statt 0
- keine doppelten IDs (`kind:id`)
- nie Upgrade einer nicht besessenen Waffe, Upgrade-Stufe exakt `Ist+1`
- Evolution nur bei Basiswaffe 8 + passendem Powerup ≥ 1
- höchstens eine Evolution pro Angebot
- Evolutionsangebot UI-kompatibel: `kind: "weapon"`, `isNew`, Stufe 8, Name/Effect aus `EVOLUTIONS`
- angebotene Evolutionen = exakt `evolvableList` (keine fehlende, keine unerlaubte)

**RED-Lauf vor dem Fix** (`npx tsx`/Vitest, Log `~/tmp/m10-levelup-offers-card02-red.log`):

```
Test Files  1 failed (1)
     Tests  4 failed | 5 passed (9)
FAIL  alles maxed + Evolution einloesbar → genau 1 ... expected 0 to be greater than or equal to 1
FAIL  bietet eine einloesbare Evolution an ... expected [] to include 'phoenix'
FAIL  Evolutionsangebot ist neu, auf Maximalstufe ... expected undefined to be defined
FAIL  Evolutionen entsprechen exakt evolvableList ... 6-waffen-stufe8-6-passives seed 1:
      keine Evolution angeboten: expected false to be true
```

Die 5 grünen Fälle belegen, dass Duplikate, nicht besessene Waffen und unerlaubte
Evolutionen bereits vor dem Fix nicht vorkommen; rot sind ausschließlich die
fehlenden Evolutionen (Audit-Befund Karte 01).

## Karte 03 — Fix

Änderung ausschließlich in `src/logic/levelup.ts` (keine Waffen-/Balancedaten, keine neuen Inhalte):

- lokale `eligibleEvolutions()`-Regel (Basiswaffe Stufe 8, passendes Powerup ≥ 1, Evolution nicht im Slot,
  Evolutionswaffe implementiert) — identisch zu `evolvableList` in `evolution.ts`, aber ohne Zyklus-Import.
- Wird eine Evolution einlösbar, wird **genau eine** (erster Treffer aus `EVOLUTIONS`) fest als Angebot
  vorangestellt; der Rest wird wie bisher gewichtet gezogen. Dadurch max. 1 Evolution und keine Duplikate.
- Das Evolutionsangebot läuft als `kind: "weapon"` mit Evolutions-ID, `isNew: true`, Stufe 8. Damit bleibt
  die UI unverändert (`iconKeyForOffer` erkennt Evolutionswaffen) und `applyOffer` → `addWeapon` ersetzt die
  Basiswaffe im selben Slot. Kein `Run.ts`-Edit nötig.
- `tests/logic.test.ts`: alter Fall „alles maxed → keine Angebote“ an die neue, korrekte Semantik angepasst
  (alles maxed + 6 einlösbare Evolutionen → genau 1 Evolutionsangebot, nicht 0).

**Audit Nachher** (`shots/m10-levelup-offers-audit-after.json`, gleiche Methode/Seeds/Builds):

| Metrik | Vorher | Nachher |
|---|---|---|
| Anzahl-Verteilung | `3`: 120, `0`: 30 | `3`: 120, `1`: 30 |
| doppelte IDs | 0 | 0 |
| Evolution ohne Voraussetzung | 0 | 0 |
| fehlende Evolution trotz Voraussetzung | **60** | **0** |
| Upgrade nicht besessener Waffe | 0 | 0 |
| falsche Upgrade-Stufe | 0 | 0 |
| Evolution-Angebote insgesamt | 0 | **60** |
| Aufrufe mit >1 Evolution | – | **0** |

Die 30 Aufrufe mit nur 1 Angebot sind die dokumentierte Ausnahme „Pool erschöpft“ (alle 6 Waffen Stufe 8,
alle 6 Powerups Stufe 5): Es gibt keine Upgrades/neuen Items mehr, nur die einlösbare Evolution.

## Karte 04 — Beleg + Abnahme

**In-Game-Belege** (Playwright, Debug-API, kein `Run.ts`-Edit):

- Drei echte Level-Ups per `__lf.giveXp` (8, 9, 12 XP = exakt die Schwellen), jeweils `pickLevelUp(0)`.
  Danach `__lf.addWeapon("ember", 8)` + `__lf.addPassive("tome", 1)` und ein weiteres Level-Up
  (`giveXp(20)`): Der Screen zeigt **genau 3 Karten** — „PHÖNIXSCHWARM · NEU 8“, „MAGNETAMULETT · NEU 1“,
  „ARKANES BUCH · STUFE 2“. Eine Evolution, keine Duplikate.
  Beleg: `shots/m10-levelup-evolution-offer.png`.
- Nach `pickLevelUp(0)` liegt **Phönixschwarm Stufe 8** im Waffen-Slot (`state().weapons = [{id:"phoenix",level:8}]`),
  HUD zeigt Evolutions- und Tome-Icon. Beleg: `shots/m10-levelup-after-evolution.png`.
- 0 JS-Fehler in beiden Läufen.

**Messwerte:**

- `npx vitest run`: **201 Tests / 13 Dateien grün** (inkl. 9 neue Fälle in `tests/levelup-offers.test.ts`).
- `npm run build`: grün (`tsc --noEmit` + `vite build`, ~1,1 s).
- `node scripts/verify-menus.mjs`: **FAIL 1/2** — Timeout in `waitForScene(page, "credits")` nach Klick
  `clickGame(346, 214)`. Befund: `clickGame` rechnet fest mit 480×270, der M8-View ist bei 960×540@dpr1
  aber 860×360; der Credits-Knopf liegt logisch bei ~x 279–352, y 187–203, der Klick bei y 214 trifft daneben.
  Das ist **nicht** durch diese Lane verursacht (Titel-/Menü-Szenen unangetastet; Fehler tritt schon vor
  jedem Level-Up auf). Als Befund dokumentiert, nicht umgangen. Die Level-Up-Belege oben sind unabhängig davon.
