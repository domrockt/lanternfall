# Lane m10-fx-bakes-evo-r2 — Mixel-Bakes für Evo-Signaturen + fx_boss_core

Re-Queue des Original-Briefings (Opfer des Ancestor-Bugs 06:32Z). Ziel: Scale-Coverage-Ratchet
aus `tests/palette-compliance.test.ts` (Fixture `tests/fixtures/palette-fx-guard.json`)
auf 0 ungedeckte Keys abbauen, ohne Optik-Verschlechterung.

## K1 — Sammler-/Fixture-Update (#10251)

**Befund (Karten-Plan war auf veralteter Baseline):** Das Briefing nannte 13 ungedeckte Keys
(12 × `fx_evo_*` @ 3,2–4,6 + `fx_boss_core` @ 3,6). Der Sammler-Lauf auf dem Ist-Stand nach
der Evo-Kette (phoenix/soulpyre/zornpendel/dornensturm/winter/form-polish, Querschnitt d73ab80)
zeigt: **10 der 12 Evo-Signaturen sind bereits gedeckt** — sie werden in Zielgröße gebacken
(`BAKED_SIGNATURES`, `drawScale [1,1]`): phoenix 128², wrath_pendulum 96², eternal_winter 128²,
thorn_storm 128², soul_beacon 96², Draw-Scale 1 (Mixel-Regel erfüllt). Der alte Sammler hatte
alle 12 pauschal als 32×32-`signatureFrame`-Menge erfasst (stale) und das SCALE_MANIFEST
sagte 3,6/4,6 für alle — beides stimmte nicht mehr mit der Laufzeit.

**Änderungen (K1):**
- `src/gfx/gen-fx.ts`: `BAKED_SIGNATURES` aus `addEvolutionSignatures()` herausgezogen,
  neu `evolutionSignatureTextureDef(id, kind)` (exportiert) — eine Wahrheit für
  Laufzeit-Textur, Sammler und Test. thunder_seal bleibt beim 32×32-Pfad
  (128er-Upgrade war Chaos-Lane-K2, Revert 34e97d3, Karte #8876 — nicht geschmuggelt).
- `scripts/m10-palette-fx-guard.mjs`: Evo-Sets über `evolutionSignatureTextureDef`
  (reale Größe/Frames); SCALE_MANIFEST auf Ist (5 baked @ 1,0; thunder_seal hit 3,6 /
  death 4,6; fx_boss_core 3,6).
- `scripts/art/palette-check.mjs` `collectEvolutionSources`: nutzt dieselbe Quelle
  (stale baked-Map phoenix/soul_beacon ersetzt).
- `tests/palette-compliance.test.ts`: Spiegel `representativeFxSets` + Größen-Assertion
  auf reale Definition; Ratchet `>= 13` → `<= 3` (darf nur schrumpfen).

**Ist-Coverage nach Sammler-Lauf 1** (`~/games/.evidence/m10-fx-bakes-evo-r2/k1-ist-report.json`,
vorher: `before-fixture-palette-fx-guard.json` / `before-report.json`):

| Key | maxScale | Covered | Grund |
|---|---|---|---|
| fx_evo_{hit,death}_{phoenix,wrath_pendulum,eternal_winter,thorn_storm,soul_beacon} | 1,0 | ✅ | baked in Zielgröße, Draw-Scale 1 |
| fx_evo_hit_thunder_seal | 3,6 | ❌ | 32×32, kein Bake |
| fx_evo_death_thunder_seal | 4,6 | ❌ | 32×32, kein Bake |
| fx_boss_core | 3,6 | ❌ | 32×32, kein Bake |
| fx_halo / fx_shock / fx_fire / fx_halo_cold | 4,6/3,3/1,9/1,9 | ✅ | Bake-Stufen 6/4/3/3 |

Fixture: 37 Sets / 137 Frames (baked-Signatur-Frames jetzt in realer Größe), off-palette 0,
alpha 0. Sammler: 1 Lauf (Iter limit eingehalten).

**Scope-Anpassung ggü. Briefing (dokumentiert):** K2 betrifft nur noch `fx_evo_*_thunder_seal`
(2 Keys statt 12); die 10 baked-Signaturen brauchen keinen Bake — sie zeichnen bereits mit
Scale 1 aus Zielgrößen-Texturen. K3/K4 wie geplant.
