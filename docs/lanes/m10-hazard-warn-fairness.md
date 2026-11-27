# Lane m10-hazard-warn-fairness — Warnphasen im Schwarm messbar fair machen

Basis: Worktree `lf-lanes/m10-hazard-warn-fairness` (Branch `m10-hazard-warn-fairness`).
Ziel laut Briefing: messen, ob Warnring/Rim-Puls bei 300+ Gegnern und 640x360 lesbar bleibt und
ob die Warnzeit reicht; dann Fix für Unter-Warnzeit-Fälle (warn < 0.45 s / Rim-Alpha zu niedrig).

Claim-Dateien: `src/systems/Hazards.ts`, `tests/hazard-fairness.test.ts`,
`scripts/m10-hazard-fairness.mjs`, `shots/m10-hazard-*`, diese Doku.

## K1 — Bestandsaufnahme: alle HazardSystem-Aufrufer

Quellen: `src/systems/BossSystem.ts` (`launch()`, 18 Angriffe aus `src/logic/bosses.ts`),
`src/scenes/Run.ts` (`explode`-Aktion), Defaults in `src/systems/Hazards.ts`.

Optik pro Hazard (`Hazards.ts`):
- Warnfläche: `telegraph_disc` (gestrichelter Ring + 22-%-Füllung), Alpha pulsiert
  `0.55 ± 0.35` (0.20–0.90), Tiefe `DEPTH.hazard`.
- Rim-Puls: `ring_burst`, Blend ADD, Tint `hotRed`, Scale `max(0.2, radius/30)`;
  Alpha pulsiert `0.12 + |sin| * 0.35` → **Minimum 0.12** (Strahl-Rim beim Spawn 0.18).
- Strahl: `telegraph_beam`, Rim-Scale `1.25 × len/16`, gleiches Puls-Minimum 0.12.
- Treffer fällt ausschließlich am **Ende** der Warnphase (`warn -= dt; if (warn > 0) continue;`).

### Tabelle: Boss-Angriffe (BossSystem, warn = telegraph aus bosses.ts)

| Boss | Phase | Angriff | Form | warn (s) | Radius (px) | Rim-Optik |
|---|---|---|---|---|---|---|
| 0 Moorkönigin | 1 | jump_slam | Kreis | 0.95 | 74 | disc + rim hotRed |
| 0 Moorkönigin | 1 | poison_puddles | Kreis ×3 | 0.80 | 26 | disc + rim + puddle |
| 1 Knochenfürst | 1 | summon_ring | Kreis | 0.90 | 96 | disc + rim |
| 1 Knochenfürst | 1 | bone_boomerang | Strahl | 0.60 | 16 | beam + rim |
| 2 Fahler Hirte | 1 | summon_wolves | Kreis | 0.75 | 70 | disc + rim |
| 2 Fahler Hirte | 1 | scythe_sweep | Kreis | 0.72 | 82 | disc + rim hotRed |
| 3 Glockenturm-Golem | 1 | stomp | Kreis | 1.05 | 92 | disc + rim hotRed |
| 3 Glockenturm-Golem | 1 | stone_rain | Kreis ×5 | 1.20 | 24 | disc + rim hotRed |
| 4 Hexenzirkel | 1 | teleport | Kreis | 0.60 | 22 | disc + rim |
| 4 Hexenzirkel | 1 | fire_cross | Strahl ×2 | 0.95 | 18 | beam + rim (Farbe 26) |
| 5 Hohler König | 1 | thorn_ring | Kreis ×8 | 1.00 | 22 | disc + rim hotRed |
| 5 Hohler König | 1 | bone_boomerang | Strahl | 0.60 | 16 | beam + rim |
| 5 Hohler König | 2 | thorn_burst | Strahl ×7 | 0.90 | 16 | beam + rim hotRed |
| 5 Hohler König | 2 | fire_cross | Strahl ×2 | 0.85 | 18 | beam + rim (26) |
| 5 Hohler König | 2 | summon_ring | Kreis | 0.80 | 96 | disc + rim |
| 5 Hohler König | 3 | thorn_ring | Kreis ×8 | 0.75 | 24 | disc + rim hotRed |
| 5 Hohler König | 3 | thorn_burst | Strahl ×7 | 0.70 | 30 | beam + rim hotRed |
| 5 Hohler König | 3 | fire_cross | Strahl ×2 | 0.65 | 18 | beam + rim (26) |

