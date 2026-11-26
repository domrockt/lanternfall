# Lane m10-hazard-telegraph — Boss-Angriffe mit fairer Vorwarnung

Basis-SHA: `252fd98` (main-Merge m10-qa-numbers). Branch `m10-hazard-telegraph`.
Ziel laut Briefing: jeder Boss-Angriff und jede Gefahrenzone hat eine sichtbare
Vorwarnung vor dem Treffer, kein Treffer ohne Telegraph. `src/systems/BossSystem.ts`
ist Claim der Lane m9-art-polish und wurde **nicht** angefasst.

## 1. Audit (Ist-Stand)

Quelle: `src/logic/bosses.ts` (`BOSS_ATTACKS`), 6 Bosse, 18 Angriffs-Einträge.
Maschinenlesbarer Beleg: `shots/m10-hazard-telegraph-audit.json`.

Trefferzeitpunkt im Code (`src/systems/Hazards.ts`, `update`):
`warn -= dt; if (warn > 0) continue;` — erst danach werden `onTrigger`,
`containsPlayer` und `onPlayerHit` ausgelöst. Schaden fällt also ausschließlich
am **Ende** der Warnphase (`hitAtMs == telegraphMs`). Bei `linger <= 0` wird die
Hazard-Instanz nach genau einem Treffer entfernt (keine Doppel-Treffer).

### Angriffe mit Warnzeit < 600 ms (FAIL vor Fix)

| Boss | Phase | Angriff | Warnzeit | Form | Schaden |
|---|---|---|---|---|---|
| 1 Knochenfürst | 1 | bone_boomerang | 550 ms | Linie | 0.8× Kontakt |
| 4 Hexenzirkel | 1 | teleport | 350 ms | Kreis | 0 (nur Bewegung) |
| 5 Hohler König | 1 | bone_boomerang | 500 ms | Linie | 0.7× Kontakt |

Alle übrigen 15 Einträge lagen bereits ≥ 600 ms (650–1200 ms). Der Teleport
verteilt keinen Schaden, bleibt aber ein angekündigter Boss-Angriff und wird
deshalb ebenfalls auf ≥ 600 ms angehoben.
