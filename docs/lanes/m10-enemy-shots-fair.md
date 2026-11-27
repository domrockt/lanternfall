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
| spit | runde Giftkugel (Kreuz-Kern) | ink 0 | 31 / 20 | 1,02 / 1,95 / 3,83 | 1,53 / 3,04 / 5,98 |
| bone | Knochenpaar | ink 0 | 11 / 10 / 13 | 6,90 / 9,03 / 11,67 | 10,77 / 14,11 / 18,23 |
| shadow | Halo-Ring mit Lücke | ink 0 | 9 / 26 / 13 | 2,86 / 3,71 / 4,56 | 4,46 / — / — |
| fire | Flamme mit Schweif | ink 0 | 19 / 18 / 12 | 1,36 / 5,78 / 10,66 | 2,13 / — / — |

Kontrast = WCAG-Verhältnis (sRGB-Luminanz) je Nicht-Kontur-Pixel gegen den Hintergrund
(`minInner` = schwächster, `meanInner` = Mittel, `max` = hellster Pixel),
`shots/m10-enemy-shots-contrast.json`. Messung: **ein Lauf**, fester Satz Hintergründe
(nightDeep/night/waterDeep/waterMid/grassMarsh), Stichprobe = alle opaken Nicht-Kontur-
Pixel der 4 Texturen; keine weiteren Crops/Montagen. Schwelle für die Innenfüllung:
`meanInner ≥ 2,0` gegen Wasser/Nacht, `greenMarsh ≥ 1,5` als Grenzfall.
Ergebnis: bone (4,31–14,11) und shadow (1,79–5,79) sowie fire (1,17–9,03) erfüllen die
Wasser-/Nacht-Schwelle; **spit** liegt gegen waterMid bei mean 1,95 und gegen Gras bei
1,32 darunter. Ehrlich: die dunklen Innenpixel von spit/fire liegen gegen Wasser bei
1,0–1,4; die Lesbarkeit tragen dort die 1-px-Tint-Kontur (ink 0) und die klar
verschiedenen Silhouetten, nicht die Innenfüllung. Auf Gras (`grassMarsh`,
Index 30) liegt bone bei 4,31, shadow/fire bei 1,79/1,17. Form-IoU der Paare 0,38–0,86
(spit/shadow 0,66, spit/fire 0,86 — Form ähnlich, aber Kernfarbe/Halo-Lücke/Flamme
verschieden); Kontaktbogen `shots/m10-enemy-shots-optics.png`, Dichte-Beleg
`shots/m10-enemy-shots-density.png` (500 Gegner, 63 Schüsse aktiv), 2-s-GIF
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
