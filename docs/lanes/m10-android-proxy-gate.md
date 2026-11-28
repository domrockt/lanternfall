# Lane m10-android-proxy-gate — Android-Ersatztest für Perf-Lanes

Ziel: ein automatischer Android-Ersatztest (Regel 9 aus
`Wissen/Android-Optimierung-Praxis.md`), den **jede Perf-Lane** vor/nach einer
Perf-Änderung laufen lässt, damit CPU-/GC-Regressions sichtbar werden, bevor Dom
die APK auf dem Tablet anfasst.

## Was die Lane geliefert hat

| Karte | Ergebnis |
|---|---|
| #10625 K1 | `scripts/harness.mjs`: `androidProxyContext(browser)` — Playwright-Device `Galaxy Tab S4 landscape` (1138x712 CSS, dpr 2.25, Touch) + CDP `Emulation.setCPUThrottlingRate {rate: 4}`. Rein optional, bestehende Aufrufer unverändert. |
| #10626 K2 | `scripts/android-proxy.mjs`: Proxy-Lauf je Charakter (mira, kael): 6 Evolutionen (Stufe 8) + 6 Passiv-Items (Stufe 5), God + AutoPlay, Zeitraffer (30x) bis Minute 10, `skipTo(1490)` → Minute 25, 6 s Einschwingen, 60 s **Echtzeit**-Messung bei Minute-25-Dichte (Auffüllen auf 300 Gegnern mit zähen Tiers treant/abom, Sampling im Spawn-Fenster wie `perf.mjs`). Schreibt `shots/m10-android-proxy-<tag>.json` (Baseline-JSONs liegen wegen `shots/*`-Ignore unter `shots/abnahme/`). |
| #10627 K3 | Diese Doku. |

## So nutzt jede Perf-Lane den Proxy (vorher/nachher)

Vor der Perf-Änderung (Baseline), dann nach der Änderung, gleicher Befehl mit
neuem `--tag`:

```bash
npm run build                          # oder: Skript baut dist bei Bedarf selbst
flock /home/ai/games/.lf-perf.lock node scripts/android-proxy.mjs --tag <vorher>
# ... Änderung umsetzen ...
flock /home/ai/games/.lf-perf.lock node scripts/android-proxy.mjs --tag <nachher>
```

* **Immer mit `flock /home/ai/games/.lf-perf.lock`** — Echtzeit-FPS-Messung
  (eine Sperre, kein Home-Pfad mehr).
* Laufzeit ~4–5 min (2 Charaktere je Zeitraffer + 60 s Messung).
* Vergleich in der Lane-Doku: `fpsMedian` und `fpsP5` je Charakter,
  `frameP95`, `lodWorst` (quality-Stufe: full/reduced/minimal),
  `renderScaleWorst`, `heapMB.max`, `jsErrors`. **Regel 10:** jede Behauptung
  „schneller" braucht vorher/nachher-JSONs; „schneller, aber hässlicher"
  (lodWorst/renderScale schlechter bei gleichem FPS) ist kein Erfolg.
* Abnahmekriterium der Lane selbst (ausführen, nicht diskutieren): 2 Läufe,
  `fpsMedian`-Abweichung < 10 %, `passed: true` (0 JS-Fehler, Dichte erreicht,
  kein SwiftShader-Renderer), Baseline-JSON committet.

## Baseline (main-Stand, 2026-11-28)

Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein
SwiftShader, Beleg gültig. JSONs: `shots/abnahme/m10-android-proxy-baseline1.json`
und `...-baseline2.json` (Kopien: `~/games/.evidence/m10-android-proxy-gate/`).

| Charakter | fpsMedian | fpsP5 | frameP95 | lodWorst | Heap max | min/max Enemies |
|---|---|---|---|---|---|---|
| mira (Lauf 1 / 2) | 59.9 / 59.9 | 59.5 / 30 | 16.8 / 33.3 ms | minimal | 87.7 / 85.6 MB | 300 / 341–333 |
| kael (Lauf 1 / 2) | 59.9 / 59.9 | 20 / 59.5 | 50 / 16.8 ms | minimal | 89.7 / 88.9 MB | 300 / 331–331 |

Reproduzierbarkeit: Median-Abweichung 0 % (< 10 % gefordert), `passed: true`,
0 JS-Fehler in beiden Läufen. `lodWorst: minimal` ist bei ≥ 300 Gegnern das
korrekte Verhalten des LOD-Reglers, kein Defekt.

## Grenzen des Proxys — ehrlich

1. **CPU-Throttle griff im Baseline-Lauf kaum:** trotz
   `Emulation.setCPUThrottlingRate 4` läuft der Lauf mit ~60 FPS. Bei dieser
   Last ist der JS-Anteil pro Frame klein genug, dass die Drosselung das
   Bild nicht drückt. Der Proxy fängt dadurch *Allokations-/GC-* und
   *Logik-Regressions* (Heap-Wachstum, frameP95-Spitzen, JS-Fehler), aber
   **keine reine CPU-Knappheit** des Tablets.
2. **Kein GPU-/Treiber-Ersatz:** Mali/Adreno-Tile-Based-Verhalten, Overdraw-
   und Füllrate-Engpässe (Regel 2) werden auf der Intel-iGPU anders (teils
   gar nicht) sichtbar. ADD-Flächen-Regressionen zeigt der Proxy nur über
   `frameP95`-Ausreißer, nicht über echte GPU-Zeiten.
3. **Keine Thermik:** Regel 7 (10-min-Läufe, Drosselung nach 5–10 min) kann
   der Proxy nicht abbilden — er dauert ~5 min und der Host drosselt anders.
4. **Andere Auflösungs-Mechanik:** dpr 2.25 emuliert nur Viewport/UA/Touch;
   der adaptive Render-Skalen-Regler läuft hier mit dprCap 2 statt des echten
   Geräte-Panels.
5. **Synthetische Dichte:** die Minute-25-Dichte wird mit treant/abom
   aufgefüllt, nicht mit der echten Director-Mischung — konsistent zwischen
   vorher/nachher, aber nicht 1:1 das Spielgefühl.

**Echte Freigabe = Geräte-Telemetrie** (Regel 8): die APK schickt an
`http://10.10.50.185:5180/t`, Werte unter `~/games/.evidence/device/` bzw.
`GET /latest`. Der Proxy ist die *günstige Vorprüfung* im Harness; das
letzte Wort hat Doms Tablet.

## Offene Punkte / Beobachtungen (kein Kartenwechsel)

* `fpsP5` und `frameP95` schwanken zwischen Läufen (20–59.5 bzw. 16.8–50 ms),
  weil einzelne Spitzen einmal pro 60-s-Fenster erwischt werden oder nicht.
  Für Vorher/Nachher-Vergleiche deshalb **fpsMedian und Heap** primär
  bewerten, fpsP5/frameP95 nur bei konsistenter Verschiebung über 2+ Läufe.
* Fremde Reste im Worktree (`shots/m10-passive-math-*.json`, nur Zeitstempel)
  wurden vor dem K2-Commit zurückgesetzt — gehört nicht in diese Lane.
