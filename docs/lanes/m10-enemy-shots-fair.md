# Lane m10-enemy-shots-fair — Gegnerschüsse fair und lesbar

Ziel (Briefing): kein Spielertreffer durch einen Schuss, der außerhalb des sichtbaren
Bereichs abgefeuert wurde; jeder ranged-Schuss hat eine sichtbare Vorwarnung ≥ 0,3 s
am Schützen; die 4 Schuss-Optiken (spit/bone/shadow/fire) bleiben bei 500 Gegnern
unterscheidbar. Kein Rebalancing, keine Änderung an `CombatSystem.ts` oder `Run.ts`.

## Karte 01 — Ist-Beleg (vor der Fairness-Regel)

30-min-Sim (`timeScale 30`, Debug-Hook `__lfEnemyShots()`), Viewports 640×360 und
780×360, `shots/m10-enemy-shots-before.json` + Frame-Screenshots mit ~500 Gegnern:

| Viewport | abgefeuert | Treffer | davon Offscreen-Schützen | Offscreen-Treffer |
|---|---|---|---|---|
| 640×360 | 500 | 2 | 50 | 0 |
| 780×360 | 503 | 8 | 100 | **2** |

Befund: Bei 780×360 gab es 2 Spielertreffer durch Schützen außerhalb des Views
(Schuss ohne sichtbaren Ursprung). Screenshots: 593 bzw. 540 Gegner. 0 JS-Fehler.
Commit 40b6016.

## Karte 02 — Fairness-Regel

- `ENEMY_SHOT_WINDUP_SECONDS = 0.36` s (≥ 0,3 s), `ENEMY_SHOT_WINDUP_MIN_SECONDS = 0.3`.
- `EnemyProjectilePool.spawn()` verwirft Schüsse, deren Ursprung außerhalb des
  Kamera-View-Rechtecks liegt (`cancelledOffscreen`, `offscreenAttempts`).
- Der Schuss entsteht erst nach Ablauf der Vorwarnung. Bricht der Schütze in dieser
  Zeit weg (`shooterAliveNear()` false) oder liegt der Ursprung dann außerhalb des
  Views, wird abgebrochen (`cancelledShooterDeath` / `cancelledOffscreen`).
- Kollisionsradius unverändert (`radius` 4, Trefferprüfung `radius + 6`).
- Reine Regeln in `src/logic/bosses.ts` (`canLaunchShot`, `isPointInView`), Pool lokal
  in `src/systems/EnemyProjectiles.ts`; `Run.ts`/`CombatSystem.ts` unangetastet.

Nachher-Sim (`shots/m10-enemy-shots-after.json`):

| Viewport | abgefeuert | Offscreen gefeuert | Offscreen-Treffer | Wind-up OK |
|---|---|---|---|---|
| 640×360 | 501/663 Versuche | 0 (148 verworfen) | **0** | 501/501 (100 %) |
| 780×360 | 500/679 Versuche | 0 (169 verworfen) | **0** | 500/500 (100 %) |

Zusätzlich 13 bzw. 7 Schüsse durch Schützentod abgebrochen. 0 JS-Fehler. Commit e57a402.

## Karte 03 — Lesbarkeit

Jede der 4 Optiken hat eine eigene Silhouette und 1-px-Kontur, nur die Optik wurde
geändert (keine Kollisions-/Radius-Änderung):

| Optik | Form | Kontur | Kern/Glanz | waterMid min/mean/max | nightDeep min/mean/max |
|---|---|---|---|---|---|
| spit | runde Giftkugel + 1-px Tropfen-Tail | ink 0 | 13 außen oben-links, Füllung 31 | **2,04** / 3,58 / 6,22 | 5,98 / 10,50 / 18,23 |
| bone | Knochenpaar 9×7, Highlight oben-links | ink 0 | 10 / 11 / 13 | 3,68 / 4,34 / 6,22 | 10,77 / 12,73 / 18,23 |
| shadow | offener Halo mit C-Mund, 3 Stufen | ink 0 | 9 / 13, verbundener Bogen | **2,43** / 4,80 / 6,22 | 7,12 / 14,07 / 18,23 |
| fire | elongierte Flamme 9×12 | ink 0 | 19 / 20 / 22 | **2,75** / 3,36 / 5,68 | 8,06 / 9,84 / 16,65 |

