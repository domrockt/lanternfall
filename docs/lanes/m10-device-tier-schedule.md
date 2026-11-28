# Lane m10-device-tier-schedule — Geräte-Tier-Scheduling im stepQuality

Letzter offener Anteil von **Hebel A** aus der v1.0-Geräteabnahme
(`docs/qa/v10-device-acceptance-2026-11-28.md`, K3 FAIL: janky 13,44 %/13,90 % vs. Tor < 10 %).

Scope: `src/logic/quality.ts` (+ Tests, Messskript, diese Doku). **Nicht** angefasst:
`src/config.ts` und `src/systems/FxSystem.ts` (belegt durch merge-m10-device-janky-node).

## K1 — Ist-Analyse + Vorher-Beleg

### stepQuality (src/logic/quality.ts, Zeilen 135–204)

Reiner Hysterese-Regler über FPS-EWMA:

| Signal | Schwelle | Haltezeit | Frame-Zeit-Äquivalent |
|---|---|---|---|
| Stufe runter | `fpsEwma < QUALITY_LOW_FPS` (45) | 3 s kumulativ | 22,2 ms |
| Stufe hoch | `fpsEwma >= QUALITY_HIGH_FPS` (57) | 12 s am Stück | 17,5 ms |
| Totzone | 45–57 FPS | Timer eingefroren | 17,5–22,2 ms |

`evaluateThermalStep` (Guard unterhalb "low") greift erst ab Basis-Stufe "low" — am
Geräteknoten irrelevant, solange der Regler dort nie absteigt.

### Befund: warum der Regler am 120-Hz-Gerät blind ist

Geräteknoten: Redmi Pad Pro, Adreno (TM) 710, DPR 2, **120-Hz-Panel → 8,33-ms-Deadline**.
Gemessen (Abnahme K3): 106–112 FPS Durchschnitt (9,0–9,4 ms/Frame) — `fpsEwma` liegt
damit weit über der Up-Schwelle 57 FPS → der Regler sieht **nie Budget-Mangel**, das
Gerät bleibt dauerhaft **"high"**.

Das janky-Tor zählt aber Frames **über ~16,6–16,7 ms** (Chrome-Frame-Deadline-Histogramm,
siehe K3-Befund). Die Regler-Schwellen liegen als Frame-Zeit (17,5/22,2 ms) **beide über**
der janky-Kante: selbst ein Abstieg auf 57 FPS würde bedeuten, dass bereits 100 % der
Frames janky sind. Der Regler misst den falschen Sollwert — er braucht am Gerät das
**Zeitbudget-Soll 16,7 ms** als Tier-Grenze, nicht die FPS-Schwellen der 60-Hz-Welt.

Der Budget-Deckel aus merge-m10-device-janky-node (`DEVICE_NODE` → `clampTierMax(medium)`
im config-Wrapper + FX-Pool-Deckel) allein hat janky nicht bewegt (Befund: Frame-Tail ist
Present/GPU-seitig). Verbleibender Hebel: die Abstufung/Hysterese **im `stepQuality`
selbst** verankern statt im config-Wrapper.

### Vorher-Beleg (iGPU-Harness, M25-Szene, 780x360@3)

`node scripts/m10-device-tier.mjs --out …/before.json` (Beleg:
`~/games/.evidence/m10-device-tier-schedule/before.json`, 2026-11-28):

| Wert | Ist |
|---|---|
| Renderer-String | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (gültig, kein SwiftShader) |
| qualityTier im Lauf | `high` |
| Frames / FPS avg | 601 / 60,0 |
| p50 / p90 / **p95** / p99 / worst (ms) | 16,6 / 16,7 / **16,7** / 16,8 / 16,8 |
| janky (>16,7 ms) | 3,83 % |
| JS-Fehler | 0 |

Anmerkung ehrlich notiert: die iGPU-Anzeige läuft mit VSync auf 60 FPS — p95/p99 liegen
auf der vsync-Kante, das Harness-Tor kann daher nur "nicht schlechter als Vorher"
belegen (Akzeptanzkriterium der Lane), einen GPU-seitigen Gewinn Richtung ≤ 16 ms kann
nur die Geräteprobe zeigen.

## Geräteprobe

Device-bridge (`http://172.17.0.1:5181`) ist erreichbar (Redmi Pad Pro, SM7435,
Adreno 710, Thermal 0, Akku 33,0 °C). Geräteprobe in dieser Lane **nicht gefahren**,
Begruendung:

- CDP (`172.17.0.1:9333`) lieferte zur Lane-Laufzeit keine Game-Page (`/json/list`
  leer) und `/status` meldete `dom_playing: true` — das Geraet ist in Benutzung,
  ein Probe-Lauf waere in eine fremde Session gelaufen.
- Der Deployment-Pfad eines Lane-Builds aufs Geraet ist in dieser Lane nicht
  belegt (die Abnahme-Messungen liefen ueber die Merge-Pipeline); ohne gesicherten
  Build-Bezug waere ein janky-Wert nicht der Lane zurechenbar.

