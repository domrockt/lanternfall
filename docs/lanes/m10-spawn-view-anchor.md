# Lane m10-spawn-view-anchor

Datum: 2026-11-28 · Worktree `lf-lanes/m10-spawn-view-anchor` (Branch `m10-spawn-view-anchor`) · Karten #12527–#12531 (reservierter Block)

## Ziel

Dritter und letzter Sim-Pfad-Leser von `camera.worldView` aus der Bedarfsmeldung
m10-boss-dur-determinism K2: `Spawner.outsideView` (Spawn-Platzierung `spawnOne`/Ring-Welle)
las im `SIM_MAX_STEP`-Teilschritt-Loop den frame-abhängigen Render-Stand (`worldView` wird
ausschliesslich in `Camera.preRender` gesetzt) → frame-abhängige Spawn-Entscheidungen
verschoben Kills/Spawns und den RNG-Ziehungsstrom → gesamte Lauf-Divergenz → stochastische
Boss-Dauern (Verletzung Dom-Korridor A5). Läuft parallel zur Lane
`m10-worldview-anchor-pools` (die anderen beiden Leser); Dateien disjunkt, Anker bewusst
inline in `Spawner.ts` (keine gemeinsame Hilfsdatei, keine Merge-Gate-Kollision).

## K1 — Vorher (#12527)

Mess-Skript `scripts/m10-spawn-view-anchor.mjs`: 3 Seeds × 2 Läufe (700 s Sim, 30x, autoPlay),
Marken = Position/UID JEDES frischen Spawns (gepatcht an `Spawner.spawnAt`), gebündelt je
Sim-Sekunde; Vergleich bitgleich, dazu Boss-Warn/-Defeat-Dauern.

Beleg: `~/games/.evidence/m10-spawn-view-anchor/marks-before.json`
(Kopie `shots/m10-spawn-view-before.json` — shots-Belege werden von git ignoriert und
kommen gemäss Regel vom 28.11. nicht ins Repo; kanonischer Ort ist `~/games/.evidence/`).

| Seed | erster Divergenz-Sekunden-Bucket | divergente Sekunden | Boss-Dauern (rep0 vs rep1) |
|---|---|---|---|
| 101 | s=249 (uid 396, Positionsdelta ≈ 20 px) | 408 | #0 24,05/28,60 · #1 33,65/26,70 |
| 202 | s=47 | 518 | #0 35,10/32,00 · #1 41,05/27,05 |
| 404 | s=130 | 468 | #0 29,35/8,40 · #1 30,70/29,10 |

Alle 3 Seeds divergieren bei bitgleichem RNG-Schedule — reproduziert die Bedarfsmeldung
(Boss-Dauern stochastisch, Exit 2).

Mess-Skript-Historie (2+1 Iterationen, dokumentiert): Iteration 1 hatte einen Off-by-one
(Sekunden-Bucket wurde beim BEGINN der Sekunde gelesen statt nach Abschluss — Marken
fehlten); Iteration 2 (window-level Aufzeichnung + Diagnosezähler) behob die fehlenden
Marken; der Bucket-Lese-Zeitpunkt wurde im selben Zug auf `elapsed >= N+1` korrigiert.
Seitdem volle Abdeckung (~990 Marken je Lauf, calls ≈ marks).

## K2 — Fix (#12528)

`src/systems/Spawner.ts`, `outsideView()` (Commit 0910f360): liest NICHT mehr
`camera.worldView`, sondern den deterministischen Sim-Anker — Rezept EXAKT nach der
Ursachen-Lane (K2 Punkt 4, `probe-fix.mjs` Patch 1, formelidentisch):

- Teiler `s = max(1, round(GAME_WIDTH / (cam.width || GAME_WIDTH)))`
- View `x = scrollX + cam.width/2 - (cam.width*s)/2` (Anker-Mid = `scrollX/Y + width/2`;
  `scrollX/Y` wird pro Teilschritt in `Run.simulate` gesetzt; `cam.width/height` sind
  konstant pro Skalierung via `enforceCameraProjection`), Weite/Höhe `cam.width*s × cam.height*s`
  = logischer Screen `GAME_WIDTH × GAME_HEIGHT` bei erzwungener Projektion `zoom = 1/Teiler`.
- Anker inline in Spawner.ts (Area-Disziplin); eine spätere Konsolidierung mit der
  pools-Lane ist bewusst NICHT Teil dieser Lane.
- Delta-Richtung: weg vom frame-abhängigen Render-Stand, hin zum Sim-Anker. Bei 1x/60 fps
  unverändert bis auf Phasers Floor-Rundung (~0,5 px an Gate-Grenzen; `worldView ≈ scroll ±
  (W/2, H/2)` bei zoom = 1/Teiler) — im Test mit ≥ 1 px Abstand von der Grenze exakt
  bitgleich geprüft.