Iteration 1 (2026-11-27, art-director-Befund): vorher waren spit (minInner 1,00 gegen
Gras) und shadow (1,36 gegen waterDeep) praktisch Tarnung. Korrektur: spit-Füllung
29/30 → 31 + 13-Rim, shadow 5/8 → 9 + 13-Rim, fire-Basis 17 → 19; kein Pixel mehr
unter minInner 2,04 auf allen 5 Hintergründen. Zusätzlich Pixel-Grid: Schuss-Scale
fest 1x (Puls nur über Alpha) und Telegraph 1x statt 0,34–0,62 (art-director-Befund 3).

Kontrast = WCAG-Verhältnis (sRGB-Luminanz) je Nicht-Kontur-Pixel gegen den Hintergrund
(`minInner` = schwächster, `meanInner` = Mittel, `max` = hellster Pixel),
`shots/m10-enemy-shots-contrast.json` — Messung reproduzierbar mit
`scripts/art/contrast-enemy-shots.py` (ein Lauf, fester Satz Hintergründe
nightDeep/night/waterDeep/waterMid/grassMarsh, Stichprobe = alle opaken Nicht-Kontur-
Pixel der 4 Texturen; keine weiteren Crops/Montagen). Nach Iteration 1 liegt
**jede** Optik auf **allen** 5 Hintergründen bei minInner ≥ 2,04 (spit 2,04–5,98,
bone 3,68–10,77, shadow 2,43–7,12, fire 2,75–8,06). Form-IoU aller 6 Paare
0,26–0,60. Kontaktbogen `shots/m10-enemy-shots-optics.png` (480×120, 10× nearest),
Dichte-Beleg `shots/m10-enemy-shots-density.png` (500 Gegner: 125
toad/witchling/lich/horror), 2-s-GIF `shots/m10-enemy-shots-density.gif`
(24 Frames, 12 fps), 0 JS-Fehler.

**art-director-Urteil Iteration 0:** FAIL 3,0/5 (bone 4, fire 4, shadow 3, spit 2) —
spit/schattentarnung, loses Nase-Pixel, nichtganzzahliger Puls-Scale, Dichte-Beleg
nur auf Gras. Iteration 1 behebt alle vier Punkte (Farben, Nase entfernt, Puls 1x,
Gegenmessung gegen Nacht/Wasser im JSON). Re-Urteil nach Commit siehe „Abnahme“.

Mapping: ranged TI0 → spit, TI1 → bone, TI3 → shadow, TI4 (horror) → fire; damit
kommen alle vier Optiken im Spiel vor.

**art-director-Urteil Iteration 1: PASS 4/5** (Ziel ≥ 4/5). Einzelnoten: spit 4, bone 4,
shadow 4 (von 3,5 aufgewertet), fire 4. Belege: `shots/m10-enemy-shots-contrast.json`
(minInner spit 2,04 / bone 3,68 / shadow 2,43 / fire 2,75 auf allen 5 Gründen; Form-IoU
0,26–0,60) und `shots/m10-enemy-shots-density.gif` (24 Frames, lebende Gegner + fliegende
Schüsse im selben Frame). Nicht blockierende Nachbesserungen notiert (shadow 3. Ton/kühler
gegen bone, spit Tail-Spitze + 1 Corner, fire 2 Corner-Leaks, bone Knubbel an Schaftenden);
Einschränkung: Dichte-Beleg zeigt Gras/Moor, Nacht/Wasser nur über Kontaktbogen + JSON.

## Karte 04 — Tests, Messwerte, Abnahme

`tests/enemy-shots-fair.test.ts` (12 Tests, grün):
- jeder ranged-/summoner-Schuss feuert im Pool erst nach ≥ 0,3 s Vorwarnung
  (Laufzeitmessung über alle Schützen, keine Konstanten-Assertion),
