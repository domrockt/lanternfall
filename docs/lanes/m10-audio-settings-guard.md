# Lane m10-audio-settings-guard

Ziel: `src/audio/settings.ts` (einzige unbehandelte src-Datei) pruefen, belegte
Maengel fixen, Guard-Tests, Doku. Master-Mute bleibt bitgleich (A7-Vertrag,
`npm run verify:final` unveraendert gruen).

Karten: #11004 (K1 Befund+Vorher-Probe), #11005 (K2 Fix), #11006 (K3 Tests),
#11007 (K4 Doku+Nachher). Reservierter Block #11004-#11007, Disponent.

## Verhalten von src/audio/settings.ts (K1, gelesen + Probe)

- **Zweck:** Modul-level Cache der `Options` (music/sfx/shake/damageNumbers/muted/scale),
  geladen einmal beim Import via `loadOptions(window.localStorage)`; UI/Debug
  aendern via `changeSetting`/`setSettings`, sofort persistiert (`saveOptions`,
  Schluessel `lanternfall-options-v1` aus options.ts), Listener via
  `onSettingsChanged` (main.ts: View-Skalierung, AudioSystem.applyOptions:
  Volumes + Master-Mute).
- **Defaults** (options.ts): music 0.55, sfx 0.8, shake/damageNumbers true,
  muted false, scale 0 (Auto).
- **Persistenz-Pfad:** `saveOptions` clamped alle Felder (clampVolume/clampScale,
  Boolean-Coercion) vor dem Schreiben; Quota/Privacy-Fehler werden still
  geschluckt.
- **Load-Pfad (options.ts loadOptions, out of Scope, nur geprueft):** fehlender
  Storage / leere Payload / JSON-Muell -> Defaults; NaN/nicht-numerische Felder
  -> Feld-Default, korrupte Booleans -> Default, out-of-range -> geclamped.

## Probe (Vorher)

Skript: `scripts/m10-audio-settings.mjs` (Node `--experimental-strip-types`,
echte settings.ts/options.ts; Kindprozess pro Phase = echter Modul-Reload;
localStorage per StorageLike-Shim ueber JSON-Datei, gleicher
getItem/setItem-Vertrag). Kein flock (keine FPS-Messung).

Beleg: `~/games/.evidence/m10-audio-settings-guard/m10-audio-settings-before.json`
(generatedAt 2026-11-28T10:2xZ, label "before").

### Belegt OK

| Phase | Ergebnis |
|---|---|
| defaults (leerer Storage) | exakt DEFAULT_OPTIONS |
| set-clamp via changeSetting | music 1.7 -> 1, sfx -3 -> 0, scale 9 -> 6; muted true wird bitgleich true; 4 Listener-Events |
| Persistenz | Stored-Payload geclamped (`{"music":1,"sfx":0,...,"muted":true,"scale":6}`) |
| reload (neuer Kindprozess) | persistierte Werte kommen 1:1 zurueck |
| korrupte Payload ("kein JSON{{{") | -> Defaults |
| out-of-range Payload (music 42, sfx -5, scale 99, muted "yes") | -> music 1, sfx 0, scale 6, muted false (Default), shake true |
| resetSettings | -> Defaults |

### Belegte Maengel (nur diese werden in K2 gefixt)

1. **`setSettings()` validiert nicht** — Probe `directSet`: `setSettings({music: NaN, sfx: 2, muted: "yes"})` -> `getSettings()` liefert `music: NaN` (JSON: null), `sfx: 2` (out of range), `muted: "yes"` (kein Boolean). Konsumenten bekommen das ungefiltert: AudioSystem `settings.music * 0.55` -> NaN-Volumen; `settings.sfx <= 0`-Guthaben-Check trift keine Entscheidung mehr (2 > 0, aber nicht im 0..1-Band); main.ts-View-Hook bekommt NaN-scale-Rohdaten.
2. **Memory/Storage-Divergenz** — dieselbe Probe: Speicher `{music: NaN, sfx: 2, muted: "yes"}`, Storage geclamped `{music:0, sfx:1, muted:true}` (`memoryStorageDiverge: true`). Nach dem Reload gilt ein anderer Stand als im laufenden Spiel.
3. **Partial-Payload** — Probe `partialSet`: `setSettings({music: 0.3})` -> `getSettings()` enthaelt NUR `music`; `sfx`/`shake`/`muted`/... sind `undefined` (Konsumenten-Crashs/Garbage moeglich), kein Feld-Fallback auf Defaults.
4. **Junk-Schluessel** — Probe `partialSet`: `changeSetting("mute", 1)` (Tippfehler) haengt ein Feld `mute: 1` ans Options-Objekt (setOption-else-Zweig in options.ts, out of Scope) statt es zu verwerfen; settings.ts kann das als Gate abfangen.

