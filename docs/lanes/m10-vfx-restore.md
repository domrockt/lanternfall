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

## Offene Punkte

- `fxAlphaFor` (0,5/0,72) liegt in `src/logic/lod.ts` — **fremd geclaimed**
  (`m10-prop-density-lod`). Anfrage in `/home/ai/games/.dispatch/requests.md` (K2).
- Glow-dpr-Alpha (0,6 bei dpr>=3) liegt in `src/gfx/gen-fx.ts` — **fremd geclaimed**
  (`m10-boss-fx-contrast`). Anfrage (K3).
- Die Ruecknahme wird daher als **Run.ts-Teil** umgesetzt: `Run.setFxRestore(stage)`
  (public, von Mess-Skript/Abnahme nutzbar) skaliert FX-/Partikel-Pool und
  Laternenlicht im minimal-LOD auf die Stufen-Alpha, ohne die geclaimten Dateien zu
  beruehren.
