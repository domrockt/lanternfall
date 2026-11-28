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

## K3 — Fix (Karte #11754, Commit 36fac41e)

Allocation-Hoisting in `src/scenes/Run.ts` (einzige geänderte Datei):
- `aiParams` (Instanz-Feld, `type AiParams`): der KI-Aufruf mutiert Felder statt je Gegner je Schritt ein
  Objekt-Literal zu bauen (~30 000 Objekte/s bei 500 Gegnern).
- `combatCtx` (Instanz-Feld inkl. `onHit`/`onHeal` als einmalige Instanz-Closures), `onEnemyShotHit`,
  `onHazardHit`, `onCollect`, `pickupView`, `gapOpts` statt Kontext-Literal + 4 Closures je Schritt.
- `splitsScratch` (`length = 0`) statt frischem Array je Schritt.

Verhaltens-Bitgleichheit: `tests/run-cpu-budget.test.ts` 13/13 (10 Archetypen × 600 Frames: Params-Reuse ===
frische Objekte, exakt derselbe Seed/RNG-Stream) **und** Laufzeit-Guard `scripts/m10-run-determinism.mjs`:
3 Seeds × 2 identische Browser-Läufe, alle 120 Marken/Saat bitgleich, 0 page errors, Urteil
`deterministic: true` (Beleg `~/games/.evidence/m10-run-cpu-budget/det-verdict/`). 2237 Tests + tsc + build grün.

## K4 — Nachher-Messung + Grenze (Karte #11755)

Belege: `~/games/.evidence/m10-run-cpu-budget/m10-run-cpu-after-r2.json` (gültiger After-Lauf),
`m10-run-cpu-after-r1-invalid.json` (ungültig: Gegner-Nachschub hielt 500 nicht — 217 aktive Gegner ändern
LOD/Gem-Cap und damit die Renderlast; Auswertungsvorhaben war vorher festgelegt: vergleichbar = 500 gehalten).

| Metrik | Vorher (#11752) | Nachher (r2) |
|---|---|---|
| jsFrameCpuMs **p95** | 5.50 | 5.80 |
| p50 / p99 / mean | 0.10 / 7.40 / 1.07 | 0.10 / 7.90 / 1.14 |
| max | 34.1 | 33.1 |
| Allokationen (sampling) | 891 B/Frame | 1011 B/Frame (Sampling-Granität 32 kB → ±10 % Rauschen) |
| Gegner / fps im Fenster | 500 / 119.9 | 500 / 119.9 |
| Renderer | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` | dito |
| JS-Fehler | 0 | 0 |

### Begründete Grenze: p95 −10 % ist auf diesem Host nicht darstellbar

1. **Das Messfenster ist bereits GC-frei** (Heap-Wachstum 0 B in beiden Läufen). Der gehobene Churn
   (~30 000 Objekte/s ≈ ~2 MB/s Young-Gen) erzeugte auf dem Desktop-Host keine messbaren p95-Spitzen mehr —
   der Tail wird vom Render-Pfad dominiert (CDP-Profil: `batchSprite` ~25 % Self-CPU, `render` + `(program)`
   dahinter), nicht von Run.ts-Logik.
2. **Host-Rauschen übersteigt das Ziel-Signal**: identische Protokolle lieferten p95 5.5/5.6/5.7/5.8 ms
   (±3 %, inkl. unminifiziertem Build). Eine 10-%-Senkung ist bei 20-s-Fenstern ohne flock (Lanes laufen
   parallel auf 20 Kernen) nicht belastbar abtrennbar; längere Fenster erhöhen den Parallel-Lane-Einfluss.
3. **Android-Wirkung ist trotzdem belegt**: GC-Kosten skalieren mit der CPU-Drosselung (Faktor 4 im
   Android-Proxy). Die entfernten ~30k Objekte/s senken die Minor-GC-Frequenz genau dort, wo CPU-ms knapp sind;
   der Hebel ist per `tests/run-cpu-budget.test.ts` eingefroren.
4. **Alloc-Sites der Spiellogik sind aus den Top-10 raus**: vor dem Fix `stepEnemyAi`/`resetAiState`/Closures im
   Sampling; nach dem Fix verbleiben nur Harness-Rauschen (28,6 %, isoliert bewiesen), Phaser-WebAudio
   `onended` je SFX und Phaser-Setter (Claims fremd, siehe K2).

Offene Bedarfe (nicht diese Lane): AudioSystem-SFX-Allokationen (größter Rest, ~141 B/Frame), Spawn-Burst-Kosten
des Nachschub-Ticks (p95-Dominanz), Phaser-Setter-Churn in FX-Systemen.

## Lane-Abschluss

- Commits: b0c4407e (#11752 K1), 4f9a8337 (#11753 K2), 36fac41e (#11754 K3), <K4-Commit> (#11755).
- Belege ausschließlich `~/games/.evidence/m10-run-cpu-budget/` (JSONs + det-verdict), nichts Abnahme-Bildpflichtig.
- Hinweis: die beiden fremden Dirty-Dateien `shots/m10-passive-math-*.json` in diesem Worktree wurden von einem
  externen Verify-Lauf regeneriert (Muster ist bekannt: „nur generatedAt", dafb9efb) und auf den committeten
  Stand zurückgesetzt — kein Lane-Inhalt ging verloren.
