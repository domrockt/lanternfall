# Lane m10-golden-frame-rebaseline (2026-11-28)

Bedarf: `m10-run-setter-churn` (Bedarfsmeldung in `~/.dispatch/requests.md`) — die
Golden-Frame-Baseline (Stand ab50197b) divergiert seit ~40 Dateien/~4136 Zeilen in `src/`
permanent; das Guard-Verdict ist dauerhaft rot und als Regressionsschranke wertlos.
Diese Lane rebased die Baseline bewusst (Anleitung `docs/lanes/m10-golden-frame-guard.md`)
und macht das Guard wieder scharf. **Keine src-Änderung.**

Karten: #12853 (K1 Vorher-Verdict), #12854 (K2 Rebaseline), #12855 (K3 Guard grün),
#12856 (K4 Rückfallebene bei echtem Regress — nicht aktiviert, siehe unten).

## K1 (#12853): Vorher-Verdict auf aktuellem main reproduziert — DIVERGENT

Belege: `~/.games`-evidence `~/games/.evidence/m10-golden-frame-rebaseline/`
(`k1-guard-lauf.log`, `k1-verdict-divergent.json`, `k1-divergenz-detail.json`).

- Lauf `node scripts/m10-golden-frame.mjs` (3 Seeds × 2 Läufe, 600 Ticks, mira, dist-Build):
  **URTEIL FAIL** — `deterministic=true matchesBaseline=false jsErrors=0`,
  Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU-Pflicht erfüllt).
- Divergenz je Seed (alt → neu, Hash-Präfixe):

| Seed | Baseline (ab50197b-Stand) | Ist (213b8494) |
|---|---|---|
| 101 | `ee84b3afc40918c3` | `9d3f3b2aff8461fc` |
| 202 | `5bd267501ce3054b` | `b4555df0be113816` |
| 404 | `2f338e1c299779e6` | `a9f247a96b2e34d6` |

- Wichtig zur Einordnung: **`final` UND `lastMark` sind je Seed bitgleich** mit der Baseline
  (kills/level/HP/Gegnerzahl/Position am Ende identisch, je 10 Marken). Es divergieren nur
  Zwischen-Marken (Gegner-Marker/UID-Allokation) — konsistent mit den gemergten
  Spawn-/View-Anker- und Pool-Lanes, nicht mit einem Zufalls-/Balance-Bruch.
- 2 Läufe je Seed sind bitgleich (Determinismus-Vertrag intakt) → Rebaseline ist
  auswertbar; K4 (echter visueller Regress) wird **nicht** aktiviert.

## K2 (#12854): Rebaseline — gewolltes Lane-Delta, NICHT stillschweigend

`node scripts/m10-golden-frame.mjs --write-baseline` (ein Lauf, danach ein
Verifikationslauf ohne Code-Änderung):

| Seed | alt (ab50197b-Stand) | neu (213b8494-Stand) | Selbstbeleg |
|---|---|---|---|
| 101 | `ee84b3afc40918c3` | `9d3f3b2aff8461fc` | Lauf 2 identisch ✓ |
| 202 | `5bd267501ce3054b` | `b4555df0be113816` | Lauf 2 identisch ✓ |
| 404 | `2f338e1c299779e6` | `a9f247a96b2e34d6` | Lauf 2 identisch ✓ |

- Beide Läufe: `PASS — deterministic=true matchesBaseline=true jsErrors=0`,
  Renderer RPL-S iGPU. Selbstbeleg-Logs: `~/games/.evidence/m10-golden-frame-rebaseline/
  m10-golden-frame-rebaseline-k2-write.log` + `…-k2-verify.log`.
- **Begruendung:** Die vollständige Liste aller 76 gemergten Lanes seit ab50197b
  (Lane-Name + Merge-SHA) steht im Rebaseline-Commit (#12854) und in
  `~/games/.evidence/m10-golden-frame-rebaseline/rebaseline-merges.txt`.
  Verhaltensrelevant im engeren Sinne (Sim-/Spawn-/Balance-Delta, deckt sich mit dem
  K1-Befund „nur Gegner-Marker divergieren, final+lastMark bitgleich"):
  - m10-spawn-view-anchor (4c677cfe) — Spawn-Anker auf Sim umgestellt → Gegner-Marker
  - m10-spawn-burst-alloc (cc8a3590) — Spawn-Allokationen → UID-/Markerfolge
  - m10-boss-dur-determinism (2e721bf1) — deterministische Boss-Dauern
  - m10-mira-dps-corridor (90e02d4a) — Balance/Waffenwerte
  - m10-gem-value-reading (e0c65704) — Gem-Werte/Pickup-Zuordnung
  - m10-run-setter-churn (0f3bab90) — laut Lane bitgleich (Belege
    `~/games/.evidence/m10-run-setter-churn/`), hier im Ist-Hash enthalten
  - m10-warmup-chunk-fine (062b4146), m10-worldview-anchor-pools (111f3f95),
    m10-frame-tail-batching (00efd705), m10-device-tier-schedule (dceee3f6) —
    Engine-/Warmup-/Qualitäts-Pfade, die Markenfolge beeinflussen können
  - übrige 65 Merges: optisch/UI/Audio/Perf/Doku — vollständige Liste im Commit.
- K4 (echter visueller Regress) **nicht** aktiviert: Divergenzfelder sind
  Spawn-/Pool-Marker, final+lastMark bitgleich, Determinismus intakt.

## K3 (#12855): Guard grün + Baseline-Stand

- `npx vitest run tests/golden-frame.test.ts` → 4/4 PASS (Ergebnis im Commit).
- Baseline-Stand dokumentiert:
  - Skript-Kopf (`scripts/m10-golden-frame.mjs`): Rebaseline-Commit `761f274a`,
    Code-Stand des Capture `213b8494`; künftige Rebaselines tragen via
    `--baseline-at=<Merge-SHA>` den Stand in die Baseline-JSON ein.
  - `shots/m10-golden-frame-baseline.json`: Feld `baselineAt`.
- Lane-Abschluss: siehe unten (`.lane-done`).
