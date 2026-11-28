# Lane m10-weapon-shot-readability — 6 Spieler-Waffen-Projektile im Chaos lesbar

**Ziel (Dom):** Die 6 Waffen-Projektile (Spielerseite: ember, flail, frost, storm, thorn, lantern) sind im
300–500-Gegner-Chaos optisch klar unterscheidbar — je Waffe eigene Kontur/Farbfamilie/Groesse, kein
Auswaschen im ADD-Glow. NUR Optik: Trefferverhalten, Schaden und Balance bitgleich. Gegner-Projektile
sind NICHT Teil (shot-clarity erledigt); `CombatSystem.ts` unangetastet.

**Dateien (Disponent):** `src/gfx/gen-fx.ts`, `src/systems/FxSystem.ts`, `tests/weapon-shot-readability.test.ts`,
`scripts/m10-weapon-shot.mjs`, `docs/lanes/m10-weapon-shot-readability.md`, `shots/m10-weapon-shot-*`, `.lane-done`.

## Messwerkzeug

`scripts/m10-weapon-shot.mjs --tag=before|after` (Playwright, dist-Build, seed=1):
- **6 Solo-Szenen** (je Waffe allein, 14 unsterbliche Gegner im Ring, Minute 4, Feuer-Signal abwarten):
  `m10-weapon-shot-<tag>-solo-<waffe>.png`.
- **300er-Chaos** (Minute 25, Mix wie shot-clarity, Gegner im Ring 120–260 px, alle 6 Waffen Stufe 3):
  Zentren aller 6 Signaturen werden PER FRAME im Seitenkontext gesammelt (RAF-Loop, 3 s) — Projektile
  aus `combat.projectiles`, Flail-Swings/Orbs aus `combat.states`, Blitzsegmente (`fx_bolt`) und
  Frost-Ring/Splitter aus `fx`/`particles`. Screenshot + Box-Analyse (HALF 20) um jedes Zentrum:
  Schuss-Pixel via Palette-Nahe zur Waffen-Farbmaske, A7-Near-White + WCAG-Kontrast gegen den lokalen
  Median-Hintergrund (Methode wie `m10-shot-clarity.mjs`).
- **Kontaktblatt** der 6 Laufzeit-Texturen (6x nearest).
- Vorher/Nachher-Schaltung: URL-Parameter `shotsig=0` (Basis-Grids aus `textures.ts` + Legacy-Blitzrampe)
  vs. `shotsig=1`/default (Signaturen aus gen-fx). Boot-Quelle, weil Texturen im Boot entstehen.
- **Keine FPS-/Echtzeit-Messung** → ohne flock. Belege: `~/games/.evidence/m10-weapon-shot-readability/`.

## K1 — Vorher (commit 17699f3, `m10-weapon-shot-before.json`)

Alle 6 Signaturen solo + im Chaos belegt (Chaos-Samples: ember 28, thorn 88, lantern 354, storm 742,
frost 320, flail 32). Near-White-A7:

| Waffe | Textur | Chaos-Schuss-Pixel |
|---|---|---|
| ember | 3,23 % (1 lanternWhite-Kernpixel) | 18,5 % |
| flail | 18,4 % | 26,1 % |
| frost | 4,0 % | 32,5 % |
| storm | **58,0 %** (fx_bolt-Kern 13/12) | 21,3 % |
| thorn | 0,0 % | 0,0 % |
| lantern | 7,0 % | **37,3 %** |

Grenze 4,16 % (ACCEPTANCE-Kalibrierung) klar verfehlt; im Chaos-Shot sichtbare warme/weise
ADD-Blooms um Orb, Ring und Blitz (Sichtprüfung before-chaos300.png).

## K2 — Signaturen in gen-fx.ts (commit 105f415, #9665)

`WEAPON_SHOT_SIGNATURES` (eine Wahrheit fuer Texturen, Tests, Beleg-Skript):

| Waffe | Textur-Key | Groesse | Kern (Palette-Index) | Familie | Form |
|---|---|---|---|---|---|
| ember | projectile_ember | 7x7 | 17 emberOrange | 15–18 Glut | Komet + Tinte-Kontur, 1 helles 18er-Pixel |
| flail | flail_ball | 11x11 | 11 boneLight | 8/10/11 Knochenstahl | Kugel + N/S-Spikes, 9er-Glanz |
| frost | projectile_ice | 9x9 | 5 blueGrey | 5/6/9 kalt | Rhombus, paleMist-Kantelight |
| storm | fx_bolt | 12x16 | 7 fog | 7/11 kalt | Blitzkamm + Tintenkontur (6 Frames, Rampe 11/7/0) |
| thorn | projectile_thorn | 12x12 | 31 marshLight | 28–31 Moor | organische Speichen (unveraendert), 28er-Kappen |
| lantern | orb_lantern | 10x10 | 20 amber | 20/21 warm | runder Orb, Tinte-Ring |

