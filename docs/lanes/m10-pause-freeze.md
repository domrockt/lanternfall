# Lane m10-pause-freeze — Pause friert die Simulation komplett ein

Ziel: Deterministisch nachweisen, dass während der ESC-Pause 0 Kills, 0 Schaden,
0 Spawns, 0 Timer-/Wellen-Fortschritt und 0 FX-Updates passieren und der Lauf
nach dem Fortsetzen ohne verlorenen/gebarbten Progress weiterläuft
(Korrektheits-Lücke neben der esc-pause-Regression, verify-input F2).

## Karten

| Karte | Inhalt | Commit |
|---|---|---|
| #7505 K1 | Harness `scripts/m10-pause-freeze.mjs` + Vorher-Messung | `31b06f5` |
| #7506 K2 | Update-Gate in `src/scenes/Run.ts` + After-Messung | K2-Commit |
| #7507 K3 | `tests/pause-freeze.test.ts` (7/7) | K3-Commit |
| #7508 K4 | Doku + `.lane-done` | K4-Commit |

## Messaufbau (K1)

`node scripts/m10-pause-freeze.mjs before|after` → `shots/m10-pause-freeze-*.json`.
Drei Läufe mit gleichem Seed (31), Charakter autoPlay + god + suppressLevelUps,
timeScale 30, Marken M1 = elapsed ≥ 185 s (3:05, Minute-3-Spezialwellen aktiv)
und M2 = 205 s (3:25), **frame-exakt** über einen `sys.sceneUpdate`-Wrap
(waitForFunction-Polling wäre bei 30x bis zu 3 s Sim-Jitter):

- controlA/controlB: ohne Pause (Methodik-Baseline),
- pauseRun: Pause bei M1 (gleicher Pfad wie ESC → `togglePause()`), 5 s
  Echtzeit warten, Zustands-Delta zählen, fortsetzen bis M2.

Instrumentierte Leck-Kategorien während der Pause:
1. Kern-Sim (kills/hp/elapsed/xp/spawnerBudget/enemies/proj/shots),
2. Szenen-Clock: Probe-`delayedCall(1500)` über exakt denselben Mechanismus,
   den Run.ts für Sim-Ketten nutzt (Z. 668 Banner-Retry, 1086 Morgendämmerung,
   1811 Truhe-Autoöffnung, 1826 Boss-Tod hp=0, 1835 Truhe-Nachfolger),
3. FX-Aufrufe (`fx/particles/damageNumbers/updateVisuals`) per Funktionswrap,
4. Probe-Tween in der Klasse der Splash-/Blink-FX (Run.ts 711/995/1097).

Determinismus-Injektion (nur Harness): `Math.random` wird pro Seite durch
mulberry32(31) ersetzt, weil `EnemyPool.ts:125`
`DEFAULT_AI_RNG = { next: () => Math.random() }` Cross-Run-Vergleiche ohne
Fremd-Fix unentscheidbar macht (Beleg before-Lauf: controlA/controlB divergieren
ohne Pause, kills 95 vs 110).

## Vorher (shots/m10-pause-freeze-before.json, Verdict LECKS=2)

| Kategorie | Befund |
|---|---|
| Kern-Sim (ohne Clock-Leck) | ✅ bereits eingefroren: elapsed/hp/xp/spawnerBudget/Gegner/Projektile Δ = 0 |
| **Timer-Fortschritt** | ❌ Szenen-Clock feuerte in der Pause: Probe-delayedCall (1,5 s) lief in das 5-s-Pausenfenster und **mutierte Kills +7**; `time.paused = false` |
| FX-Aufrufe (fx/particles/dmg/visuals) | ✅ 0 Aufrufe (bereits durch den frühen Return abgedeckt) |
| **FX-Tweens** | ❌ Probe-Tween lief in der Pause fertig (+1,0 Fortschritt) |

Cross-Run-Kontext: Divergenz Pause-Lauf vs controlA (kills Δ 1) kleiner als
Baseline-Divergenz zweier Kontrollläufe (Δ 7) — der Kern-Sim frisst keinen
Fortschritt, aber Timer-Ketten und Tweens laufen im Pausenbildschirm weiter.

## Fix (K2, nur Run.ts, keine Balance-/Inhaltsänderung)

Update-Gate in `Run.update()` direkt vor dem `paused`-Return: bei **Wechsel**
von `this.paused` (deckt Level-up-/Truhen-Pfade mit ab, die `paused = true`
setzen) werden Szenen-Clock (`this.time.paused`) und Tweens
(`pauseAll()/resumeAll()`) mitgezogen; `freezeGate`-Flag verhindert
Pro-Frame-Spam. `create()` setzt den Zustand zurück (Szenen-Wiedereinstieg).

## Nachher (shots/m10-pause-freeze-after.json, Verdict **PASS**)

| Check | Ergebnis |
|---|---|
| `pause_friert_sim_ein` | ✅ kills/hp/elapsed/xp/spawnerBudget/enemies/proj/shots Δ = 0 in 5 s Pause |
| `anschluss_bitgleich` | ✅ Zustand nach 5 s Pause ≡ Zustand bei Pause-Start (elapsed 185.661, kills 85, 24 Gegner inkl. Positionen/HP/Projektile/Waffen-Timer) |
| `pause_friert_clock_ein` | ✅ Probe-delayedCall feuert nicht mehr in der Pause, `time.paused = true` |
| `pause_friert_fx_ein` | ✅ 0 fx/particles/damageNumbers/updateVisuals-Aufrufe |
| `pause_friert_tweens_ein` | ✅ Probe-Tween friert ein (Δ 0) |
| `fortsetzen_ohne_luecke` | ✅ Sim-Zeit-Konto exakt (Δelapsed ≡ ΔsimDt), ~390 Sim-Steps nach Resume |
| `keine_js_fehler` | ✅ |

## Tests

- `tests/pause-freeze.test.ts` 7/7 grün: Quell-Kontrakt (Gate vor dem
  paused-Return, create-Reset), Freeze-Semantik (idempotent ein, exakt auf,
  Level-up-/Truhen-Pfade), Integration-Beleg (after-JSON PASS).
- `npx tsc --noEmit` grün; `npm run build` grün; ESC-Pfad verify-input lokal
  grün (siehe K4-Abschluss).

## Offene Punkte / Fremd-Anfragen

1. **Cross-Run-Bitgleichheit** ist ohne Fremd-Fix nicht entscheidbar:
   `EnemyPool.ts:125` (`DEFAULT_AI_RNG = Math.random`) und frame-count-abhängige
   Systeme (Spawn-Budget je Frame in `Spawner.ts`) lassen zwei Kontrollläufe mit
   gleichem Seed divergieren. Anfrage in `/home/ai/games/.dispatch/requests.md`;
   bis dahin ist der harte Pause-Nachweis der anschluss-bitgleich (Zustand nach
   5 s Pause ≡ Zustand bei Pause-Start) plus Sim-Zeit-Konto.
2. `Math.random()` in `Run.maybeSplash` (Z. 703) ist ein visueller
   Determinismus-Bruch (Splash-FX), aber kein Sim-Zustand und kein Pause-Leck —
   nur notiert, nicht geändert (Verhaltensänderung außerhalb des Auftrags).
3. Grenzen eingehalten: `InputState.ts`, `UI.ts`, `FxSystem.ts`,
   `EnemyProjectiles.ts`, `ProjectilePool.ts`, `logic/scaling|levelup|waves.ts`
   nicht angefasst (nur gelesen).
