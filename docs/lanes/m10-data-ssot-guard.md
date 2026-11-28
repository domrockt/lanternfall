# Lane m10-data-ssot-guard — Data-SSOT-Konsistenz (Karten #10964–#10967)

Ziel: Die drei Data-SSOT-Dateien (`src/data/weaponIds.ts`, `src/data/index.ts`, `src/data/types.ts`)
durch einen lesenden Befund-Lauf und einen Guard-Test schützen, ohne Verhalten zu ändern
(acceptance-count bleibt bitgleich 30/6/6/6/6/2, A3).

## Werkzeug

`scripts/m10-data-ssot.mjs` (SSR-Loader wie `scripts/acceptance-count.mjs`, **nur lesend**):
- ID-Eindeutigkeit in `WEAPON_IDS`, `EVOLUTION_WEAPON_IDS`, `PASSIVE_IDS`, `CHARACTER_IDS`, `BOSS_IDS`, `ENEMY_IDS`
- `weaponIds` (types.ts) vs. `WEAPONS`-Keys; `EVOLUTION_WEAPON_IDS` vs. `EVOLUTION_WEAPONS`-Keys
- Evolutions-Paare: jede Basiswaffe genau 1×, `passive` ∈ `PASSIVE_IDS`, `id` ∈ `EVOLUTION_WEAPON_IDS`,
  EVOLUTION_WEAPONS-Eintrag vorhanden, `behavior === id`
- Key/ID-Drift für PASSIVES/CHARACTERS/ENEMIES/BOSSES; `weaponDef()` löst jede `WeaponAnyId` auf
- Waffen-Stufen fortlaufend 1..`maxLevel`; `BOSSES[i].index === i` und Reihenfolge = `BOSS_IDS`
- types.ts-Exporte ohne Consumer (inkl. transitiver Nutzung); Felder der Kern-Interfaces ohne Referenz
- acceptance-count-Vertrag 30/6/6/6/6/2

Belege: `~/games/.evidence/m10-data-ssot-guard/m10-data-ssot-{before,after}.json`
(sowie lokal `shots/m10-data-ssot-*.json`, laut .gitignore nicht ins Repo).

## K1 Befund (Vorher, Commit 153aa244)

Lauf `node scripts/m10-data-ssot.mjs before` → **rc=0, ok:true, findingCount:0**, `contractOk:true`,
counts = enemies 30, weapons 6, powerups 6, evolutions 6, bosses 6, characters 2.

- Keine doppelten IDs in einem der sechs ID-Arrays.
- `WEAPON_IDS` ↔ `WEAPONS`-Keys identisch (ember, flail, frost, thorn, storm, lantern);
  `def.id` stimmt in jedem Eintrag mit dem Key überein.
- `EVOLUTION_WEAPON_IDS` ↔ `EVOLUTION_WEAPONS`-Keys identisch; alle 6 Evolutions-Paare vollständig,
  jede Basiswaffe genau 1× abgedeckt, `behavior === id` überall.
- Kein Key/ID-Drift bei Passives/Characters/Enemies/Bosses; `weaponDef()` löst alle 12 IDs auf.
- Alle 12 Waffen haben Stufen 1..8 fortlaufend; Boss-Indizes/Reihenfolge konsistent.
- Typen ohne Consumer: keine. Fünf Typen werden nur **innerhalb von types.ts transitiv** konsumiert
  (`EvolutionWeaponId` → `WeaponAnyId`; `BossId` → `BossDef`; `WeaponBehavior` → `WeaponDef.behavior`;
  `PassiveLevel` → `PassiveDef.levels`; `WaveSpecial` → `WaveDef.special`) und von dort in Run.ts,
  LevelUpSystem.ts, BossSystem.ts, Spawner.ts usw. verwendet — kein toter Code.

## K2 Fix-Entscheidung

**Keine belegten Inkonsistenzen in den drei area-Dateien → keine Fixes erforderlich.**
Damit entfällt jede Verhaltensänderung; der acceptance-count-Vertrag bleibt bitgleich
(Nachher-Lauf in K4 belegt das erneut). Befunde in Fremd-Dateien: keine — keine Bedarfsmeldung in
`/home/ai/games/.dispatch/requests.md` nötig. `src/data/characters.ts` (merge-m10-charstats-ssot)
und `src/data/waves.ts` (balance-Kette) wurden wie befohlen strikt nur lesend betrachtet.

Anmerkung (nicht umgesetzt, kein Handlungsbedarf): `EVOLUTION_WEAPONS` ist als
`Partial<Record<WeaponAnyId, WeaponDef>>` typisiert; der Streber-Check (Key-Menge = ID-Menge)
läuft im Skript und im Guard-Test, daher ist die schwächere Typisierung verträglich. Eine Schärfung
auf `Record<EvolutionWeaponId, WeaponDef>` läge in `src/data/evolution-weapons.ts` (fremd) —
bei Bedarf dort als eigene Karte.

## K3 Guard-Test

`tests/data-ssot.test.ts` mit 10 Assertions: ID-Eindeutigkeit (6 Arrays), weaponIds-Sollmenge 6,
Evolutions-Paare vollständig (Basisabdeckung + Passives + Behavior), types-Kernfelder vorhanden,
acceptance-count-Sollwert 30/6/6/6/6/2.

## K4 Nachher

`node scripts/m10-data-ssot.mjs after` → rc=0, ok:true, 0 Befunde (siehe Beleg-Pfad oben).
`node scripts/acceptance-count.mjs` → ok:true, 30/6/6/6/6/2 unverändert.
