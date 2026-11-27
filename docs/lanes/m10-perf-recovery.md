# Lane m10-perf-recovery — M10 Engine-Performance zurückholen (fa-01)

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-recovery`, Branch `m10-perf-recovery`.
**Scope dieser Karte: Profil + Bisect + Ursache benennen. Kein Fix** (Fix als Folgekarte
`m10-perf-fix-<ursache>`, siehe Auftrag 08:35).

Ausgangsbefund Endabnahme 27.11. (`docs/qa/final-2026-11-27.md`):
fullrun fpsMin **37,9** (640×360) / **40,2** (780×360), Burst 640 **46,3 FPS** — Ziel ≥ 55.
QA-Referenz 26.11. 10:51 (Commit `0b42ffe`): 59,3 / 59,3 FPS.

## Werkzeuge

- `scripts/perf-profile.mjs` — Playwright + CDP `Profiler` über 60 s Burst bei 640×360.
  Zählt per Wrapper `gl.drawElements/drawArrays` (inkl. Instanced), Blend-/Programm-/
  Texture-Wechsel pro Frame und GameObjects nach Typ. Optional `--skip-to 1490`
  für das Endgame-Fenster (Minute 25 mit Evolutionen). Ergebnis-JSON in `shots/`.
  Start immer mit `flock /home/ai/.lf-perf.lock` (FPS-Messung).
- `scripts/perf-bisect.sh` + `scripts/perf-bisect-check.mjs` — `git bisect` zwischen
  `0b42ffe` und `HEAD` in einem temporären Worktree; Predikat = `npm run perf`
  (640×360), Kriterium `minute25` (Default) oder `burst`, Schwelle 55 FPS.

## Profil 1 — Burst 500 Gegner, 640×360, 60 s

`flock … node scripts/perf-profile.mjs --seconds 60 --viewport 640x360`
→ `shots/m10-perf-profile-640.json`, `shots/m10-perf-profile-640.png`.

| Kennzahl | Wert |
|---|---|
| FPS (60 s) | **59,9** (3592 Frames) |
| Gegner min/avg | 314 / 480 (Autoplay killt zwischen Refills, final 500) |
| Draw-Calls/Frame Median | 16 (Mean 17,9, Max 88) |
| Blend-Wechsel/Frame Median | 12 |
| Texture-Binds/Frame Median | 94 |
| LOD | minimal, fxCap 60, particleCap 100, trails aus |

Befund: Der **500er-Burst ist auf diesem HEAD nicht mehr der Blocker** (59,9 statt 46,3
aus der Endabnahme). Die Endabnahme-Messung lag zeitlich vor den Merges
m10-perf-500/m10-heap-tail; der SpatialHash-/Pool-Fix hat den Burst bereits gehoben.
Reproduktion mit `npm run perf -- --viewport 640x360 --dpr 1`: Burst **59,1 FPS PASS**,
Minute-25 **53,0 FPS FAIL**.

## Profil 2 — Endgame Minute 25, 640×360, 60 s (der eigentliche Blocker)

`flock … node scripts/perf-profile.mjs --seconds 60 --skip-to 1490 --target 300 --viewport 640x360`
→ `shots/m10-perf-profile-minute25-640.json`, `shots/m10-perf-profile-minute25-640.png`.

| Kennzahl | Wert |
|---|---|
| FPS (60 s) | **52,3** (< 55) |
| Draw-Calls/Frame Median | **88** (Mean 86,5, P95 **131**, Max **175**) |
| Blend-Wechsel/Frame Median | **82** (≈ 1 Wechsel pro Draw-Call) |
| Texture-Binds/Frame Median | 106 |
| Aktive GameObjects | DisplayList 3313 / sichtbar 2067: **2871 Image**, 520 Sprite, 25 Container, **0 Graphics** |
| LOD | full, fxCap 180, particleCap 280, trails an, damageAggregate aus |
| JS-Fehler | 0 |

Top-Funktionen nach Self-Time (60 s, CDP, ohne `(program)`/idle):

| # | Funktion | Self-Time | Anteil |
|---|---|---|---|
| 1 | `batchSprite` (Phaser MultiPipeline) | 1329,8 ms | 2,2 % |
| 2 | `e.99517…exports` (Phaser-Bundle) | 486,9 ms | 0,8 % |
| 3 | `update` (Phaser GameObject) | 459,3 ms | 0,8 % |
| 4 | `e.19186…exports` (Phaser-Bundle) | 366,1 ms | 0,6 % |
| 5 | `render` (Phaser MultiPipeline) | 330,8 ms | 0,5 % |
| 6 | `render` (Phaser WebGLRenderer) | 327,9 ms | 0,5 % |
| 7 | `updatePropsDepth` (GroundRenderer/Props) | 198,1 ms | 0,3 % |
| 8 | `bufferSubData` (WebGL-Treiber) | 192,7 ms | 0,3 % |
| 9 | `set` (Phaser Transform/Property) | 192,5 ms | 0,3 % |
| 10 | `batchQuad` (Phaser MultiPipeline) | 189,4 ms | 0,3 % |

CPU-Idle nur **1,8 %**, GC 0,2 % → der Endgame-Frame ist **CPU-/Batch-bound**, nicht
GPU-bound und nicht Heap-bound.

## Ursache (Profilbefund)

Der Burst ist grün; der Blocker sitzt im **Endgame-Fenster Minute 25**:
- Draw-Calls/Frame steigen von 16 (Burst) auf **88 Median / 131 P95 / 175 Max**.
- Fast jeder Draw wird von einem **Blend-Wechsel** begleitet (82 Wechsel vs. 88 Draws).
  Das ist das Signaturmuster von **abwechselnd ADD/NORMAL gezeichneten Effekt-Sprites**,
  die per `setDepth` zwischen normale Sprites sortiert werden: jeder Wechsel flusht den
  Phaser-Batch und erzeugt einen eigenen Draw-Call.
- 2871 Images / 520 Sprites im DisplayList, 25 Container. Keine Graphics-Objekte
  (kein per-Frame-`clear()`-Problem), Heap/GC unauffällig.

Damit ist die im Auftrag genannte Hebel-Richtung bestätigt: **Blend-Modi werden im
Endgame abwechselnd gezeichnet und brechen das Batching.** Welche Commits das eingeführt
haben, belegt der Bisect (folgt unten).

## Status (Supervisor 2026-11-27 ~11:35)

Profil + Bisect sind abgeschlossen (Zeitbox eingehalten). Top-10 Self-Time und
Draw-Calls/Frame stehen oben; Ursache ist mit `c0f56d5` **belegt** (Median 51,4
statt 60,0 FPS im Minute-25-Fenster, Burst unverändert). Kein Code-Fix in dieser
Mess-Karte; Folgekarte ist `#2678 m10-perf-fix-ambient-batching`.

