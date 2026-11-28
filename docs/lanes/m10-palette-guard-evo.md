# Lane m10-palette-guard-evo — Compliance-Fixture auf Evo-FX-, Boss- und Truhen-Texturen erweitert

Auftrag (2026-11-28, ~02:00Z): `m10-palette-fx-guard` deckt die bisherigen Sprite-/FX-Grids ab;
die Evo-FX-Kette (zornpendel läuft, gewittersiegel/dornensturm/winter-w2/form-polish warten) und
die wartenden Merges (chest-reveal, evo-fx-winter) bringen NEUE Texturen nach main. Ziel: Fixture +
Check erweitern, GRÜNEN Schnitt als harte Assertions aufnehmen (`npm test` bleibt grün), rote
Restliste als Skript-Report mit Datei-/Hebel-Pointer belegen und als Bedarfsmeldung melden.
**Kein Spielcode geändert** — `gen-fx.ts`/`textures.ts`/`bakeAtlas.ts`/`FxSystem.ts`/`CombatSystem.ts`
nur gelesen; angefasst wurden nur meine Claims: `scripts/art/palette-check.mjs`,
`scripts/art/palette-check.d.mts` (Typen), `tests/palette-compliance.test.ts`, `src/palette.ts` (unverändert).

Board-Karten: #7505 (K1 Check/Before-Report), #7506 (K2 Grün-Schnitt), #7507 (K3 rote Liste +
Bedarfsmeldung), #7508 (K4 .lane-done). Commits: 743817e (K1), af93f9b (K2), K3/K4 folgen.

## 1. K1 — Check erweitert (`scripts/art/palette-check.mjs`, Commit 743817e)

- **Neue Quelle erfasst:** `ENEMY_PROJECTILES` aus `src/gfx/textures.ts` (5 Gegnergeschoss-Grids)
  lief bislang an der Compliance vorbei — `collectStaticSources` nahm nur `SPRITE_GRIDS`.
- **Report-Modus (Verstöße je Key):** `violationsPerKey(assets)` gruppiert off-palette/alpha pro
  Basis-Key (Frames zusammengefasst) und liefert je Gruppe `file`, `key`, `offPalette`, `alphaViolations`,
  ersten Pixel-Verstoß plus **Hebel-Pointer** (`leverFor`): wo gedreht wird (Grid/Generator-Funktion)
  und welcher Kettenglied-Job betroffen ist. Mapping-Auszug:
  - `fx_evo_*_thunder_seal` → `EVOLUTION_SIGNATURES.thunder_seal` in `src/gfx/gen-fx.ts` → Job gewittersiegel/form-polish
  - `fx_evo_*_thorn_storm` → `EVOLUTION_SIGNATURES.thorn_storm` → Job dornensturm/form-polish
  - `fx_evo_*_eternal_winter` → `EVOLUTION_SIGNATURES.eternal_winter` → Job winter-w2/evo-fx-winter/form-polish
  - `fx_evo_*_wrath_pendulum` → `EVOLUTION_SIGNATURES.wrath_pendulum` → Job zornpendel/form-polish
  - `chest_*` → `SPRITE_GRIDS.chest_*` in `src/gfx/textures.ts` → Job chest-reveal
  - `fx_boss*` → `deathFrameSets()` in `src/gfx/gen-fx.ts` → Boss-FX-Lane
- **Coverage-Sektion im Report:** Evo-Signaturen (12 Keys), Boss-Quellen (grids/frames/fx),
  Truhen-Keys, enemy_shot-Keys — die Abdeckung ist im JSON sichtbar, nicht behauptet.
- **Before-Report** (Ist auf aktuellem main, Commit 743817e):
  `shots/m10-palette-guard-evo-before.json` — **483 Grids/Frames, 1 473 817 Pixel, 0 off-palette,
  0 alpha-Verstöße**, Verstöße je Key: keine.

## 2. K2 — Grün-Schnitt als harte Assertions (`tests/palette-compliance.test.ts`, Commit af93f9b)

Alles hier bestand auf main und ist ab jetzt Schranke; die Merges chest-reveal/evo-fx-winter und die
Evo-Kette können neue Texturen nur noch über bewusste Pflege einschleppen:

