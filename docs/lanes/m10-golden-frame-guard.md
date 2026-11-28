# Lane m10-golden-frame-guard — Golden-Frame-Regressionsschutz

**Stand:** 2026-11-28 · Karten #10311–#10313 · Branch `m10-golden-frame-guard` · Nur neue Dateien (keine `src/**`-Änderung, damit der Job disjunkt zur laufenden Evo-FX-Merge-Welle startbar ist).

## Zweck

Gleicher Seed = bitgleiche Simulation ist seit m10-run-determinism / m10-pause-freeze /
m10-ai-stream-cadence-r2 ein haltbarer Vertrag. Diese Lane friert den simulierten
Spielstand nach 600 Sim-Ticks pro Seed als **Golden-Frame-Hash** ein, sodass jede
verhaltensändernde Merge-Welle beim ersten Guard-Lauf auffällt statt erst in der
nächsten Abnahme. Die laufende Evo-FX-Kette (gen-fx/textures/FxSystem/CombatSystem/
Run.ts) wartet darauf, dass m10-weapon-shot-readability endet — dieser Guard ist der
Regressionsschutz dafür.

## Methode

`scripts/m10-golden-frame.mjs` (Playwright + dist-Build, Muster `m10-run-determinism.mjs`,
**kein flock** — sim-exakte Marken sind lastunabhängig):

- 3 Seeds (**101, 202, 404**) × je **2 identische** autoPlay-Läufe über **600 Sim-Ticks**
  (1 Tick = `SIM_MAX_STEP` = 1/20 s ⇒ 30 Sim-Sekunden), Fast-Forward via `timeScale 30`,
  Start über das `?detstart=1`-Gate (Run startet pausiert; autoPlay/timeScale sind gesetzt,
  bevor Schritt 1 läuft).
- **Marken sim-exakt** im `simulate`-Hook (prototype-Patch, kein Polling), alle 60 Ticks:
  `elapsed`, `kills`, `level`, `xp`, `hp`, Gegnerzahl, Spielerposition (×1e4),
  **Gegner-Marker** (UID + auf 0,1 px gerundete logische Position, sortiert nach UID) und
  **Spawn-UIDs** (`nextUid`-Zähler). Dazu `events` (bossDefeated/chestOpen) und `final`.
- **Hash** = SHA-256 über `JSON.stringify({marks, events, final})` je Lauf.
- Abgleich: (a) 2 Läufe je Seed müssen **bitgleich** sein (0 Divergenz), (b) Hash muss zur
  committeten Baseline passen. Divergenz = FAIL (Exit 1).

## Messwerte (dieser Rechner, 2026-11-28)

- **3/3 Seeds bitgleich** über 2 Läufe (0 Divergenz) — Hashes je Seed:
  `101 = ee84b3afc40918c3…`, `202 = 5bd267501ce3054b…`, `404 = 2f338e1c299779e6…`
  (Hash-Stabilität über mehrere Skript-Aufrufe bestätigt, u. a. Seed 404 über 3 Läufe).
- Final je Seed (30,05 s Sim-Zeit): 101 → 14 Kills/Level 3 · 202 → 10/2 · 404 → 16/4.
- **Renderer:** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — iGPU,
  kein SwiftShader (iGPU-Pflicht erfüllt, String im Verdict-JSON).
- **0 JS-Fehler** in allen Läufen.
- Guard-Lauf: **~23 s** Skript-Laufzeit (6 Browser-Läufe); Suite-Guard-Test **195 ms**.
- `npx vitest run tests/golden-frame.test.ts` 4/4 grün; `npm test` **1850/1850** grün; `tsc` rc=0.

Belege: `shots/m10-golden-frame-baseline.json` + `shots/m10-golden-frame-verdict.json`
(committet, via `.gitignore`-Negation `!shots/m10-golden-frame-*.json` — gleiche
Test-Fixture-Methode wie `shots/m10-run-det-*.json`; Einzeiler im Commit ab50197b
begründet, Notiz in `~/.dispatch/requests.md`). Rohe Marken je Lauf:
`~/games/.evidence/m10-golden-frame-guard/` (nicht in git).

## Wie man den Guard laufen lässt

```bash
node scripts/m10-golden-frame.mjs                 # Guard gegen Baseline (Exit 0 = PASS)
node scripts/m10-golden-frame.mjs --write-baseline  # NEUE Baseline — nur bewusst, siehe unten
```

