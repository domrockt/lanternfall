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

## K2 — Mixel-Bakes für fx_evo_{hit,death}_thunder_seal (#10252)

**Ansatz:** `MIXEL_BAKE_DEFS`-Muster 1:1 übernommen — `signatureFrame()` um `density`-Parameter
erweitert (identische normierte Geometrie in 32·L Pixeln: Radien/Bandbreiten ×L, Sinus-Frequenzen
pro normierter Einheit i/L), `outlineAndRim()` um Kontur-Thickness t=L. Neue Bake-Defs:
hit maxLevel 4 (ceil 3,6), death maxLevel 5 (ceil 4,6). Draw-Scales unverändert — FxSystem
wählt Stufe L=ceil(Scale) und zeichnet mit Scale/L ≤ 1 (0,9/0,92).

**Optik-Abbruchkriterien geprüft:**
- Level-1-Ausgabe **bitidentisch** zur alten 32×32-Quelle (Beleg: 12/12 Evo-Sets == K1-Fixture,
  Skript `~/tmp/m10-fx-bakes-evo-r2/verify-density1.mjs`). thunder_seal-Pfad (Revert 34e97d3,
  Karte #8876) unangetastet — kein baked-Upgrade geschmuggelt.
- Farbrampe in jeder Stufe vollständig (Test: Farbmenge == L1), Flachenskalierung ~L² je Farbe.
- Gefundener und gefixter Bug unterwegs: Beam-Seitenband/Kern war in Stufen nur 1 Texel breit
  statt L (Screen-Band hätte 3,6 px → 0,9 px schrumpft); Querschnitt jetzt 9|12|9 in L-fach
  Auflösung, bei L=1 bitidentisch.
- Dokumentierte Abweichung: die 1-Texel-Rim-Lichtkante (11) bleibt 1 Texel (statt auf L zu
  wachsen) — sie liest sich am Schirm als feine 0,9-px-Kante statt 3,6-px-Block. Eine „innerhalb
  t"-Rim-Regel kollabierte den steilen Beam (Wobble-Slope ~2) und wurde verworfen.

**Dither-Baseline:** Die neuen @L-Frames erzeugen zusätzliche gepinnte Dither-Befunde (>2 px
Band in Texturpixeln) — strukturell identisch zum bestehenden Präzedenzfall fx_fire@2/@3 und
ring_frost@2/@3 (bandPx skaliert mit L, Screen-Band unverändert, da Draw-Scale/L). Die L1-Basen
sind unverändert gepinnt. Beleg: `~/games/.evidence/m10-fx-bakes-evo-r2/k2-ist-report.json`.

Coverage nach K2: 16/17 gedeckt; uncovered nur noch `fx_boss_core` (K3).
Neue Tests: `tests/evo-fx-bakes.test.ts` (6 Assertions-Blöcke: Basis-Keys, Coverage-Bereich,
Stufen-Existenz, L1-Bitidentität, Geometrie-Skalierung, bestehende Basen unangetastet).

## K3 — fx_boss_core: Entscheidung BAKE (#10253)

**Entscheidung: Mixel-Bake bis Level 4** (nicht Scale ≤ 1). Beleg:
- Runtime-Draw-Scales: Boss-Tod `Run.ts playBossDeathFx` 1,6→3,6, Boss-Auftritt 0,6→2,4,
  Boss-Tod-Shards `death.ts` rimScale 1,2–1,25. Gewünschte Screen-Größe bis 115 px.
- Scale ≤ 1 wäre eine Optik-Verschlechterung: der Effekt würde auf 32 px schrumpfen und die
  #5219-Schärfe-Features (geschlossene Tintenkontur + Offset-Outline, eingeführt gegen den
  Blocker „Boss-FX-Kontrast") würden ihre Wirkung verlieren. Bake hält die Kontur bei
  Draw-Scale 0,9 scharf — genau der Briefing-Fall „Bake bevorzugt, wo Optik-Kernscharfe
  wichtig ist".
- Implementierung wie K2: `bossCoreFrame(stage, density)` (Kontur/Outline/Bandbreiten ×L,
  Zack-Frequenz pro Umlauf konstant, L=1 bitidentisch), Bake-Def maxLevel 4.
- `Run.ts` wurde NICHT angefasst: `FxSystem.spawn` wählt die Stufe automatisch nach dem
  Area-Cap (Design-Kommentar dort: Cap rechnet bewusst mit L1-Textur, Stufe L verkleinert
  die Device-Fläche um Faktor L).
- `isBossFxKey` ist jetzt "@"-tolerant (`fx_boss_core@4` bleibt Boss-FX) — Alpha-Boden 0,7,
  NORMAL-Blend und LOD-Ausnahme überleben den Frame-Rewrite.
- Bug unterwegs gefunden und gefixt: `deathFrameSets` rief `[0..5].map(bossCoreFrame)` auf —
  `Array.map` liefert den Index als 2. Argument, der jetzt als density interpretiert wurde
  (Frame 2 renderte 64²). Fix: `.map((i) => bossCoreFrame(i))`, L1 wieder bitidentisch.

**Fremde Alt-Pins aktualisiert (4 Assertion-Zeilen, Bedarf in
`/home/ai/games/.dispatch/requests.md` gemeldet):** `tests/fx-mixel.test.ts` (3) und
`tests/boss-death-shards.test.ts` (1) pinnten ausdrücklich „fx_boss_core ist kein
Mixel-Basis" (Stand der m10-fx-mixel-fix-Lane, bevor ein Boss-Bake geplant war). Die Pins
sind auf das neue, in `tests/evo-fx-bakes.test.ts` getestete Verhalten umgestellt —
inkl. neue Assertions (mixelLevel 2 bei Scale 1,35, Alpha-Boden bleibt).

Coverage nach K3: **17/17 gedeckt, knownFindings 0** (`~/games/.evidence/m10-fx-bakes-evo-r2/k3-ist-report.json`).

## K4 — Ratchet abgebaut + Sichtbelege + Abschluss (#10254)

**Ratchet:** `tests/palette-compliance.test.ts` pinnt jetzt **0 ungedeckte Keys** (vorher 13 →
nach K1 3 → nach K2 1 → nach K3 0). Die Assertion ist hart: jede neue ungedeckte Draw-Scale
macht rot. Dither-Ratchet: L1-Basen unverändert; neue gepinnte Befunde sind ausschließlich
@L-Bake-Frames (Präzedenzfall fx_fire@2/@3, ring_frost@2/@3 — bandPx skaliert mit L, Screen-Band
identisch, da Draw-Scale/L). Guard-Laufzeit < 3 s (Test-Assertion grün), Full-Suite grün
(171 Dateien / 1857 Tests), `npm run build` rc=0.

**Sichtbelege (iGPU, Mesa Intel(R) Graphics (RPL-S), kein SwiftShader):**
`shots/abnahme/k4-shot-*.png` + `k4-zoom-*.png` (3× nearest), Beleg-JSON
`shots/abnahme/k4-shot-evidence.json` (Kopien: `~/games/.evidence/m10-fx-bakes-evo-r2/`).
Wirkungsmomente mit lebenden Gegnern:
- thunder_seal hit (`fx_evo_hit_thunder_seal@4_3` aktiv) + death (`fx_evo_death_thunder_seal@5`)
- eternal_winter death (baked-Zielgrößen-Referenz)
- fx_boss_core Boss-Tod: **`fx_boss_core@4` zur Laufzeit aktiv** (Stufen-Rewrite im Spawn
  funktioniert; Intro zusätzlich @3) — 0 JS-Fehler.

**art-director-Sichtcheck:** **PASS** (strenge Abnahme, 4/4 Kriterien mit Bildbeleg):
keine 6–10-px-Mixelblöcke (1-px-Treppen an Beam- und Core-Kanten), eine Pixelgröße im Bild
(thunder_seal vom baked-Zielgrößen-Referenz-Setup nicht unterscheidbar), Formen/Kerne lesbar
(thunder_seal death = 3 Beams + Seitenarme wie im Generator; fx_boss_core 3-Stufen-Kern +
Zackenring + Splitter trotz Screen-Flash), keine ausgebrannten Stufen. Rim-1-px-Abweichung
als feine Creme-Kante bestätigt. Kontrolleur-Beleg: `npx vitest run tests/evo-fx-bakes.test.ts`
11/11 grün; Runtime-Keys `@4/@5` + Mesa-RPL-S-Renderer im Beleg-JSON.

## Bilanz

| Schritt | Ist |
|---|---|
| Ungedeckte Draw-Scale-Keys | 13 (gepinnt, davon 10 stale) → **0** |
| Neue Mixel-Bakes | fx_evo_hit_thunder_seal@2–4, fx_evo_death_thunder_seal@2–5, fx_boss_core@2–4 |
| Level-1-Optik | bitidentisch (12/12 Evo-Sets + fx_boss_core gegen alte Quelle verifiziert) |
| Run.ts-Änderungen | keine (FxSystem wählt Stufe automatisch) |
| Suite/Build | 171 Dateien / 1857 Tests grün, build rc=0, Guard < 3 s |

**Review (Kontrolleur reviewer, Runde 1: FAIL → fixes → grün):**
- K1 (kritisch): Full-Suite-Timeout `tests/fx-mixel.test.ts` unter Host-Last — `mixelBakes()`
  rendert bei JEDEM Aufruf alle Stufen (bis 160²×4 Frames). Fix: einmaliges Hoisten
  (`const BAKES = mixelBakes()`) in fx-mixel/evo-fx-bakes-Tests.
- S1: Boss-Rim ist real `scaleFrom × rimScale` bis 4,531 (burst) — nur zufällig gedeckt, weil
  heute alle Bosse Archetyp tank→crumble (3,456) sind. Fix: fx_boss_core-Bake auf **maxLevel 5**,
  Manifest-Quelle dokumentiert das Produkt mit Fundstellen (CombatSystem.ts:1212, death.ts,
  BossSystem.ts:154); Coverage-Test pinnt jetzt [3,456, 4,531].
- N3: Taper-Slopes (0,55/0,6) als bewusst nicht skaliert kommentiert (normalisierte Rampe).
- Test-Schärfe: `distinctColors` im fx-mixel-Rampen-Test jetzt frame-weit (Zentralreihe schnitt
  bei @5 quantisierte Zackenstellen; Farbzählung über alle Stufen: 10/10 Farben mit ~L²-Ratios).

**Offene Punkte:** keine aus dieser Lane. Der thunder_seal-Zielgrößen-Pfad (128er-Upgrade,
Revert 34e97d3) bleibt bei Karte #8876 — der Bake macht ihn optional, nicht dringend.
