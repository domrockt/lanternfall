# Lane m10-golden-frame-rebaseline-r3 — Golden-Frame-Schranke nach der Merge-Welle seit r2 (2026-11-28)

## Auftrag
Golden-Frame-Schranke nach der Merge-Welle seit r2 (16:38, Baseline ab `d75862cb`; seither u. a.
renderer-guard `9bcc1e41`, blend/gc/evo/heap-Lanes) wieder scharf machen. Wiederkehrendes
Sicherungsmuster wie r2 (`docs/lanes/m10-golden-frame-rebaseline.md` + r2). **Keine src-Änderung.**
Karten: #13539 (K1 Probe), #13540 (K2 Rebaseline oder Befundliste), #13541 (K3 Doku + .lane-done).

## Ergebnis: KEINE Divergenz — keine Rebaseline nötig (K1-Pfad, K2-Rebaseline entfällt)

Guard-Lauf **ohne** `--write-baseline` gegen die Baseline vom Rebaseline-Stand
(`baselineAt: 761f274a`, Rebaseline-Commit #12854, Capture-Stand `213b8494`):

```
node scripts/m10-golden-frame.mjs        # 3 Seeds × 2 Läufe × 600 Ticks, mira, dist-Build
```

| Seed | Hash (ist = Baseline) | matchesBaseline | lastMark (Tick 600) |
|---|---|---|---|
| 101 | `9d3f3b2aff8461fc` | ✅ | kills=14, level=3, enemies=3 |
| 202 | `b4555df0be113816` | ✅ | kills=10, level=2, enemies=1 |
| 404 | `a9f247a96b2e34d6` | ✅ | kills=16, level=4, enemies=1 |

**URTEIL: PASS** — `deterministic=true` (je Seed 2 Läufe bitgleich), `matchesBaseline=true` (3/3),
`jsErrors=0`, Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(iGPU-Pflicht erfüllt, kein SwiftShader). Verdict: `shots/m10-golden-frame-r3-verdict.json`.
Laufzeit 34 s. Die Hashes sind **bitgleich** mit der r2-Doku (16:38) und der Rebaseline #12854 —
die Merge-Welle seit r2 hat den simulierten Spielstand nach 600 Ticks nicht ungefragt verändert.

## Code-Stand des Laufs
Worktree-HEAD = `489e7682` (Branch `m10-golden-frame-rebaseline-r3`), dist neu gebaut (ensureBuild).

## Quellenzuordnung: alle 3 Merges seit r2-Baseline d75862cb sind src-frei

`git log --first-parent --merges d75862cb..HEAD`:

| Merge | Lane | src/-Änderung | Betroffene Dateien | Sim-relevant? |
|---|---|---|---|---|
| `32aaa78b` | m10-inrun-tor-sweep | nein | scripts/m10-acceptance-doc-lint*, tests/acceptance-doc-lint, docs | nein (Lint/Docs) |
| `9bcc1e41` | m10-renderer-guard | nein | scripts/lf-renderer.mjs, scripts/perf.mjs, scripts/m10-v10-device-10min.mjs, tests/renderer-guard | nein (Guard/Mess-Skripte) |
| `08ef5235` | m10-janky-remeasure | nein | scripts/m10-janky-remeasure.mjs, docs, board | nein (Mess-Lane) |

Erwartungskonform: keine der Quellen berührt `src/` → Sim-Hash zwingend unverändert;
der Guard-Befund bestätigt genau das. Keine Differenzen, daher keine Belegliste je Frame (K2-Befundpfad)
und keine Rebaseline (K2-Rebaseline-Pfad). Auch der R2-Folgewellen-Hinweis bleibt gültig:
ein künftiger Guard-FAIL wird zuerst je Differenz eingeordnet, nicht stillschweigend rebaselt.

## Tests
- `npx tsc --noEmit` — sauber.
- `npx vitest run tests/golden-frame.test.ts` — 4/4 grün.
- `npx vitest run` (volle Suite) — 234 Dateien / 2541 Tests grün.

## Belege (außerhalb des Repos)
- Guard-Log: `~/tmp/m10-golden-frame-rebaseline-r3-k1.log`
- Rohe Marken je Lauf: `~/games/.evidence/m10-golden-frame-guard/<ts>/` (Skript-Standardpfad)

## Offene Punkte
- Keine. Schranke bleibt scharf gegen die nächste Merge-Welle (Baseline unverändert:
  `shots/m10-golden-frame-baseline.json`, `baselineAt: 761f274a`).

## Lane-Abschluss (#13541)
Schranke nach der Merge-Welle seit r2 **scharf**: Guard PASS ohne Rebaseline, Baseline
unverändert (`baselineAt: 761f274a`). Keine src-Änderung in dieser Lane; Mess-/Probe-Aufwand
1 Skript-Lauf, 0 Edit-Iterationen am Mess-Skript.
