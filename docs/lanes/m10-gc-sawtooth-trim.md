# Lane m10-gc-sawtooth-trim (Frame-Zeit-Spitzen via GC-Druck senken)

**Ziel:** Allokationsrate pro Frame im Minute-25-Burst senken, um GC-Pausen aus
dem p99-Schwanz der v10-Gerätetore zu ziehen (K3 p99 31 ms vs p95 21 ms;
ACCEPTANCE Heap-SOFT: GC-Sägezahn, max Fenster-Peak +65,3 % über Basis, 41–55 MB).
Das HARD-Heap-Tor (retained) ist grün — es geht NUR um Allokationsrate, nicht Leaks.

**Abnahme:** bytes/frame im Probe −30 % oder besser; JS-Frame-CPU-ms p99 nicht
schlechter; `npm test` grün (inkl. run-determinism-Guard), tsc rc=0, 0 JS-Fehler;
Renderer-String in jedem Beleg.

**Area (Disponent):** `src/systems/ProjectilePool.ts`, `tests/gc-sawtooth-trim.test.ts`,
`scripts/m10-gc-probe.mjs`, diese Doku, `shots/m10-gc-sawtooth-*`, `.lane-done`.
Run.ts ist fremd geclaimed und wurde nicht angefasst.

## K1 — Vorher-Profil (Minute-25-Burst) ✓

- Skript: `scripts/m10-gc-probe.mjs` (CDP HeapProfiler-Sampling 16 KB + RAF-Frame-Zähler
  + GC-Trace-Events; Sim bis Minute 25 mit timeScale 30, Messfenster 12 s bei timeScale 1;
  unter `flock /home/ai/games/.lf-perf.lock`).
- Beleg: `~/games/.evidence/m10-gc-sawtooth-trim/shots/m10-gc-sawtooth-before.json`
  (Regel 27./28.11.: Mess-JSONs nach `.evidence/`, nicht in git).
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — gültig (kein SwiftShader).
- **Ergebnis:** 744 Frames, Allokation **355 131 bytes/frame** (264,2 MB / 12 s),
  520 MinorGC + 1 MajorGC im Fenster (GC-Spitze 47,4 MB before), retained 69,2 MB,
  Frame-ms p50/p95/p99 = 16,7/16,8/16,8 (vsync-geklemmt), enemies 29, kills 2878.
