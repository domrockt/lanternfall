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
