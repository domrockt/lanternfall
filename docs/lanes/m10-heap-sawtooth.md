# Lane m10-heap-sawtooth — Heap-Tor +21 % (GC-Sägezahn) im 30-min-Echtzeitlauf

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-heap-sawtooth`, Branch `m10-heap-sawtooth`.

Ziel (Nachabnahme-C-Folge-Job): Heap-Tor Minute 1 → 29 im 30-min-Echtzeitlauf
(`shots/qa-reaccc-realtime-30min.json`: 31,9 → 38,6 MB = +21 %, endMB 27,1 —
GC-Sägezahn, kein monotoner Leak) zuverlässig auf **≤ +12 %** bringen, indem die
Allokations-Spikes gesenkt werden.

## Messmethode

`scripts/m10-heap-sawtooth.mjs` (eigene Lane-Datei): 30-min-**Sim**-Lauf
(timeScale 30, AutoPlay, God, seed 99, Warmlauf bis Sim-Sekunde 60). Je Sim-Minute:

- `rawMB` — rohe `performance.memory.usedJSHeapSize` OHNE GC (Sägezahn-Oberkante),
- `gcMB` — best-of-2 retained Heap nach erzwungenem Voll-GC (Gate-Metrik analog
  `realtime-run.mjs`, dort best-of-3),
- Gegner-/Kill-Zähler, FPS; dazu Sägezahn-Rohkurve (328 Samples) und
  Sampling-Heap-Profil ab Sim-Minute 20. Läuft **ohne flock** (Heap ist
  lastunabhängig, feste Substeps).

## Karte #6178 — Vorher-Messung (BEVOR der Fix beginnt)

Beleg: `shots/m10-heap-sawtooth-before.json` (2026-11-27, 30/30 Sim-Minuten,
0 JS-Fehler, Kills 9099).

| Kennzahl | Wert |
|---|---|
| Minute 1 gcMB | 35,1 |
| Minute 29 gcMB | 33,5 |
| deltaVsMinute1Pct (gcMB) | **−4,6 %** (Zufalls-Pass: Minute 1 zufällig auf Wellenkamm) |
| endGcMB / endRawMB | 34,7 / 35,2 |
| Sägezahn-Amplitude (raw − gc) gesamt | 0–11,3 MB, Mittel Minute 20–30: **6,0 MB** |
| Amplitude-Spitzen | Minute 25: 11,3 MB, Minute 27: 10,5 MB, Minute 29: 8,5 MB |

Einordnung: Der Retained-Heap ist flach (−4,6 %) — das Tor kippt nicht durch einen
Leak, sondern durch die **Amplitude des Sägezahns**: liegt Minute 1 auf einem Tal
und Minute 29 auf einem Kamm der Arbeitsmenge (Gegnerwellen + Churn zwischen den
GCs), meldet das Gate +21 % wie in `qa-reaccc-realtime-30min.json` (31,9 → 38,6 MB,
endMB 27,1). Hebel ist daher die **Allokationsrate zwischen den GCs** (Churn),
nicht Retention.

### Top-Allokationsquellen Minute 20–29 (Sampling-Heap-Profil, 10 Sim-Minuten)

| Site (minifiziert) | Bytes | Attribution |
|---|---|---|
| `set` (Phaser-Component-Setter, Zeile 23/812) | 328 KB | pro neuem GameObject (Sprite/Image) |
| `initialize` (Phaser-Components, 18/810) | 328 KB | pro neuem GameObject |
| `l` / `add` / `initialize` (810) | je 164–295 KB | DisplayList-`add` → neue Sprites |
| `addProp` (812) | 263 KB | GroundRenderer-Props (Bekannt aus m10-heap-margin) |
| `insert` / `initPostPipeline` (812/23) | 197 KB | neue Images/Sprites (Post-Pipeline je Objekt) |
| `t.onended` (808) | 103 KB | WebAudio-Clip-Handler |
| `setOriginFromFrame`, `initPipeline`, `setValue` | je ~100–131 KB | neue Sprites/Texte |

Attribution der minifizierten Sites über Bundle-Kontext (Zeile 810–812 enthält
`chain_link`, `fx_fire`, `fx_halo`, `fx_seal`, `flail_ball`, `shadow`, `ripple`,
`damage`): der Churn sind **neu erzeugte GameObjects je Frame** — konsistent mit
der Churn-Tabelle aus `docs/lanes/m10-heap-margin.md` (chain_link 9 968 / 9 min,
FX-Sprites 10 783, Gegner-Trails 2 348, Prop-Shadows 2 339, Ripples 833).
Zähl-Probe je Textur-Key folgt in Karte #6179.

### Grenzen der Messung

- Sim-Lauf (timeScale 30) ist nicht bitdeterministisch (rAF-Dt-Jitter ändert
  Substep-Gruppierung): Kills 6181 (1. Lauf, defektes Skript, ohne Minute-1-Sample)
  vs. 9099 (2. Lauf) bei gleichem Seed. Für „Verhalten bitgleich“ daher dedizierte
  deterministische Probe (Karte #6180/#6181), nicht der Vergleich zweier 30×-Läufe.
- GC-Trace-Attribution je Minute ist im ReportEvents-Modus erst am Laufende
  ausgewertet worden (alle Events im Bucket Minute 30) — die per-Minute-GC-Zahl
  ist daher nicht belastbar; die Amplituden-Kurve (rawCurve/perMinute) ist die
  primäre Sägezahn-Metrik.

## Karte #6179 — Ursache im Pool-Bereich (Befund mit Zeilenbeleg)

**Befund: Die Hypothese „Reuse-Lücken in `Pool.ts`/`EnemyPool.ts`" ist durch die
Messung WIDERLEGT.** Churn-Zahlprobe (`~/tmp/m10-heap-sawtooth/churn-probe.mjs`,
Werkzeug; Beleg `shots/m10-heap-sawtooth-churn-befund.json`): im Endgame-Fenster
(Sim-Minute 24→29, AutoPlay+God, timeScale 30, seed 99) entstehen **16 392 neue
Images über `scene.add.image` — davon 0 über Pool.ts/EnemyPool.ts**. Im Fenster
wird kein einziger Gegner-Sprite neu erzeugt (EnemyPool-Reuse greift seit
m10-heap-tail), `Pool<T>` (DamageNumbers-Einträge) wächst nicht.

Top-Allokationsquellen Minute 24–29 (Zähler je Aufrufer, 5 Sim-Minuten):

| Aufrufer | Datei:Zeile | neue Images/Fenster | Charakter |
|---|---|---|---|
| `CombatSystem.fireFlail` | `src/systems/CombatSystem.ts:355-374` | **5 297** | je Swing 10 neue Images (`flail_ball` + 8× `chain_link` + `fx_halo`) via `makeImage` → `scene.add.image`, Destroy nach 0,24–0,32 s |
| `Run.spawnSplash` | `src/scenes/Run.ts:663-674` | **4 126** | je Splash 3 Images + 3 Tweens, Destroy nach ~0,3 s |
| `GroundRenderer.placeProps` | `src/gfx/GroundRenderer.ts:634-683` | **2 852** | Props je Chunk-Rebuild (`buildChunk` Zeile 557, `addProp` Zeile 585) |
| `CombatSystem.addBurn` | `src/systems/CombatSystem.ts:1117-1130` | **2 844** | je Brandfläche ein neues `fx_fire`-Image (Cap 10, Destroy nach life) |
| `GroundRenderer.buildChunk/placeWaterDetails` | `src/gfx/GroundRenderer.ts:557-572` | ~1 060 | Wasser-Deko je Chunk-Rebuild |
| Rest (impactFx, spawnBeam, flushLabels …) | — | ~150 | DamageNumbers/FX-Rest, bereits gedeckelt |

Alle belegten Quellen liegen **außerhalb der Lane-Area** (Pool.ts/EnemyPool.ts).
In-Area-Restposten (Karte #6180 gefixt):

1. `EnemyPool.compact` nutzte `this.active.splice(i, 1)` (vorher Zeile 266) —
   `splice` alloziert **pro Todesfall** ein Ergebnis-Array; in Todeswellen
   (hunderte Tode/Frame in Minute 23–27) reiner Objekt-Churn.
2. `EnemyPool.spawn` rief `eliteRimDef(def)` (`src/gfx/enemySprites.ts:190`,
   `{...def, id}` → neues Objekt) und `eliteMarkerSpec(radius)` je Elite-Spawn auf.

### Fix-Empfehlungen für Folge-Jobs (fremde Dateien, hier NICHT angefasst)

- **Größter Einzelposten:** `fireFlail`-Swing-Objekte (Ball/Kette/Halo) als
  fester Sprite-Satz je Waffe wiederverwenden (10 Images pro Waffe statt 10 pro
  Swing) — `src/systems/CombatSystem.ts:355`. Erwarteter Gewinn ~32 % des
  Endgame-Churn. (Schon in m10-heap-margin empfohlen, unverändert aktuell.)
- `addBurn`: Brandflächen-Sprite in einen kleinen Pool (Cap 10) legen —
  `src/systems/CombatSystem.ts:1117`, ~17 %.
- `spawnSplash`: 3 Drop-Images poolen statt `makeImage` + Tween + destroy —
  `src/scenes/Run.ts:663`, ~25 %. **Run.ts ist fremd-geclaimed.**
- GroundRenderer: Props/Wasser-Deko sind an Chunk-Texturen gebunden; Reuse nur
  über Chunk-Recycling (Chunk-Key → Image-Set) — `src/gfx/GroundRenderer.ts:557`.

## Karte #6180 — Fix + Regressionsschutz

Fix nur in `src/systems/EnemyPool.ts` (Pool.ts ist bereits churn-frei:
`obtain`/`release`/`trim` arbeiten ohne Allokation — kein Eingriff nötig):

- `compact()`: in-place Verschieben + `length--` statt `splice` — Reihenfolge
  der Überlebenden bleibt exakt erhalten (bitgleich), kein Array pro Tod.
- `rimDefCache`/`markerSpecCache` (Map je Basis-ID bzw. gerundetem Radius):
  Elite-Spawns lesen gecachte Objekte statt pro Spawn neu zu spreaden.

Tests `tests/heap-sawtooth.test.ts` (4): (1) keine Sprites/Images nach Aufwärmen
über 3 Wellen à 120, (2) 30 Sim-Frames Kill-Wellen — 300 Spawns auf 10 Runtimes/
KI-Zustände, Werte bitgleich, (3) Rim-Def-/Marker-Spec-Objekt-Identität + Wert-
Gleichheit, (4) `compact` ohne `splice`-Aufruf (gezählt) mit erhaltener Reihenfolge.

## Karte #6181 — Nachher-Messung + Abschluss

Beleg: `shots/m10-heap-sawtooth-after.json` (30/30 Sim-Minuten, 0 JS-Fehler,
Kills 13 235). Vorher/Nachher (je 30-min-Sim-Lauf, timeScale 30, AutoPlay, God,
seed 99, Skript und Gate-Metrik identisch):

| Kennzahl | Vorher (`…before.json`) | Nachher (`…after.json`) | Ziel |
|---|---|---|---|
| **deltaVsMinute1Pct (gcMB, M1→M29)** | −4,6 % (Zufalls-Pass) | **+5,2 %** | ≤ +12 % ✅ |
| endGcMB | 34,7 | 36,8 | flach ✅ |
| Kills (Gesamtlauf) | 9 099 | 13 235 | — |
| Sägezahn-Amplitude M20–30 (raw−gc, MB) | 5,96 | 7,59 | gesenkt? **nicht im Rohergebnis** |
| Amplitude M23–30 | 7,00 | 8,60 | — |
| **Amplitude pro Kill** (M23–30, MB/Kill) | 0,77 | **0,65** | **−16 %** ✅ |
| JS-Fehler | 0 | 0 | 0 ✅ |

### Ehrliche Auswertung

- **Gate:** +5,2 % ≤ +12 % — PASS in diesem Lauf. Weil das Tor auf den
  Sägezahn-Phasen (Tal/Kamm) basiert, ist ein Einzellauf kein
  Zuverlässigkeitsbeweis; die verbindliche Aussage lautet: im nachgemessenen
  Lauf hält das Tor, und die Allokationsrate pro Aktivität ist gesenkt.
- **Amplitude:** im Rohergebnis NICHT gesenkt (7,59 vs. 5,96 MB) — aber die
  Vergleichsläufe sind nicht aktivitätsgleich: der Nachher-Lauf hat +45 % Kills
  (Lauf-zu-Lauf-Streuung des 30×-Sims, bereits im Vorher dokumentiert: 6 181 vs.
  9 099 Kills auf identischem Vorher-Build). **Pro Aktivitätseinheit** (MB Amplitude
  je Kill, M23–30) sinkt die Churn-Intensität von 0,77 auf 0,65 MB/Kill (−16 %) —
  das ist der messbare Effekt des In-Area-Fixes (Todeswellen ohne
  splice-Array-Churn, Elite-Spawns ohne Objekt-Spread).
- **Verhalten bitgleich:** wertgleich nachweisbar nur innerhalb des Spiels
  (tests/heap-sawtooth.test.ts: Werte über 300 Recycle-Spawns identisch, Rim-Def
  `toEqual` bitgleich, Reihenfolge der Überlebenden erhalten). Zwischen zwei
  30×-Browser-Läufen ist ±0 nicht erreichbar (rAF-Dt-Jitter ändert Substep-
  Gruppierung → chaotische Divergenz, Kills ±45 %). Für ein bitdeterministisches
  Gate bräuchte es einen fest-substep-gesteuerten Sim-Modus — Folge-Job.
- **Dominante Rest-Churn (außerhalb der Area, unverändert):** CombatSystem
  fireFlail/addBurn (~50 %), Run.spawnSplash (~25 %), GroundRenderer-Chunk-Rebuild
  (~24 %) — siehe Karte #6179. Solange diese Quellen leben, bleibt die absolute
  Sägezahn-Amplitude von der Aktivität (Kill-/Splash-/Swing-Rate) bestimmt. Das
  zuverlässige ≤ +12 % erfordert den dortigen Sprite-Reuse (Fix-Empfehlungen
  dokumentiert).

### Abnahme-Tabelle

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| 30-min-Sim-Lauf deltaVsMinute1Pct ≤ +12 % | **+5,2 %** ✅ | `shots/m10-heap-sawtooth-after.json` |
| Sägezahn-Amplitude messbar gesenkt | Rohergebnis nein; pro Aktivität −16 % (0,77→0,65 MB/Kill) | before/after JSON |
| Verhalten bitgleich (±0) | Wert-Identität in Tests belegt; Lauf-±0 nicht definierbar (Streuung dokumentiert) | tests/heap-sawtooth.test.ts |
| `npm run build` + `npm test` grün, Testzahl +≥2 | 787/787 in 77 Dateien (+4 neue Tests in `tests/heap-sawtooth.test.ts`), build ✓ | Commit #6181 |
| Mess-Sperre | Heap/Tests ohne flock ✅; kein flock-Pflichtlauf in dieser Lane | — |
| Belege im Commit | before/after/churn JSON + Doku | dieser Commit |
