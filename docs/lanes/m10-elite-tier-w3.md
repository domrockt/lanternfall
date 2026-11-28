# Lane m10-elite-tier-w3 — Elite-Tier-Nachbesserung Welle 3 (#8298/#8299)

Rettest die backlog-Karte **#7526** (T4-Stufenkollaps) aus der Lane-Doku
`m10-elite-tier-refine` (Abschnitt „Abnahme"/„Offene Punkte"); die Karte ging als
Lane-Backlog beim Board-Reconcile verloren. Basis: main **nach** dem Merge
`merge-m10-elite-tier-refine` (Worktree `m10-elite-tier-w3`, Branch
`m10-elite-tier-w3`). Board: #8298 (K1), #8299 (K2).

## K1 — T4-Stufenkollaps (#7526, Pflicht)

**Befund (refine):** Bei Mix 0,7 kollabieren T4-Typen auf zu wenige Innen-Schattierungsstufen —
`horror` 1 Stufe, übrige betroffene T4-Typen 2.

**Hebel:** Per-Type Soft-Mix 0,55–0,6 in `eliteTierMixFor` für genau die betroffenen
T4-Typen. Offline-Suchlauf mit festem Iterationslimit (2 Edit-Iterationen, dann
verbindlich ausgewert — Werkzeug lief als temp. Vitest-Datei, nur das Ergebnis-JSON
ist committet): `shots/m10-elite-tier-w3-analysis.json`.

### Suchlauf-Ergebnis (Offline, exakt, Rim-Frame-Logik wie `eliteRimFrame`)

| T4-Typ | Stufen @ 0,7 | adopted Mix | Stufen nachher | Befund |
|---|---|---|---|---|
| horror | 1 (`[31]`) | **0,6** | **2** (`[9,31]`) | Ziel ≥ 2 erfüllt |
| gargoyle | 2 (`[9,31]`) | **0,6** | **3** (`[7,9,31]`) | Ziel ≥ 3 erfüllt |
| centipede | 2 (`[9,31]`) | 0,7 (unverändert) | 2 | im Fenster 0,55–0,6 **nicht heilbar** |
| reaper_bat | 2 (`[9,31]`) | 0,7 (unverändert) | 2 | im Fenster **nicht heilbar** |
| abom | 2 (`[9,31]`) | 0,7 (unverändert) | 2 | im Fenster **nicht heilbar** |
| voidcaller | 2 (`[9,31]`) | 0,7 (unverändert) | 2 | im Fenster **nicht heilbar** |

- `horror`/`gargoyle` → aufgenommen in `ELITE_TIER_MIX_FINE_TYPES` (0,6, Gruppe wie imp).
- centipede/reaper_bat/abom/voidcaller bleiben bei 2 Stufen **für das gesamte
  Fenster 0,55–0,6** (Kandidaten-Tabelle im JSON, alle Mixes geprüft, kein Treffer
  ≥ 3): ihre Basis-Rampen mischen mit marshLight (31) nur auf die zwei Indices
  `[9,31]` — nicht heilbar ohne neuen Palettenindex, **dokumentiert statt getrickst**
  (gleiches Muster wie skeleton/bat und T0-Basen im Refine).
- 0,6 ist innerhalb des vorgeschriebenen Fensters zugleich der **gruen-optimale**
  Mix (stärkster Dye-Anteil = höchster gruen-Anteil); das Suchlauf-Fenster war
  damit in beiden Richtungen ausgeschöpft, kein weiteres Tuning.

### Messbare Ziele — Vorher/Nachher (`scripts/m10-elite-tier.mjs`, EIN Lauf je Stand)

Chaos 305 Nicht-Elites + Elite-Cluster (2 je Typ), 640×360-Fenster bei 960×540,
4x-nearest-Crop. **K2 wurde verworfen (siehe unten) → kein Code-Delta nach K1 →
`w3-k1` ist zugleich der After-Stand** (kein zweiter Lauf über identischem Code).

