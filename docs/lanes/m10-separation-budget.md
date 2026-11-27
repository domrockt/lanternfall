# Lane m10-separation-budget — Separations-/Kollisions-Budget (Minute-25-Chaos)

**Auftrag:** ACCEPTANCE-Blocker „fullrun-fpsMin 34,8–35,7 < 55" am Separations-Hot-Path
angreifen: ms/Frame für Separation + SpatialHash-Rebuild bei 500 gedrängten Gegnern
senken (−30 %) oder fullrun-fpsMin +5 FPS — ohne die Trennqualität zurückzubauen
(`tests/separation-crowd.test.ts` bleibt grün, Gegner dürfen nicht wieder verschmelzen).

**Claims (Disponent):** `src/logic/separation.ts`, `src/systems/SpatialHash.ts`,
`tests/separation-budget.test.ts`, `scripts/m10-separation-budget.mjs`,
`docs/lanes/m10-separation-budget.md`, `shots/m10-separation-budget-*`. **Keine** Änderung
an `src/scenes/Run.ts` oder Spawner/Waves.

## 1. Messmethode und ein wichtiger Mess-Befund

`scripts/m10-separation-budget.mjs` bencht den produktiven Run.ts-Pfad (clear+insert,
`queryCircle(radius+10)`, `separationPush`-Summe, Chase-Integration) und den
Budget-Resolver `resolveCrowdSeparation()` — 500 Gegner, Minute-25-Mischung, mulberry32,
deterministisch, ohne Browser (kein flock nötig).

**Befund (wichtig für ACCEPTANCE):** Die Karte-#4618-Baseline (1,88/1,72/1,67 ms Separation
pro Frame, `shots/m10-separation-budget-before.json`) ist ein **Harness-Artefakt**: dort
läuft der Hot-Loop auf ES-Module-Top-Level (ein einziger Aufruf → OSR-Pfad, kein
TurboFan-Optimieren wie im Spiel, wo `Run.update` 1800× gerufen wird). Derselbe alte Code,
gemessen mit der funktionbasierten Schleife der neuen Skriptversion, kostet nur
**0,33 ms/Frame** (Faktor ~5,5). Ausschlaggebend sind deshalb nur noch die fairen A/B-Zahlen
aus **einem** Prozess mit frame-verschränktem, reihenfolge-alternierendem Vergleich
(`--abSrc`, `shots/m10-separation-budget-fairab-1..3.json`).

## 2. Umgesetztes Budget (Karte #4619)

In `src/logic/separation.ts` + `src/systems/SpatialHash.ts` (Run.ts-Signaturen unverändert):

1. **Inline `massOf`/`separationWeight`** im Paar-Check (heißester Pfad, 15,8k Aufrufe/Frame);
   Semantik für finite Radien identisch (Grenzfälle im Test).
2. **Ring-Pool (16 Slots) für `separationPush`-Rückgaben**: statt ~1,8k Objekte/Frame
   (≈110k/s → Minor-GC-Spikes) allokationsfrei im Satten. Vertrag: Ergebnis nur unmittelbar
   verbrauchen (Run.ts und Resolver summieren sofort; dokumentiert).
3. **SpatialHash-Query-Fast-Path** (`queryCircle`/`queryNeighbors`): Query im flachen Grid
   ohne Bounds-/Overflow-Prüfung pro Zelle, indizierte Writes statt `out.push`.
4. **Nachbar-Deckel `maxNeighborsPerEnemy` (Default 32)** im Budget-Resolver — deterministisch,
   da Scratch-Reihenfolge deterministisch; + `neighborCapHit` im Result.

## 3. Vorher/Nachher (fair, gleicher Prozess, 1200 Frames, 3 Läufe)