Der Suite-Test `tests/golden-frame.test.ts` pinnt die committeten Belege (Muster
`tests/run-determinism.test.ts`) und schlägt fehl, wenn Baseline und Verdict auseinander
laufen oder der letzte Guard-Lauf nicht PASS war.

## Grenze: Suite-Kontext ohne Sim-Ticks (dokumentiert)

Der Sim-Kern (`src/scenes/Run.ts`) importiert Phaser und instanziiert Textures/Tilemap/
Camera — ein Tick-Lauf im Suite-Kontext (Node, kein Browser) ist mit vertretbarem Aufwand
nicht möglich. Der Briefing-Fallback greift damit weiter unten als gedacht: **0 Ticks in
der Suite** (nicht einmal 60), der 600-Ticks-Guard läuft ausschließlich als **Skript-Gate**
(`node scripts/m10-golden-frame.mjs`, ~23 s, kein flock). Die Suite prüft die committeten
Belege und ist so die Schranke dagegen, dass ein FAIL-Lauf unkommentiert bleibt.

## Rebaseline-Anleitung (GEWOLLTE Verhaltensänderung)

Eine neue Baseline ist **nie stillschweigend** zu schreiben:

1. Guard läuft FAIL (z. B. nach einem Balance-/Verhaltens-Merge): erst den Befund klären —
   `firstDiff` im Skript-Output nennt Marke (Tick-Index) und Feld. Bei **ungewollter**
   Divergenz (Bug, Flakiness) NICHT rebaseln, sondern Bug fixen (eigene Lane).
2. Ist die Änderung **gewollt** (Balance-Tuning, Verhaltens-Fix, Spawn-Logik): in den
   Commit, der die Änderung trägt, gehört die Begruendung; danach **einen** Lauf
   `node scripts/m10-golden-frame.mjs --write-baseline` und **baseline + verdict im
   selben Commit** mitchen (`git add shots/m10-golden-frame-baseline.json
   shots/m10-golden-frame-verdict.json`).
3. Commit-Message-Muster: `<Lane>: #<karte> <was> — golden-frame Rebaseline (gewollt:
   <Begruendung>); alte Hashes <alt-16>, neue <neu-16>`.
4. Der Suite-Test (4/4) muss danach grün sein; `matchesBaseline:true` im neuen Verdict
   belegt, dass auch die zweiten Läufe bitgleich sind (Determinismus bleibt Teil des
   Vertrags — Rebaseline ändert nur den erwarteten Hash, nie die Bitgleichheitspflicht).

**Divergenz durch laufende Lane-Merges:** Baseline und Arbeitsstand können kurzfristig
auseinanderlaufen, während parallele Lanes gemergt werden. Befund in dieser Datei
dokumentieren (Seed, Tick, Feld), **nicht stillschweigend rebaseln**; der Merge-Job
entscheidet nach Lane-Abschluss über die neue Baseline.

## Abnahme (Karten)

| Karte | Inhalt | Beleg |
|---|---|---|
| #10311 | Probe-Skript + Baseline | Commit ab50197b; 3 Seeds × 2 Läufe bitgleich, 0 Divergenz; Renderer RPL-S iGPU; 0 JS-Fehler |
| #10312 | Suite-Guard-Test | Commit 908d87a1; 4/4 grün (195 ms), tsc rc=0, npm test 1850/1850 |
| #10313 | Lane-Doku + `.lane-done` | diese Datei + `.lane-done` |

## Bemerkungen

- `.gitignore`-Einzeiler (fremde Datei, minimal): `!shots/m10-golden-frame-*.json` —
  nötig, damit Baseline/Verdict als Test-Fixtures committbar sind; begründet im
  Commit ab50197b und in `~/.dispatch/requests.md`.
- Board-Hygiene: `board_move` von #10312 nach `review` wurde vom Plugin verweigert, weil
  zwei **fremde** uncommittete Änderungen im Worktree liegen (`shots/m10-passive-math-*.json`,
  Lane m10-passive-math) — nicht angefasst, wie schon bei #10246 dokumentiert.
- Offene Folge-Kosten: jeder verhaltensändernde Merge braucht einen bewussten Rebaseline-
  Schritt (siehe oben); das ist beabsichtigt und kostet ~25 s Skriptlaufzeit.
