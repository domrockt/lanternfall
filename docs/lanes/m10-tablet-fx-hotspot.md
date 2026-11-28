# M10-tablet-fx-hotspot — Fix des Geraete-Ruckelns (Blend-Flush-Explosion)

Datum: 2026-11-28. Lane: `m10-tablet-fx-hotspot` (Worktree `/home/ai/games/lf-lanes/m10-tablet-fx-hotspot`,
Branch `m10-tablet-fx-hotspot`). Auftrag: Root-Cause aus `m10-tablet-fx-rootcause` fixen — Blend-Wechsel/Frame < 8,
Optik unveraendert; Beleg lokal vorher/nachher + Android.

## K1 (entfiel hier) — Root Cause uebernommen

Bericht: `docs/lanes/m10-tablet-fx-rootcause.md` (Root-Cause-Lane). Kernaussage: Phaser flushed den Batch an jeder
ADD↔NORMAL-Grenze im depth-sortierten Walk; ADD-Glows des FxSystem lagen auf `DEPTH.fxLow` (7) mitten zwischen
NORMAL-Draws → 32 Blend-Wechsel/Frame bei vollem Evo-Stapel (lokal gemessen). Framebuffer: 0 nicht-null FB-Binds
lokal — der am Geraet gemeldete „+1/Frame“ ist im Evo-Stapel nicht reproduzierbar. Area-Kürzung laut Briefing:
`gen-fx.ts` gestrichen (Bericht nennt es nicht), `CombatSystem.ts` behalten (Bericht nennt es als Nachschub-Pfad),
zusaetzlich `ProjectilePool.ts` mit 2 Zeilen angerührt (nicht geclaimed, unten begründet).

## K2 — Fix: alle ADD-Glows in einem zusammenhaengenden Depth-Band (Commit 549c7801)

- **`FX_GLOW_DEPTH = DEPTH.fxLow + 0.5`** (zwischen NORMAL-FX-Formen 7 und Gegnern 9, Zeichenordnung aus GAME.md
  unveraendert — Glows zeichnen weiterhin unter Gegnern) in `src/systems/FxSystem.ts`; pure Helfer
  `glowDepthFor(baseDepth, glow)`.
- FxSystem + ParticleSystem: Tiefe an den Glow-Zustand gekoppelt — `spawn()` setzt `depthBase` und rendert
  `glowDepthFor(depthBase, glow)`; `setAlphaScale()` zieht die Tiefe mit, wenn ein Glow-Slot zu-/abgeht
  (NORMAL-Fallback bleibt auf seiner Basis-Tiefe, keine Insel im Band).
- **ADD-Inseln zugerollt** (Probe ~/tmp/m10-tablet-fx-hotspot/probe-add-depths.mjs fand sie):
  - `CombatSystem.ts`: Wrath-/Soul-Halos (makeImage-Pfad, ADD auf `DEPTH.trail` 6) → Band.
  - `ProjectilePool.ts` (2 Zeilen, **nicht geclaimed** — Begründung: unvermeidbar, die 8 ADD-Eis-Projektile
    lagen als Insel auf `DEPTH.death` 8 und haben das Ziel < 8 sonst verfehlt; Haken: claimcheck blockierte
    nicht, weil unclaimed; Disponent bitte beim Merge registrieren): ADD-Projektile → Band (bleibt unter
    Gegnern, death 8 → 7.5 ist keine Umdrehung der Ordnung).
- Nach dem Probe-Fix: 48/49 ADD-Sprites im Band (bleibt nur der Lichtkreis auf 20, Run.ts, nicht meine Datei).
- **Review-Fix (Kontrolleur FAIL → begrenzt):** `glowDepthFor` rueckt nur Sprites mit Basis-Tiefe <= death ins
  Band. Additive Treffer-/Tod-Bursts auf `enemyDeath` (11, CombatSystem shard-/dust-/sputter-/core-burst und
  Wrath-Treffer-Funken) behalten ihre Basis-Tiefe — unter Gegnern waeren sie im 300er-Gedraenge unsichtbar
  (dokumentierter Grund der Tiefe 11) und wuerden je Glow-Budget-Aufkommen poppen. Bewusste Rest-Inseln:
  enemyDeath-Bursts (11), EnemyPool-Elite-Aura (8, `EnemyPool.ts:308-311`, nicht geclaimed — Bedarf beim
  Disponenten melden, wenn auch zugrollt werden soll), Hazard-Rims (14, bewusst: Warnflaechen muessen ueber
  den Silhouetten bleiben).

## K3 — Beleg

**Lokal vorher/nachher** (`scripts/m10-tablet-fx.mjs`, je 4 s, 640x360, 200 wisp, god; JSON mit Renderer-String in
`~/games/.evidence/m10-tablet-fx-hotspot/{before,after}.json`; Renderer: `Mesa Intel(R) Graphics (RPL-S)`, WebGL1/ANGLE):

