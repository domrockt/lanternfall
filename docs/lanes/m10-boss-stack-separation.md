# Lane m10-boss-stack-separation (M10, 2026-11-28)

## Befund (Anlass, Argus 08:00Z / Claude-Sichtung main 45c198d 08:15Z Punkt 3)

Late-game (late-1920, Belege `~/games/.review/out2/`) überlappen mehrere Bosse/Elites
zu einem Haufen — Silhouetten und HP-Zuordnung unlesbar, Gegner nicht zählbar.
Root-Cause: `Run.updateEnemies()` überspringt Bosse komplett (`if (e.boss) continue;`),
es gibt also keinerlei Separation zwischen Boss-Entities; Elite-Elites erhalten nur
die geschwindigkeitsskalierte Schwarm-Separation (Tanks: kaum Wirkung). Zusätzlich
unterschätzt die Trefferfläche (Boss r = 16..20) die sichtbare Stapelung — die
Sprite-Frames sind 56..96 px groß (M10 A10).

## Fix

1. **`src/logic/separation.ts` — `resolveBossStackSeparation()` (rein, deterministisch):**
   leichter Abstoß pro überlappendem Paar (kein Positions-Snapping): Korrektur =
   `STACK_STRENGTH` (0.4) des Abstandsdefizits, massengewichtet (Anteil invers zur
   Fläche des Trennradius — schwerer Boss weicht kaum aus, Elite mehr). Zielabstand
   `STACK_GAP_FACTOR` (0.35) × (r1+r2) ⇒ Sprite-Deckung ≤ 65 % (Abnahmegrenze 80 %).
   **Sprungfreiheit:** harte Deadzone — ohne Überlappung exakt null Kraft; der Abstand
   nähert sich dem Ziel monoton an (nie überschwingend), kein Vibrieren im Stand.
   Determinismus: feste Paar-Ordnung i<j, Fallback-Richtung über kleinere UID
   (Goldener Winkel), kein Math.random.
2. **`src/systems/BossSystem.ts` — `resolveStacks()` am Ende von `update()`:**
   Scratch-Pool (`stackScratch`/`stackRefs`) ohne Frame-Allokation; Bosse mit
   Sprite-Halbbreite (`BOSS_SPRITE_SIZE/2` = 28..48) als Trennradius, Elites mit
   Hit-Radius aus `pool.active`. Rückkopplung auf `e.x/e.y`. Fast-Path: n < 2 ⇒ skip.

Bosse werden weiterhin vom BossSystem gesteuert; die Trennung ist eine korrigierende
Zusatzkraft und ändert weder Tempo noch Angriffe (kein Balance-Eingriff).

## Abnahme (messbar)

| Kriterium | Vorher | Nachher | Grenze |
|---|---|---|---|
| Max. Sprite-Deckung Boss/Elite (Kreisdistanz vs. Radiensumme) | **0.828** | **0.338** | kein Paar > 0.80 ✓ |
| Paare mit > 80 % Deckung | 1 | 0 | 0 ✓ |
| JS-Frame-Zeit p95 (rAF-Deltas, 10 s, 601 Frames) | 16.8 ms | 16.8 ms | ≤ +5 % ✓ (+0 %) |
| Frame p50 / max | 16.7 / 16.8 ms | 16.7 / 16.8 ms | ✓ |
| WebGL-Renderer-String | Mesa Intel(R) Graphics (RPL-S), webgl1 | identisch | Pflicht ✓ (kein SwiftShader) |
| JS-Fehler im Lauf | 0 | 0 | 0 ✓ |

Szenario beider Läufe identisch (`scripts/m10-boss-stack.mjs`, `?debug=1&seed=99`,
skipTo 1500 + 5. Boss + 24 bogzombie, 6 s Anlauf bei timeScale 4, Messung 10 s,
Spieler steht still): late-game Minute 25 mit 5 Bossen + Elite-Packs + Horde.

### Belege

- Mess-JSON (nicht in git): `~/games/.evidence/m10-boss-stack-separation/m10-boss-stack-{before,after}.json`
  (je Frame-Statistik, 2 Stapel-Samples mit schlimmstem Paar, Renderer-String, Szenario-Parameter).
- Abnahme-Shots (in git): `shots/abnahme/m10-boss-stack-before.png` (Klumpen, Vorher),
  `shots/abnahme/m10-boss-stack-after.png` (Einzel-Silhouetten, Nachher).
- art-director-Abnahme (EINMAL, Punkt 3): siehe Karten-Notiz #10051 im Board.
- Deterministischer Test: `tests/boss-stack-separation.test.ts` (7 Tests) —
  ≥ 3 Bosse/Elites auf engem Raum, kein Paar > 80 % Deckung nach 60 Frames,
  ≤ 1 px/Frame im Stand über 120 Frames, Elite weicht ~9× mehr aus als der Boss,
  Bit-Determinismus, Tote ignoriert, getrennte Paare exakt unberührt.

## Qualität

- `npx tsc --noEmit` rc=0; `npm run build` grün; volle Testsuite 159 Dateien /
  1705 Tests grün (inkl. neuer 7).
- Mess-Skript: EIN Probe-Skript (`scripts/m10-boss-stack.mjs`), 2 Edit-Iterationen
  (Tag-Parsing + Sprite-Deckungs-Metrik) — within budget, danach eingefroren.
- Frame-Zeit-Messungen unter `flock /home/ai/games/.lf-perf.lock`.

## Offene Punkte / Scope-Grenzen

- Kleingegner-Schwarm bleibt dicht um den Spieler — bewusst nicht Teil dieser Karte
  (Scope Boss/Elite-Stapel; Schwarm-Separation ist die bestehende M10-Separation).
- `pairsOver80`-Metrik misst Boss/Elite-Paare; Boss-vs-Kleingegner-Überlappung wird
  über die bestehende Massengewichtung (`separationWeight`) abgedeckt.
- Kein GAME.md-Änderung (Lane-Doku wird beim Merge übernommen).