- Paarweise Kernfarben: WCAG >= 1,4 ODER RGB-Distanz >= 110 (15/15 Paare, Schwellen vor der Messung
  festgelegt); keine Kern-Index-Doppler; geteilte Nicht-Kern-Farben <= 3; Silhouetten-XOR >= 8 px;
  Flaechen 49/121/81/192/144/100 paarweise verschieden (Mixel-Regel: Zielgroesse, Draw-Scale 1).
- **Runtime-Override:** `createFxTextures` registriert die 4 Keys neu, die in `textures.ts` liegen
  (projectile_ember/ice, flail_ball, orb_lantern) — Keys, Radien und Treffer-Logik bleiben identisch,
  nur die Optik kommt aus gen-fx (`textures.ts` ist fremd beansprucht, m10-chest-closed-crisp).
- `boltFrame`-Rampe 13/12/20 → 11/7/0 (Legacy hinter `shotsig=0`/Registry `lf-shot-signatures`).
- Kein A7-Near-White: 12 candleWhite, 13 lanternWhite, 22 glow sind in Shot-Signaturen tabu.

## K3 — FxSystem Draw-Pfad (commit 50b1e62, #9666)

- `SHOT_SUPPORT_ADD_ALPHA_CEIL = 0.45`: additive `fx_halo`-Support-Glows werden beim Spawn auf
  Start-Alpha 0,45 gedeckelt (Vorher 0,8–0,9) — der lanternWhite-Kern des Halos stackt nicht mehr
  hinter Orb/Kugel/Ring zu Near-White. Boss-/Event-Halos laufen ueber den makeImage-Pfad in
  CombatSystem und sind bewusst nicht Teil des Deckels.
- `SHOT_TRAIL_ALPHA_FLOOR = 0.3`: Waffen-Schweife (fx_ember_trail, fx_ice, fx_fire, fx_thorn) fallen
  im Endgame (alphaScale bis 0,2 + dprAlpha 0,6) nicht mehr unter 0,3 — das Projektil behält seine
  Bewegungsrichtung, statt als nacktes Sprite zu wirken.
- `CombatSystem.ts`/`ProjectilePool.ts` unangetastet; nur Start-Alpha von FX — Trefferpfad bitgleich.

## K4 — Tests, Bitgleichkeit, After-Belege (#9667)

### Tests

`tests/weapon-shot-readability.test.ts` (57 Tests, gruen): 6 Signaturen rechteckig/Palette-konform/
nicht leer, dunkle Kontur je Signatur (Luminanz <= 0,03), 0 % A7-Near-White, Kern-Index-Doppler-Frei,
Flaechen-Stufen paarweise verschieden; alle 15 Paare: Kern via WCAG >= 1,4 oder RGB-Dist >= 110,
geteilte Nicht-Kern-Farben <= 3, XOR >= 8 px; Paar ember/frost streng (Masken disjunkt, WCAG UND
Distanz); 4 K3-Draw-Pfad-Guards (fx_halo-Deckel, Nicht-Support unberuehrt, Trail-Boden bei
alphaScale 0,2, Spawn-Verhalten unveraendert). `npm test` 1712/1712 gruen, `tsc --noEmit` rc=0,
`npm run build` gruen.

### Treffer-/Kill-Zahlen bitgleich

Sim-exakter Determinismus-Lauf (`scripts/m10-run-determinism.mjs`, 3 Seeds x 2 Reps x 120 Sim-Sekunden,
Marken im Sim-Loop gelesen) auf diesem Branch (Signaturen aktiv) gegen die **committete Vor-Lane-
Baseline** (`shots/m10-run-det-101/202/404-r0/r1.json` — mit alter Optik aufgezeichnet):
alle 6 Mark-Dateien **bitgleich** (kills/level/xp/hp/enemies je Sim-Sekunde, finale kills
67/73/… identisch). Kopien + Urteil: `~/games/.evidence/m10-weapon-shot-readability/det-baseline/`.
Die Arbeitsshots wurden danach via `git checkout --` restauriert (fremd getrackte Dateien).
Hinweis: ein eigener Polling-basierter Det-Versuch im Mess-Skript war frame-unscharf (DIFF durch
Mess-Jitter) und wurde entfernt — der sim-exakte Beleg kommt aus dem bestehenden Harness.

### Nachher (`m10-weapon-shot-after.json`)

