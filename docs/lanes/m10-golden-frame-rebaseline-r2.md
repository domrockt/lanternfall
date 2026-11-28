# Lane m10-golden-frame-rebaseline-r2 — Golden-Frame-Schranke nach 4 Merges (2026-11-28)

## Auftrag
Die Golden-Frame-Schranke (3 Seeds × 600 Ticks, Sim-Hash, `tests/golden-frame.test.ts`) nach der
Merge-Welle heap-gate-recovery / fps-cap-stackfix / charstats-spec-followup / mira-hp-balance-check
prüfen. Kurs Dom 14:20Z: v1.0-Abschluss — reine Sicherung, kein Ausbau.

## Ergebnis: KEINE Divergenz — keine Rebaseline nötig (K1-Pfad, K2/K3 entfallen)

Guard-Lauf **ohne** `--write-baseline` gegen die Baseline vom Rebaseline-Stand
(`baselineAt: 761f274a`, Rebaseline-Commit #12854, generiert 2026-11-28T15:14:38Z):

```
node scripts/m10-golden-frame.mjs
```

| Seed | Hash (ist = Baseline) | matchesBaseline | lastMark (Tick 600) |
|---|---|---|---|
| 101 | `9d3f3b2aff8461fc` | ✅ | kills=14, level=3, enemies=3 |
| 202 | `b4555df0be113816` | ✅ | kills=10, level=2, enemies=1 |
| 404 | `a9f247a96b2e34d6` | ✅ | kills=16, level=4, enemies=1 |

**URTEIL: PASS** — `deterministic=true` (je Seed 2 Läufe bitgleich), `matchesBaseline=true`
(3/3 Seeds), `jsErrors=0`, Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(iGPU-Pflicht erfüllt, kein SwiftShader). Verdict: `shots/m10-golden-frame-verdict.json`.

## Code-Stand des Laufs
Worktree-HEAD = `b472b57d` (Branch `m10-golden-frame-rebaseline-r2`), enthält alle 4 abhängigen
Merges plus weitere Welle:
- `3fd53803` Merge m10-heap-gate-recovery (Pool/EnemyPool)
- `aa8739f0` Merge m10-fps-cap-stackfix (Spawner drainDebugQueue)
- `d8ef47e3` Merge m10-charstats-spec-followup (src/data)
- `3d355f29` Merge m10-mira-hp-balance-check (HP-Hebel)
- zusätzlich: m25-density-mode `af7df344`, chest-closed-crisp-ui `9128c450`,
  postwave-smoke-r2 `be697c34`, v10-gate-guard `5f7e5b1a` — **alle** ebenfalls
  hash-neutral gegenüber der Baseline 761f274a.

Das heißt: die 4 Merges (und die Folgewelle) haben den simulierten Spielstand nach 600 Ticks
nicht ungefragt verändert — genau der Vertrag, den die Schranke sichert. Keine Differenzen,
daher keine Belegliste je Frame (K2) und keine Rebaseline (K3a/K3b) nötig.

## Tests
- `npx tsc --noEmit` — sauber.
- `npx vitest run tests/golden-frame.test.ts` — 4/4 grün.
- `npx vitest run` (volle Suite) — grün (rc=0).

## Belege (außerhalb des Repos)
- Guard-Log: `~/tmp/m10-golden-frame-rebaseline-r2-k1.log`
- Rohe Marken je Lauf: `~/games/.evidence/m10-golden-frame-guard/2026-11-28T16-3*/…`

## Offene Punkte
- Keine. Schranke bleibt scharf gegen die nächste Merge-Welle (Baseline unverändert:
  `shots/m10-golden-frame-baseline.json`, `baselineAt: 761f274a`).
- Hinweis für künftige Lanes: mira-hp-HP-Hebel und charstats-Daten haben den Sim-Hash bei
  Seeds 101/202/404 in den ersten 600 Ticks nicht berührt (entweder display-only bzw. nicht
  innerhalb der 30 Sim-Sekunden wirksam). Ein Guard-FAIL nach solchen Merges ist trotzdem
  zuerst je Differenz einzuordnen (K2-Muster), nicht stillschweigend zu rebaseln.