| Metrik | Vorher (`w3-before`) | Nachher (`w3-k1` = Final) | Ziel |
|---|---|---|---|
| horror Innen-Stufen (Offline) | 1 | **2** | ≥ 2 ✅ |
| gargoyle Innen-Stufen (Offline) | 2 | **3** | ≥ 3 ✅ |
| übrige 4 T4-Typen (Offline) | 2 | 2 — **nicht heilbar im Fenster** (neuer Palettenindex nötig) | ≥ 3 ❗ dokumentiert |
| T4-Bucket gruen (Runtime) | 77,3 % | **74,5 %** | „≥ ~75 %“ — 74,5 % knapp darunter, **dominant erhalten** (gruen 74,5 vs. mittel-neutral 24,7 vs. blau 0,8); Trade-off wie im Refine (82 → 77,3), Priorität Terrain-Kontrast |
| min Tier-Zentroid (Offline, exakt) | 43,2 | **41,8** | ≥ 30 ✅ |
| T2-dominant glut-braun (Runtime) | 83,2 % | **83,2 %** (unverändert) | ≥ 82 ✅ |
| T0/T2-Zentroid (Offline, exakt) | 134,9 | 134,9 | ≥ 130 ✅ |
| Amber-Rim-Anteil (A10) | 1,0 | **1,0** | 1,0 ✅ |
| Burst-FPS (median/mean, 240 Ticks, flock) | 60/60 | **60/60** | within noise ✅ |
| JS-Fehler / lebend / Elites / texMiss | 0 / 339 / 34 / 0 | 0 / 339 / 34 / 0 | ✅ |
| Renderer (Pflicht) | Mesa Intel RPL-S (iGPU) | Mesa Intel RPL-S (iGPU) | kein SwiftShader ✅ |

\* Offline-Vorher-Guards im Refine-Stand (`guardsBaseline`, horror/gargoyle noch
0,7): min Zentroid 43,2, T0/T2 134,9, Chaos-gewichtetes T4-gruen-Subset 78,7 %.
Nach dem K1-Fix: 41,8 / 134,9 / 75,9 %. Das Chaos-gewichtete Offline-Subset liegt
nahe an, ist aber nicht identisch mit der Runtime-Metrik (2 Instanzen je Typ,
ungewichtet) — die verbindliche gruen-Gegenprobe ist der Runtime-Lauf.

### Verträge (unangetastet, geprüft durch Test-Suite)

- A10: 100 % der Randpixel Amber PAL 20 (`amberShareMin = 1` in beiden Läufen).
- Silhouette bytegleich, Kontur (0) und Augen/Glow (13) unangetastet,
  genau 1 Frame je Typ (`<spriteKey>_rim`), Nicht-Elite-Frames bytegleich
  (crowd-variety-Test), nur Palettenindizes/binäres Alpha/eine Pixelgröße.
- Nur `src/gfx/enemySprites.ts` (Kommentar + 2 Set-Einträge) und
  `tests/elite-tier-families.test.ts` (neuer K1-Test) geändert — tiles.ts,
  EnemyPool, Run.ts, gen-fx.ts unberührt; keine Bedarfsmeldungen nötig.

## K2 — centipede/voidcaller paleMist-Befund: **VERWORFEN**

Refine-Befund: die hellen Basen `centipede`/`voidcaller` (nacht-Rampe `[5,7,9]`)
mischen bei T4 teils auf paleMist (9) — im Bucket mittel-neutral statt gruen.
EIN Offline-Suchlauf (im selben Lauf wie K1, keine zweite Messung): alle 32
Palette-Indizes gegen die Dye-Verträge geprüft (Luminanz 50–160, Abstand zum
Amber-Rim ≥ 45, Paar-Abstand ≥ 55 zu allen 5 Tier-Dyes) → **6 Kandidaten**,
davon lesbar relevant:

| Kandidat-Dye | centipede „Fremd-Familie“-Anteil | voidcaller | T4 gruen (Guard) | Urteil |
|---|---|---|---|---|
| — (Ist: 31) | 67,6 % (paleMist 67,6 %) | 62,2 % | 75,9 % | Befund bestätigt |
| 26 (blut-rot hell) | **0 %** | **0 %** | **65,4 % < ~75 %** | ❌ verletzt K1-Grenze |
| 30 (marsh) | 29,8 % | 22,9 % | 87,3 % | ❌ liegt in der häufigen Grasrampe (28/29/30) — reintroduziert exakt den Refine-K1-Mangel (T4-Körper auf Grasfarben unlesbar); Fremd-Anteil bleibt zudem ~30 %/23 % |
| 5/6/9/29 | 32,4–97,9 % | 59,7–90,5 % | 65,4–67,3 % | ❌ keine Verbesserung bzw. Grenzverletzung |