| Metrik (Produktions-Pfad) | Vorher (alter Code) | Nachher | Delta |
|---|---|---|---|
| Separation ms/Frame mean | 0,3286 / 0,3437 / 0,3437 | 0,3286 / 0,3412 / 0,3436 | **≈ 0 %** |
| median | 0,3141 / 0,3245 / 0,3265 | 0,3141 / 0,3239 / 0,3268 | ≈ 0 % |
| max (GC-/Tail-Spitzen) | 0,91 / 0,86 / 0,76 | 0,74 / 0,79 / 0,83 | verrauscht |
| min-Paarabstand overall | 0,222 | 0,222 | **bitidentisch** |
| Paare/Frame | 15979,6 | 15979,6 | **bitidentisch** |

Die **Trajektorie ist bitidentisch** (gleiche min-Distanz-Serie, gleiche Paarzahl) — die
Optimierungen ändern nichts am Verhalten, `tests/separation-crowd.test.ts` bleibt grün
(67/67 inkl. neuem Test). Der Budget-Resolver (Strecke B) liegt bei ~1,1–1,2 ms/Frame; der
Nachbar-Deckel (32) greift dort **nicht** (nur ~15 Nachbarn/Gegner/Durchlauf im Kern),
Trennqualität 8,355 → 7,973 unverändert.

## 4. Ehrliches Urteil gegen die Abnahmekriterien

- **„ms/Frame Separation −30 %" — NICHT erreicht (fair ≈ 0 %).** Grund: der Pfad kostet real
  nur ~0,33 ms/Frame ≈ **2 % des 16,6-ms-Framebudgets**; die 1,88-ms-Baseline war ein
  Messartefakt. Selbst Wegstreichen des ganzen Pfads könnte bei fpsMin ~35 (+5 FPS ≈ −7 ms/Frame)
  nicht ausreichen.
- **„fullrun-fpsMin +5 FPS" — nicht über diese Lane plausibel.** Konsistent mit
  `m10-perf-rootcause` (Urteil: Render-/Fill-Kosten) liegt der Blocker außerhalb der
  Separations-Logik. Empfehlung: den ACCEPTANCE-Blocker neu attribuieren (Render-/Fill-Rate,
  Draw-Calls, nicht Separation).
- **Trennqualität: erfüllt** (bitidentische Trajektorie, Resolver-Deckel testgehärtet,
  kein Verschmelzen).
- **`npx tsc --noEmit` + Tests: grün** (67/67, u. a. neuer `tests/separation-budget.test.ts`:
  Deckel aktiv + Arbeit je Gegner begrenzt, Paar-Budget bricht, min-Paarabstand steigt
  dauerhaft, Determinismus, Pool-Vertrag, Fast-Path ≡ Brute-Force inkl. Overflow-Rand).

## 5. Belege

- `shots/m10-separation-budget-before.json` (+ `-before-r2/-r3`) — Artefakt-Baseline (Karte #4618)
- `shots/m10-separation-budget-fairab-1..3.json` — fairer A/B-Vergleich (Produktion, ein Prozess)
- `shots/m10-separation-budget-fair-ab-*.json`, `-fair-ab2-*.json` — verschränkte Läufe über Prozesse
- `shots/m10-separation-budget-probe2-*.json`, `-prof*.json`, `-after-*.json` — Suchläufe (WIP-Snapshot)
- `tests/separation-budget.test.ts` — Budget-/Qualitäts-/Äquivalenz-Tests

## 6. Offene Punkte

1. ACCEPTANCE-Zahl „Separation 1,88 ms/Frame" in ACCEPTANCE.md/GAME.md sollte auf den fairen
   Wert (~0,33 ms) korrigiert und der fpsMin-Blocker neu attribuiert werden (fremde Claims —
   hier nur Empfehlung).
2. Der Ring-Pool-Vertrag („nur unmittelbar verbrauchen") ist dokumentiert; falls künftig ein
   Aufrufer Push-Vektoren sammelt, muss der Pool größer oder opt-in werden.
3. Falls der Separations-Pfad im Browser (GC unter vollem Heap) doch spürbar ist, wäre der
   nächste Hebel der Nachbar-Deckel im produktiven Pfad — der braucht eine Änderung in
   `Run.ts` (fremder Claim) und wird hier bewusst nicht angetastet.
