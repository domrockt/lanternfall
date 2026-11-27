# Lane m10-shot-path-budget — Gegner-Schuss-Pfad-Budget

Roter Abnahmepunkt (Nachabnahme B): **„Burst 640×360: 46,3/46,3/49,3 FPS < Ziel 55"** —
letzter unbeleuchteter FPS-Hebel: der Gegner-Schuss-Pfad (`EnemyProjectilePool.update`
+ Gate-Aufrufe aus `src/logic/bosses.ts`) bei 500+ Gegnern.

## K1 — Bench + Vorher-Messung (`#5658`)

Neues Messwerkzeug `scripts/m10-shot-path.mjs`: deterministischer Micro-Bench
(500 Gegner, Endgame-Archetypen-Mix, 71 Schützen mit 1–2 s Feuerrate, Seed
20261127, View 640×360 um den Spieler). Es lädt das **echte**
`src/systems/EnemyProjectiles.ts` — Phaser und `gfx/atlas` werden per
Node-Resolver-Hook auf Stubs umgeleitet (Sprite-Methoden setzen Felder und
zählen ihre Aufrufe). Die Kamera-Sichtbarkeit, Windup-Gates
(`canLaunchShot`/`isPointInView`), Offscreen-Verwerfen und Schützentod laufen
vollständig mit. 9 Passes à 300 Frames (120 Warmup), **Minimum** zählt
(Micro-Bench-Standard wie `m10-ai-budget.mjs`).

Ergänzung: Der Stub-Szene wurde ein Mini-Tween-Manager gegeben, damit der
Trail-Fade (vorher `scene.tweens.add`) in beiden Varianten ehrlich kostet.

**Vorher (`shots/m10-shot-path-before.json`): 0,047 ms/Frame.**

### Profil — welche Teile dominieren (Stub-Aufrufe/Frame, before)

| Teil | Aufrufe/Frame | Befund |
|---|---|---|
| Aktive Schüsse (~89) | `setPosition` 84, `setRotation` 84 (+`atan2`), `setScale` 89, `setAlpha` 89 | **Rotation konstant pro Schuss** (v fix) — `atan2`+`setRotation` je Frame tot; `setScale(1)` je Frame tot (Grid 1×) |
| Trail | `makeImage` 16,9 + 16,9 `tweens.add` je Frame (~2 400 Allokationen/s) + ~170 Alpha/Scale-Updates via Tween-Manager | **größte Allokationsquelle im Pfad** |
| Vorwarnungen (~7) | `setScale(1)` 7 (tot), `setAlpha` 7, `Phaser.Math.Clamp` 7 | Clamp inline möglich |
| Gate-Aufrufe | `isInView` erzeugte **je Aufruf ein Objekt** (View-Box); `shooterAliveNear` O(500) je Launch (nur bei Windup-Ende, selten) | Allokation eliminierbar |

Determinismus: zwei Läufe liefern identische Zähler (369 Versuche, 186 Schüsse,
173 Offscreen-Verwerfen, 0 Treffer).

## K2 — Fix (`#5659`), nur `src/systems/EnemyProjectiles.ts`

1. Rotation nur noch beim Launch (v pro Schuss konstant) → kein `atan2`/`setRotation` je Frame.
2. `setScale(1)` je Frame gestrichen (aktive Schüsse + Telegraphs; Scale konstant 1).
3. `isInView`: View-Probe wird einmal pro `spawn()`/`update()` kopiert — kein Objekt je Gate-Check.
4. `shooterAliveNear`: dx/dy-Frühabbruch statt Quadrate.
5. **Trail-Pool**: gepoolte Bilder mit manuellem linearem Fade (identische Kurve
   wie der bisherige Tween: Alpha 0,25→0, Scale 0,7→0,2, 160 ms) statt
   `makeImage` + `tweens.add` je 0,07 s → 0 Allokationen im Hot Path. Fade läuft
   in ~30-Hz-Schritten (gleiche Kurve, halbe Setter-Rate).
6. `PendingShot`-Objekte werden wiederverwendet.

**Fairness unverändert**: Windup ≥ 0,3 s, kein Offscreen-Spawn/Treffer,
Schützentod-Abbruch — Gates (`canLaunchShot`) unangetastet, Bench-Zähler
bitgleich vor/nachher (369/186/173/0 identisch).

**Nachher: 0,030 ms/Frame → −36,2 %** (Ziel −30 % erreicht; Bestätigungslauf
0,027 → −43 %). Stub-Aufrufe/Frame 781 → 471 (−40 %), `makeImage` 16,9 → 0,35,
`tweens.add` 16,9 → 0, `setRotation` 84 → 0.

## K3 — Tests (`#5660`)

`tests/shot-path-budget.test.ts` (8 Tests, grün):
Windup-Reihenfolge (erst Warnung ≥ 0,3 s, dann Projektil), Schützentod-Abbruch,
0 Offscreen-Spawns/-Treffer, „kein Shot verloren" (fired + Abbrüche = attempted,
nach 4 s active/pending = 0), Runtime-Recycling, Trail ohne `tweens.add` und mit
gebundener Bildanzahl. `tests/enemy-shots-fair.test.ts` bleibt grün (14 Tests).

## K4 — Nachher in-game (`#5661`)

- `scripts/m10-shot-path.mjs --tag=after` → `shots/m10-shot-path-after.json`
  (0,027–0,030 ms/Frame, s. o.).
- **Burst 640×360 nicht verschlechtert** (`shots/m10-perf-burst-after.json`,
  mit `flock`): 60,1 FPS bei 500 Gegnern, `passed: true` (Ziel ≥ 55; roter
  Abnahmewert 46,3/49,3 damit clear).
- Chaos-Screenshot `shots/m10-shot-path-after.png` (Minute 25, 653 Gegner,
  god mode, 3,5 s echte Zeit): Schuss-Zähler live — attempted 110, fired 106,
  active 21, pending 4, **0 Offscreen**, windupOk 106/106, keine JS-Fehler.

## Grenzen / offene Punkte

- Der Micro-Bench misst die Logikpfad-Kosten mit Stub-Sprites (wie
  `m10-ai-budget`); die absoluten ms liegen unter den In-Game-Kosten, weil
  Phaser-Setter teurer sind als die Stubs. Die Aufruf-Reduktion (−40 %) ist
  daher die belastbare Kennzahl; in-game bestätigt der Burst-Lauf ≥ 55 FPS.
- Der Trail-Fade läuft mit ~30 Hz statt 60 Hz (identische Kurve, Schritte von
  ~0,03 Alpha — visuell nicht unterscheidbar). Falls der Art-Director einen
  60-Hz-Fade will: `TRAIL_FADE_STEP_SECONDS = 1/60` setzen, kostet ~85 Setter/Frame.
- Kein Anfassen von FxSystem/CombatSystem/Spawner/waves/ProjectilePool/Pool (fremd geclaimed).