| Assertion | Ratchet-Wirkung |
|---|---|
| `enemy_shot_*`-Keys == `ENEMY_PROJECTILES`-Keys, palette-clean | neue Geschoss-Grids fallen automatisch unter den Guard, Liste wird bewusst gepflegt |
| Evo-Signaturen: hit+death je `EVOLUTION_SIGNATURE_IDS`, 4 Frames, gebackene Zielgröße (phoenix 128, soul_beacon 96 = `SOUL_SIGNATURE_SIZE`), palette-clean | neue Evolution ohne Signatur-Set schlägt an; gebackene Frames (Spiegel von `BAKED_SIGNATURES` in `addEvolutionSignatures`) sind benannt geprüft, nicht nur über die 32×32-Fixture |
| jede Evo-Signatur-Key in der Canvas-Erfassung (`createFxTextures`) vorhanden | Laufzeit-Textur und geprüfte Quelle können nicht auseinanderlaufen |
| `chest_*`-Keys == `["chest_closed", "chest_open"]`, palette-clean | chest-reveal-Merge erweitert die Liste BEWUSST (Ratchet) |
| Boss-Quellen: `gen-bosses` erfasst, ≥ 1 Boss-Frame-Set je `BOSSES`-Eintrag, `fx_boss_core` in FX-Erfassung, palette-clean | Boss-Lanes verlieren den Guard nicht stillschweigend |
| `violationsPerKey(...) == []` | Gruppen-Ratchet; Failure listet Datei+Key+Hebel+Job |

- `formatViolations` im Guard hängt jetzt je rotem Key den Hebel-Pointer an — ein Verstoß der
  neuen Texturen sagt sofort, WO und VON WEM er zu fixen ist.
- **Laufzeit:** `staticAssets`/`numericAssets`/`fxAssets` memoized (vorher 4× dieselbe Arbeit):
  Compliance-Datei 0,66 s (vorher 0,88 s), Suite **1192/1192 grün in 3,53 s Wandzeit**
  (Baseline vor K2: 3,20 s, Delta +0,33 s für die 5 neuen Tests; die 3-s-Gesamtgrenze war durch das
  Suite-Wachstum anderer Lanes schon vor dieser Lane überschritten — ehrlich gemeldet, kein
  Spielcode-Griff um das zu kompensieren). `npm run build` grün, `npx tsc --noEmit` rc=0.
  Beleg: `shots/m10-palette-guard-evo-k2-test.log`.
- Typen: `scripts/art/palette-check.d.mts` um die neuen Exporte ergänzt (`EvoSourceSet`,
  `LeverPointer`, exakte `signatureFrame`-Signatur).

## 3. K3 — Rote Restliste (Report `shots/m10-palette-guard-evo-before.json`)

**Off-palette/alpha: 0 Verstöße über alle 483 Grids/Frames** inkl. der neu erfassten Quellen —
eine rote Liste existiert auf main NICHT. Belegt je Key: `violationsPerKey: []` im Report.

Die offenen Befunde für die Evo-Kette liegen woanders (bereits von `m10-palette-fx-guard` gepinnt,
hier mit Hebel-Pointer für die Bedarfsmeldung übernommen):

| Befund | Datei :: Key | Hebel | Betroffener Kettenglied-Job |
|---|---|---|---|
| Dither-Band 6 px (`fx_evo_death_thunder_seal#0..#3`) | `src/gfx/gen-fx.ts` | `EVOLUTION_SIGNATURES.thunder_seal` / `signatureFrame("beam", …)` | gewittersiegel, form-polish |
| Dither-Band 4 px (`fx_evo_hit_phoenix#0`) | `src/gfx/gen-fx.ts` | `phoenixSignatureFrame` | form-polish (phoenix) |
| 13 ungedeckte Draw-Scales (12× `fx_evo_*`, `fx_boss_core`) | `src/gfx/gen-fx.ts` + `FxSystem.spawn` | Mixel-Bakes (Muster `mixelBakes`) oder Skeleton-Scale ≤ 1 | form-polish / Boss-FX-Lane |

Bedarfsmeldung ist eingetragen: `/home/ai/games/.dispatch/requests.md` (2026-11-28T02:xxZ).

**Offene Punkte (nicht Teil des Auftrags, fürs Backlog):**
1. `src/gfx/hazardDisc.ts` erzeugt Laufzeit-Canvas-Texturen (Masken, `scene.textures.addCanvas`),
   die von keinem Palette-Guard erfasst sind — nachziehen, wenn eine Lane dort arbeitet.
2. Beim Landen von chest-reveal/evo-fx-winter: `chest_*`-Liste in K2-Test erweitern (bewusste
   Pflege), FX-Keys laufen automatisch durch Canvas-Erfassung + `FX_FRAME_COUNTS`-Fixture-Ratchet.

## 4. Messwerte

| Messung | Wert | Beleg |
|---|---|---|
| Compliance-Report (main, vor/assertiert) | 483 Grids, 1,47 Mio px, 0 off-palette, 0 alpha | `shots/m10-palette-guard-evo-before.json` |
| `npx vitest run tests/palette-compliance.test.ts` | 16/16 grün, 0,66 s | `shots/m10-palette-guard-evo-k2-test.log` |
| `npm test` | 110 Files / 1192 Tests grün, 3,53 s (Baseline 3,20 s) | Commit af93f9b |
| `npm run build` / `npx tsc --noEmit` | grün / rc=0 | Commit af93f9b |
| Änderungen an Spielcode | 0 Dateien | `git diff 743817e^..HEAD --stat` (nur scripts/tests/shots/docs) |
