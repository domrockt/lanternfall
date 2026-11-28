# Lane m10-worldview-anchor-spawner

Datum: 2026-11-28 · Worktree `lf-lanes/m10-worldview-anchor-spawner` (Branch `m10-worldview-anchor-spawner`) · Karten #12769–#12772 (reservierter Block)

## Ziel

Dritter frame-abhängiger `camera.worldView`-Leser im Sim-Teilschritt: `Spawner.outsideView`
(Spawn-Platzierung `spawnOne`/Ring-Welle) soll auf den deterministischen Sim-Anker stehen
(Rezept m10-boss-dur-determinism K2 Punkt 4: Anker-Mid `scroll + width/2`, logischer Screen
`GAME_WIDTH × GAME_HEIGHT`). Damit ist die Lauf-Determinismus-Kette komplett
(ProjectilePool/EnemyProjectiles: Lane `m10-worldview-anchor-pools`, gemergt).

## K1 — Ist-Analyse (#12769)

**Befund: Der K2-Fix dieser Lane ist im Basis-Stand bereits umgesetzt und gemergt.**

- Der Basis-Stand dieses Worktrees enthält den Merge der Lane `m10-spawn-view-anchor`
  (#12527–#12531, Merge `4c677cfe` in main, im Branch-Basis-Stand enthalten):
  `Spawner.outsideView()` liest seit Commit `0910f360` (#12528 K2) NICHT mehr
  `camera.worldView`, sondern den Sim-Anker — formelidentisch zum Rezept
  (m10-boss-dur-determinism K2 Punkt 4):
  - Teiler `s = max(1, round(GAME_WIDTH / (cam.width || GAME_WIDTH)))`
  - View-X `scrollX + cam.width/2 − (cam.width*s)/2` (Mid = `scroll + width/2`),
    Weite/Höhe `cam.width*s × cam.height*s` = logischer Screen `GAME_WIDTH × GAME_HEIGHT`
    bei erzwungener Projektion `zoom = 1/Teiler`.
- Sim-Konvention verifiziert: `Run.simulate` setzt `cam.scrollX/Y` PRO Teilschritt aus der
  SIM-Position (`detCam.scrollX = posX − width/2`, m10-run-determinism-fix) — der Anker
  ist im Teilschritt-Loop deterministisch.
- **Vorher-Divergenz ist belegt** durch die gemergte Vorläufer-Lane
  (`~/games/.evidence/m10-spawn-view-anchor/marks-before.json`, Kopie in
  `~/games/.evidence/m10-worldview-anchor-spawner/`): 3 Seeds × 2 Läufe (700 s, 30x),
  Spawn-Marken divergieren bei bitgleichem RNG (Seed 101 ab s=249, 202 ab s=47,
  404 ab s=130; Boss-Dauern stochastisch). Eine erneute Vorher-Messung würde den
  gemergten Fix rückbauen — bewusst NICHT dupliziert.
- Claims (`/home/ai/games/.dispatch/claims.json`): `src/systems/Spawner.ts` ist dieser
  Lane zugeordnet (Job `m10-worldview-anchor-spawner`) — kein Claim-Konflikt.
- Die anderen beiden Leser sind durch `m10-worldview-anchor-pools` geankert und gemergt
  (`daa15891` K5, `simAnchorView` in `src/systems/ProjectilePool.ts`).

Kartengültigkeit: Briefing-K1 (Vorher-Messung) ist durch den oben zitierten Beleg der
Vorläufer-Lane erfüllt; Briefing-K2 wird als Verifikation ausgeführt (K2 unten).
Abweichung vom Briefing hiermit begründet: identischer Fix existiert bereits im
Basis-Stand — Duplikation wäre Drift.

## K2 — Verifikation outsideView-Anker (#12770)

Der Fix ist im Basis-Stand; verifiziert statt neu implementiert (siehe K1):

1. **Rezept-Konformität**: `outsideView()` (`src/systems/Spawner.ts:347`) — Teiler
   `s = max(1, round(GAME_WIDTH / (cam.width || GAME_WIDTH)))`, View
   `vx = scrollX + cam.width/2 − w/2` (Mid = `scroll + width/2`), Weite/Höhe
   `cam.width*s × cam.height*s` = `GAME_WIDTH × GAME_HEIGHT`. Formelidentisch zu
   m10-boss-dur-determinism K2 Punkt 4 (Kausalbeweis `probe-runtime-patch.json`).
   Namensgebung/Konvention konsistent mit der pools-Lane (`simAnchorView`,
   logischer Screen #4658); Anker bewusst inline (Area-Disziplin, siehe dort).
2. **Guard**: `grep worldView src/systems/Spawner.ts` → nur 3 Kommentarzeilen
   (Z.331/332/342), kein Code-Leser im Sim-Pfad.
3. **Call-Sites**: `outsideView` an Z.288 (Ring-Welle `spawnWave`, Drehlogik nahe
   Weltgrenze) und Z.459 (`spawnOne`-Rand-Richtungsentscheid) — beide entscheiden
   ausschließlich über den Anker.
4. `npx tsc --noEmit` → rc=0.

Keine Änderung an 1x/60 fps erwartet: `worldView ≈ scroll ± (W/2, H/2)` bei
`zoom = 1/Teiler` bis auf Phasers Floor-Rundung ~0,5 px (Rezept, Vorläufer-Lane K2).
