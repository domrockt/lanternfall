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
| spit | runde Giftkugel + 1-px Tropfen-Tail | ink 0 | 31 / 30 / 29 | 1,17 / 1,43 / 2,04 | 1,53 / 3,43 / 5,98 |
| bone | Knochenpaar 9×7, Highlight oben-links | ink 0 | 10 / 11 / 13 | 3,68 / 4,34 / 6,22 | 10,77 / 12,73 / 18,23 |
| shadow | Halo-Ring mit C-Mund, 3 Stufen | ink 0 | 6 / 9 / 8 / 5 | 1,52 / 2,09 / 2,43 | 1,56 / 4,83 / 7,12 |
| fire | elongierte Flamme 9×12 | ink 0 | 19 / 20 / 22 / 17 | 1,15 / 3,03 / 5,68 | 3,37 / 9,22 / 16,65 |

Kontrast = WCAG-Verhältnis (sRGB-Luminanz) je Nicht-Kontur-Pixel gegen den Hintergrund
(`minInner` = schwächster, `meanInner` = Mittel, `max` = hellster Pixel),
`shots/m10-enemy-shots-contrast.json` — Messung: **ein Lauf**, fester Satz Hintergründe
(nightDeep/night/waterDeep/waterMid/grassMarsh), Stichprobe = alle opaken Nicht-Kontur-
Pixel der 4 Texturen; keine weiteren Crops/Montagen. Ergebnis ehrlich: bone (mean 4,34–12,73)
und fire (3,03–9,22) tragen über die Innenfüllung; shadow (2,09) knapp; **spit** liegt gegen
waterMid/Gras bei mean 1,43/1,40 unter der Innenfüll-Schwelle 2,0. Dort tragen die
1-px-Kontur (ink 0), der aufgehellte Rand (31) und die eindeutig andere Silhouette
(Form-IoU max 0,62, spit/fire nur 0,47); das ist als offener Punkt dokumentiert,
kein Rebalancing. Auf Gras (`grassMarsh`, Index 30) liegt bone bei 4,31, shadow/fire bei
1,60/1,35. Form-IoU aller 6 Paare 0,26–0,62 (vorher spit/fire 0,86). Kontaktbogen
`shots/m10-enemy-shots-optics.png` (480×120, 10× nearest), Dichte-Beleg
`shots/m10-enemy-shots-density.png` (500 Gegner: 125 toad/witchling/lich/horror), 2-s-GIF
`shots/m10-enemy-shots-density.gif` (24 Frames, 12 fps), 0 JS-Fehler.

Mapping: ranged TI0 → spit, TI1 → bone, TI3 → shadow, TI4 (horror) → fire; damit
kommen alle vier Optiken im Spiel vor.

**art-director-Urteil:** siehe Abschnitt „Abnahme“ (wird nach der Kontrolle ergänzt).

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

## Offene Punkte

- Der WCAG-`minInner`-Kontrast der dunklen Innenpixel ist bei spit/fire niedrig
  (gegen Wasser 1,0–1,4; gegen Gras 1,0–1,2), bei bone/shadow hoch (≥ 2,9).
  Die Lesbarkeit im Spiel tragen 1-px-Tint-Kontur + Silhouette; eine spätere
  Konturaufhellung wäre eine eigene Karte (hier bewusst nur Optik, kein Blink).
- Viele Ranged-Gegner gleichzeitig erzeugen sehr viele Projektile (1359 in ~2 s bei
  500 Ranged); das ist Bestand, nicht Teil dieser Lane (kein Rebalancing).