Alle 18 Boss-Angriffe ≥ 0.60 s (Ergebnis der Lane m10-hazard-telegraph) → **kein** Boss-Angriff
unter der anvisierten Mindest-Warnzeit von 0.45 s.

### Nicht-Boss-Aufrufer

| Aufrufer | Form | warn (s) | Radius (px) | Rim-Optik | Bewertung |
|---|---|---|---|---|---|
| `Run.ts` exploder `explode` (bomber/imp, Tier 2/3) | Kreis | **0.16** | 36 + 6×Tier (48/54) | disc + rim, min-Alpha 0.12 | **FAIL: Warnzeit 0.16 s < 0.45 s** — Rim-Puls braucht bis zu ~0.3 s bis zum Alpha-Maximum, die Warnphase ist vorher vorbei |
| `spawnCircle`-Default | Kreis | 0.70 | — | wie oben | OK |
| `spawnBeam`-Default | Strahl | 0.90 | — | wie oben | OK |

### Befund K1

1. Einziger Unter-Warnzeit-Fall: **Exploder (0.16 s)**. Bei 500-Gegner-Schwarm steht der
   detonierende Gegner oft unter anderen Sprites; 0.16 s ≈ 10 Frames reichen weder zum
   Reagieren (Bewegungstempo ~50–80 px/s → max ~13 px Ausweichweg bei Radius ≥ 48 px)
   noch für einen vollständigen Rim-Puls.
2. Rim-Alpha-Minimum 0.12 (ADD-Blend) ist im dichten Schwarm kontrastarm — Messung in K2.

## K2 — Mess-Harness (Baseline)

`scripts/m10-hazard-fairness.mjs` (ohne flock: keine FPS-Messung, feste Substeps):
500 Schadens-0-Gegner als Schwarm um den Spieler, View 640x360 (Canvas-Renderer für
Pixel-Sampling). Pro Hazard-Klasse wird der echte `spawnCircle`/`spawnBeam`-Aufruf mit den
Werten aus K1 in der Szene ausgeführt und gemessen:

- **effektive Warnzeit** aus der Runtime (`warnMax` der Hazard-Instanz),
- **Warnring-Kontrast** gegen Hintergrund (Pixel-Sampling: Ring-Annulus vs. Nachbarfläche,
  Michelson-Kontrast der Luminanz), gesampelt an 3 Puls-Phasen,
- **Bot-Trefferquote**: AutoPlay-Bot, Hazard spawnt auf Spielerposition, HP-Delta bis
  Warnphase-Ende = Treffer; 10 Trials pro Hazard-Klasse.

Baseline: `shots/m10-hazard-baseline.json` (siehe Abschnitt K4 für Vorher/Nachher).

## K3 — Fix (`src/systems/Hazards.ts`)

- Exportierte Konstante `MIN_WARN_S = 0.45` + reine Helfer `effectiveWarn()`; beide Spawn-Pfade
  clamps auf die Mindest-Warnzeit (Exploder: 0.16 → 0.45 s; Boss-Angriffe unverändert).
- Rim-Puls-Minimum von 0.12 auf `MIN_RIM_ALPHA = 0.3` angehoben (`0.3 + |sin|·0.35` → 0.30–0.65),
  damit der Rand auch unter 300+ Gegnern lesbar bleibt; Strahl-Rim gleiches Minimum.
- Unit-Tests: `tests/hazard-fairness.test.ts` (≥ 4 Tests, siehe K4-Zahlen).

## K4 — Vorher/Nachher

siehe unten (wird nach der Nachmessung ergänzt).
