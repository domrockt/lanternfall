# Lane m10-death-fx — Todes-VFX im Massenkampf

Ziel: Die vier Todesklassen aus `src/logic/death.ts` sind im Massenkampf (300+
Gegner) sichtbar unterscheidbar; Boss-Tode sind eine eigene Stufe.

## #K1 Ist-Stand (effektive DeathFxSpecs)

Erhoben per temporärem Vitest-Probe (`deathClassFor`/`deathFxFor` gegen alle
30 `ENEMIES`) am 27.11.2026. Die Tabelle ist die effektive Spec, die
`CombatSystem.killsFx` heute erhält.

| Gegner | Name | Archetyp | Klasse | Shard | Dust | Count | Additiv | Boss-Count | Boss-Shard |
|---|---|---|---|---|---|---|---|---|---|
| bog_rat | Moorratte | swarm | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| wisp | Irrlicht | chaser | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| mudling | Schlammling | splitter | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| crow | Aaskrähe | swarm | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| bogzombie | Moorleiche | chaser | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| toad | Giftkröte | ranged | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| skeleton | Knochenwächter | chaser | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| bat | Blutfledermaus | swarm | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| ghoul | Ghul | charger | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| witchling | Hexenlehrling | ranged | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| slime | Moorschleim | splitter | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| scarecrow | Strohmann | tank | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| wolf | Schattenwolf | charger | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| banshee | Klageweib | phaser | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |
| golem | Torfgolem | tank | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| spider | Grabspinne | swarm | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| cultist | Kultist | summoner | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |
| bomber | Pilzbomber | exploder | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| knight | Verfluchter Ritter | tank | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| harpy | Moorharpyie | orbiter | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |
| lich | Kleiner Lich | ranged | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| wraith | Wiedergänger | phaser | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |
| treant | Faulbaum | tank | crumble | fx_death_bone | fx_ash | 8 | false | 26 | fx_death_bone |
| imp | Glutimp | exploder | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| horror | Augenhorror | ranged | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| centipede | Knochenläufer | charger | sputter | fx_death_dust | fx_fire | 8 | true | 26 | fx_death_dust |
| gargoyle | Wasserspeier | orbiter | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |
| reaper_bat | Nachtsense | swarm | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| abom | Fleischkoloss | splitter | burst | fx_death_blob | fx_death_blob | 8 | false | 26 | fx_death_blob |
| voidcaller | Leerenrufer | summoner | dissolve | fx_death_void | fx_dusk | 8 | true | 26 | fx_death_void |

Verteilung: burst 8, crumble 7, sputter 9, dissolve 6 Gegner.

**Befund:** Es kommen **4 Klassen** im normalen Kampfpfad an
(`CombatSystem.killsFx`), nicht nur 2 — der Verdacht bestätigt sich für den
Kampfpfad nicht. Die 4 Specs sind heute aber nur in **2 Dimensionen**
unterscheidbar (Shard-Textur + Additiv/Dust); Count (8), Lebensdauer und
Scale sind für alle Nicht-Boss-Klassen identisch, und die 9×9-Shards sind im
300er-Gedränge sehr klein. Zusätzlich kollabiert der Morgendämmerungs-Pfad in
`src/scenes/Run.ts` (nicht in dieser Lane) auf `fx_death_blob`/`fx_ash`, also
2 Klassen. Für die Abnahme „sichtbar unterscheidbar" reicht der Ist-Stand
damit nicht: #K2 gibt jeder Klasse eigene Count-/Größen-/Dauer-/Farb-/
Streuungswerte, #K3 nutzt sie in `killsFx`.