Guard: im Spawner-Sim-Pfad gibt es keine `worldView`-Lesung mehr (K3-Test, Code-Zeilen-Scan).

## K3 — Tests (#12529)

`tests/spawn-view-anchor.test.ts` (4/4 grün, Commit b05cb645):

1. Guard: Code-Zeilen von `src/systems/Spawner.ts` enthalten kein `worldView` (Kommentare ausgenommen).
2. Spawn-Platzierung (24 `spawnOne`-Marken) bitgleich bei gleichem RNG — unabhängig von
   heftigen `worldView`-Mutationen (Reinheit gegen die K2-Leck-Klasse).
3. Teiler-unabhängig: `outsideView`-Entscheidungen über 243 Probe-Punkte identisch bei
   Teiler 1/2/3 (Midpoint erhalten, wie `enforceCameraProjection` ihn rettet).
4. 1x-Verhalten: Anker-View == `[scroll, scroll + logischer Screen]`, Margin 16 —
   unveraendert bis auf Phasers Integer-Rundung der `worldView` (≤ 0,5 px).

## K4 — Nachher (#12530)

Eigener Basis-Stand enthält den pools-Fix NICHT (`git merge-base --is-ancestor 857c979f HEAD`
failt; Basis 445a930d, pools-Merge 857c979f ist später in main gemergt). Deshalb:

- **Reiner Nachher-Lauf** (echter Code, nur Spawner geanchert):
  `~/games/.evidence/m10-spawn-view-anchor/marks-after.json` — Seed 101 + 404: Spawn-Marken
  BITGLEICH inkl. Boss-Dauern; Seed 202: divergiert ab s=47. Erwartet: die beiden anderen
  `worldView`-Leser (`ProjectilePool.view`, `EnemyProjectiles.refreshView`) lecken weiter in
  den RNG-Strom — dieselbe Fehlerklasse, Zuständigkeit pools-Lane.
- **Kombinations-Nachweis**: der Kausalbeweis der Ursachen-Lane
  (`~/games/.evidence/m10-boss-dur-determinism/probe-runtime-patch.json`) hat alle drei
  Leser zur Laufzeit auf denselben Anker gesetzt (Patch 1 formelidentisch zu diesem K2-Fix)
  → 3 Seeds × 2 Läufe bitgleiche Marken inkl. Boss-Dauern. Der Rest-Divergenz-Herd in
  `marks-after.json` ist damit den ungeancherten pools-Lesern zugeordnet.
- Ein dritter Lauf mit `--anchor-others` (Runtime-Patches für die pools-Leser, Rezept
  Ursachen-Lane) wurde nach Supervisor-Steer abgebrochen: konkreter Fehler im Output
  (`page.waitForFunction: Timeout 300000ms` in rep 0 — der gepatchte Sim stallt). Keine
  weitere Skript-Iteration; der Nachweis läuft stattdessen über die beiden Belege oben.
- **VOLLER E2E** (`scripts/m10-boss-dur-det.mjs`, Exit 0, bitgleiche Boss-Dauern) —
  OFFEN, folgt mit dem Merge des pools-Fixes in den gemeinsamen Basis-Stand
  (Bedarf gemäß Briefing K4 explizit vorgesehen).

## Abnahme

- `npx tsc --noEmit` rc=0; `npm test` grün (Lauf siehe Commit #12530/#12531).
- K1/K2/K4-Belege: `~/games/.evidence/m10-spawn-view-anchor/` (+ Kopien `shots/m10-spawn-view-*.json`).
- Keine Balance-Änderung: einzige Quelle-Änderung ist die Anker-Quelle in `outsideView()`
  (Rezept formelidentisch zum Kausalbeweis).
- Keine `worldView`-Lesung mehr im Spawner-Sim-Pfad (Guard-Test K3.1).

## Offene Punkte

1. E2E-Nachweis (bitgleiche Boss-Dauern über `scripts/m10-boss-dur-det.mjs`) sobald
   m10-worldview-anchor-pools im gemeinsamen Basis-Stand gemergt ist.
2. Konsolidierung der drei Anker-Stellen (Spawner inline, pools-Lane `simAnchorView`,
   BossSystem `simViewRect`) in eine gemeinsame reine Funktion — bewusst nicht in dieser
   Lane (Area-Disziplin, siehe Briefing).
3. Der fremde Checkpoint-Commit f0c48cd1 („#12013 WIP") hat WIP dieses Worktrees enthielt
   und liegt in der Branch-Historie; `scripts/tmp-spawn-debug.mjs` daraus ist im
   K4-Commit gelöscht.
