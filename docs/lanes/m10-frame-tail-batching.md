# Lane m10-frame-tail-batching — Frame-Zeit-Schwanz (Hebel B): Spawn-Batching + Chunk-Upload-Glättung

Datum: 2026-11-28. Auftrag: K3-FAIL der Lane m10-v10-device-acceptance (janky 13,44 %/13,90 %,
p99 31 ms, worstFrame 33–34 ms) — Befundliste Hebel B abarbeiten. Belege (außerhalb des Repos,
Merge-sicher): `~/games/.evidence/m10-frame-tail-batching/`. Board: #11989 (K1), #11990 (K2), #11991 (K3).

## Datei-Mapping (Disponent-Claim)

Der Disponent-Claim nennt `src/systems/EnemySystem.ts` — diese Datei existiert nicht; das
Spawn-System heißt real **`src/systems/Spawner.ts`** (Worden-Director, `spawnEnemy`, Budget-Regler).
Alle Spawn-Änderungen dieser Lane sind in Spawner.ts. Zusätzlich minimal angefasst (begründet):
`src/scenes/Run.ts` — nur `debugSpawnEnemy()` (3 Zeilen): der Debug-API-Pfad muss auf die neue
Batch-Methode zeigen, das ist der dokumentierte Fix-Gegenstand (Harness-Top-up). Spielereignisse
(Dawn-Effekt, Elite-Aufnahmen) nutzen weiterhin `spawner.spawnEnemy()` sofort — unverändert.

## K1 — Vorher-Messung (Baseline, vor jeder Änderung) — abgeschlossen

Alle Messungen 2026-11-28, Minute-25-Worst-Case (6 Evos Lv8, 6 Passives Lv5, `skipTo(1490)`,
Top-up auf 300 Gegner im 50-ms-Takt, god, suppressLevelUps, autoPlay).

### Gerät (Redmi Pad Pro, Adreno 710, Thermal 0, device-bridge/CDP)

