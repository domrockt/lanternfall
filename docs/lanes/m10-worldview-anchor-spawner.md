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

## K4 — Ganzketten-E2E (#12772)

Skript `scripts/m10-worldview-spawner.mjs` (eigene Datei, Harness nur gelesen):
3 Seeds × 2 Läufe, 700 Sim-Sekunden, timeScale 30, mira, autoPlay — Marken
sim-exakt im `Run.simulate`-Patch: je Sekunde kills/hp/pos + Spawn-Buckets
(UID/Position JEDES frischen Spawns über `Spawner.spawnAt`), dazu
`bossWarn`/`bossDefeated` → Boss-Dauer je Index.

**Urteil: DETERMINISTISCH, 0 Abweichung** (Exit 0). Kanonischer Beleg:
`~/games/.evidence/m10-worldview-anchor-spawner/m10-worldview-spawner-after.json`
(Kopie `shots/m10-worldview-spawner-after.json`, gitignored — nicht committet).
Renderer je Rep: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(kein SwiftShader, Mess-Sperre nicht nötig — sim-exakte Marken, lastunabhängig).

| Seed | Spawn-Aufrufe bis s=700 (rep0/rep1) | Boss-Dauern rep0 == rep1 |
|---|---|---|
| 101 | 1324 / 1324 | #0 31,10 s · #1 40,10 s — bitgleich |
| 202 | 980 / 980 | #0 25,20 s · #1 29,50 s — bitgleich |
| 404 | 1092 / 1092 | #0 29,75 s · #1 45,45 s — bitgleich |

Anmerkung: der ROHE Spawn-Call-Zähler beim Seitenauslesen weicht leicht ab
(Post-Limit-Spawns nach der 700. Marke — Timing-Artefakt außerhalb des
deterministischen Fensters); die Marke `calls` beim Schreiben der letzten
Sekunden-Marke ist bitgleich (siehe Tabelle). Erstes Skript-Edit-Delta:
`callsAtLimit` aufgenommen (1 von max. 2 Iterationen, Ergebnis verbindlich).

Damit ist die Lauf-Determinismus-Kette KOMPLETT: alle drei Sim-Pfad-Leser von
`camera.worldView` sind auf denselben Anker gestellt
(Spawner.outsideView — m10-spawn-view-anchor 0910f360; ProjectilePool.view +
EnemyProjectiles.refreshView — m10-worldview-anchor-pools daa15891); der
Kausalbeweis der Ursachen-Lane (probe-runtime-patch.json) ist im echten Build
bestätigt: 3 Seeds × 2 Läufe bitgleich inkl. Boss-Dauern. Dom-Korridor A5
(Boss-Dauer 20–60 s) ist deterministisch abnehmbar: alle 6 gemessenen
Boss-Dauern liegen im Korridor.

## Abnahme

- `npx tsc --noEmit` rc=0; `npm test` grün (223 Dateien / 2419 Tests, inkl. 3
  neue Tests `tests/worldview-anchor-spawner.test.ts`); `npm run build` grün.
- K1–K4-Belege: `~/games/.evidence/m10-worldview-anchor-spawner/`
  (marks-before.json der Vorläufer-Lane als Vorher-Beleg, m10-worldview-spawner-after.json).
- Keine Balance-Änderung: keine Quelle-Änderung in src/ — der Fix war im
  Basis-Stand; diese Lane liefert Verifikation, Test und Ganzketten-Nachweis.

## Offene Punkte

1. Konsolidierung der drei Anker-Stellen (Spawner inline, pools-Lane
   `simAnchorView`, BossSystem `simViewRect`) in eine gemeinsame reine Funktion —
   bewusst nicht in dieser Lane (Area-Disziplin, siehe m10-spawn-view-anchor).
2. Board: Karten #12765–#12768 (m10-spawn-view-anchor K2–K5) stehen auf main
   noch auf `todo`, obwohl die Lane gemergt ist — Board-Hygiene-Job schließt
   verwaiste Karten (nicht meine, nicht angefasst).
