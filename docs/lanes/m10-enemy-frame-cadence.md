# Lane m10-enemy-frame-cadence — Gegner-Lauf-Frames (Cadence + Lookup-Fix)

Ziel: Alle generierten Lauf-Frames werden tatsächlich gezeigt. Der Auftrag
(2x von m9-art-enemies angefragt, `.dispatch/requests.md` Run.ts ~1066) lautete:
`Math.min(2, frames.length)` begrenzt den Zyklus auf F0/F1.

## Befund (wichtiger als gemeldet)

Der Modulo-Fix allein wäre wirkungslos gewesen, denn Run.ts suchte
`SPRITE_FRAMES[def.spriteKey]`, die Map ist aber anders verschlüsselt:

- `ALL_ENEMY_FRAMES` ist nach `def.id` verschlüsselt (`bog_rat`), Gegner-Defs
  tragen aber `spriteKey` (`enemy_bog_rat`). Nur die 3 Legacy-2-Frame-Einträge
  (`enemy_bog_rat`, `enemy_wisp`, `enemy_bogzombie`) trafen zu.
- Folge: **27 von 30 Gegnertypen hatten `frames === undefined`** — gar keine
  Frame-Animation (Spawn-Textur blieb F0, `if (frames)` übersprungen).
- Bosse: `bossEnemyDef()` setzt `spriteKey: "boss_<id>"`, die Map schlägt aber
  unter `<id>` → auch für alle 6 Bosse `undefined`, kein Wind-up-Frame.
- Für die 3 Legacy-Typen begrenzte `% Math.min(2, frames.length)` auf F0/F1,
  wie im Auftrag beschrieben.

## Fix (Karte #1)

- Neu: `src/logic/enemy-frames.ts` (reine Funktionen, 2 Exporte):
  - `framesForDef(def)`: löst Boss-Praefix (`boss_<id>` → `<id>`), sonst
    Gegner-`def.id` (4 generierte Frames), sonst Legacy-`spriteKey` (2 Frames).
    Textur-/Atlas-Keys wurden NICHT umbenannt (Karten-Vorgabe).
  - `runFrameIndex(frameCount, t, phase)`: `Math.floor(t * 6 + phase) % count`
    zyklisch über ALLE Frames (6 fps), 0 bei leerem Array.
- `src/scenes/Run.ts`: Lookup + Modulo ersetzt; Boss-Wind-up (`frames[2]` bei
  Telegraph, `frames.length >= 3`) und Bob (`sin(t*4+phase)*1.2`) unveraendert.
- `tests/enemy-run-frames.test.ts` (5 Tests): alle 30 Gegner finden 4
  generierte Frames (Basis-Frame = spriteKey), alle 6 Bosse 3 Frames inkl.
  Wind-up, 4-Frame-Typen nutzen zyklisch 4/4 Frames über t und Phase,
  2-Frame-Typen (3 Legacy-Einträge) weiterhin nur F0/F1, Eckfälle deterministisch.

## Sicht-Beleg (Karte #2)

- `shots/m10-enemy-frame-cadence-run.gif` — 640x360 (nativ), 30 Frames ~15 fps:
  Ritter (4-Frame-Typ, 340 hp) läuft auf den Spieler zu, Frames wechseln.
- `shots/m10-enemy-frame-cadence-frames.png` — 4x 400 %-Zoom-Montage, gelabelt
  F0..F3 → `enemy_knight`/`_2`/`_3`/`_4`, vier klar verschiedene Posen.
- `shots/m10-enemy-frame-cadence-run.json` — Log der am Sprite gemessenen
  Frame-Keys (Debug-Hook `__lfEnemyFrames` in Run.ts, nur `?debug=1`):
  alle 4 Keys kommen über die Zeit vor (4/4 genutzte Frames), keine JS-Fehler.
- Capture: `scripts/m10-enemy-frame-cadence.mjs` (Playwright, `?debug=1&seed=42`).
  Anmerkung: Hook-Positionen weichen ~80 px vom Renderbild ab (Kamera folgt
  dem Player-Container mit Lerp, nicht `posX`); für die Zoom-Montage mit
  +79/+4 px kalibriert, im Log für den Frame-Nachweis irrelevant.

## Regression (Karte #3)

- `npx vitest run`: 43 Dateien, **451/451 grün** (vorher 446 + 5 neue).
- `npm run build`: rc=0.
- `node scripts/verify-enemies.mjs`: **30/30 PASS, failed: [], keine
  jsErrors** — Verhalten unverändert (Bewegung/Tempo/Modi der Gegner).
- Board: #4298/#4299/#4300 (done).

## Dateien (Disponent-Bereich + Begründungen)

- `src/scenes/Run.ts` (Claim), `tests/enemy-run-frames.test.ts` (Claim),
  `docs/lanes/m10-enemy-frame-cadence.md` (Claim), `shots/m10-enemy-frame-cadence-*` (Claim).
- `src/logic/enemy-frames.ts` — NEU, reine Funktionen nach Projekt-Konvention
  (`src/logic/*` + Tests; Run.ts kann nicht headless getestet werden). Neue
  Datei kollidiert mit keinem Claim.
- `scripts/m10-enemy-frame-cadence.mjs` — NEU, Capture-Skript der Lane
  (Muster wie `scripts/capture-m5.mjs`), neue Datei.

## Offene Punkte

- EnemyPool.ts (Zeile ~183, fremde Datei, nicht angefasst) nutzt denselben
  spriteKey-Lookup für die Spawn-Textur. Visuell folgenlos (Fallback
  `def.spriteKey` = Basis-Textur = Frame 0), aber wer dort künftig Frames
  vorsetzt, sollte `framesForDef()` nutzen.
- Die 3 Legacy-2-Frame-Einträge in `SPRITE_FRAMES` sind jetzt toter Code
  (alle Gegner nutzen die 4 generierten Frames); Aufräumen = eigene Karte,
  da textures.ts fremd ist.
