# m10-feedback-budget — Shake/Hit-Stop/Knockback im 500-Gegner-Chaos

## Lücke

Bei 500+ Gegnern und `timeScale 30` treffen viele Projektile pro Render-Frame.
Vorher gab es keine expliziten Budgets für die Summe der Requests:

- Shake-Anfragen mehrerer Quellen (Boss-Treffer, Boss-Tod, Spieler-Treffer) konnten
  pro Frame mehrfach an die Kamera gehen. Phaser ignoriert einen laufenden Shake,
  aber die Werte waren nirgends als „max statt Summe“ festgeschrieben.
- Hit-Stop wurde mit `Math.max(remaining, request)` gesetzt. Ein laufender Stop
  konnte durch weitere Requests im selben Frame auf 120 ms „aufgefrischt“ werden
  (Boss-Feedback-Cooldown lief zudem in Sim-Zeit, bei 30x also alle 40 ms Wandzeit).
- Knockback wurde pro Treffer auf `e.vx/e.vy` addiert. Mehrere Treffer im selben
  Substep konnten einen Gegner mehrere Pixel weit springen lassen (Teleport-Effekt).

## Fix (nur Feedback-Dosierung)

`src/logic/feedback.ts`
- `MAX_HITSTOP_SECONDS = 0.12`, `MAX_SHAKE_MS = 400`, `MAX_KNOCKBACK_SPEED = 160`.
- `mergeHitStop(remaining, request)`: laufender Stop wird **nicht** verlängert oder
  aufaddiert; ein einzelner Request bleibt auf 120 ms gedeckelt.
- `mergeShake(...requests)`: stärkster Request gewinnt (Pixel-Limit 6 px), Dauern
  werden nie summiert.
- `knockbackFor`: harte Obergrenze 160 px/s; `clampKnockbackSpeed`: klemmt die
  akkumulierte Gegner-Geschwindigkeit je Substep (< 3 px bei 60 Hz).

`src/scenes/Run.ts`
- Beide Boss-Hit-Stop-Aufrufe nutzen `mergeHitStop`.
- Boss-Feedback-Cooldown läuft in Echtzeit (`realDt`) statt in Sim-Zeit, damit
  `timeScale 30` kein Dauer-Rumble/Dauerfreeze erzeugt.
- Gegner-`vx/vy` werden nach dem Decay auf `MAX_KNOCKBACK_SPEED` geklemmt.
- Keine Änderung an Schaden, Gegnerzahlen, Spawnraten oder Balance-Daten.

## Messung (Chaos-Probe)

`scripts/m10-feedback-probe.mjs` startet headless einen echten Run, springt auf
Minute 25, spawnt 500 Gegner, aktiviert `timeScale 30`, God-Mode und AutoPlay und
loggt je Render-Frame Treffer, Shake-Intensität (px), Shake-Request-Peak,
Hit-Stop-Restdauer und Frame-Dauer.

| Wert | Baseline (`shots/m10-feedback-budget-baseline.json`) | Nachher (`shots/m10-feedback-budget-after.json`) |
|---|---:|---:|
| Frames | 393 | 386 |
| Treffer gesamt | 10.431 | 12.247 |
| Treffer max/Frame | 720 | 783 |
| Shake-Peak (px) | 2,56 | 2,56 |
| Shake-Request-Peak (px) | 4,80 | 4,80 |
| Hit-Stop-Peak (ms) | 120 | 120 |
| Frames mit aktivem Hit-Stop | 125 | 55 |
| Stutter-Frames > 33 ms | 18 | 13 |
| Frame-Zeit p99 / max (ms) | 38,9 / 48,0 | 38,8 / 48,8 |
| JS-Fehler | 0 | 0 |

Reproduktion:

```bash
node scripts/m10-feedback-probe.mjs --out shots/m10-feedback-budget-after.json --label after
npx vitest run tests/feedback-budget.test.ts
```

## Tests

`tests/feedback-budget.test.ts` (7/7 grün, `npm test`: 349/349 grün):

- (a) 1.000 Shake-Requests in einem Frame ergeben ≤ 6 px (Summe wäre > 600 px).
- (b) 1.000 Hit-Stop-Requests in einem Frame ergeben exakt 60 ms, nicht 60 s;
  ein laufender Stop wird auch durch einen stärkeren Request nicht verlängert;
  ein einzelner Request bleibt ≤ 120 ms.
- (c) 1.000 Knockback-Impulse im selben Substep ergeben ≤ 160 px/s, also < 3 px
  pro 60-Hz-Frame statt eines Sprungs.

## Urteil

- **Shake:** in beiden Läufen ≤ 6 px (Peak 2,56 px). Bei 783 Treffern/Frame keine
  Addition; `mergeShake` erzwingt max statt Summe.
- **Hit-Stop:** Peak 120 ms (Boss-Tod), nicht kumulativ. Trotz mehr Treffern sanken
  die Frames mit aktivem Stop von 125 auf 55, weil der Cooldown jetzt in Echtzeit
  läuft und laufende Stops nicht mehr aufgefrischt werden.
- **Knockback:** je Substep auf 160 px/s geklemmt, sichtbar (< 3 px/Frame), kein
  Teleport durch Massentreffer. Einzelne normale Treffer bleiben unverändert.
- **Stutter:** 13 Frames > 33 ms (p99 38,8 ms, max 48,8 ms) bleiben. Ursache ist
  die 500-Gegner-Simulation bei 30x (AI/Separation/Kollisionen), nicht das
  Feedback-Budget; die Zahl ist hier bewusst genannt, kein Feedback-Rumble.

## Offene Punkte

- Frame-Stutter im 500-Gegner-Chaos ist Engine-/Sim-Last; ein eigener
  Performance-Ticket (Separation/AI-LOD bei 30x) könnte das adressieren.
- Die Probe misst 640×360@2x; andere Viewports können die Trefferzahl pro Frame
  verschieben, die Budget-Grenzen gelten aber unabhängig davon.
