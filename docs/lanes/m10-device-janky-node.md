# Lane m10-device-janky-node — Geräteknoten unter Minute-25-Last auf medium-Budget

**Auftrag:** v10-device-acceptance K3 FAIL (gfxinfo janky 13,44 %/13,90 %, Tor < 10 %) — Hebel A.
Das Redmi Pad Pro (SM7435, „Adreno (TM) 710“, DPR 2, 120-Hz-Panel) bleibt unter Minute-25-Last
dauerhaft auf `quality="high"` (109–115 FPS Durchsatz), weil der stepQuality-Regler
(Schwellen 45/57 FPS in `src/logic/quality.ts`) nie Budget-Mangel sieht — aber ~13 % der Frames
liegen über ~16,6 ms. Diese Lane schneidet den Fix NUR in `src/config.ts` (Geräteknoten-Erkennung,
`installRenderBudget`) und `src/systems/FxSystem.ts` (Pool-Caps); `src/logic/quality.ts` ist von
m10-props-always-visible belegt und wurde NICHT angerührt (Guard-Test pinnt die Schwellen).

**Bereich (Disponent):** `src/config.ts`, `src/systems/FxSystem.ts`, `tests/device-janky-node.test.ts`,
`scripts/m10-device-janky-node.mjs`, `docs/lanes/m10-device-janky-node*`. Board-Karten #11969–#11972.

## Wichtiger Methodik-Befund: Gerät misst die INSTALLIERTE APK, nicht den Worktree

Die device-bridge startet die **installierte APK** (`de.domrockt.lanternfall`), deren WebView das
Spiel selbst über einen lokalen Server (`127.0.0.1:35053/index.html?debug=1`) ausliefert — die
Asset-Hashes zeigen: das war der Hourly-Main-Build (12:00), NICHT der Lane-Stand. Beide Messungen
einer „Vorher/Nachher“-Kette sind nur vergleichbar, wenn zwischendurch die Lane-APK installiert
wird. Sanctionierter Weg (Team/Infrastruktur.md Z.106, Fix von Dora 09:46Z):

    POST http://172.17.0.1:5181/install?lane=m10-device-janky-node

baut aus dem **committierten Lane-HEAD** (eigener Detached-Worktree) nach
`~/lf-apk/out-lane/m10-device-janky-node.apk` und installiert. Falle: nur committete Arbeit kommt
mit — uncommittete Änderungen fehlen still. `.apkbuild/dist` (Hourly-Main) wurde von dieser Lane
NICHT angefasst.

Verifikation nach Install: `window.__lf.state().quality` am Gerät = **"medium"** (vorher "high"),
DPR 2 — der Tier-Cap greift ab Boot (siehe K2).

## K1 — Vorher-Baseline (Pflicht vor dem Fix) — **gemessen, committet**

Skript: `scripts/m10-device-janky-node.mjs` (Basis `m10-v10-device-gfxinfo.mjs`, erweitert um
Renderer-String/DPR-Pflicht, 1 Fenster OHNE Spawn-Top-up — Methodik-Hinweis Befund 3 der Vor-Lane —
und rAF-Framezeit-Perzentile je Fenster; gfxinfo-Differenz vor/nach je 10-s-Fenster).

**Erste Messung (12:31, gegen die ausgelieferte Main-APK — der reale Vorher-Stand des Geräts):**
Beleg `~/games/.evidence/m10-device-janky-node/k1-baseline-device.json` (Kopie committet als
`docs/lanes/m10-device-janky-node-baseline.json`). Renderer **„Adreno (TM) 710“** (Pflicht, kein
SwiftShader), DPR 2, Thermal 0.

| Fenster | FPS | Frames | Janky | janky % | p95 (rAF) | worst |
|---|---|---|---|---|---|---|
| m25-topup-1 | 114,7→ | — | — | — | — | — |
| m25-topup-2 | — | — | — | — | — | — |
| **M25-Aggregat (Fenster 1+2)** | **115,1** | 2172 | 226 | **10,41 %** | 8,4 ms | — |
| m25-natural (ohne Top-up) | 118,5 | — | — | **10,20 %** | 8,4 ms | — |

Tor < 10 %: knapp verfehlt (Vor-Lane: 13,44/13,90 % — das Gerät war heute schon besser; Methodik
identisch, Messtiefe 3 statt 2 Fenster). `state().quality` durchgehend **"high"** → Hebel A
(Tier bleibt hoch) bestätigt am echten Gerät.

