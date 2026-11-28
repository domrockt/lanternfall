# Lane m10-evo-fx-winter-w2 — Aura-Siegel-Tint-Invariante + geparkte Winter-Reste

**Datum:** 2026-11-28 · **Worktree:** `lf-lanes/m10-evo-fx-winter-w2` (Branch `m10-evo-fx-winter-w2`)
**Anlass:** Bedarfsmeldung der Lane m10-evo-fx-winter (00:4xZ, `.dispatch/requests.md`): art-director
Runde 2 FAIL 3,5/5 am Aura-Siegel `ring_frost` auf hellem Moor-Grund — Root Cause multiplikativer
fogBlue-Tint am FX-Spawn. Argus-Ergänzung 02:00Z: Element-Identität (Eisblau-Rampe, Reif-Kante,
Gegner-Tint, Bodenfrost) liegt ausdrücklich bei **m10-evo-fx-form-polish** — hier nicht gebaut.

## Ausgangslage (wichtig für den Merge)

Der fogBlue-Tint selbst war beim Lane-Start **bereits in main**: die Winter-Lane hat ihn in
Versuch 3 selbst gestrichen (Commits 4787abc/ebf5a61, Merge 1f6bcd7; art-director Runde 4:
PASS 4,5/5) und dies um 01:0xZ in `.dispatch/requests.md` gemeldet („Folgelane w2 nie angelegt“).
w2 ist danach trotzdem gestartet — der K1-Auftrag verschiebt sich dadurch von „Fix bauen“ zu
„Fix verifizieren + dauerhaft absichern“. Beide Seiten (Bedarfsmeldung 00:4xZ und Erledigungs-
meldung 01:0xZ) stehen so in `.dispatch/requests.md`.

## K1 — Tint-/Alpha-Invariante (Commit „#K1 Aura-Siegel-Tint-Invariante“)

- **Verifikation per Probe** (`scripts/m10-evo-fx-winter-w2.mjs`, Winter-Szene nachgestellt:
  eternal_winter Lv 8, mudling/bog_rat, seed 7, kollisionsfreier Server Port 0):
  - `shots/m10-evo-fx-winter-w2-before.json`: main-Stand — `ring_frost@3` und alle `fx_ice*`-Keys
    **tintfrei** (einzige Tint-Stufe 0xffffff), 0 fogBlue-Partikel.
  - `shots/m10-evo-fx-winter-w2-tint-before.json`: FAIL-Stand rekonstruiert (Tint temporär wieder
    eingebracht, nach dem Lauf revertet) — **8 fx_ice_3-Partikel mit Tint 0x3a4a5c (pal6 fogBlue)**.
  - Crops (2x nearest, 480x360 Welt-px um den Spieler, helles Moor): `...-before-aura-2x.png`
    (nachher, Siegel komplett sichtbar) vs `...-tint-before-aura-2x.png` (vorher, trüb/dunkler).
- **Test `tests/evo-fx-winter-w2.test.ts`** (3 Guards K1): `tint: PAL[C.fogBlue]` kommt in
  CombatSystem.ts nicht mehr vor; Aura-Spawn `alphaFrom: 0.55, alphaTo: 0.2`, NORMAL-Blend,
  tintfrei; Frostnova-`ring_frost` unverändert (`alphaFrom: 1, alphaTo: 0`).
- Aura-Alpha bewusst **nicht** weiter gesenkt: die 0,55/0,2-Stufe ist genau der Stand, den
  art-director Runde 4 mit 4,5 PASS bewertet hat („optional“ im Briefing).

## K2 — geparkte Winter-Reste (Commit „#8159“, nur CombatSystem.ts)

Aus `docs/lanes/m10-evo-fx-winter.md`, Offene Punkt 2 (bewusst in Versuch 3 nicht angefasst):

1. **Partikel-Scale ≤ 1 (Mixel-Regel):** Aura-`fx_ice` `scaleFrom: 1.3 → WINTER_FX.particleScale`
   (= 1), Frostnova-Shards `1.5 → 1`. Nachher-Messung: fx_ice live **max 0.751** (vorher 1.25).
