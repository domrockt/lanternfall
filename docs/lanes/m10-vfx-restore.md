# Lane m10-vfx-restore — VFX-Daempfung stufenweise zuruecknehmen (A7-Restmangel)

Ziel: Der VFX-Minimal-LOD ist seit A7 bewusst stark gedaeampft (fxAlpha 0,5/NORMAL,
Licht 0,85·0,5, additive Glow-dpr-Alpha 0,6) — die Effekte wirken verwaschen. Seit
Ambient-Batching, Draw-Caps und iGPU-Harness sind Budget-Reserven da. Die Daempfung
wird stufenweise zurueckgenommen, ohne die erreichte Lesbarkeit (Near-White ≤ 4,16 %,
A7-Definition) zu opfern.

**Dateien (Disponent):** `src/scenes/Run.ts`, `tests/vfx-restore.test.ts`,
`scripts/m10-vfx-restore.mjs`, `docs/lanes/m10-vfx-restore.md`, `shots/m10-vfx-restore-*`.

## Messaufbau (scripts/m10-vfx-restore.mjs)

- M25-Szenario wie ACCEPTANCE A7 (`scripts/final-vfx-readability.mjs`): seed 77,
  `skipTo(1400)`, 6 Basiswaffen Lv8, god, suppressLevelUps, Banner ausgeblendet,
  Szene pausiert, reproduzierbare Pool-Effekte (`fx_spark`/`fx_halo`/`fx_shock`) in der Horde.
- Burst-Spawn auf ~450 Gegner -> Freeze-Frame bei ~300 (bis zum Einfrieren stirbt ~1/3,
  wie im A7-Frame: 460 gespawnt, 429 angekommen) + lebender Boss (`spawnBoss(4)`).
  Bossdruck + >250 Gegner => `lodFor` = **minimal** — genau dort greift die 0,5-Daempfung.
- Profile: `640x360@1` (fuellt den View), `780x360@3` (iGPU-/dpr-Pfad, Spielflaeche
  ganzzahlig skaliert mit Rand — Near-White-Anteile sind darum je Profil getrennt
  vor/nach zu vergleichen, nicht profiluebergreifend).
- Gemessen: Near-White A7 (`r,g,b >= 150 und r >= 235`) im A7-anteiligen Crop
  (x 37,5–62,5 %, y 29,63–70,37 % des Frames) und fullframe, `min(RGB) >= 200` als
  Gegenprobe, fxAlpha-Setup, Draw-Calls/Frame (GL-Wrapper wie `perf-profile.mjs`),
  FPS 45 s im Live-Lauf, Renderer-String, JS-Fehler. FPS-Laeufe unter `flock`.

## K1 — Baseline (Stufe 0, unveraendert)

`shots/m10-vfx-restore-baseline.json` + `-damped`-PNGs (committet).

| Profil | Gegner (Freeze) | lod | fxAlpha | FPS | Draw-Calls/Frame (Median) | Near-White A7 Crop | Near-White A7 Full |
|---|---|---|---|---|---|---|---|
| 640x360@1 | 286 | minimal | 0,5 | 60,0 | 16 | 1,57 % | 0,61 % |
| 780x360@3 | 323 | minimal | 0,5 | 60,0 | 16 | 3,43 % | 0,74 % |

Renderer-String: siehe JSON (`renderer`), Headless-Chromium (Software-GL) auf dem
Sandbox-Host. 0 JS-Fehler. Beobachtung: Near-White liegt unter dem A7-Ziel von
4,16 % — die Gegenprobe `final-vfx-m25-after.png` (4,16 %) stammt aus einem anderen
Setup (12 Waffen/429 Gegner); fuer die Lane gilt der hier gemessene Baseline-Wert
als Referenz, das Gate 4,16 % bleibt trotzdem als harte Grenze.

## K2 — Stufe 1: fxAlpha 0,5 -> 0,65 im minimal-LOD (Run.ts-Hebel)

`src/scenes/Run.ts`: `Run.FX_RESTORE_ALPHA = 0.65` + `Run.setFxRestore(stage)` (public,
von Mess-Skript/Abnahme nutzbar). Wirkt nur im minimal-LOD mit aktiver Daempfung auf
die Run.ts-eigenen Hebel: `combat.fx.setAlphaScale(a)`, `combat.particles.setAlphaScale(a)`
und das Laternenlicht (`0,85·a`); `applyLod()` ruft sie idempotent jeden Frame. Bewusst
**unter** der 0,7-Schwelle des FxSystem, damit additive Glows NORMAL bleiben (kein
Blend-/Batch-Rueckschritt). Debug-Report (`getQuickStats().fxAlpha`) meldet 0,65.