Zusätzlich gemessene Zwischenstände (gleiche Methode, Main-APK): 10,30 % M25-Aggregat @ 109,4 FPS
(`k3-after-device.json` — siehe K3-Abschnitt, warum das KEIN Nachher ist).

## K2 — Fix: Geräteknoten-Erkennung + Tier-Cap + Pool-Caps — **implementiert, committet**

- `src/config.ts`:
  - `isDeviceNode(renderer, dpr)` (rein): NUR `"Adreno (TM) 710"` + DPR ≥ 2. Desktop/iGPU
    (Mesa Intel, Apple, NVIDIA, SwiftShader) fallen nie hinein. 120 Hz werden bewusst nicht
    geprüft (im Browser unzuverlässig; Renderer + DPR sind eindeutig genug).
  - `clampTierMax(tier, cap)` (rein, Ordnung über `QUALITY_ORDER`), `DEVICE_TIER_CAP = "medium"`.
  - `probeDeviceNode()`: einmalige WebGL-Probe im `tick()` von `installRenderBudget` (unabhängig
    vom Game-Boot; in Vitest/Node passiv → Desktop bitgleich).
  - Im `tick()`: `const baseTier = DEVICE_NODE ? clampTierMax(qState.tier, DEVICE_TIER_CAP) : qState.tier;`
    → das Gerät startet in medium und kommt nie zurück auf high; Abstieg auf low/thermal bleibt
    offen (Regler-Schwellen in quality.ts UNVERÄNDERT, Reviewer-Pin in
    `tests/device-janky-node.test.ts`).
  - `DEVICE_MAX_FX_ACTIVE = qualityBudgetFor("medium").maxFxSprites` (= 140),
    `DEVICE_MAX_PARTICLES = 240` (Proportion 140/220 auf 360).
- `src/systems/FxSystem.ts` (Stellen 226/323/667/754 des Briefings):
  - FxSystem `maxActive`: Feld und `setMaxActive()` am Geräteknoten auf 140 geklemmt
    (`DEVICE_NODE ? Math.min(x, DEVICE_MAX_FX_ACTIVE) : x`) — wirkt unmittelbar auf den Frame-Tail.
  - ParticleSystem `maxActive`: analog auf 240 (Feld + `setMaxActive()`).
- Desktop/iGPU: `DEVICE_NODE = false` → alle Pfade bitgleich (`min(x, x) = x`).
- `tests/device-janky-node.test.ts` (13 Guards): Erkennung, Deckel-Ordnung, Desktop-Bitgleichheit
  (Caps 220/360 unverändert per Spawn-Zählung), Quell-Pins der Verdrahtungsstellen + Pin, dass
  quality.ts-Schwellen (45/57 FPS, 3 s/12 s) unverändert bleiben.
- **Fremd-Berührung (unvermeidbar, minimal):** `tests/thermal-wiring.test.ts` pinnte die alte
  Ausdrucksform `effectiveQuality(qState.tier, …)`; ein Pin nutzt jetzt `baseTier` (der Writer
  bleibt `effectiveQuality`, keine Verhaltensänderung). Grund: der Tier-Cap sitzt genau zwischen
  Regler und Writer.

## Desktop/iGPU unverändert (Vorher/Nachher-Belege)

- **Golden-Frame-Guard als A/B-Vergleich:** `scripts/m10-golden-frame.mjs` (3 Seeds × 2 Reps,
  deterministisch, Renderer Mesa Intel RPL-S = iGPU, kein SwiftShader) lief gegen den
  Vorher-Build (K1-Commit, Temp-Worktree `~/tmp/m10-device-janky-node/vorher-wt`) und den
  K2-Build: **Hashes je Seed identisch** (`9d3f3b2a…`, `b4555df0…`, `a9f247a9…`) → Desktop-
  Simulation bitgleich. (Beide Builds divergieren gleichermaßen von der committeten Golden-
  Baseline — vorbestehend, nicht von dieser Lane; Endzustände matchen die Baseline.)
- **Pixel-identisches Vorher/Nachher-Bild:** deterministischer Run-Screen
  (`?debug=1&seed=101&detstart=1`, pausierter Startzustand, Kael): Vorher vs. Nachher
  **AE = 0.0, 0/518400 Pixel differieren** (960×540, Mesa Intel RPL-S, quality "high",
  0 JS-Fehler). Bilder: `~/tmp/m10-device-janky-node/desktop-run-vorher.png` /
  `desktop-run-nachher.png` (Kopien in `~/games/.evidence/m10-device-janky-node/`).
- Suite: 2269 Tests grün (203 Dateien), `npm run build` rc=0, `tsc --noEmit` rc=0.
