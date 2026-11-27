# m10-evo-signature-calls — Spawn-Aufruf der Evolutions-Signaturen

**Job:** Fix aus Bedarfsmeldung der Lane `m10-fx-evolution` (requests.md, 2026-11-27):
die 6 Evolutions-Waffen haben eigene Treffer-/Todes-Signaturen in `FxSystem.spawnEvolution`,
aber sie feuerten nicht, weil der Spawn-Aufruf im Spiel-Pfad fehlte.

## Änderung

- `src/scenes/Run.ts`, **Zeile 480**, im vorhandenen `onHit`-Callback des
  Combat-Systems (`onHit: (enemy, damage, weaponId, killed) => {`, Zeile 475):

  ```ts
  this.combat.fx.spawnEvolution(weaponId, killed ? "death" : "hit", enemy.x, enemy.y);
  ```

- Reine Visualisierung: keine Schadens-/Gameplay-Werte. Der Aufruf sitzt nach der
  Damage-Aggregation und dem Audio-Pfad (`tests/evo-signature-calls.test.ts` prüft
  genau das).
- **Hinweis / ehrlicher Befund:** Der Aufruf lag beim Start dieser Lane bereits in
  `main` — die Lane `m10-fx-evolution` hatte ihn in ihrem WIP-Commit `56da3a5`
  selbst eingepflegt (Bedarfsmeldung war damit teilweise veraltet). Diese Lane hat
  die Zeile **verifiziert** (tsc, Tests, In-Game-Beleg) statt doppelt einzubauen;
  weitere Run.ts-Eingriffe gab es nicht (Rücksicht auf den Claim von
  `m10-enemy-frame-cadence`).

## Karten / Belege

| Karte | Ergebnis |
|---|---|
| K1 (#4518) | Aufruf verifiziert, `npx tsc --noEmit` 0 Fehler, fx-evolution+fx-overdraw 27/27. Commit 9c06483 |
| K2 (#4519) | `tests/evo-signature-calls.test.ts` 6/6: Verdrahtung in Run.ts (genau 1 Aufruf, nach Damage-Pfad), Hit-/Death-Spawn mit korrektem Typ/Textur/Position, Nicht-Evolutions-Waffen spawnen nichts, Cooldown pro Evolution+Art, alle 6 Evolutionen feuern Hit+Death. Suite 515/515, Build grün. Commit 0cdfea7 |
| K3 (#4520) | In-Game-Beleg via `scripts/m10-evo-signature-shots.mjs`: Phoenix (Lvl 8) + 16 Gegner, Screenshot im Moment der aktiven Signatur (live gelesen über `FxSystem.keys`, Beleg `shots/m10-evo-signature-evidence.json`: `fx_evo_hit_phoenix` + `fx_evo_death_phoenix` beobachtet). **0 JS-Fehler**. Belege: `shots/m10-evo-signature-hit.png` (Splitter-Regen auf getroffenen Gegnern), `shots/m10-evo-signature-death.png` (große Todes-Splitter, 3x-zoom geprüft) |

## Offene Punkte

- Keine. Die ursprüngliche Bedarfsmeldung („Spawn-Aufruf fehlt“) ist erledigt/überholt;
  der Merge-Job kann `docs/lanes/` und die Testdatei übernehmen.