Sicht-Belege (`#2499`): profile done — die Belege lagen bereits als eigene Karte
vor und sind in `caea6b6`/`3ea51b7` committet (verify-display 38/38, 30 Gegner/
6 Bosse/12 VFX-GIFs bei 640×360).

## Bisect (git bisect, Kriterium minute25 ≥ 55 FPS)

`bash scripts/perf-bisect.sh 0b42ffe HEAD` (temporärer Worktree, Predikat
`npm run perf --viewport 640x360 --dpr 1`, Kriterium `minute25`).

Bisect-Log: `~/tmp/m10-perf-recovery/bisect-minute25-20261127-101238-bisectlog.txt`.

Erste Messreihe (je 1 Lauf pro Commit):

| Commit | minute25 FPS | Urteil |
|---|---|---|
| `0b42ffe` (good, QA 26.11.) | 60,0 | gut |
| `c0f56d5` / `946f7f6` (Kandidat) | 52,9 / 50,7 / 52,3 | schlecht |
| `9d19a5e` (Parent-Kette davor) | 59,8 / 59,9 / 59,6 | gut |

Weil der von `git bisect` markierte Snapshot `946f7f6` **keinen src-Diff** gegenüber
seinem Parent `c0f56d5` hat, wurde die Kette interleaved A/B nachgemessen
(3× je Commit, abwechselnd, `flock`):

| Commit | minute25 FPS (3 Läufe) | burst FPS | Urteil |
|---|---|---|---|
| `9d19a5e` (vor Ambient/Props-Depth) | 60,0 / 60,0 / 59,8 | 60,1 | **gut** |
| `c0f56d5` (`#280` Ambient Glühwürmchen + Nebel) | 57,4 / 49,5 / 51,4 | 60,1 | **schlecht** |

**Verursachender Commit: `c0f56d5` „M9-m9-art-world: #280 Ambient Gluehwürmchen und
Nebel (bildschirmverankert, dezent)“** — FPS-Delta **≈ −7 bis −10 FPS** (60 → 51 Median)
im Minute-25-Fenster, Burst 500 unverändert 60,1.

Der Commit ergänzt in `src/gfx/GroundRenderer.ts`:
- **24 ADD-Glühwürmchen-Sprites** (`m9_ambient_glow`, `BlendModes.ADD`, `setDepth(-89.6)`)
  plus **3 NORMAL-Nebelbänder** (`m9_ambient_fog`, `setDepth(-89.85)`), die pro Frame
  Position und Alpha neu setzen.
