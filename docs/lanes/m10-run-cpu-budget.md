# Lane m10-run-cpu-budget (M10, 2026-11-28)

Ziel: Android-/Tablet-Blocker auf dem **CPU-Anteil** angehen. Hartes, hostunabhaengiges Tor:
**JS-Frame-Zeit (update+render CPU-ms p95)**, Beleg auf iGPU `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(Renderer-String im Beleg-JSON). Kein FPS-Tor im Container.

- Mess-Skript: `scripts/m10-run-cpu.mjs` (Playwright + CDP, Chaos-Lauf: Seed 1, skipTo(1500) = Minute 25,
  6 Evolutionen + 6 Passives St. 5, 500 Gegner gehalten, god/autoplay, 20 s Messfenster, Viewport 640x360).
  Gemessen wird pro Frame die CPU-Zeit des rAF-Callbacks (JS update+render ohne GPU-Wartezeit) plus
  Allokations-Telemetrie (in-page `performance.memory`-Delta + CDP Sampling-Heap-Profiler) und
  Top-CPU/Top-Alloc-Sites (Attribution K2). Läuft OHNE flock (kein FPS/Echtzeit-Lauf).

## K1 — Vorher-Messung (Karte #11752)

Belege (außerhalb des Repos): `~/games/.evidence/m10-run-cpu-budget/m10-run-cpu-before.json`
(Skript schreibt nach `shots/m10-run-cpu-before.json`, `shots/*` ist gitignored).

| Metrik | Wert |
|---|---|
| Renderer | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` |
| jsFrameCpuMs p50 / **p95** / p99 | 0.10 / **5.50** / 7.40 ms (mean 1.07, max 34.1) |
| Frames gemessen | 2398 (20 s @ ~120 fps headless; CPU-ms ist der Vergleichswert, nicht FPS) |
| Gegner im Fenster | 500 gehalten (avg), 41 249 Kills im Chaos-Lauf |
| Allokationen | 891 B/Frame (sampling), Heap-Wachstum im Fenster 0 B (GC-sauber) |
| JS-Fehler | 0 |

Hinweis zur Skala: Headless-Host läuft mit ~120 fps und sehr schnellem Desktop-CPU-Kern — die absoluten
CPU-ms sind niedrig; gemeint ist das relative Vorher/Nachher-Delta auf identischem Setup (Android-Proxy /
Gerätetelemetrie liegt außerhalb dieser Lane, siehe `Wissen/Android-Optimierung-Praxis.md`).

## K2 — Attribution (Karte #11753)

Methode: derselbe Chaos-Lauf, unminifizierter Build (`npx vite build --base ./ --minify false`, nur temporär in
`dist`, danach normaler Build) → lesbarer Bundle-Code; Isolations-Probe `~/tmp/m10-run-cpu-budget/isolate-probe.mjs`
(läuft OHNE rAF-CPU-Wrapper) beweist, dass der Top-Alloc-Site „(anonymous) @ :14“ (34–47 %) **Mess-Harness-Rauschen**
ist (HeapNumber-Allokationen des Wrappers), nicht Spielcode.

Belege: `~/games/.evidence/m10-run-cpu-budget/m10-run-cpu-attrib.json` (Attributions-Lauf) +
`m10-run-cpu-no-raf-probe.json` (Isolationsprobe).

### Top-3 im Run.ts update-Loop (Datei + Zeile + Hebel)

| # | Quelle | Ort | Mechanismus | Hebel (K3) |
|---|---|---|---|---|
| A | **KI-Param-Objekt je Gegner je Schritt** | `src/scenes/Run.ts` updateEnemies, stepEnemyAi-Aufruf (~1012–1020) | Objekt-Literal `{archetype,tier,x,y,playerX,playerY,speed}` pro Gegner pro Sim-Schritt ≈ 30 000 Objekte/s bei 500 Gegnern (junger Gen, GC-Druck → p95/ms-Spitzen) | hoisted Feld, Felder je Aufruf mutiert (stepEnemyAi liest synchron, keine Retention → bitgleich) |
| B | **Sim-Kontext + Closures je Schritt** | `src/scenes/Run.ts` simulate (~604–654) | `combat.update({...})`-Literal, `onHit`/`onHeal`-Closures, `enemyShots`-/`hazards`-/`pickups`-Closures, Pickup-View `{x0..y1}`, `resolvePlayerGap({ignore})` — je 1×/Schritt ≈ 400 Allokationen/s | hoisted Instanz-Arrow-Funktionen + wiederverwendete Kontextobjekte |
| C | **`splits`-Array je Schritt** | `src/scenes/Run.ts` collectKills (~1136) | frisches `EnemyRuntime[]` pro Schritt | Scratch-Feld mit `length = 0` |

### Benannt, aber außerhalb des Claims (nicht in Run.ts fixbar)

- `source.onended @ phaser:147728` (~141 B/Frame): WebAudio-`createBufferSource`+Closure **je SFX** (Phaser Sound,
  getriggert vom AudioSystem) — Claim AudioSystem/Lane fremd; größter verbleibender Alloc-Posten.
- `tick @ gfx:375` (~B/Frame): FPS-Supervisor des renderBuffer-Monitors (Telemetrie, kein Gameplay).
- `EnemyPool.spawn`/`stepEnemyAi`-Rückgabe/`resetAiState` (~27 B/Frame je): Pools/Logik `src/systems`/`src/logic` fremd.
- `StableSort`/`batchSprite`/`render` (CPU): Phaser-Renderer + Tiefensortierung — engine-seitig, kein Run.ts-Hebel.

## K3/K4 — offen