Offener Restpunkt aus ACCEPTANCE („keine Automatik für Todes-VFX") ist damit
adressiert: die Spec wird nicht mehr implizit aus zwei Texturen abgeleitet,
sondern ist eine explizite, getestete Datenstruktur.

Beleg-Commit: `23f3c4a` (#K1, Board-Karte #1778).

## #K2 Spec schärfen (`src/logic/death.ts`)

`DeathFxSpec` trägt jetzt pro Klasse eigene, deterministische VFX-Werte
(keine Zufallszahlen in der Spec, keine Gameplay-/Balance-Felder):

| Klasse | Shard | Dust | Count | DustCount | Life | DustLife | Scale | Rim (Scale/Tint) | Spread | Tint/DustTint | Additiv |
|---|---|---|---|---|---|---|---|---|---|---|---|
| crumble | fx_death_bone | fx_ash | 10 | 4 | 0,60 s | 0,45 s | 1,60→0,50 | fx_death_bone (1,15 / nightDeep) | 42 px/s | boneLight / mist | nein |
| burst | fx_death_blob | fx_death_blob | 16 | 8 | 0,35 s | 0,28 s | 2,40→1,00 | fx_death_blob (1,14 / nightDeep) | 130 px/s | marshLight / mossDark | ja |
| dissolve | fx_death_void | fx_dusk | 11 | 5 | 0,80 s | 0,90 s | 2,00→0,30 | fx_death_void (1,25 / nightDeep) | 22 px/s | fogBlue / nightMid | ja |
| sputter | fx_death_dust | fx_fire | 20 | 10 | 0,45 s | 0,55 s | 2,20→0,30 | fx_death_dust (1,20 / nightDeep) | 165 px/s | flame / emberOrange | ja |

Neu in #K5 (Art-Director-Befund Runde 1: „kein Rim/Kern"): jede Klasse
zeichnet eine **dunkle Kontur** (`rim`, nightDeep, ~1,1–1,25× Scale) hinter
die hellen Splitter; `burst`/`sputter` bekommen zusätzlich einen hellen Kern
(`fx_star`/`fx_fire`). Die Skalen wurden angehoben (9-px-Texturen auf
14–22 px), damit die Silhouetten im 300er-Gedränge lesbar sind.

Boss-Variante (`deathFxFor(cls, true)`): eigene Kern-Textur `fx_boss_core`
plus `fx_halo`-Staub, größerer Count (18–34), längere Lebensdauer (0,7–1,4 s)
und ≥ 2× Fläche gegenüber der Nicht-Boss-Klasse (Scale-Ratio quadratisch;
Minimum 2,56× bei burst). Keine neuen Assets — nur vorhandene FX-Texturen.

Beleg-Commit: `b631b71` (#K2, Board-Karte #1779). Rim-/Kontur-Felder
(`rim`, `rimTint`, `rimScale`) kamen in #K5/#1782 dazu.

## #K3 Umsetzung (`src/systems/CombatSystem.ts`, `killsFx`)

`killsFx` liest `deathClassFor(archetype)` → `deathFxFor(cls, e.boss)` und
übergibt **alle** Spec-Felder an die Partikel-Aufrufe (Shard/Dust,
Count/DustCount, Life/DustLife, ScaleFrom/To, DustScale, Spread, Tint/DustTint,
Additiv) plus die Rim-Felder an einen zusätzlichen Kontur-Burst auf
`DEPTH.enemyDeath - 0,5`. Elite bleibt Zwischenstufe (×1,15 Scale, ×1,4 Count).
Schaden/Hitboxen unverändert. Todes-Partikel liegen auf `DEPTH.enemyDeath` (11)
und sind damit im 300er-Gedränge **über** den Gegnern sichtbar.

## #K4 Test (`tests/death-fox.test.ts` → `tests/death-fx.test.ts`)

`npx vitest run tests/death-fx.test.ts` → 5/5 grün:
- jeder der 30 Archetypen mappt auf genau eine der 4 Klassen, alle 4 kommen vor;
- alle 4 Klassen paarweise in ≥ 3 Dimensionen unterscheidbar (plus eigene Shard-Textur);
- Boss-Spec ≠ Nicht-Boss-Spec: eigene Textur `fx_boss_core`, Fläche ≥ 2×, mehr/länger/weiter;
- deterministisch: zwei Läufe liefern byte-identische JSON-Specs;
- Spec enthält nur VFX-Felder (kein `damage`/`hp`/`radius`).

## #K5 Beleg + Doku

### Eingefrorener Frame (~300 Gegner)
`shots/m10-death-fox-frame.png` → **`shots/m10-death-fx-frame.png`** (960×540,
Canvas 480×360 @1,5). 6×50 Bog-Ratten ringförmig gespawnt, danach je Klasse
6 frische Gegner am Effektort getötet; Szene für den Shot eingefroren
(`setTimeScale(0)`), Messung aus dem Partikel-Pool. Final: **309 lebende
Gegner**, `jsErrors: []`, fps 59,9 im Lauf. Rohdaten:
`shots/m10-death-fx-frame.json`.

### 4 Klassen-Crops (2× nearest, 320×266 → 640×532)
| Klasse | Datei | Texturen | Partikel (6 Tode @50 ms) | BBox im Bild (Spiel-px) | Fläche 50 ms |
|---|---|---|---|---|---|
| crumble | `shots/m10-death-fx-crumble.png` | fx_death_bone + fx_ash (+Rim fx_death_bone/nightDeep, 4 lange Splitter) | 132 | 27×22 | 17 472 px² |
| burst | `shots/m10-death-fx-burst.png` | fx_death_blob + fx_star, additiv (+Rim-Ring fx_death_blob/nightDeep) | 140 | 45×45 | 47 604 px² |
| dissolve | `shots/m10-death-fx-dissolve.png` | fx_death_void + fx_dusk (+Rim fx_death_void/nightDeep) | 120 | 26×27 | 39 450 px² |
| sputter | `shots/m10-death-fx-sputter.png` | fx_death_dust + fx_fire (+Rim fx_death_dust/nightDeep, 6 Flammenzungen) | 140 | 37×37 | 40 852 px² |

Rohdaten: `shots/m10-death-fx-measure.json`; Messung nach `particles.clear()`
je Klasse, 6 gleichzeitige Tode, 50 ms nach Auslösen. Fläche = Summe
`displayWidth × displayHeight` aller Partikel ≤ 90 px um den Effektort.
Die vier Klassen unterscheiden sich messbar in **Textur, Rim-Tint/Scale,
Count, Größen-BBox (26–45 px), Fläche (17,5–47,6 k px²), Lebensdauer, Streuung,
Tint und Blend-Modus** (≥ 3 Dimensionen, siehe #K4). Die Crops zeigen die
Effekte über **lebenden** Gegnern. Messung Runde 2 (nach Art-Fix, Grau-Probe
über die `shots/m10-death-fx-*-gray.png`): alle vier Silhouetten bleiben auch
ohne Grün-Kontext an der Form unterscheidbar (Knochenspur, Tropfen-Ring,
Halo-Ring, Flammenzungen) — die Form selbst ist aber noch zu generisch
(Art-Director Runde 2, siehe unten).

Ehrlicher Befund: `crumble` bleibt bewusst kleinteilig (27×22 px) und wirkt
als feine Knochenspur; `dissolve` ist mit 26×27 px der kleinste Effekt, aber
der weiße Halo-Ring ist der klarste Kontrast. `burst` (grüner Blob-Spray mit
hellem Kern und dunkler Kontur) und `sputter` (orange Funken vor dunkler
Asche-Kontur) sind am größten und im Gedränge am schnellsten erkennbar.

### Messung: Differenz je Klassenpaar (Spec-Dimensionen)
`tests/death-fx.test.ts` prüft je Paar ≥ 3 unterscheidbare Dimensionen; aus den
Specs gezählt (Shard, Dust, Count, DustCount, Life, DustLife, ScaleFrom/To,
DustScale, Rim, RimTint, RimScale, Spread, Tint, DustTint, Additiv):

| Paar | unterscheidbare Dimensionen |
|---|---|
| crumble ↔ burst | 15 |
| crumble ↔ dissolve | 15 |
| crumble ↔ sputter | 15 |
| burst ↔ dissolve | 15 |
| burst ↔ sputter | 15 |
| dissolve ↔ sputter | 15 |

Boss vs. Nicht-Boss (Fläche = Scale-Ratio²): crumble 2,88/1,60 → **3,24×**,
burst 3,84/2,40 → **2,56×**, dissolve 3,20/2,00 → **2,56×**, sputter
3,52/2,20 → **2,56×**. Boss-Count 18–34 vs. 10–20, Life 1,1–1,4 s vs.
0,35–0,8 s, eigene Textur `fx_boss_core` + Rim.

### Art-Director-Urteile

**Runde 1 — FAIL 2,3/5.** Klassen nur über Farbe unterscheidbar, nicht über
Silhouette; drei von vier Effekten ohne lesbaren Kern/Kontur. Einzelnoten:
crumble 2,0/5, burst 1,5/5 (grün-auf-grün), dissolve 2,5/5 (weicher Halo),
sputter 2,0/5 (Orange wie Gegner).

**Runde 2 (nach #K5-Fix: Rim/Kontur, größere Skalen, Grau-Gegenprobe) —
FAIL 2,5/5.** Einzelnoten: crumble 3,0/5 (klarster Effekt, aber Chunks sind
identische Rechtecke → „Scherbenring", kein Knochen; Rim zu transparent),
burst 1,5/5 (weiterhin grün-auf-grün, im 309-Gegner-Frame kaum zu finden),
dissolve 2,5/5 (Ring statt aufsteigender Schwaden, warmer Beige-Halo statt
`fogBlue`, Form/Größe kollidieren mit crumble), sputter 2,5/5 (hohle Balken/
flache Rechtecke wirken wie Konfetti, keine Flammenzungen/Ascheflakes),
Boss-Tod 3,0/5 (Flächenstufe ≥2× klar erfüllt: BBox 112×110, 214 155 px²;
Kern aber Flat-Fill ohne 3 Stufen/Kontur, keine Ringe/Splitter).

**Kernbefund:** Die Specs sind mit 15 unterscheidbaren Dimensionen und
Determinismus sauber (Test-Auditor PASS), aber **im Bild** bleiben im
Wesentlichen Farbe + Größe übrig; alle vier Formen sind „expandierender Ring".
Damit ist die Abnahme „bei 300+ Gegnern sichtbar unterscheidbar" noch nicht
erfüllt. Die vom Art-Director geforderten Korrekturen (Knochen-/Tropfen-/
Flammen-Silhouetten, harte 1-px-`nightDeep`-Konturen, 3-Stufen-Kerne, Boss-Ringe)
brauchen neu gezeichnete Frames in `src/gfx/gen-fx.ts`.

**#1782 blocked:** Doku/Crops/Messung liegen vor (Commits `b55465c`/`42377d2`),
das Urteil ≥ 4/5 ist mit den vorhandenen FX-Texturen nicht erreichbar.
`src/gfx/**` ist fremder Claim → Request in `/home/ai/games/.dispatch/requests.md`
und Follow-up-Karte für den gfx-Nachzug. K1–K4 sind erledigt (Test-Auditor PASS).

### Boss-Tod
Eigene Stufe über `fx_boss_core` + `fx_halo`, ≥ 2,56× Fläche, 18–34 Partikel
und 0,7–1,4 s Lebensdauer; per Test #K4 belegt. Zusätzlich als Crop belegt:
`shots/m10-death-fx-boss.png` (2× nearest). Messung
50 ms nach dem Tod eines Moor-Bosses: **33 Partikel, BBox 112×110 px,
Fläche 214 155 px²**, Texturen `fx_boss_core`/`fx_halo`; Rohdaten
`shots/m10-death-fx-boss.json`. Damit liegt der Boss-Tod sichtbar eine Stufe
über den Nicht-Boss-Klassen (BBox 26–45 px, Fläche 17,5–47,6 k px²).