| Fenster | draws vor→nach | blend vor→nach | bufSub vor→nach | fbNonNull |
|---|---|---|---|---|
| base | 6→6 | 5→5 | 5→5 | 0→0 |
| single:thorn_storm | 5→5 | 3→3 | 4→4 | 0→0 |
| stackA:+2 phoenix | 19→6 | 18→5 | 19→5 | 0→0 |
| stackA:+3 eternal_winter | 30→6 | 28→4 | 29→5 | 0→0 |
| stackA:+6 (alle) | **33→6** | **32→5** | **33→5** | 0→0 |

Korridor (Bericht: blend ≤ 8, draws ≤ 14) weit unterschritten; erwartete Budget-Grundgrenzen Boden/Gems/Licht/UI.

**Geraet (Redmi Pad Pro, Adreno 710, Chrome/157, Android 16 — One-Shot-Probe `~/tmp/m10-tablet-fx-hotspot/probe-device.mjs`,
kumulativ ohne Relaunch, je 5 s; JSON `~/games/.evidence/m10-tablet-fx-hotspot/after-device-probe.json`):

| Fenster | FPS | blend | draws | bufSub | fbNonNull |
|---|---|---|---|---|---|
| stackA:+1 thorn_storm | 119,8 | 2 | 17 | 4 | 0 |
| stackA:+6 (alle) | **119,4** | **7** | **21** | **8** | **0** |

Vorher am Geraet (Device-Report der Root-Cause-Lane): 43 FPS, blend 26, draws 54 in der Dornensturm-Kombi.
Ziel „6 Evos >= 90 FPS, Blend < 8“ damit auf dem Geraet bereits erreicht (119,4 FPS, blend 7). Die formale
Geraetemessung nach dem Merge macht Argus/Claude (6 Evos >= 90 FPS, Minute-25-Dichte >= 60 FPS).

**Optik unveraendert** (Sichtpruefung, 3x nearest-upskalierte Vorher/Nachher-Vergleiche je Evo in
`~/games/.evidence/m10-tablet-fx-hotspot/shots-{before,after}/`, Kontrollbilder in git:
`shots/abnahme/side-{eternal_winter,thorn_storm,wrath_pendulum}.png`): gleiche Glows, gleiche Formen,
gleiche Lesbarkeit; sichtbare Unterschiede sind Kampfphasen-Timing, nicht Draw-Ordnung. 0 JS-Fehler in
allen Messläufen (jsErrors im JSON leer).

**Tests:** `tests/tablet-fx-budget.test.ts` (9 Tests) pinnt die Gruppierungs-Invariante: stackA:+6-Census
(38 ADD zwischen 56 NORMAL) → alle ADD in EINEM Block, Blend-Wechsel < 8; Alt-Modell (interleaved) >= 8
als Regressions-Anker; `glowDepthFor`-Zuordnung; Band < enemy/enemyShot (GAME.md-Ordnung). `npx tsc`,
`npm test` (1966 Tests), `npm run build` gruen.

## Ehrliche Punkte / offene Reste

1. **`scripts/m10-tablet-fx.mjs --mode device` bricht beim App-Relaunch** (`connectOverCDP` stirbt mit dem
   App-Restart; `contexts()[0]` danach undefined). Der Probe umgeht das mit EINER Verbindung ohne Relaunch
   (kumulative Fenster). Fuer die formale Geraetemessung nach dem Merge: entweder Probe-Pfad (ein Relaunch
   vor dem Connect, dann kumulativ) oder Bridge so aendern, dass CDP den Restart ueberlebt.
2. Der Lichtkreis (ADD, depth 20, `Run.ts:351`/GroundRenderer) bleibt als Insel — 2 Grenzen, konstant,
   war in der Basis messbar und ist Teil der Rest-blend 5 lokal / 7 am Geraet. Wenn er spaeter auch ins Band
   soll: Run.ts/GroundRenderer sind fremd geclaimed (Bedarf melden).
3. `tests/passive-stack.test.ts` stuempelt bei jedem Testlauf `shots/m10-passive-math-{caps,matrix}.json`
   mit neuem `generatedAt` (Fremd-Dateien). Nicht von dieser Lane committet; in main aufgeraeumt werden
   (Test sollte die Zeit nicht in committed Belege schreiben).
4. Lokale FPS sind VSync-gekappt (60,3) — K3-Beweis fuehrt bewusst GL-Zahlen, nicht FPS (rendererunabhaengig,
   siehe Root-Cause-Bericht).
5. **Perf-Check (PASS, 2026-11-28) mit zwei Luecken fuer die formale Geraetemessung nach dem Merge:**
   (A) `after-device-probe.json` enthaelt keinen Renderer-String — Geraetezugehoerigkeit belegt via
   `~/games/.evidence/device/telemetry-2026-11-28.jsonl` (`"renderer": "Adreno (TM) 710"`, Qualcomm, Redmi
   2405CRPFDG, gleicher Tag). Bei der Nachmessung den Renderer-String ins Device-JSON schreiben.
   (B) Die Geraete-Baseline „43 FPS / blend 26 / draws 54“ ist als Zitat aus dem Root-Cause-Bericht belegt,
   aber nicht aus Rohdaten nachrechenbar (`rc-device.json` wurde nie aufgenommen, Geraet war offline) —
   `rc-device.json` (Vorher) nachholen, wenn das Geraet vor dem Merge laeuft.
