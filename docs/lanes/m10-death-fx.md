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

## #K2 Spec schärfen (`src/logic/death.ts`)

`DeathFxSpec` trägt jetzt pro Klasse eigene, deterministische VFX-Werte
(keine Zufallszahlen in der Spec, keine Gameplay-/Balance-Felder):

| Klasse | Shard | Dust | Count | DustCount | Life | DustLife | Scale | Spread | Tint/DustTint | Additiv |
|---|---|---|---|---|---|---|---|---|---|---|
| crumble | fx_death_bone | fx_ash | 6 | 4 | 0,60 s | 0,45 s | 0,90→0,35 | 42 px/s | bone / mist | nein |
| burst | fx_death_blob | fx_death_blob | 16 | 8 | 0,35 s | 0,28 s | 1,60→0,90 | 130 px/s | marshLight / mossDark | nein |
| dissolve | fx_death_void | fx_dusk | 9 | 5 | 0,80 s | 0,90 s | 1,20→0,15 | 22 px/s | fogBlue / nightMid | ja |
| sputter | fx_death_dust | fx_fire | 20 | 10 | 0,45 s | 0,55 s | 1,30→0,20 | 165 px/s | flame / emberOrange | ja |

Boss-Variante (`deathFxFor(cls, true)`): eigene Kern-Textur `fx_boss_core`
plus `fx_halo`-Staub, größerer Count (18–34), längere Lebensdauer (0,7–1,4 s)
und ≥ 2× Fläche gegenüber der Nicht-Boss-Klasse (Scale-Ratio quadratisch;
Minimum 2,56× bei burst). Keine neuen Assets — nur vorhandene FX-Texturen.

## #K3 Umsetzung (`src/systems/CombatSystem.ts`, `killsFx`)

`killsFx` liest `deathClassFor(archetype)` → `deathFxFor(cls, e.boss)` und
übergibt **alle** Spec-Felder an die beiden `particles.burst`-Aufrufe
(Shard/Dust, Count/DustCount, Life/DustLife, ScaleFrom/To, DustScale, Spread,
Tint/DustTint, Additiv). Elite bleibt Zwischenstufe (×1,15 Scale, ×1,4 Count).
Schaden/Hitboxen unverändert. Zusätzlich Nachzug aus der Sichtprüfung:
Todes-Partikel liegen jetzt auf `DEPTH.enemyDeath` (11) statt `fxLow` (7) und
sind damit im 300er-Gedränge **über** den Gegnern sichtbar (vorher verdeckt).
Elite/Boss-Texturen unverändert.

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
(`setTimeScale(0)`), Messung aus dem Partikel-Pool. Final: **308 lebende
Gegner**, `jsErrors: []`, fps 60 im Lauf (48,9 im eingefrorenen Frame).
Rohdaten: `shots/m10-death-fx-frame.json`.

### 4 Klassen-Crops (3× nearest, 160×133 → 480×399)
| Klasse | Datei | Texturen | Partikel (6 Tode) | BBox im Bild (Spiel-px) | Fläche 50 ms |
|---|---|---|---|---|---|
| crumble | `shots/m10-death-fx-crumble.png` | fx_death_bone + fx_ash | 60 | 36×32 | 2 461 px² |
| burst | `shots/m10-death-fx-burst.png` | fx_death_blob | 43 | 86×91 | 21 096 px² |
| dissolve | `shots/m10-death-fx-dissolve.png` | fx_death_void + fx_dusk | 84 | 37×38 | 16 533 px² |
| sputter | `shots/m10-death-fx-sputter.png` | fx_death_dust + fx_fire | 114 | 95×97 | 17 223 px² |

Messung: Partikel-BBox aus `sprite.x/y ± displayWidth/Height` im Pool, Filter
≤ 90 px um den Effektort (6 gleichzeitige Tode, ~50 ms nach Auslösen).
Fläche = Summe `displayWidth × displayHeight` je Klasse. Die vier Klassen
unterscheiden sich damit messbar in **Textur, Count, Lebensdauer, Scale,
Streuung und Farbe** (≥ 3 Dimensionen, siehe #K4). Die Crops zeigen die
Effekte über **lebenden** Gegnern.

Ehrlicher Befund: `crumble` ist bewusst kleinteilig/kurz (36×32 px, 2 461 px²)
und liegt im Gedränge eher als feine Knochenspur; `burst` ist mit 86×91 px am
größten, aber grün-auf-grün kontrastarm — im 3×-Zoom als Blob-Wolke lesbar,
bei 1× im Gedränge am schwächsten. `dissolve` (weißer Halo-Ring) und `sputter`
(orange Funken/Asche) sind am klarsten lesbar.

### Messung: Differenz je Klassenpaar (Spec-Dimensionen)
`tests/death-fx.test.ts` prüft je Paar ≥ 3 unterscheidbare Dimensionen; aus den
Specs gezählt (Count, DustCount, Life, DustLife, ScaleFrom/To, DustScale,
Spread, Tint, DustTint, Shard, Dust, Additiv):

| Paar | unterscheidbare Dimensionen |
|---|---|
| crumble ↔ burst | 12 |
| crumble ↔ dissolve | 13 |
| crumble ↔ sputter | 13 |
| burst ↔ dissolve | 13 |
| burst ↔ sputter | 12 |
| dissolve ↔ sputter | 12 |

Boss vs. Nicht-Boss (Fläche = Scale-Ratio²): crumble 1,44/0,90 → **2,56×**,
burst 2,56/1,60 → **2,56×**, dissolve 1,92/1,20 → **2,56×**, sputter
2,08/1,30 → **2,56×**. Boss-Count 18–34 vs. 6–20, Life 1,1–1,4 s vs.
0,35–0,8 s, eigene Textur `fx_boss_core`.

### Art-Director-Urteil (einmalig, Runde 1)
**FAIL — 2,3/5.** Begründung: Klassen nur über Farbe unterscheidbar, nicht über
Silhouette; drei von vier Effekten ohne lesbaren Kern/Kontur. Einzelnoten:
crumble 2,0/5 (1–2-px-Sprengsel, kein Rim), burst 1,5/5 (grün-auf-grün, weiche
Ränder), dissolve 2,5/5 (weicher Halo/Alpha-Blur, generischer Trefferblitz),
sputter 2,0/5 (Orange wie Gegner, unscharfer Glow). Im 308-Gegner-Frame geht
jeder Effekt im Chaos unter; nur der weiße Dissolve-Blitz poppt. Frame-Style
(Props, Gegner, Palette) ist ok.

**Abbruch statt Iteration:** Die geforderten Korrekturen (harte Bänder,
dunkelblaue Rims, klarere Tropfen-/Asche-Silhouetten) brauchen neue/überarbeitete
Frames in `src/gfx/gen-fx.ts` — dieser Bereich ist an eine andere Lane vergeben
und in dieser Lane nicht schreibbar. Deshalb #1782 **blocked**: Doku/Crops/
Messung liegen vor, das Art-Urteil ≥ 4/5 ist mit den vorhandenen Texturen nicht
erreichbar. Follow-up: gfx-Nachzug (Death-Motifs mit Rim/Kern) als eigene Karte.

### Boss-Tod
Eigene Stufe über `fx_boss_core` + `fx_halo`, ≥ 2,56× Fläche, 18–34 Partikel
und 0,7–1,4 s Lebensdauer; per Test #K4 belegt, nicht als Crop belegt (Boss
steht nicht im 300er-Gegnerframe).