`src/logic/lod.ts` (fxAlphaFor) ist fremd geclaimed — Anfrage steht in
`/home/ai/games/.dispatch/requests.md`. Nach Uebernahme dort kann der Run.ts-Override
entfallen (in der Anfrage vermerkt).

`shots/m10-vfx-restore-stage1.json` + `-stage1`-PNGs (committet), gemessen im SELBEN
pausierten Frame wie der Damped-Frame (sameDensity true):

| Profil | lod (Freeze) | fxAlpha | Near-White A7 Crop (0,5 -> 0,65) | Near-White A7 Full | FPS | Draw-Calls |
|---|---|---|---|---|---|---|
| 640x360@1 | minimal | 0,5 -> **0,65** | 2,34 % -> **2,99 %** (Grenze 4,16 %) | 0,65 -> 0,75 % | 60,0 | 16 -> 16 |
| 780x360@3 | reduced (244 Gegner) | 0,72 (unveraendert) | 3,60 % (Stufe greift nicht) | 0,60 % | 60,0 | 16 -> 16 |

- Renderer-String (beide Profile): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
  OpenGL ES 3.2)` — iGPU-Pfad. 0 JS-Fehler.
- Das 780x360@3-Profil verfehlte den minimal-LOD im Freeze-Frame (244 < 250 Gegner;
  Mortalitaet bis zum Einfrieren streut). Die Stufe wirkt dort bewusst nicht; der
  Near-White-Wert bleibt trotzdem unter der Grenze. Nachmessen im K3-Lauf.
- `tests/vfx-restore.test.ts` prueft die gewaehlte Stufe gegen die Messgrenzen
  (Near-White ≤ 4,16 %, FPS ≥ 50, Draw-Calls ≤ Baseline + 10 %, Verdrahtung in Run.ts).

## K3 — Stufe 2 (Glows +0,1) claim-blockiert; Nachmessen Stufe 1 (45 s, flock)

- **Glow-Hebel blockiert:** Die additive Glow-dpr-Alpha (`fxAlphaForDpr`, dpr≥3: 0,6) und
  der Glow-Alpha-Pfad liegen in `src/gfx/gen-fx.ts` + `src/systems/FxSystem.ts`
  (Claim `m10-boss-fx-contrast`). Run.ts hat keinen Hebel darauf (setAlphaScale wirkt
  nicht selectively auf Glows; ≥0,7 wuerde zusaetzlich den Blend-Modus umschalten).
  -> Anfrage in `/home/ai/games/.dispatch/requests.md`; **gewaehlte Stufe der Lane = 1**.
- **Nachmessen mit Stufe 1 aktiv** (`shots/m10-vfx-restore-stage1-long.json`, 45 s,
  `flock /home/ai/games/.lf-perf.lock`, beide Profile diesmal im minimal-LOD):

| Profil | lod | fxAlpha | Near-White A7 Crop (0,5 -> 0,65) | FPS | Draw-Calls/Frame (Median) |
|---|---|---|---|---|---|
| 640x360@1 | minimal | 0,5 -> 0,65 | 3,00 % -> **3,98 %** ≤ 4,16 % | **60,0** ≥ 50 | 16 → 16 ≤ Baseline+10 % |
| 780x360@3 | minimal | 0,5 -> 0,65 | 1,78 % -> **2,06 %** ≤ 4,16 % | **60,0** ≥ 50 | 16 → 16 ≤ Baseline+10 % |

- Renderer-String (iGPU-Pfad, im JSON): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
  OpenGL ES 3.2)`. 0 JS-Fehler. FPS ist vsync-geklemmt (60); Ziel ≥ 50 erfuellt.
- Beobachtung: Near-White bei 640 liegt mit 3,98 % nah an der 4,16 %-Grenze — die
  Streuung zwischen Laeufen (2,99 % im K2-Lauf) ist real. Stufe 2 (Glows +0,1) wuerde
  den Near-White-Anteil weiter anheben und muss deshalb (wie beantragt) gegen dieses
  Gate gemessen werden, bevor sie uebernommen wird.

## Offene Punkte

- `fxAlphaFor` (0,5/0,72) liegt in `src/logic/lod.ts` — **fremd geclaimed**
  (`m10-prop-density-lod`). Anfrage in `/home/ai/games/.dispatch/requests.md` (K2).
- Glow-dpr-Alpha (0,6 bei dpr>=3) liegt in `src/gfx/gen-fx.ts` — **fremd geclaimed**
  (`m10-boss-fx-contrast`). Anfrage (K3).
- Die Ruecknahme wird daher als **Run.ts-Teil** umgesetzt: `Run.setFxRestore(stage)`
  (public, von Mess-Skript/Abnahme nutzbar) skaliert FX-/Partikel-Pool und
  Laternenlicht im minimal-LOD auf die Stufen-Alpha, ohne die geclaimten Dateien zu
  beruehren.
