# Lane m10-swarm-gap-wiring — Bedarfsmeldung „resolvePlayerGap im Frame-Pfad" (2026-11-28)

## Ergebnis: Bedarfsmeldung ERLLEDIGT — kein Wiring nötig (K1 positiv)

Die Bedarfsmeldung der Lane `m10-player-swarm-gap` (requests.md, 2026-11-28T10:5xZ) wurde bereits
von dieser Lane selbst erledigt und über main gemerged — vor dem für diese Lane angesetzten
after-Punkt (Merge von `m10-fx-bakes-evo-r2`):

- **Commit `3751e397`** (`M10-m10-player-swarm-gap: #10272 K2 Spieler-Abstoß-Ring …`) enthält das
  komplette Wiring: Import in `src/scenes/Run.ts:13`
  (`import { directionToPlayer, resolvePlayerGap, separationPush } from "../logic/separation"`)
  und Aufruf im updateEnemies-Ende, `src/scenes/Run.ts:1085`:
  `resolvePlayerGap(this.enemies.active, px, py, { ignore: (e) => e.boss }, this.hash);`
  plus Kommentarblock (Zeilen 1079–1084), exakt in der vom Bedarf geforderten Form.
- **Auf main:** `git merge-base --is-ancestor origin/main HEAD` → rc=0; `grep resolvePlayerGap`
  auf `git show origin/main:src/scenes/Run.ts` zeigt Zeile 13 (Import) und Zeile 1085 (Aufruf).
  Die Lane `m10-player-swarm-gap` ist gemerged (Karten #10272/#10273/#10564 mit
  `lane …, Merge branch m10-player-swarm-gap` abgeschlossen).

## Belege

- **Live-Messung (Nachher, Ursprungs-Lane):** 9,38 → **3,20** Gegner mit Kantenabstand < 8 px
  (Mittel über 10 s, Minute-25-Schwarm, seed=7) = **−66 %** ✓ (Ziel ≥ 50 %). JSON:
  `~/games/.evidence/m10-player-swarm-gap/m10-player-gap-{before,after}.json`,
  Szenario/Methodik: `scripts/m10-player-gap.mjs`.
- **Tests:** `npx vitest run tests/player-swarm-gap.test.ts` → **9/9 passed** (309 ms).
  Enthalten: Spieler nie bewegt, Mindest-Kantenabstand im Ring, 500 Gegner deterministisch
  bitgleich (2 Läufe), Gegner außerhalb des Rings unberührt, Tote ignoriert, Boss-Ignore.
- **tsc:** `npx tsc --noEmit` → rc=0.
- **Separations-/SpatialHash-Logik unberührt:** diese Lane hat **keine** Änderung an
  `src/logic/separation.ts`, `src/systems/SpatialHash.ts` oder sonstigem Code vorgenommen
  (`git status` vor dem Commit: nur Board + Lane-Doku). Trefferverhalten der Separation ist
  bytegleich zum Merge-Stand.

## Karten-Entscheidung

- **#10813 (K1):** erledigt — Bedarfsmeldung geprüft und als erledigt geschlossen (dieses Dokument).
- **#10814 (K2, 4-Zeilen-Wiring):** **entfällt** — Wiring existiert bereits auf main
  (Commit `3751e397`); eine zweite Einbringung wäre ein Duplikat.
- **#10815 (K3, Nachher-Messung/Test/Shots):** **entfällt** — Nachher-Messung (−66 % ≥ 50 %) und
  Tests (tests/player-swarm-gap.test.ts, 9/9) sind durch die Ursprungs-Lane mit Belegen
  abgeliefert und liegen auf main.

## Offene Punkte

Keine. Kein Commit von Code aus dieser Lane, daher auch keine Abnahme-Shots nötig — die
Live-Belege stammen von der Ursprungs-Lane (Pfade oben).
