# Lane m10-evo-reachability — Evolutionen systematisch gegenprüft (2026-11-27)

**Auftrag (Dom):** Alle 6 Evolutionen müssen deterministisch erreichbar sein
(Basiswaffe Stufe 8 + passendes Powerup, Angebotslogik korrekt). Bisherige
Abnahme-Belege zeigten nur „≥ 1 Evolution pro 30-min-Run" (A4: 4/6) — die Lücke
war der ungeprüfte Gate-Pfad, nicht die Optik.

## Werkzeug

`scripts/m10-evo-reach.mjs` (Seed 4711, Playwright headless, `?debug=1`):
spielt je Kombination **zwei frische Runs** und prüft beide Gate-Pfade im echten
Spiel (nicht nur in der reinen Logik):

- **Truhen-Pfad:** `chestRewards → canEvolve → Truhe-UI → applyChestReward`
- **Level-Up-Pfad:** `generateOffers (includeEvolutions) → pickLevelUp → addWeapon`

Gate-Matrix je Evolution (Kombination aus `src/data/evolutions.ts`):

| # | Evolution | Basiswaffe | Powerup |
|---|---|---|---|
| 1 | Phönixschwarm (phoenix) | ember | tome |
| 2 | Zornpendel (wrath_pendulum) | flail | heart |
| 3 | Ewiger Winter (eternal_winter) | frost | hourglass |
| 4 | Dornensturm (thorn_storm) | thorn | boots |
| 5 | Gewittersiegel (thunder_seal) | storm | whetstone |
| 6 | Seelenleuchtfeuer (soul_beacon) | lantern | charm |

Geprüfte Fälle je Kombination: Lv7 + Powerup → **keine** Evolution; Lv8 +
falsches Powerup → **keine**; Lv8 + passendes Powerup → Evolution angeboten
(Slot 0), angewendet, Basiswaffe ersetzt, Powerup erhalten, keine Duplikate;
danach keine zweite Evolution (Truhe und Level-Up).

## Ist-Analyse (K1): Gate-Bedingungen

- `evolvableList` / `canEvolve` (src/logic/evolution.ts): Basiswaffe Lv 8,
  passendes Powerup ≥ 1, Evolution noch nicht im Slot, implementiert.
- Level-Up: `eligibleEvolutions` (src/logic/levelup.ts) — gleiche Regeln plus
  `weaponDef(evo.id).implemented`; die Evolution belegt **Slot 0** des Angebots.
- Truhe: `chestRewards` gibt der Evolution den ersten Slot und verhindert, dass
  die Basiswaffe erneut angeboten wird.

**Kernbefund before (`shots/m10-evo-reach-before.json`): 6/6 PASS.** Die
A4-Lücke („nur 4/6 pro 30-min-Run") ist **kein Gate-Bug**, sondern
Build-Randomisierung: in einem organischen 30-min-Run werden Waffe-8 +
passendes Powerup nicht in allen 6 Kombinationen erreicht/gezogen. Es gab also
**keinen Spieler-sichtbaren Gate-Fehler zu fixen**.

## Härtung (K2): zwei latente Inkonsistenzen geschlossen

1. `evolvableList` (evolution.ts) prüfte das `implemented`-Flag der
   Evolutions-Waffe nicht (anders als `eligibleEvolutions` in levelup.ts) —
   die Truhe hätte eine nicht implementierte Evolution anbieten können,
   `applyChestReward/addWeapon` würde dann werfen. Fix: gleiche Prüfung wie im
   Level-Up-Pfad.
2. `LevelUpSystem.evolve()` prüfte das passende Powerup nicht (der Truhen-Pfad
   garantiert es heute, aber `evolve()` ist der öffentliche Gate). Fix: Evolution
   nur noch mit passendem Powerup ≥ 1.

Commit 91d1cb2. Bestehende `tests/evolution.test.ts` 11/11 grün.

## Tests (K3): `tests/evo-reachability.test.ts` — 12 Tests

6/6 erreichbar je Pfad (evolvableList / evolutionReadyList / generateOffers /
chestRewards + applyOffer bzw. applyChestReward), Grenzfälle Lv7-vs-8,
fehlendes Powerup (auch Lv 0), falsches Powerup, zweites (falsches, Stufe 5)
Powerup ohne Effekt, keine Duplikate, Doppel-Evolutions-Sperre, `evolve()`-Gate.
**Volle Suite: 61 Dateien / 631 Tests grün, `npx tsc --noEmit` grün.**
Commit 4555fa0.

## Nachher (K4): `shots/m10-evo-reach-after.json` — 6/6 PASS

| Evolution | Truhe (Angebot→Anwendung, Frame) | Level-Up (Angebot→Anwendung, Frame) | Gate Lv7 | Gate falsches Powerup |
|---|---|---|---|---|
| phoenix | ja → ja, Frame 288 | ja → ja, Frame 43 | gesperrt | gesperrt |
| wrath_pendulum | ja → ja, Frame 289 | ja → ja, Frame 43 | gesperrt | gesperrt |
| eternal_winter | ja → ja, Frame 290 | ja → ja, Frame 44 | gesperrt | gesperrt |
| thorn_storm | ja → ja, Frame 289 | ja → ja, Frame 42 | gesperrt | gesperrt |
| thunder_seal | ja → ja, Frame 288 | ja → ja, Frame 43 | gesperrt | gesperrt |
| soul_beacon | ja → ja, Frame 288 | ja → ja, Frame 45 | gesperrt | gesperrt |

Moment-Belege (Evolution über die echte Truhe ausgelöst, lebende Gegner, Shot
im Schockring-/Zeitlupen-Moment): `shots/m10-evo-reach-<id>.png` für alle 6 IDs
(phoenix, wrath_pendulum, eternal_winter, thorn_storm, thunder_seal,
soul_beacon). Sichtprüfung: Banner „EVOLUTION – <Name>", FX am Spieler,
Gegner im Bild.

## Abnahme

- ✅ 6/6 Evolutionen deterministisch erreichbar (Seed 4711, before **und** after
  6/6 PASS; beide Gate-Pfade).
- ✅ Tests + `npx tsc --noEmit` grün (631/631).
- ✅ Balance-Werte unverändert: `git diff` über `src/data` leer (XP-/Level-Kurven
  nicht angefasst; Änderungen nur in src/logic/evolution.ts,
  src/systems/LevelUpSystem.ts, tests/, scripts/).

## Offene Punkte

- Keine aus dieser Lane. Hinweis für künftige Lanes: `tests/passive-stack.test.ts`
  schreibt `shots/m10-passive-math-*.json` bei jedem Suite-Lauf mit neuem
  `generatedAt` neu (Fremd-Diffs im Worktree; hier revertiert, nicht gemergt).
