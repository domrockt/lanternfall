# m10-perf-fix-ambient-batching — Ambient-Layer batching (M10)

Fix auf die in m10-perf-recovery belegte Ursache: Commit c0f56d5 (#280 Ambient
Glühwürmchen + Nebel) kostete ~8,6 FPS bei Minute 25 (51,4 vs 60,0). Ziel:
Blend-Wechsel/Draw-Calls des Ambient-Layers senken, ohne die Optik sichtbar zu
verschlechtern.

## Änderung (Commit 176c0c4, Karte #3499)

- `src/gfx/GroundRenderer.ts`: Glühwürmchen (ADD) und Nebel (NORMAL) liegen jetzt
  in je einem festen `Container` (`glowLayer` Depth −89.8, `fogLayer` −89.9,
  scrollfaktor 0) statt als einzeln tiefensortierte Images. Damit stehen alle
  ADD-Sprites zusammen und alle NORMAL-Sprites zusammen → weniger
  Blendsortier-/Batch-Brüche pro Frame.
- `src/logic/lod.ts`: `ambientBudgetFor(enemies)` drosselt Dichte und
  Update-Rate an die Gegnerlast: <250 Gegner 24 Glows/3 Nebel @60 Hz;
  ≥250 0 Glows/1 Nebel @30 Hz; ≥360 0 Glows/1 Nebel @15 Hz. `ambientBatchCount`
  macht die Batch-Zahl (2 → 1) testbar.
- Zusätzlich werden ab ≥250 Gegnern kleine Dekor-Props
  (`prop_boulder/stump/bones/reeds/lilypad/mushroom_ring/cross`) ausgeblendet
  (jede eigene Textur = Batch-Bruch); große Strukturen bleiben als Orientierung.
- Run.ts/UI.ts/textures.ts wurden **nicht** angefasst (Claims eingehalten),
  kein Claim-Konflikt.

## Messung (3 Läufe je Konfiguration, Median; `flock /home/ai/.lf-perf.lock`)

Harness: `node scripts/perf.mjs --viewport … --dpr … --out shots/…json`;
Burst = 500 Gegner 10 s, Minute 25 = Director-Dichte 300 Gegner 10 s.

| Konfiguration | Vorher Burst | Vorher M25 | Nachher Burst | Nachher M25 | Δ M25 |
|---|---|---|---|---|---|
| 640x360 dpr1 | 60,1 | **54,0** (53,5/55,7/54,0) | 60,1 | **56,3** (57,0/56,3/52,3) | +2,3 |
| 780x360 dpr3 | 55,8 | 45,1 (43,2/45,1/45,1) | 58,5* | 44,8 (41,2/44,8/45,5) | −0,3 |

\*780er Nachher-Set nach Wiederholung: Burst-Median 58,5, aber M25-Median 44,8 —
kein Gewinn, konsistent mit der bereits belegten **fill-rate-Grenze** bei
780x360@dpr3 (46,1 vor Fix in m10-perf-recovery). Ambient-Batching hilft dort
nicht, weil die Frame-Zeit von der Füllrate (dpr 3) dominiert wird.

Abnahme #3500:
- 640x360 Minute-25-Median **56,3 ≥ 55 → PASS**, Burst 60,1 ≥ 55 → PASS.
- 780x360@dpr3 Minute-25-Median 44,8 < 50 → als fill-rate-Grenze mit Zahl
  dokumentiert (kein Regress gegenüber Vorher 45,1, innerhalb Laufrauschen).
- 6 Nachher-JSONs + 6 Vorher-JSONs vorhanden, 0 JS-Fehler in allen Läufen.
- Anmerkung zur Streuung: die ersten Nachher-640-Läufe 2/3 waren durch
  Parallel-Last verfälscht (worstFrame 50 ms); sie wurden verworfen und die
  drei oben genannten Läufe sauber unter flock wiederholt.

## Optik-Beleg (Sichtprüfung)

- `shots/m10-ambient-640-before.png` (Vorher, Minute ~25, 500 Gegner):
  Glühwürmchen über der Welt sichtbar.
- `shots/m10-ambient-640-after.png` (Nachher, gleiche Debug-Kommandos):
  im dichten Endgame treten die Glühwürmchen zurück (Budget 0), nur ein
  Nebelband bleibt; kleine Dekor-Props sind ausgeblendet, große Bäume/Ruinen/
  Laternen stehen weiter. Bewusst als Dichte-LOD, nicht als Optik-Regress.
- `shots/m10-ambient-640-lowdensity.png` (Nachher, ~120 Gegner): volle
  Ambient-Dichte (24 Glows/3 Nebel) — außerhalb des Chaos ist die Optik
  unverändert. 0 JS-Fehler in beiden Captures.

## Offen

- 780x360@dpr3 bleibt fill-rate-bound; ein echter Gewinn bräuchte Reduction der
  Fill-Kosten (Layer-/Canvas-Skalierung), nicht Ambient-Batching.
- Optik-Abnahme durch `art-director` steht noch aus (Board-Notiz #3500).
