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

## K2 (#12854): Rebaseline

siehe unten (wird beim Abarbeiten ergänzt).

## K3 (#12855): Guard grün + Baseline-Stand

siehe unten (wird beim Abarbeiten ergänzt).

## Gemergte Lanes seit ab50197b (Begruendungsteil K2)

siehe Commit #12854 — Liste aller 76 Merge-SHAs `ab50197b..HEAD` (ohne Kontroll-Screenshot-Commits),
verhaltensrelevant im engeren Sinne markiert.