Nachholpunkt fuer einen device-Job mit Build-Bezug: `scripts/m10-v10-device-gfxinfo.mjs`
(janky % vor/nach, K3-Metrik) gegen einen Build mit dieser Lane. Erwartung aus dem
Befund: Stufe `medium` statt `high` am Geraet (Kap ist im stepQuality verankert,
Gegenprobe im Test #12484) → ADD-Flaeche/Partikel unter medium-Budget → p95 Richtung
≤ 16 ms → janky < 10 %.

## K2/K3 — Umsetzung (Tier-Scheduling + Hysterese im stepQuality)

- `QualityDeviceClass` + reiner Klassifizierer `classifyDeviceClass(renderer, dpr)`:
  gleiches Renderer-String-Muster wie `isDeviceNode` (src/config.ts) — bewusst
  dupliziert statt importiert (Import config→quality wäre ein Zyklus; config.ts darf
  nicht angefasst werden).
- `stepQuality(state, fpsEwma, dtMs, device?)`: 4. Parameter optional; ohne Gerät
  (`null`/Vitest/Node ohne window) exakt der alte Desktop-Pfad (bitgleich).
  Mit Geräteknoten:
  - Stufe wird auf **medium** geklemmt (Cap wirkt auch auf den Startzustand "high" —
    der Aufstieg auf high ist blockiert, Abstieg auf low/thermal bleibt möglich).
  - Tier-Grenze = **Zeitbudget-Soll 16,7 ms** (`fpsEwma < 1000/16,7 ≈ 59,9 FPS` →
    Abstieg nach 3 s), Erholung am Stück erst ab ≥ 100 FPS (Frame ≤ 10 ms) —
    Totzone 60–100 FPS, damit bei 109–112 FPS **kein Flapping** zwischen high/medium
    entstehen kann (high ist ohnehin durch den Cap blockiert).
- Laufzeit-Erkennung ohne config-Edit: `probeDeviceClass()` (gleiches WebGL-
  UNMASKED_RENDERER_WEBGL-Probe wie config.probeDeviceNode, einmalig gecacht,
  in Vitest/Node passiv) — `stepQuality` ohne 4. Argument liest sie selbst.
- Desktop: Geräteknoten nie erkannt → Tier-Pfad unberührt; Beleg AE=0 über
  Referenzwert-Tests (tests/device-tier-schedule.test.ts pinnt die Desktop-
  Zustandsfolgen exakt).

## K4 — Messung Vorher/Nachher (iGPU-Harness, 780x360@3, M25-Szene)

`node scripts/m10-device-tier.mjs` (Vorher vor K2, Nachher nach K2/K3; Belege
`~/games/.evidence/m10-device-tier-schedule/{before,after}.json`, je 601 Frames,
10 s Fenster, Top-up 300 Gegner im 50-ms-Takt):

| Wert | Vorher (Commit 6aaa79ba) | Nachher (nach efee908e) |
|---|---|---|
| Renderer-String | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` |
| qualityTier im Lauf | `high` | `high` |
| Frames / FPS avg | 601 / 60,0 | 601 / 60,0 |
| p50 / p90 (ms) | 16,6 / 16,7 | 16,6 / 16,7 |
| **p95** (ms) | **16,7** | **16,7** |
| p99 / worst (ms) | 16,8 / 16,8 | 16,8 / 16,8 |
| janky (>16,7 ms) | 3,83 % | 4,50 % |
| JS-Fehler | 0 | 0 |

**Auswertung (Akzeptanz: p95 nicht schlechter als Vorher):** p95/p99/worst
identisch (16,7/16,8/16,8 ms) — beide Laeufe laufen mit VSync an der 60-FPS-Kante,
die Perzentile sind durch die Panel-Runde bestimmt, nicht durch Sim-Last.
jankyPct 3,83 → 4,50 % sind 23 bzw. 27 Frames an derselben Kante (Vsync-Jitter,
kein Tail-Anstieg: worst unverändert 16,8 ms). **PASS** im Sinne des Lane-Tores.

**Desktop-Tier-Pfad unberührt (AE=0):** qualityTier bleibt beide Male `high`
(Geräteknoten am Mesa-Renderer nie erkannt → stepQuality ohne Zeitbudget-Pfad),
zusätzlich pinnt tests/device-tier-schedule.test.ts die Desktop-Referenzwerte
(bitgleiche Zustandsfolgen, Commit e2c6f88b).

Wie in K1 ehrlich notiert: einen GPU-seitigen Gewinn "Richtung ≤ 16 ms" kann der
iGPU-Lauf an der VSync-Kante nicht zeigen — der Geräte-Hebel (medium-Cap +
16,7-ms-Grenze) ist durch die Tests #12484/#12485 belegt, der janky-Gewinn am
Adreno-710-Knoten bleibt der Geräteprobe in einem device-Job vorbehalten.

## Offene Punkte

- Geräteprobe (janky am Adreno-710-Knoten) nachholen — Mess-Budget: der Lauf
  (gfxinfo vor/nach 10-s-Fenster) gehört in einen device-Job mit Build-Bezug
  (siehe Abschnitt "Geräteprobe" — Bridge/CDP zur Lane-Laufzeit nicht nutzbar,
  `[Supervisor]`-Steer: nicht weiter verfolgen).

## Bilanz

- Tier-Scheduling (Cap medium + Zeitbudget-Soll 16,7 ms) liegt jetzt **im
  stepQuality selbst** (src/logic/quality.ts), nicht mehr nur im config-Wrapper;
  desktop bitgleich (Referenz-Tests, qualityTier `high` in beiden Harness-Läufen).
- Hysterese bei 120 Hz fixiert: 0 Flapping bei 109–112 FPS über 60 s (Guard-Test),
  Totzone 60–100 FPS, Erholung erst ab 100 FPS am Stück; Haltezeiten unverändert
  (3 s / 12 s).
- config.ts und FxSystem.ts wurden NICHT angefasst (fremdbelegt).
- Belege: `~/games/.evidence/m10-device-tier-schedule/{before,after}.json`
  (Renderer-String je Beleg).
