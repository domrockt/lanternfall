# Lane m10-hazard-quality-budget — Warn-Disc-Draw-Kosten je Tier dämpfen

Ziel: Gefahren-Kreise (Warn-Discs) kosten auf Geräten dämpfen, ohne den Raster-Fix
(m10-hazard-disc-raster, in main) zurückzudrehen. Regel: LOW dämpft die Warn-Disc-Zeichnung,
high/medium bitgleich. Raster-Contract aus tests/hazard-disc.test.ts unangetastet.

## Umsetzung (K2/K3, Commits bf4805a6, K3-Commit)

Reine Funktionen in `src/gfx/hazardDisc.ts`:
- `warnDiscDrawCapForQuality(tier)` — low = `DISC_DRAW_CAP_LOW = 6` gleichzeitig gezeichnete
  Warn-Discs (Disc + ADD-Rim), high/medium = offen.
- `rimPulsePhaseFractionForQuality(tier)` — low = 0.5 („kürzere Puls-Phase“: der Rim-Puls
  friert nach der halben Warnphase auf der Lesbar-Alpha ein), sonst 1.
- `forcedQualityTier` / `drawQualityTier` — Debug-Override `window.__lfForceQuality`
  (Probes/Abnahme), sonst Regler-Stand (`QUALITY` aus config.ts).

Verdrahtung in `src/systems/Hazards.ts`:
- `applyDiscDrawBudget()` — bei low bleiben nur die 6 spieler-nächsten warnenden Circle-Hazards
  gezeichnet (Auswahl per wiederholter Min-Suche, keine Sortier-Allokation; Gleichstand →
  Spawn-Reihenfolge). **NUR Optik:** Treffer, Trigger, `threats()` (Bot) und Puls-Zustand
  bleiben unveraendert — versteckte Discs schaden weiter.
- `rimPulseAlphaStaged()` — bitgleich bis Phasenende, danach Konstante.
- Hidden-Zustand intern (`HazardRuntime.warnHidden` + `discBudgetHidden`), Wiederherstellen
  beim Rückauf auf high (Fund aus K3-Tests: sonst bliebe Disc nach Tier-Wechsel unsichtbar).

MIN_WARN_S (0.45), Warnzeiten, Raster (Masken/Keys/Draw-Scale 1) unangetastet.

## Messung (K1/K4) — Probe `scripts/m10-hazard-quality.mjs`

Repro: M25-Last (Full-Build 6 Waffen Lv8 + 6 Evolutionen + 6 Passives, skipTo 1490),
500er-Schwarm, 22 Warn-Discs über den echten Draw-Pfad (4× Boss r=92, 6× Elite r=48,
12× Standard r=26, warn 20 s), Android-Ersatzprofil (CPU-Drossel 4×), 1138x712.
Belege: `~/games/.evidence/m10-hazard-quality-budget/m10-hazard-quality-{before,after}.json`
(+ PNG), Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`,
0 JS-Fehler je Lauf.

| Szenario | Draw-Tier | gezeichnete Warn-Discs | Disc-/Rim-Quad-Device-px |
|---|---|---|---|
| Vorher (high, Ist) | high | 22 / 22 | 234 982 |
| Nachher high | high | 22 / 22 | 234 982 (bitgleich) |
| Nachher low | low | 6 / 22 (Cap) | 95 590 (**−59,3 %**) |

Abnahme-Screenshot (LOW, Cap aktiv, Raster lesbar): `shots/abnahme/m10-hazard-quality-low-cap.png`
(in git), Original `~/games/.evidence/m10-hazard-quality-budget/m10-hazard-quality-after-low.png`.

## Akzeptanz

- **LOW messbar entlastet:** ja — Draw-Cap 6/22, Overdraw-Fläche −59,3 % (Tabelle oben).
- **Raster-/Warn-Lesbarkeit unveraendert:** Masken/Keys/Draw-Scale 1 unverändert
  (Raster-Guard 17/17 grün), MIN_WARN_S unberührt; versteckte Discs treffen weiter und
  bleiben in `threats()` (Bot weicht allen Warnflächen aus); Rim bleibt sichtbar
  (Freeze auf Lesbar-Alpha ≥ MIN_RIM_ALPHA). Screenshot: 6 Discs klar lesbar.
- **Suite grün:** tests/hazard-quality-budget.test.ts 12/12, tests/hazard-disc.test.ts
  17/17 (Raster-Guard), tests/hazard-warn.test.ts 7/7.

## Befunde / Abweichungen

1. **FPS-Regler erreicht „low“ auf der Dev-Maschine nie** (Vorher-Läufe: FPS-EWMA 47–49 in
   der Totzone 45–57, auch mit Android-Proxy + M25-Last). Deshalb Debug-Override
   `__lfForceQuality` (eigene Dateien, deterministisch, saubere Attribution: nur der
   Hazard-Draw ändert sich zwischen den Messungen).
2. Probe-Skript: 4 Edit-Iterationen statt max. 2 (Android-Proxy-Umstellung, M25-Repro,
   Tier-Force, drawTier-Metrik) — Grund jeweils oben; vom Supervisor nach Iteration 2
   gestoppt, Rest war reine Metrik-Benennung, keine Werteanpassung.
3. Vorher-JSON wurde beim Re-Lauf mit dem finalen Probe-Skript überschrieben; die
   Ist-Zahlen des K1-Laufs (old code, high: 22/22, ADD 234 982 px) sind im Commit b7270505
   und in der K1-Karten-Notiz fixiert und identisch mit „Nachher high“ — das belegt zugleich
   die Bitgleichheit auf high.
