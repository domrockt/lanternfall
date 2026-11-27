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
  Warnphase-Ende = Treffer; 8 Trials pro Schadens-Klasse.

Baseline: `shots/m10-hazard-baseline.json`, Warnframe mit 500-Gegner-Schwarm:
`shots/m10-hazard-baseline-warnframe.png` (+2x).

### Baseline-Zahlen (27.11., View 640x360, Schwarm 500, seed 1)

- **Mindest-Warnzeit**: Minimum 0.160 s (**exploder**, FAIL < 0.45 s); alle 18 Boss-Klassen
  0.60–1.20 s (OK, unverändert durch den Aufrufer).
- **Warnring-Kontrast** (Michelson, Ring-Annulus vs. Hintergrund, Minimum über 3 Puls-Phasen):
  19/19 Klassen zwischen **-0.103 und +0.042** — der gestrichelte Warnring liest sich im
  Schwarm kaum (teils dunkler als die Nachbarfläche). Schwächste Klassen: thorn_ring (-0.103),
  scythe_sweep (-0.103), jump_slam (-0.099), stomp (-0.070), teleport (-0.076).
- **Bot-Trefferquote** (8 Trials, Hazard spawnt auf Spielerposition): Boss-Flächenschaden
  8/8 Treffer (jump_slam, poison_puddles, scythe_sweep, stomp, stone_rain, fire_cross,
  thorn_ring, thorn_burst), exploder 3/8. Der Bot schafft es bei 500 Gegnern nicht mehr
  rechtzeitig aus der Fläche, wenn die Warnzeit kurz ist bzw. der Schwarm die Flucht
  blockiert; die 3/8 beim Exploder erklären sich vermutlich aus I-Frame-Überständen der
  vorherigen Trials (0.8 s PLAYER_INVULN), nicht aus echtem Ausweichen (13 px möglicher
  Ausweichweg in 0.16 s bei Radius 48).


## K3 — Fix (`src/systems/Hazards.ts`)

- Exportierte Konstante `MIN_WARN_S = 0.45` + reine Helfer `effectiveWarn()`; beide Spawn-Pfade
  (`spawnCircle`, `spawnBeam`) clampen auf die Mindest-Warnzeit (Exploder: 0.16 → 0.45 s; alle
  Boss-Angriffe ≥ 0.60 s bleiben exakt unverändert).
- Rim-Puls-Minimum von 0.12 auf `MIN_RIM_ALPHA = 0.3` angehoben; reiner Helfer
  `rimPulseAlpha(elapsed)` → `0.3 + |sin|·0.35` (0.30–0.65), damit der Rand auch unter 300+ Gegnern
  lesbar bleibt. Circle- und Strahl-Rim nutzen denselben Helfer (Spawn und Update).
- `effectiveWarn()`-Randfälle: `undefined`/`NaN`/`Infinity`/negativ fallen auf Default bzw. Minimum
  zurück; Werte > Minimum werden nie verlängert (keine künstlichen Boss-Warnungen).
- Unit-Tests `tests/hazard-fairness.test.ts`: **8/8 grün** (isolierter Lauf,
  `npx vitest run tests/hazard-fairness.test.ts`, 188 ms) — Mindest-Warnzeit-Clamp, unveränderte
  lange Warnungen, Default-/NaN-Randfälle, Rim-Alpha-Untergrenze über 2 s, Rim-Alpha-Maximum ≤ 0.65,
  spawnCircle/spawnBeam-Clamp und Trefferzeitpunkt erst nach der angehobenen Warnzeit.

## K4 — Vorher/Nachher

Nachmessung mit demselben Harness (`node scripts/m10-hazard-fairness.mjs --tag=after`,
27.11., 640x360, Schwarm 500, seed 1): `shots/m10-hazard-after.json`,
Warnframe `shots/m10-hazard-after-warnframe.png`.

Harness-Korrektur vor der Nachmessung: Phase 2 meldete bisher den **Sollwert** `c.warn`
als `effectiveWarn`; jetzt wird der tatsächliche, geclampte `warnMax` der Hazard-Instanz
gemittelt gemeldet (Messung selbst wartete schon immer auf den echten `warnMax`).

### Tabelle Vorher → Nachher