### Skizze Fix (K2, nur settings.ts)

`setSettings()` normalisiert Eingaben vor Zuweisung+Persistenz pro Feld gegen
DEFAULT_OPTIONS (clampVolume/clampScale + typeof-Checks — gleiche Semantik wie
loadOptions, als lokale Hilfsfunktion, options.ts bleibt unberuehrt);
`changeSetting()` verwirft unbekannte Schluessel. Master-Mute: gueltiges
`muted: boolean` bleibt bitgleich identisch -> A7/verify:final unberuehrt.

## K2 Fix

Commit 66cae756 (`src/audio/settings.ts`, sonst nichts — options.ts,
AudioSystem.ts, meta.ts unberuehrt):

- `normalizeOptions()` (lokal): pro Feld gegen DEFAULT_OPTIONS, identische
  Semantik wie `loadOptions` (nicht-finite Zahlen -> Feld-Default,
  out-of-range -> clampVolume/clampScale, nicht-boolean -> Feld-Default,
  fehlende Felder -> Default).
- `setSettings()` normalisiert vor Zuweisung + Persistenz -> Maengel 1-3
  behoben: Konsumenten sehen immer ein komplettes validiertes Objekt,
  Memory == Storage.
- `changeSetting()` verwirft unbekannte Schluessel (Maengel 4) statt sie via
  setOption-else-Zweig als Junk-Feld anzufuegen.
- **Master-Mute bitgleich:** gueltige Eingaben durchlaufen die Normalisierung
  unverändert (`setClamp`-Probe nachher identisch: muted true, Speicherstand
  wie vorher). `npm run verify:final` (unveraendert) rc=0, alle 7 Checks PASS,
  u. a. "Master-Mute Option gesetzt options.muted=true audio.muted=true" und
  "Master-Mute nach Reload persistiert".

Probe nachher (`~/games/.evidence/m10-audio-settings-guard/m10-audio-settings-after.json`):
- `directSet` {music: NaN, sfx: 2, muted: "yes"} -> music 0.55 (Default), sfx 1
  (clamp), muted false (Default); `memoryStorageDiverge: false` (vorher true).
- `partialSet` {music: 0.3} -> komplettes Objekt inkl. Defaults; `junkKeys: []`
  (vorher ["mute"]).
- defaults/corrupt/out-of-range/reset/reload: wie vorher OK (nicht
  verschlechtert).

## K3 Guard-Tests

Commit 950d68c9: `tests/audio-settings.test.ts`, 8 Tests in 3 Blöcken:
Defaults (leerer Storage), Clamping + Listener, Persist-Roundtrip (frisches
Modul = Reload), korrupte Payload -> Defaults, out-of-range Payload ->
geclamped/Feld-Default, K2-Regression (NaN/partial -> normalisiert, Memory ==
Storage), Junk-Key verworfen, Master-Mute bitgleich (true/false + Persistenz +
resetSettings).

Lauf: Datei 8/8 PASS; Suite `npm test` 181 Dateien / 1982 Tests, 0 fail;
tsc rc=0; build rc=0.

## K4 Nachher-Probe + Fazit

Beide Probe-JSONs (gleiche Skript-Version, Kindprozess je Phase):
- Vorher: `~/games/.evidence/m10-audio-settings-guard/m10-audio-settings-before.json`
- Nachher: `~/games/.evidence/m10-audio-settings-guard/m10-audio-settings-after.json`

Vorher/Nachher der 4 belegten Maengel:

| Maengel | Vorher | Nachher |
|---|---|---|
| setSettings unvalidiert (NaN/out-of-range/falscher Typ) | music NaN, sfx 2, muted "yes" in getSettings() | music 0.55, sfx 1, muted false (komplett validiert) |
| Memory/Storage-Divergenz | true | false |
| Partial-Payload | getSettings() nur {music: 0.3}, sfx undefined | komplettes Objekt mit Defaults |
| Junk-Key ("mute") | junkKeys ["mute"] | junkKeys [] |

Fazit: Der Audio-Einstellungspfad ist jetzt gegen ungepruefte Aufrufe gehaertet
(gleichtes Validierungsverhalten beim Schreiben wie beim Laden), Persistenz-
und Load-Pfad waren bereits korrekt (loadOptions, out of Scope) und sind per
Test abgesichert. Master-Mute-Vertrag (A7) unverändert, verify:final 7/7 PASS.

Offene Punkte: keine. Eingriff in fremde Dateien: keine (Disponent-Bereich
eingehalten; verify:final nur gelesen/ausgefuehrt, Skript nicht geaendert).