- Diese ADD/NORMAL-Sprites liegen als eigener Depth-Layer zwischen Terrain-Chunks und
  Spielwelt und werden pro Frame bewegt; im Endgame (viele Evolutionseffekte, Gems,
  Hazards) erhöhen sie die Zahl der Blend-/Texture-Wechsel, die den Phaser-Batch
  flushen. Im Burst (nur Bog-Rats, wenig Effekte) bleiben die Draw-Calls niedrig,
  deshalb dort kein FPS-Verlust.

Präzisierung (welcher Teil des Commits — Glühwürmchen vs. Props-Depth-Sortierung aus
`da3ef77`): siehe A/B-Isolation unten.

### A/B-Isolation (welcher Teil des Commits)

Interleaved 3× je Commit, gleiches Predikat (`npm run perf`, 640×360, `flock`):

| Commit | minute25 FPS | burst FPS | Urteil |
|---|---|---|---|
| `9d19a5e` (vor Ambient + Props-Depth) | 60,0 / 60,0 / 59,8 | 60,1 | gut |
| `da3ef77` (`#279` Props-Tiefensortierung/Schatten) | 58,1 / 58,7 / 60,0 | 60,1 | gut (≥55) |
| `c0f56d5` (`#280` Ambient Glühwürmchen + Nebel) | 57,4 / 49,5 / 51,4 | 60,1 | **schlecht (Median 51,4)** |

**Ergebnis: `c0f56d5` „#280 Ambient Gluehwürmchen und Nebel (bildschirmverankert,
dezent)“ ist der verursachende Commit.** Die Props-Tiefensortierung allein
(`da3ef77`) bleibt mit 58–60 FPS über der Latte; erst die 27 zusätzlichen
ADD/NORMAL-Ambient-Sprites drücken das Endgame-Fenster auf 49–57 FPS (Median 51,4,
Delta ≈ −8,6 FPS gegen `9d19a5e`). Der Burst bleibt in allen drei Commits bei 60,1 FPS
— die Regression ist **endgame-spezifisch** (viele gleichzeitig gezeichnete Effekte).

Ein direktes Draw-Call-A/B bei 20 s (`da3ef77` 73 vs. `c0f56d5` 70 Draws/Frame) ist
mangels reproduzierbarer Endgame-Dichte nicht aussagekräftig; der belastbare Beleg ist
die interleaved FPS-Messung oben plus das 60-s-Profil am HEAD (88 Draws im
Minute-25-Fenster vs. 16 im Burst, 82 Blend-Wechsel/Frame).

### Draw-Call-/Blend-Beleg

Profil Minute 25 (HEAD, 60 s): 88 Draw-Calls/Frame Median vs. 16 im Burst;
82 Blend-Wechsel/Frame ≈ 1 Wechsel pro Draw. Das bestätigt die Batch-Bruch-Hypothese:
die zusätzlichen ADD/NORMAL-Ambient-Sprites erzwingen im Effekt-Chaos wesentlich mehr
Batch-Flushes als im ruhigen Burst.

## Empfehlung für die Folgekarte `m10-perf-fix-ambient-batching`

- Die 24 Glühwürmchen (`m9_ambient_glow`, ADD) und 3 Nebelbänder (`m9_ambient_fog`,
  NORMAL) in **einen** Layer/Container mit fester Tiefe legen und gesammelt zeichnen,
  statt sie pro Frame durch `setDepth` zwischen Normal-Sprites zu sortieren.
- Alternativ: Nebel/Glow in die Terrain-RenderTexture backen (statisch) und nur die
  Bewegungs-Offsets im Shader/Container animieren; Glühwürmchen-Zahl an LOD koppeln.
- Regressionsschutz: `tests/perf-budget.test.ts` (Draw-Calls/Frame und sichtbare Images
  im Headless-Burst/Endgame unter Budget) — gehört in die Fix-Karte.
- Abnahme der Fix-Karte: `npm run perf` Burst ≥55 (640/780) **und** Minute-25 ≥55,
  `npm run fullrun` fpsMin ≥55 in beiden Formaten, plus art-director-Sichtprüfung
  (Ambient darf nicht sichtbar verschwinden).

## Offene Punkte / Folgekarte

- Fix-Karte `m10-perf-fix-<ursache>` erst nach Bisect-Ergebnis anlegen.
- `tests/perf-budget.test.ts` (Draw-Calls/Frame, aktive Graphics/Images unter Budget im
  Headless-Burst) gehört in die Fix-Karte als Regressionsschutz, nicht in diese
  Mess-Karte (Scope: kein Code-Fix).