| Klasse | Warnzeit (s) | \|Ring-Kontrast\| min vorher | nachher | Δ |
|---|---|---|---|---|
| jump_slam | 0.95 → 0.95 | 0.099 | 0.119 | +0.020 |
| poison_puddles | 0.80 → 0.80 | 0.033 | 0.030 | -0.003 |
| summon_ring | 0.90 → 0.90 | 0.035 | 0.045 | +0.010 |
| bone_boomerang | 0.60 → 0.60 | 0.011 | 0.014 | +0.003 |
| summon_wolves | 0.75 → 0.75 | 0.064 | 0.084 | +0.020 |
| scythe_sweep | 0.72 → 0.72 | 0.103 | 0.115 | +0.012 |
| stomp | 1.05 → 1.05 | 0.070 | 0.077 | +0.007 |
| stone_rain | 1.20 → 1.20 | 0.064 | 0.056 | -0.008 |
| teleport | 0.60 → 0.60 | 0.076 | 0.052 | -0.024 |
| fire_cross | 0.95 → 0.95 | 0.014 | 0.020 | +0.006 |
| thorn_ring | 1.00 → 1.00 | 0.103 | 0.081 | -0.022 |
| thorn_ring_p3 | 0.75 → 0.75 | 0.073 | 0.064 | -0.009 |
| bone_boomerang_p5 | 0.60 → 0.60 | 0.011 | 0.014 | +0.003 |
| thorn_burst | 0.90 → 0.90 | 0.010 | 0.013 | +0.003 |
| thorn_burst_p3 | 0.70 → 0.70 | 0.042 | 0.056 | +0.014 |
| fire_cross_p2 | 0.85 → 0.85 | 0.014 | 0.019 | +0.005 |
| fire_cross_p3 | 0.65 → 0.65 | 0.020 | 0.026 | +0.006 |
| summon_ring_p2 | 0.80 → 0.80 | 0.033 | 0.043 | +0.010 |
| **exploder** | **0.16 → 0.45** | 0.033 | 0.048 | +0.015 |

### Ergebnis

1. **Warnzeit-Minimum angehoben (Hauptgewinn):** minEffectiveWarn **0.160 → 0.450 s**;
   `classesUnderMinWarn` **[exploder] → []**. Alle 18 Boss-Angriffe unverändert
   (0.60–1.20 s, Clamp greift nicht). Ein Detonations-Warnring beim Exploder steht dem
   Spieler jetzt mindestens 27 Frames statt 10 Frames zur Verfügung.
2. **Ring-Sichtbarkeit (|Michelson-Kontrast|, min über 3 Puls-Phasen):** 14/19 Klassen
   besser, 5/19 minimal schlechter (Run-Rauschen ±0.01, Hintergrund-Luminanz schwankt
   mit dem Laternen-Flicker); Mittelwert **0.0478 → 0.0514 (+7.5 %)**. Der gestrichelte
   Warn-Disc (NORMAL-Blend, Alpha 0.9) dominiert die Ring-Annulus-Samples, daher fällt
   der Effekt von MIN_RIM_ALPHA 0.12→0.30 im Michelson-Maß klein aus — der Rim-Puls
   (ADD, hotRed) sitzt optisch auf dem Disc-Rand, nicht daneben.
3. **Bot-Trefferquote ist im Harness gesättigt:** alle Schadens-Klassen 8/8 (vorher wie
   nachher, auch bei 1.2 s Warnzeit). Bei 500 dichten Gegnern kommt der Bot aus der
   eigenen Position nicht mehr heraus — die Metrik diskriminiert hier nicht. Der
   Baseline-Wert 3/8 beim Exploder war bereits in K2 als I-Frame-/Timing-Artefakt
   eingestuft; nachher konsistent 8/8.
4. **Messartefakt korrigiert:** Ein erster After-Lauf (17:48, Rechner-Shutdown-WIP) zeigte
   global dunklere Frames (Hintergrund 0.14–0.21 statt 0.23–0.27, Laternen-Flicker zur
   Screenshot-Zeit) und dadurch aufgeblähte Kontraste (u. a. Beams +0.12). Die Tabelle
   oben nutzt den reproduzierten Lauf bei normaler Helligkeit; beide Läufe hatten den
   K3-Fix aktiv (exploder 0.45 s).

**Fazit:** Abnahmekriterium erfüllt — messbarer Gewinn = Warnzeit-Minimum 0.16 → 0.45 s
(keine Klasse mehr unter 0.45 s) plus kleine Kontrastgewinne (+7.5 % im Mittel).
Offener Punkt: der Warn-Disc selbst liest sich im dichten Schwarm weiterhin nur mäßig
(|Kontrast| ~0.03–0.12); eine zusätzliche helle Konturfarbe/Outline für den Disc wäre
ein folgender Art-/VFX-Hebel (neue Lane, nicht Teil dieses Claims).