- Schuss erst nach Ablauf der Vorwarnung (`canLaunchShot`-Grenzfälle),
- Abbruch bei Schützentod,
- kein Spawn aus Offscreen-Position (Punkt-in-View),
- 4 paarweise verschiedene Texture-Keys und 4 eigene Formen/Kernfarben,
- alle 30 Gegner (Anzahl geprüft) mappen auf eine der 4 Optiken,
- Pool-Pfad mit Phaser-/Atlas-Stubs: `spawn()` verwirft Offscreen-Ursprünge
  (`attempted` 1, `offscreenAttempts` 1, `cancelledOffscreen` 1, `fired` 0, `pending` 0),
  `update()` feuert nicht vor 0,36 s und danach genau einmal (`windupOk` 1),
  bricht bei Schützentod (`cancelledShooterDeath` 1) und bei aus dem View
  gewandertem Ursprung (`cancelledOffscreen` 1) ab, `offscreenHits` bleibt 0.
  Die Test-Stubs liegen nur im Test (keine Phaser-Abhängigkeit der Logik).

Abnahme: Offscreen-Treffer 0 bei ≥ 200 gezählten Schüssen (500/501 im JSON),
Wind-up 100 % ≥ 0,3 s, `npm run build` + alle Tests grün, 0 JS-Fehler,
art-director ≥ 4/5.

Ergebnis (Versuch 3, 2026-11-27):
- `npx vitest run tests/enemy-shots-fair.test.ts` → **12/12 grün**; `npm test` → **236/236 grün (18 Dateien)**.
- `npm run build` → **rc=0** (Vite-Build grün).
- Frische Dichte-Aufnahme (500 Gegner: 125 toad/witchling/lich/horror) →
  `shots/m10-enemy-shots-density.png` + 2-s-GIF (24 Frames, 12 fps), **0 JS-Fehler**.
- Messwerte unverändert aus `shots/m10-enemy-shots-after.json`:
  640×360 501 Schuss, 0 Offscreen-Treffer, windupOk 501/501;
  780×360 500 Schuss, 0 Offscreen-Treffer, windupOk 500/500.
- art-director: **PASS 4/5** (Karte 03).

Temporäre Analyse-Ordner (`.arts/`) wurden vor Abschluss entfernt und nach
`~/tmp/m10-enemy-shots-fair/` ausgelagert (nicht Deliverable); keine Fremddateien
außerhalb `src/systems/EnemyProjectiles.ts`, `src/logic/bosses.ts`, Tests, Docs, Shots.

## Review (Versuch 3)

- test-auditor: **PASS** — 12→14 Tests, echte Pool-Pfad-Asserts (0,29/0,35-s-Grenzen,
  Schützentod, View-Wegfall, Offscreen-Verwurf), keine skip/only.
- Reviewer: **PASS mit Auflagen** — Blocker `shots/tmp_density.rgb` (Temp-Datei) entfernt;
  umgesetzt: Telegraph-Pool-Cap bricht den Schuss jetzt ab (`cancelledNoTelegraph`) statt
  nach der Vorwarnung stumm zu feuern, `clear()` räumt den Debug-Hook `__lfEnemyShots` ab
  (kein Pool-Leak), Kommentar zu spit-Füllung/Lichtkante korrigiert.
- Bekannte Grenze (dokumentiert, nicht behoben): `shooterAliveNear` prüft nur, ob IRGENDEIN
  lebender Gegner im 40-px-Radius um den Ursprung steht — kein echter Schützenbezug. Eine
  Shooter-Referenz in `PendingShot` würde die `spawn()`-Aufrufer (`Run.ts`, `BossSystem.ts`)
  anfassen und ist außerhalb des Disponent-Bereichs dieser Lane.

## Offene Punkte

- Stand Iteration 1: kein Innenpixel mehr unter WCAG-`minInner` 2,04 auf den fünf
  festen Hintergründen (vorher waren spit 1,00 und shadow 1,36 Tarnung). Die
  Lesbarkeit im Spiel tragen zusätzlich 1-px-Tint-Kontur + Silhouette; eine
  weitere Konturaufhellung wäre eine eigene Karte (hier bewusst nur Optik, kein Blink).
- Viele Ranged-Gegner gleichzeitig erzeugen sehr viele Projektile (1359 in ~2 s bei
  500 Ranged); das ist Bestand, nicht Teil dieser Lane (kein Rebalancing).