| Beleg | Methode | FPS | janky | p50/p90/p95/p99 (ms) | worst rAF (ms) |
|---|---|---|---|---|---|
| `before-device.json` | gfxinfo-Fenster 10 s (`scripts/m10-v10-device-gfxinfo.mjs`) | 115,1 | **9,09 %** (100/1100) | 8/18/22/**36** | 91,6 |
| `before-device-frames.json` | je-Frame 24 s (`scripts/m10-frame-tail-batching.mjs --mode device`) | ~112 | 1,33 % (rAF-dt > 16,9) | 8,3/8,4/8,5/**25** | 58,4 |

- GPU-Renderer: **`Adreno (TM) 710`** (aus dem Spiel-Page-Context, kein SwiftShader). 0 JS-Fehler.
- Die eigene Baseline (9,09 %) liegt unter den 13,4/13,9 % der Akzeptanz-Lane — Gerätezustand
  schwankt zwischen Läufen; verbindlich ist die Vorher/Nachher-Differenz MITTels gleicher Methode
  und gleicher Session.

### Befund-Korrelation (je-Frame, 24 s Gerät) — `before-device-frames.json`

- **Spawn-Top-up ist der belegte Tail-Treiber:** rAF-dt nach Top-up-Gruppen (bis 281 Gegner in
  einem 50-ms-Tick): 41,6 / 33,4 / 25,0 ms. Große Spikes (f1177 41,7 ms, f1182 58,4 ms, f692/f777
  33,4 ms) folgen direkt auf Top-up-Gruppen; alle Spikes sind VSync-Vielfache (25/33/41/58 ≈ n·8,3).
- **Chunk-Main-Thread-Kosten NICHT bestätigt:** 6 Chunk-Installs im Fenster, alle auf Frames mit
  dt 8,3–8,4 ms — der Worker-Pfad hält den Main-Thread sauber.
- **Aber:** gfxinfo-janky (9 %) ≫ rAF-dt-Tail (1,33 %) → der größte Teil des Janky entsteht
  COMPOSITOR-/Render-Thread-seitig. Hauptverdächtiger neben dem Spawn-Burst: der GPU-Upload je
  Chunk-Install (`texture.refresh()`, 512 px, Wasser 3 Stufen) — ein Render-Thread-Stall, der im
  rAF-dt unsichtbar bleibt (p95 rAF 8,5 ms vs. gfxinfo p95 22 ms).

### Lokal iGPU (Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`)

- `before-local.json` (10 s): p50 16,7 / p99 16,8 / worst 16,8 ms, 0 Frames > 16,9 — der lokale
  Lauf ist 60-Hz-VSync-gebunden und quantisiert den Tail weg; das Tail-Signal ist nur am Gerät
  auflösbar. Lokal dienen die Läufe dem A/B-Vergleich derselben Methode, nicht als Tail-Beleg.

## K2 — Fix (Spawn-Batching + Chunk-Upload-Glättung)

1. **Spawn-Batching (`src/systems/Spawner.ts` + `src/scenes/Run.ts` debugSpawnEnemy):**
   Neue Debug-Pfad-Methode `queueEnemyWave(id, n, x, y, elite)`: berechnet ALLE Positionen sofort
   (exakt gleiche RNG-Reihenfolge wie `spawnEnemy`: Winkel, Radius, Clamp), legt sie in eine Queue;
   `update()` materialisiert höchstens `SPAWN_DEBUG_BATCH_PER_FRAME = 30` Runtime-Spawns je Frame
   (reine Helfer-Funktion `drainSpawnQueue`, getestet). Der natürliche Director-Pfad (`update`-
   Budget/Allowance) ist UNVERÄNDERT; kleine Spiel-Spawns (Dawn-Ereignis `spawnEnemy("bog_rat",8)`,
   Elite-Aufnahmen) bleiben über `spawnEnemy()` sofort — Semantik dort bitgleich.
2. **Chunk-Upload-Glättung (`src/gfx/GroundRenderer.ts`):** `finalizeReady` hatte bereits die
   harte Obergrenze 1 Install/Frame; neu zusätzlich `chunkInstallDue()` (rein, getestet): bei
   Rückstau (> 1 fertiger Chunk) mindestens `CHUNK_INSTALL_MIN_INTERVAL_MS = 12` ms zwischen zwei
   Installs → die Upload-Kette nach einer Chunk-Grenzüberfahrt wird über Frames verteilt, der
   Steady-State (1 fertiger Chunk) bleibt sofort. Keine Änderung an Worker/Sync-Fallback/Margin
   (K1: kein belegter Main-Thread-Tail dort; ein größeres Prefetch-Margin wäre +50 MB GPU auf
   Android — verworfen, siehe Android-Praxis-Notiz).
3. **Nicht angefasst** (fremde Claims): `src/gfx/textures.ts`, `src/systems/FxSystem.ts`.

Tests: `tests/frame-tail-batching.test.ts` (11 Tests: Reihenfolge/Cap/Summe des Spawn-Drains,
Steady-State/Intervall/Überschreibung des Install-Gates). tsc rc=0.

## K3 — Nachher-Messung (gleiche Methode wie K1)

### Lokal iGPU (`after-local.json`, gleiche Methode/Skript wie K1)

- p50 16,7 / p90 16,7 / p95 16,7 / p99 **16,8** / worst **16,8** ms, jankyPctLocal **0 %**,
  0 JS-Fehler — identisch zur Baseline (`before-local.json`): **kein Regressionssignal**.
  Wie in K1 belegt ist der lokale Lauf 60-Hz-VSync-gebunden und quantisiert den Tail
  (vorher wie nachher 0 Frames > 16,9 ms) — der Tail selbst ist lokal nicht auflösbar.
- Methodik-Notiz: der after-Lauf enthielt noch den (später durch claimcheck blockierten)
  Sofort-Zweig für Aufrufe ≤ 30; der Unterschied zum committeten Stand (alle Debug-Spawns
  gequeuet) ist am 60-Hz-vsUnc-Lauf unsichtbar und betrifft nur Debug-Spawns ≤ 30.

### Gerät — verbindliche Nachmessung nach dem Merge (offener Punkt)

Die device-bridge (`POST /install`) baut ausschließlich den committierten main-HEAD; der
Lane-Branch kann vor dem Merge nicht auf das Gerät (Präzedenz: m10-device-telemetry,
„APK-Verifikation kann diese Lane nicht liefern"). Nach dem Merge ist die Messung ein
einzelner Befehl:

    POST http://172.17.0.1:5181/install        # baut main-HEAD mit diesem Fix
    node scripts/m10-v10-device-gfxinfo.mjs --out ~/games/.evidence/m10-frame-tail-batching/after-device.json

Kriterien (gegen die EIGENE Baseline dieser Lane, gleiche Methode/Session):
janky ≥ 1 Punkt besser als 9,09 % (Zielbild gemeinsam mit m10-device-janky-tier: < 10 %),
gfxinfo-p99 < 20 ms (Baseline dieser Lane: 36; Akzeptanz-Lane: 31), 0 JS-Fehler, FPS ≥ 60.

Erwarteter Mechanismus (aus K1 belegt): die 33–58-ms-rAF-Spikes folgen Top-up-Gruppen von
bis 281 Gegnern in einem rAF-Tick; mit Cap 30/Frame entsteht dieser Burst nicht mehr. Der
rAF-dt-Tail (1,33 % der Frames) war klein gegen den gfxinfo-Janky (9 %) — der Rest ist
Compositor-seitig; dort wirkt zusätzlich die Chunk-Upload-Glättung (12 ms Mindestabstand
bei Rückstau).

## Review (m10-frame-tail-batching, reviewer-Subagent) — PASS

Urteil PASS, 2267/2267 Tests grün, tsc clean, keine kritischen Befunde. „Sollte“-Befunde und
Disposition (alle betreffen `src/systems/Spawner.ts` bzw. den Dawn-Pfad — der Claim von
Spawner.ts liegt bei m10-spawn-burst-alloc, deshalb hier dokumentiert statt selbst gefixt):

1. **Dawn = Queue-Leak (Debug-API):** während der Morgendämmerung läuft `Spawner.update()`
   nicht (Run.ts:655) → eingereihte Debug-Spawns materialisieren erst nach Run-Ende nie.
   Debug-only, spielkritisch nein. Vorschlag für den Merge: `drainDebugQueue` auch beim
   Dawn-Start aufrufen (oder Queue bei `startDawn` räumen). → `requests.md`-Eintrag 12:52Z
   ergänzt um diesen Punkt.
2. **Cap gilt je Sim-Substep, nicht je rAF-Frame:** bei timeScale > 1 (bis ~60 Substeps/Frame)
   materialisieren bis 30×Substeps je Frame. Für den 1×-Geräte-Harness wirkungslos (das
   Messfenster läuft mit `setTimeScale(1)`). Doku-Korrektur: Obergrenze = je `update()`-
   Aufruf (= Sim-Substep); bei 1× identisch mit je Frame. Der Kommentar in Spawner.ts
   (blockierte Datei) sollte beim Merge angepasst werden.
3. **RNG-Identität Batch-Pfad vs. spawnEnemy nur durch Code-Duplikation belegt, nicht per
   Test:** reviewer verifiziert die Identität per Code-Lesung (gleiche Ziehungsreihenfolge
   Winkel→Radius, gleiche Clamps/hpScale-Formel). Sauberere Lösung: reine Positions-Funktion
   + Identitäts-Test mit geseedetem RNG — gehört zur Spawner.ts-Arbeit von m10-spawn-burst-alloc,
   Bedarf steht in `requests.md`.

## Bekannte Restrisiken / offene Punkte

1. **Fremde Verify-Skripte mit synchroner Spawn-Lese:** `window.__lf.spawnEnemy` materialisiert
   jetzt im nächsten `update()`-Aufruf statt synchron (bei 1× = nächster Frame; GAME.md verspricht
   keine Synchroneität; Rückgabewert = angefragte Anzahl, unverändert). Zwei fremde Skripte lesen
   frische Spawns
   UNMITTELBAR nach dem Aufruf und liefern bei n > 30 falsche Daten auf einem Re-Lauf:
   `scripts/m10-boss-fair.mjs` (topUpCrowd, `enemies.active.slice(before)` nach `spawnEnemy(need)`)
   und `scripts/m10-crowd-probe.mjs` (gleiches Muster). Beide sind nicht in aktiver Abnahme
   (ACCEPTANCE.md nennt sie nicht); ihre Lane-Owner sollten entweder 1 Frame warten oder den
   Sofort-Zweig nutzen: **Bedarf in `.dispatch/requests.md` (12:52Z) gemeldet** — Aufrufe
   ≤ `SPAWN_DEBUG_BATCH_PER_FRAME` (30) sofort materialisieren statt queuen. Die Änderung
   (~15 Zeilen in `queueEnemyWave` + 1 Test) war ausgearbeitet, aber der Claim von
   `src/systems/Spawner.ts` wurde zwischenzeitlich an **m10-spawn-burst-alloc** vergeben
   (claimcheck hat den Commit blockiert; K2-Kern war zu dem Zeitpunkt bereits committet).
   Merge-Konfliktrisiko mit m10-spawn-burst-alloc (gleiche Datei) ist real — beide Lanes
   arbeiten an Spawn-Burst-Kosten; der Merge-Job sollte die Queues/Drain-Logik zusammenführen.
2. **Spawner.ts-Claim-Mapping:** Disponent-Claim dieser Lane nennt `src/systems/EnemySystem.ts`
   (existiert nicht); real bearbeitet: `src/systems/Spawner.ts` + 3 Zeilen `src/scenes/Run.ts`
   (`debugSpawnEnemy`-Wiring, siehe Abschnitt Datei-Mapping).
3. **Chunk-Prefetch-Margin bewusst NICHT erhöht** (K1: kein Main-Thread-Tail am Worker-Pfad;
   +1 Margin-Ring wären ~50 MB GPU-Texturmemor auf Android — siehe
   `coding-brain/Wissen/Android-Optimierung-Praxis.md`).