2. **Windup-Anticipation wired:** `winterWindup`-Flag in `WeaponState`; einmal je Spike-Zyklus
   (1,35 s) spawnt `updateWinter` den kalten Halo `WINTER_FX.windupTexture` (`fx_halo_cold`,
   24x24) mit `windupLife` 0,25 s, wenn `spikeTimer ≤ windupAt` (0,25 s) — die in WINTER_FX
   bereitliegenden, bisher inerten Parameter sind jetzt live. Nachher: `fx_halo_cold_2` im
   Probe-Lauf live @ Scale 0.933 (≤ 1).

K2 berührt **keine Fremd-Dateien** (WINTER_FX-Konstanten standen schon in
`src/data/evolution-weapons.ts`, merged); FxSystem.ts/gen-fx.ts wurden nicht gebraucht —
keine Meldung an Dora nötig.

## Tests / Build

- `tests/evo-fx-winter-w2.test.ts`: **5 Guards** (3 Tint/Alpha + 2 Reste), 15/15 in
  evo-fx-winter*-Dateien grün; `npx tsc --noEmit` rc=0; `npm run build` rc=0;
  **Suite 1335/1335** (124 Dateien) grün; 0 JS-Fehler in allen Probe-Läufen, gültiger
  WebGL-Renderer (ANGLE Mesa RPL-S, iGPU) in jeder JSON.

## Abnahme

- **art-director Runde 3 (streng): PASS — Gesamtnote 4,5/5** (Korridor ≥ 4/5 erfüllt).
  Belege: Radialscan im After-Crop (shots/m10-evo-fx-winter-w2-after-aura-2x.png) zeigt die
  unverfälschte Textur-Treppe candleWhite(12) → paleMist(9) → mist(8) → **blueGrey(5)-Außenkante
  (B > R, kalt)** klar gegen das warm-grüne Moor (G-dominant); Abgrenzung zum Lampenschein
  (warm, R/B > 1,8) sauber; Vorher-Crop (Tint-Stand) zum Vergleich ohne kühlen Stufenverlauf.
  Noten: Lesbarkeit 5/5, Eis-Identität 4,5/5, Treppe unverfälscht 5/5, Palette 5/5,
  Animation/Rendering 4,5/5. Optionale Anmerkung (kein Abnahmekriterium): candleWhite-Innenkante
  wirkt über hellem Moor leicht grünlich-weiß — Hebel bei form-polish, nicht hier.
- Near-White ≤ 4,16 %: die Aura-Textur ist unverändert (Mixel-Bake @3, guardet via
  tests/evo-fx-winter.test.ts + Palette-FX-Guard-Fixture); die w2-Änderungen färben keine
  Pixel neu (Scale/Wiring/Tint-Verzicht), der 4,16-%-Korridor wird von der bestehenden
  Fixture-Ratchet abgesichert.
- FPS: keine Echtzeit-Änderung (3 Spawn-Parameter + 1 Flag); kein perf-Lauf nötig —
  „within noise“ per Konstruktion, Mess-Sperre nicht verbraucht.
- Trefferverhalten unverändert: Treffer-Pfade (damage/slow/freeze/knockback) nicht berührt;
  Frostnova-Alpha-/Scale-Signatur per Guard eingefroren.

## Offene Punkte

1. **Element-Identität** (Eisblau/Weiß-Rampe, Reif-Kante am Aura-Rand, gefrorene Gegner
   sichtbar, Bodenfrost-Partikel, „Element auf einem Standbild ohne Beschriftung erkennbar“)
   liegt bei **m10-evo-fx-form-polish** (Argus 02:00Z) — hier bewusst nicht verbaut.
2. Polier-Hinweis aus Winter Runde 4 (fx_ice-Facette paleMist→bone im dunklen 960-Shot)
   bleibt nicht-blockierend bestehen.
3. Befund Probe-Infrastruktur: der Terrain-Worker malt Chunks **progressiv** — Screenshots
   < ~3 s nach Run-Start zeigen schwarze/nur teilweise gemalte Karten (Chunk-Grenze sichtbar
   in `~/tmp/m10-evo-fx-winter-w2/m10-evo-fx-gewittersiegel-wtcheck-640-t03.png`). Andere
   Lane-Skripte, die direkt nach dem ersten FX screenshoten, können davon betroffen sein;
   `scripts/m10-evo-fx-winter-w2.mjs` wartet 3 s (Aura zyklisiert alle 0,4 s, Moment unverändert).
