# Lane m10-ground-chunk-budget — Hebel B (2. Teil): Chunk-Generierung/-Upload im Frame glätten

Datum: 2026-11-28. Auftrag: K3-FAIL der Geräteabnahme (`docs/qa/v10-device-acceptance-2026-11-28.md`,
janky 13,44 %/13,90 %, worstFrame 33–34 ms ~alle ~11 s) — dokumentierter Verdacht
„Chunk-Generierung im Lauf (GroundRenderer)“ mit Belegen/Upload-Spikes. Der Spawner-Teil läuft
als Lane m10-frame-tail-followup; diese Lane fixt NUR den GroundRenderer-Teil.

Belege (außerhalb des Repos, Merge-sicher): `~/games/.evidence/m10-ground-chunk-budget/`.
Board: #12435 (K1 Vorher), #12436 (K2 Fix), #12437 (K3 Guards), #12438 (K4 Nachher), #12439 (K5 Doku).

## Vorarbeit anderer Lanes (relevanter Stand)

- m10-frame-tail-batching (#11990) hat bereits die Install-Glättung gebaut:
  `finalizeReady` = 1 Install/Frame + `chunkInstallDue()` (12 ms Mindestabstand bei Rückstau).
- Deren K1 (Gerät): Chunk-Main-Thread-Kosten NICHT bestätigt (6 Installs, alle auf 8,3-ms-Frames);
  Verdacht bleibt Compositor-/GPU-Upload (`texture.refresh()`, 256×256 Land / 256×768 Wasser
  = 3 Stufen) sowie GC.

## Dateien (Disponent-Claim)

`src/gfx/GroundRenderer.ts`, `tests/ground-chunk-budget.test.ts`, `scripts/m10-ground-chunk.mjs`,
diese Doku, `shots/m10-ground-chunk-*`, `.lane-done`.

## K1 — Vorher-Messung (Baseline, vor jeder Änderung) — abgeschlossen

Mess-Skript: `scripts/m10-ground-chunk.mjs` (Minute-25-Worst-Case wie m10-frame-tail-batching:
6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up 300 im 50-ms-Takt, god, suppressLevelUps,
autoPlay; je Frame dt + Top-up + Chunk-Texturanzahl + Heap + DELTAS der GroundRenderer-Debug-
Zaehler chunkBuilds=Canvas-Erzeugung, readyInstalled=Install/Upload, workerReceived).

### Lokal iGPU (40 s Fenster, `before-local.json`, Renderer-String im JSON)

Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (gültig, kein SwiftShader).

| Kennzahl | Wert |
|---|---|
| Frames | 2252 (40 s, 60 Hz VSync) |
| p50 / p90 / p95 / p99 (ms) | 16,7 / 16,7 / 33,2 / **49,9** |
| worst (ms) | 66,8 |
| jankyPct (dt > 16,9) | 5,11 % |
| Chunk-Installs/-Builds gesamt | 10 / 10 (≈ 1 alle 4 s = Chunk-Grenzüberfahrt) |
| dt-Mean auf Install-Frames vs. ohne | 16,69 vs. 17,77 ms (Installs NICHT auf Spikes) |
| dt max nach Build-Frame | 33,3 (einmalig, Nachbarframe) |
| Heap-Drops (GC) | 67, dt max nach Heap-Drop **49,9** |
| Top-up-Frames | 722, dt max nach Top-up **66,7** |

### Befund (K1)

1. **Alle 16 Worst-Frames (50–66,8 ms) fallen mit Top-up-Frames zusammen** (Top-up 111–187
   Gegner im 50-ms-Tick) bzw. folgen auf Heap-Drops (GC). Chunk-Installs (10) und Canvas-Builds
   (10) liegen in 40 s NIEMALS auf einem Worst-Frame; Install-Frames haben mittlere dt
   (16,69 ms = p50). → Lokal ist der Chunk-Pfad (Worker + 1-Install/Frame-Gate) nicht der
   rAF-dt-Treiber. Konsistent mit dem Gerät-Befund der Frame-Tail-Lane (Installs auf 8,3-ms-
   Frames; Tail Compositor-seitig).
2. **GC-Korrelation ist real** (dt max nach Heap-Drop 49,9 ms): Allokations-Churn im Lauf
   erhöht die GC-Pause-Wahrscheinlichkeit. Ein Teil dieses Churn ist der Chunk-Wechsel selbst:
   je Chunk-Wechsel `createCanvas` (256 KB Land / 786 KB Wasser) + `textures.remove` (Canvas +
   GL-Textur freigeben) — pro Grenzüberfahrt 2–3 Chunks. Auf Android (langsamere GC, kein
   `performance.memory`-Signal nötig) sind solche Flächen-Allokationen der belegte
   Spike-Kandidat (Android-Praxis-Regel „keine Allokationen im Frame“).
3. **Akzeptanzgrenze vor dem Fix (verbindlich, eine Wiederholung erlaubt):** gleiche Methode,
   gleiche Session. K4-Ziel: keine Installs/Builds auf Worst-Frames bleiben (kein Regression),
   worstFrame und p99 verschlechtern sich nicht, Install-/Build-Frames bleiben auf p50-Niveau;
   der Gerät-Follow-up nach dem Merge prüft p99 < 20 ms (gfxinfo).

## K2 — Fix (Chunk-Budget + Canvas-Reuse) — eingefroren (Commit da6199a5)

Zwei minimalinvasive Änderungen, beide ausschließlich in `src/gfx/GroundRenderer.ts`
(Terrain-Ausgabe pixelidentisch — es wird exakt wie bisher gemalt, nur WO die Pixel landen,
ändert sich):

1. **Canvas-Textur-Pool (`chunkTexturePool`):** beim Chunk-Eviction wird die Canvas-Textur
   nicht mehr per `textures.remove()` vernichtet, sondern (nach Klasse: Frames 1 vs. 3,
   Pool-Cap 6 je Klasse) für den nächsten Chunk derselben Klasse wiederverwendet: clearRect +
   repaint + refresh — kein `createCanvas` (786-KB-Allokation), kein GL-Textur-Neuanlegen je
   Grenzüberfahrt. Reine Helfer `poolPick`/`poolStore` (getestet). Cap-Verwurf gibt den Key
   über `textures.remove()` frei (kein Leak, keine Key-Kollision).
2. **Frame-Budget-Gate (`chunkInstallGate`):** ergänzt das bestehende 12-ms-Gate um eine
   Frame-Budget-Sicht: wenn der letzte rAF-Frame das Budget überschritten hat
   (`lastFrameDtMs > CHUNK_INSTALL_FRAME_BUDGET_MS = 22`) wird der Install in nachfolgende
   Frames verschoben — höchstens `CHUNK_INSTALL_MAX_DEFER_FRAMES = 3` Frames hintereinander
   (Stillstands-Schutz: erzwingender Install spätestens im 4. Frame, gilt auch bei Rückstau —
   Gate-Fix in f5d7fc69). Steady-State (1 fertiger Chunk, kein Budget-Druck) bleibt sofort.
3. **Eingefrorene Werte: Budget 22 ms / Defer-Limit 3** (Konstanten im Quellcode). Der
   Suchlauf zur Parameter-Optimierung wurde NICHT abgeschlossen — siehe K4/Abbruch.
4. **Mess-Hook:** `chunkGateOverride` + `window.__lfChunkGate` (Modul-Level, nur vom
   Tune-Skript gesetzt; Produktion nutzt ausschließlich die Konstanten).

Nicht angefasst: Spawner.ts/Run.ts (m10-frame-tail-followup), config.ts, FxSystem.ts,
Worker/Margin/Sync-Fallback unverändert.

## K3 — Guard-Tests — umgesetzt (Commit f5d7fc69)

`tests/ground-chunk-budget.test.ts` (13 Tests):
- `poolPick`/`poolStore`: Wiederverwendung nur passender Klasse (Land 1 / Wasser 3 Stufen),
  LIFO, Cap 6 je Klasse mit Verwurf-Meldung (false → Aufrufer removed), kein doppelter Key.
- `chunkInstallGate`: Steady-State sofort; Budget-Überschreitung schiebt in nachfolgende
  Frames; nach 3 Defer-Frames erzwingender Install auch bei Rückstau (Stillstands-Schutz,
  Test „Rückstau wird vollständig abgebaut" über 60 Frames); 12-ms-Rückstau-Intervall
  kompatibel zum bisherigen `chunkInstallDue`; Budget 16,7 < 22 < 33 ms.
- Terrain bitgleich: Pool verändert nur das Ziel-Canvas, nicht das Malen; Regressionsschranke
  „0 schwarze Flächen" als `npm run verify:terrain` (Muster m10-terrain-hole-guard,
  flood-fill r,g,b<6, Regionen ≥ 300 px, 3 Formate) — gelaufen nach K2: **PASS, maxRegion
  0/0 (Start/Ende) in 960x540 / 1280x720 / 1920x1080**, Ratio 0,64 im Korridor, Renderer
  gültig (Mesa Intel RPL-S).

## K4 — Nachher-Messung — teilweise belegt, Tune-Suchlauf ABGEBROCHEN (dokumentiert)

### Nachher (gleicher 40-s-M25-Harness wie K1, `after-local-r1.json`, gleicher Renderer)

| Kennzahl | Vorher (before-local.json) | Nachher (after-local-r1.json) |
|---|---|---|
| p50 / p95 / **p99** (ms) | 16,7 / 33,2 / **49,9** | 16,7 / 16,8 / **16,8** |
| worst (ms) | 66,8 | **16,8** |
| jankyPct (dt > 16,9) | 5,11 % | **0 %** |
| Heap-Drops / dt max danach | 67 / 49,9 ms | 48 / 16,8 ms |

Ziel „p99 < 20 ms" ist damit formal erreicht — **aber mit wichtiger Einschränkung**: im
Nachher-Fenster gab es 0 Chunk-Grenzüberfahrten (0 Installs/Builds, Chunk-Texturen konstant
30; der autoPlay-Bot-Pfad ist nicht dt-deterministisch). Der Vergleich belegt also die
allgemeine Tail-Entfernung, NICHT das Verhalten speziell an Chunk-Übergängen. Dafür steht der
Pixel-Scan (verify:terrain nach 8-Richtungen-Walk mit garantierten Überfahrten: 0 schwarze
Flächen, Ratio ok) — Renderkorrektheit an Übergängen ist belegt, die Frame-Zeit dort nicht.

### Tune-Suchlauf (`scripts/tune-chunk-budget.mjs`) — ABGEBROCHEN, nicht wiederholt

Supervisor-Abbruchkriterium greift: zwei Starts (14:20, 14:46) lieferten KEIN Ergebnis,
weil `/home/ai/games/.lf-perf.lock` an anderen Lanes dauerhaft belegt war (m10-heap-budget,
dann m10-v10-gate-guard mit fullrun) — beide Läufe endeten am `flock -w`-Timeout
(leeres Log `~/tmp/m10-ground-chunk-budget-tune.log`, rc=1), KEIN Kandidat wurde gemessen.
Nach Supervisor-Anweisung nicht wiederholt. Konsequenz: die eingefrorenen Default-Werte
(Budget 22 ms / Defer 3) sind unoptimiert — gewählt nach Argument (knapp über 60-Hz-Frame,
unter dem 33-ms-Spike-Niveau), nicht nach Messung. Der Suchlauf ist nach dem Merge in
einzelnen Kommandos nachholbar:

    node scripts/tune-chunk-budget.mjs    # Limit 12 Kandidaten, automatisch p99 + Pixel-Scan

### Gerät (verbindliche Nachmessung nach dem Merge)

Die device-bridge baut nur committierten main-HEAD; nach dem Merge:
`POST /install` → `node scripts/m10-v10-device-gfxinfo.mjs` — Kriterien: gfxinfo-p99 < 20 ms,
janky-Delta gegen die Akzeptanz-Baseline (13,44 %/13,90 %), 0 JS-Fehler.
