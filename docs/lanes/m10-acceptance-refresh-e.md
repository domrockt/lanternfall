# Lane m10-acceptance-refresh-e — Nachabnahme E (NUR-PRÜF, 2026-11-28)

Zweck: Nachabnahme **E** auf aktuellem main nach ~15 Merges seit Nachabnahme C
(dpr-budget-Welle, Gamepad-Nav Kern+Szenen, Terrain-Hole-Guard, Winter-Reste,
VFX-restore Stufe 2, Ops-Hygiene f71c3be/b54e742). Nur-Prüf-Lane: Mess-Skripte werden
ausgeführt, nie geändert. Gamepad-Nav-Skript `scripts/verify-input.mjs` gehört
m10-pad-start-pause-r2 (nur gelaufen); `.opencode/board.json` fremd beansprucht → Board-Updates entfallen.

- **PIN:** main @ `a6f1458b2ffaf578828f408a152dd58a0c2558bf` (2026-11-28T07:20:20Z), Branch `m10-acceptance-refresh-e`, Worktree `/home/ai/games/lf-lanes/m10-acceptance-refresh-e`.
- Belege: `~/games/.evidence/m10-acceptance-refresh-e/`, Abnahme-Bilder: `shots/abnahme/refresh-e-*`.

## K1 — Build / Tests / Inhaltszählung (07:21–07:23Z)

| Check | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | rc=0, keine Ausgabe | **PASS** |
| Build | `npm run build` | rc=0, `✓ built in 487ms` (Chunk-Größenwarnung, bekannt) | **PASS** |
| Tests | `npm test` | **1655/1655 grün in 153 Dateien**, 0 fail, 4,45 s | **PASS** |
| Inhalte | `node scripts/acceptance-count.mjs` | `ok:true` — 30 Gegner / 6 Waffen / 6 Powerups / 6 Evolutionen / 6 Bosse / 2 Helden | **PASS** |

Befund (Delta zu Nachabnahme C, PIN `43fd9eb`): Tests 587 → **1655 (+182 %)**,
Testdateien 58 → 153. Ursache: dpr-budget-Welle, Gamepad-Nav, VFX-restore u. a.
ohne Abnahme-Beleg; keine roten Tests. Hebel: keine (positiver Befund).

Roh-Beleg: `~/games/.evidence/m10-acceptance-refresh-e/k1-logs.txt` ( nachgetragen ).

## K2 — verify:final + verify-input (07:20–07:24Z)

| Check | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| verify:final | `node scripts/verify-final.mjs` | **7/7 PASS**, `errors: []`, 0 JS-Fehler (Master-Mute, Aggregation 110/129, Results `dawn` weapons=12) | **PASS** |
| verify-input | `node scripts/verify-input.mjs` | **28/28 PASS**, 0 JS-Fehler (`jsErrors: []`) — Touch 9, Gamepad 14, Tastatur 3, Shots ok | **PASS** |

Befund E-1 (positiv): die **ESC-Regression aus Nachabnahme C (27/28 FAIL) ist behoben** —
„ESC pausiert" + „ESC setzt fort" grün (`listeners:1`, kein Doppel-Listener), Plausibilität:
Fix-Welle Gamepad-Nav/pad-start-pause-r2 seit C. Hebel: keine.

Roh-Belege: `~/games/.evidence/m10-acceptance-refresh-e/k2-verify-final.json`, `k2-verify-input.json`
(Kopien der Skript-Outputs `shots/final-verify.json` / `shots/m8-input.json`; shots/ ist gitignored).