| Waffe | Chaos A7 vor → nach | Chaos-Kontrast vor → nach |
|---|---|---|
| ember | 18,5 % → **0,00 %** | 3,28 → 1,72 |
| flail | 26,1 % → **0,35 %** | 3,80 → 2,62 |
| frost | 32,5 % → **0,00 %** | 3,38 → 2,01 |
| storm | 21,3 % → **0,00 %** | 2,15 → 2,99 |
| thorn | 0,0 % → **0,00 %** | 1,78 → 1,54 |
| lantern | 37,3 % → **0,00 %** | 4,31 → 4,61 |

Worst Chaos 0,35 % <= 4,16 % → **PASS**. Texturen exakt 0 % (Vorher worst 58,0 %).
Kontrast-Abfall bei ember/frost/flail ist expected: die entfernt lanternWhite-Kerne hatten hohe
Luminanz; Identitaet kommt jetzt aus Farb-Familie + Kontur + Form (Paar-Tests) — art-director-Urteil unten.

Abnahme-Bilder (git): `shots/abnahme/m10-weapon-shot-{before,after}-{chaos300,sheet,solo-ember,solo-lantern}.png`.
Arbeits-Belege (nicht in git): `~/games/.evidence/m10-weapon-shot-readability/`.

## art-director-Urteil (2026-11-28)

**PASS — Note 4/5.** Belege: Kontaktblaetter 6x nearest, Chaos 2x + 4x-Zooms der Schusszentren,
Solo-Shots 4x; Messwerte gegengelesen.

1. **Auseinanderhaltbarkeit:** erfuellt — alle 6 Signaturen schussgross trennbar (Ember orange,
   Lantern gold, Storm stahlblau-zickzack, Frost blaugrau, Flail Knochen-Diamant, Thorn gruen).
   Schwerstes Paar Flail vs. Storm (beide blass) wird ueber Form getrennt; Ember vs. Lantern ueber Form.
2. **Kein Auswaschen:** erfuellt — Vorher ausgebrannte Weiss-Massen (18–37 % A7), Nachher nur noch
   warmes Oliv/Amber, Messwerte 0,00–0,35 % decken sich mit dem Bildeindruck; Halo-Deckel wirkt.
3. **Signaturen an sich:** ueberwiegend sauber (Frost sauberstes Asset); kleine Makel: Storm-
   Zickzack mechanisch alternierend, Flail 1-px-Dunkelpixel an der Kante — tolerierbar.
4. **Regression:** leicht und akzeptiert — Ember/Lantern haben ihre Weisskerne verloren (bewusster
   A7-Trade), bleiben identifizierbar; Größenstaffel im Kontaktblatt plausibel.
5. **Thorn auf Moorgrund:** knapp akzeptiert — schwächste Signatur, getragen von hellen Spitzen +
   dunkler Kontur; vorher nie verwaschen (0 %), Silhouette eindeutig.

Muss-Korrekturen: keine. Optional (Qualitätsreserve, nicht blockierend, nicht umgesetzt):
1. Thorn je Spitze +1 px marshLight (schwaechste Signatur im Moor-Chaos);
2. Storm-Zickzack asymmetrisch staffeln (loest das mechanische Wechselmuster, trennt zusaetzlich
   vom blassen Flail);
3. Ember 1–2 hellere Kernpixel unter der A7-Grenze (holt Kernidentitaet zurueck; gepruefte
   Alternative: Kern 19, mit allen 15 Paaren konform).

## Offene Punkte / Hinweise

- `SPRITE_GRIDS.projectile_ice` (textures.ts, fremd beansprucht) beschreibt noch das alte 7x7-Grid;
  Runtime-Wahrheit fuer die 4 ueberschriebenen Keys ist jetzt `WEAPON_SHOT_SIGNATURES` in gen-fx.ts.
  Beim naechsten textures.ts-Kontakt (m10-chest-closed-crisp) dort synchronisieren.
- ember-Chaos-Kontrast 1,72 (vor 3,28): der dunklere Kern (17 statt lanternWhite) ist der Preis fuer
  0 % Near-White; der ember-Schweif (Alpha-Boden) traegt die Bewegungsrichtung. Falls der art-director
  eine hellere Kernstufe will: ember-Kern 19 waere mit allen 15 Paaren noch konform (gepruefte
  Alternative, nicht umgesetzt).
- Solo-Shots zeigen teils ungerenderte Boden-Chunks rechts (Teleport-Kosmetik im Beleg, nicht im Spiel).
- `shotsig=0` ist ein permanenter Vorher-Schalter (wie `lf-proj-cull`), auch fuer kuenftige A/B-Messungen.
