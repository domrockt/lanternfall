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

(folgt)

## K3 Guard-Tests

(folgt)

## K4 Nachher-Probe + Fazit

(folgt)