- **Top-Allokationsstellen** (bytes / fn / chunk):
  1. 148,7 MB (56 %) `batchSprite` — Phaser-WebGL-Batching, pro Draw
  2. 34,4 MB (13 %) `get` (phaser:23, minifiziert — Texture-/Frame-Zugriffe)
  3. ~36 MB (13 %) `sortByDepth` + `sort` + `push` — Scene-Depth-Sort-Churn
  4. 4,0 MB `updatePropsDepth` (gfx-Chunk = src/gfx/*), 3,2 MB `setAlpha`
  5. `updateEnemies` (Run-Chunk) 1,1 MB
- **ProjectilePool taucht NICHT in den Top-25 auf** — der Pool ist durch
  heap-pool-fix/projectile-cull/worldview-anchor bereits restlos gepoolt
  (Reuse, in-place trailFrames, viewScratch, hit-Set-Reuse). Die Briefing-
  Annahme „Top-Stellen im Pool" trifft nicht zu; die Stellen sind
  Phaser-Renderer-Internas, skaliert mit Draw-Count/Display-List-Churn.

## K2 — Poolen Top-1..3 in ProjectilePool.ts ✓ (Teil-Hebel)

- Umgesetzt (`b61d8f33`, #13365): „nur bei Änderung setzen" im Reuse-Pfad von
  `ProjectilePool.spawn` — redundante `applyTexture`/`setBlendMode`/`setDepth`-
  Aufrufe werden übersprungen (`sameTexture`-Helper + `sprite.blendMode`/`depth`-
  Vergleiche). Begründung: Phaser `setDepth` queued bei JEDER Neusetzung einen
  Scene-weiten StableSort (Depth-Komponente: „Setting the depth will queue a
  depth sort event within the Scene"); setTexture/setBlendMode churnen den
  Draw-Pfad. Sim-Werte unangetastet → bitgleich.
- Reviewer (Kontrolleur): **PASS** — 4 Prüffragen (sameTexture-Randfälle,
  Fremdsystem-Zugriffe auf depth/blend: keine; Testaussagekraft; GAME.md/AGENTS.md)
  mit grep/tsc/vitest-Belegen. Zwei „Sollte"-Punkte verbaut (Nicht-Atlas-Test,
  Guard-Kommentar), K3 amend `3b1a6d13`.

## K3 — Guard-Test ✓

- `tests/gc-sawtooth-trim.test.ts` (5 Cases, grün):
  - Snapshot-Zähler: nach Warmup-Burst erzeugen 2000 spawn/compact/release-Zyklen
    (gemischt ADD/NORMAL, 2 Texturen) **0 neue Runtime-Objekte** (`stats.created`
    konstant; bestehender Vertrag „prewarm zählt nicht" dokumentiert).
  - hit-Set-Identität über Reuse (leeren statt neu anlegen).
  - „Nur bei Änderung": 50 identische Reuse-Spawns → 0 erneute setTexture/
    setBlendMode/setDepth-Aufrufe; echte Änderungen (ADD-Band, Fremd-Textur)
    werden weiterhin gesetzt; Nicht-Atlas-Zweig (Texture-Key-Vergleich) abgedeckt.
- Bestehende Pool-Verträge unverändert grün (pool-trim, projectile-cull,
  heap-pool-fix, run-determinism; Gesamt: 233 Dateien / 2519 Tests PASS, tsc rc=0).

## K4 — Nachher-Profil + verbindliche Auswertung

- Beleg: `~/games/.evidence/m10-gc-sawtooth-trim/shots/m10-gc-sawtooth-after.json`
  (gleiche Methode/Seed/Fenster; Renderer `Mesa Intel(R) Graphics (RPL-S)`).
- **Vorher/Nachher:**

| Metrik | Vorher | Nachher | Delta |
|---|---|---|---|
| alloc bytes/frame | 355 131 | 346 838 | **−2,3 %** |
| Frame-ms p99 (rAF) | 16,80 | 16,80 | 0 (nicht schlechter) |
| Frame-ms p50/p95 | 16,70/16,80 | 16,70/16,80 | 0 |
| retained GC MB | 69,2 | 69,3 | ~0 (HARD-Tor bleibt grün) |
| GC maxBefore MB | 47,4 | 46,6 | −0,8 |
| kills/Framezahl | 2878/744 | 2879/747 | Rauschen |

- **Abnahme-Kriterium −30 %: NICHT erreicht (−2,3 %).** Verbindliche Auswertung
  nach Messregel (max. eine Wiederholung, dann auswerten): Die in-Area-Hebel
  (Pool) sind erschöpft — der Pool ist bereits vollständig gepoolt und trägt
  messbar < 1 % zur Allokationsrate bei. Die Top-Stellen (≈ 82 % der bytes)
  liegen in Phaser-Renderer-Internas und außerhalb des Disponent-Claims.
- JS-Fehler: beide Läufe zeigen dieselben 3 warn-level „Texture key already in
  use: chunk_*" (Debug-Atlas-Regeneration, identisch Vorher/Nachher, kein
  pageerror) — vorbestehend, nicht von dieser Lane verändert. Keine neuen Fehler.
- Hinweis Messgrenze: rAF-Frame-ms sind im Harness vsync-geklemmt (60 Hz) und
  zeigen GC-Spikes nicht; Gerätetor (v10 p99) bleibt die verbindliche Metrik.

## Rest-Hebelliste (Stellen außerhalb des Areas → Job-Zeilen)

1. **`batchSprite` + `get` ≈ 69 % (183 MB/12 s):** Phaser-WebGL allokiert pro
   Draw. Hebel: Draw-Count senken (Trail-Puffs, FX-Partikel, Props), ggf.
   Batch/Pipeline-Arbeit (Anschluss an m10-ambient-batching) oder Phaser-Patch.
   -> Job: „Draw-Count-Diät im Burst: Top-Draw-Quellen zählen und senken".
2. **`sortByDepth` + `sort` + `push` ≈ 13 % (~35 MB/12 s):** Scene-Depth-Sort
   durch je-Frame depth-Setzungen. Mein „nur bei Änderung"-Muster aus K2 ist
   übertragbar auf Enemy-/FX-/Props-Sprites (EnemyPool, FxSystem, GroundRenderer —
   alles außerhalb dieses Claims). -> Job: „depth-Setzungen nur bei Änderung
   (Enemies/FX/Props)".
3. **`updatePropsDepth` (gfx) 4 MB:** Props-Depth je Frame — Teil von 2.
4. **`setAlpha` 3,2 MB:** Alpha-Setter-Churn je Frame (FX/Enemies) — dasselbe
   Muster. -> in Job 2 mitnahmen.
5. **Probe-Ausbau:** `stats.created`/Peak-Actives des Pools im Burst ins Probe-JSON
   (heute nur allocTop) — klein, falls ein Nachfolge-Job die Pool-Größe verifizieren will.

## Commits (Lane)

- `c806c97c` #13364 K1 Vorher-Profil (Runner-Checkpoint) — Probe + Belegpfad
- `b61d8f33` #13365 K2 Pool-Reuse ohne redundante Setter
- `3b1a6d13` #13366 K3 Guard-Test (inkl. Reviewer-Followup)
- (dieser) #13367 K4 Lane-Doku + Nachher-Auswertung