**Entscheidung: verworfen.** Kein per-Type-Dye macht beide Typen nachweislich
lesbarer, ohne eine K1-Grenze (gruen ≥ ~75 % bzw. Terrain-Kontrast) zu verletzen:
der einzige guard-konforme Kandidat (30) ist die Grasrampe selbst, der einzige
voll lesbar machende (26) bricht die gruen-Dominanz. Die Lesbarkeit von
centipede/voidcaller bei T4 trägt weiterhin Rim + Silhouette (Refine-Entscheidung,
art-director-Priorität Terrain-Kontrast). Kein neuer Palettenindex → offener
Punkt bleibt dokumentiert; keine zweite Karte, kein zusätzliches Messen.

## Messungen & Belege

- `shots/m10-elite-tier-w3-before.json/.png/-crop4x.png` — Baseline (Ist-Stand nach Refine-Merge)
- `shots/m10-elite-tier-w3-k1.json/.png/-crop4x.png` — Final-Stand (= After, K2 verworfen)
- `shots/m10-elite-tier-w3-analysis.json` — Offline-Suchlauf: K1-Baseline-/Kandidaten-/Adoption-Tabellen,
  Guards (Vorher/Nachher, Chaos-gewichtete Runtime-Subsets), K2-Kandidaten-Tabelle.
  Provenienz: der committete Lauf ist der Offline-Lauf im **Vorher**-Codezustand;
  `k1.guards` rechnet über die expliziten Adoption-Mixes (= Nachher-Stand, 41,8/75,9 %),
  `k1.guardsBaseline` über `eliteTierMixFor` (Vorher, 43,2/78,7 %) — Kandidaten- und
  K2-Tabellen sind mischexplizit und standunabhängig; mit dem After-Lauf abgeglichen.
- Renderer-String-Pflicht erfüllt: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
  OpenGL ES 3.2)` (iGPU, kein SwiftShader) in beiden Lauf-JSONs.

## Abnahme

- `npx tsc --noEmit` grün, `npm run build` grün, `npm test` 1357/1357 grün
  (elite-tier-families 7, elite-rim 11, crowd-variety 6, enemy-palette 6).
- **art-director (streng, kommerziell auslieferbar, am 4x-Crop + eigenem Offline-Render
  10x nearest): PASS 4/5, „muss neu": nichts.** Eigenverifikation deckt sich exakt mit
  analysis.json (horror 1 → 2 Stufen `[31,9]`, gargoyle 2 → 3 `[31,9,7]` als
  zusammenhängendes Brust-/Flügel-Band, kein Einzelpixel-Rauschen); Amber-Rim 1,0
  alle 17 Typen in beiden Läufen; Palette/binäres Alpha/keine Mixel; T4-Familie
  liest sich grün gegen Moorgras und T0–T3. Abwertungen (kein Muss, dokumentiert):
  horror 2. Stufe dünn (11/242 Innenpixel ≈ 4,5 %), 4 T4-Typen bei 2 Stufen (neuer
  Palettenindex nötig), gruen 74,5 % vs. ~75 %.
- **Reviewer: PASS** — Scope sauber (nur enemySprites.ts + elite-tier-families.test.ts +
  Doku/shots; tiles.ts/EnemyPool/Run.ts/gen-fx.ts unberührt), `eliteTierMixFor` bleibt
  reine deterministische Funktion, K1-Test echt nicht-tautologisch (Entfernen aus dem
  Set → Mix 0,7 → Stufen 1/2 → rot), 30/30 Zieltests grün. 3 Doku-Zahlen korrigiert
  (min Zentroid Vorher 43,2, K2-Zeile 32,4–97,9 %, elite-rim 11) + Testtitel Fine-Mix.
- Mess-Skript-Budget: Suchlauf 2 Edit-Iterationen (Modell-Validierung + Label-Fix
  via stash/run — keine Tuning-Schleife), Runtime-Läufe je Stand 1x.

## Offene Punkte / Abgrenzung

- 4 T4-Typen (centipede/reaper_bat/abom/voidcaller) bleiben bei 2 Innen-Stufen —
  heilbar nur mit neuem Palettenindex (neue Palette = GAME.md-Änderung, ausdrücklich
  nicht in dieser Lane).
- T4-Bucket gruen 74,5 % (~-0,5 pp unter der ~75 %-Marke): bewusster Trade-off
  zugunsten der Stufenziele horror/gargoyle; dominant erhalten. Falls Dom die
  Marke hart (≥ 75,0 %) will, müsste entweder gargoyle (3 → 2 Stufen, zurück auf
  0,7) oder ein neuer Palettenindex geopfert werden — Entscheidung zurückgestellt.
- skeleton/bat (2 Stufen) und T0-Basen (1 Stufe) unverändert — nicht heilbar ohne
  neuen Palettenindex (Refine-Stand, dokumentiert statt getrickst).
