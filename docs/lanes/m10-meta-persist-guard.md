# Lane m10-meta-persist-guard — Persistenz-Korrektheit Meta/Options

Ziel: Persistenz-Pfade von `src/logic/meta.ts` (Bestwerte je Charakter,
recordRun/loadMeta/saveMeta) und `src/audio/options.ts` (7 OPTION_ROWS, Clamp,
Skalierungscap, OPTIONS_KEY) gegen Regression absichern. Vorher war nur
MASTER MUTE formal getestet (A10).

## Vorgehen
- Probe-Skript `scripts/m10-meta-persist.mjs` läuft **ohne Phaser/Browser**:
  `node --experimental-strip-types scripts/m10-meta-persist.mjs shots/<file>.json`
  (meta.ts/options.ts haben nur Typ-Imports → Node-Type-Stripping ladbar;
  StorageLike-Stub statt window.localStorage).
- 18 Checks: recordRun über 5 simulierte Läufe (Monotonie, Records-Flags,
  NaN/undefined-Freiheit, Run-/Sieg-Zähler), korrupte/teilweise/throende Storage-
  Payload → Defaults ohne Wurf, save/load-Roundtrips, alle 7 Optionszeilen über
  3 Reload-Zyklen, Clamp-Grenzen inkl. SCALE_MAX, Skalen-Zyklus (12 Schritte rundum).

## Vorher (shots/m10-meta-persist-before.json)
17/18 Checks. Ein echter Guard-Befund:
- **music/sfx mit nicht-numerischer Payload (`"x"`) rutschte auf 0** statt auf
  den Feld-Default (0.55/0.8) — ein kaputter Store hätte die Lautstärke stumm
  geschaltet statt auf Default zurückgesetzt.

## Fixe
- `src/logic/meta.ts` (#7827):
  - `recordRun` verwirft unbekannte Charakter-IDs (kein Streu-Eintrag in
    MetaState, Records alle false).
  - `recordRun` sanitisiert den In-Memory-Beststand vor `Math.max` — ein
    korrupter Stand (`NaN` in BestStats) vergiftet neue Bestwerte nicht mehr.
- `src/audio/options.ts` (#7828):
  - `loadOptions`: nicht-numerische/NaN-**und** null-Felder fallen feldweise
    auf `DEFAULT_OPTIONS` zurück; korrupte Booleans ebenfalls.

## Nachher (shots/m10-meta-persist-after.json)
**18/18 Checks passed, 0 NaN-Felder.** Belegt: Bestwerte über 5 Record-Läufe
monoton (Verschlechterung setzt keine Records, NaN-Lauf senkt Bestwerte nicht),
alle 7 Optionszeilen über 3 Reload-Zyklen identisch, korrupte Meta-Payload →
emptyMeta, korrupte/teilweise Options-Payload → Defaults, null/throender
Storage wirft nicht, Roundtrips verlustfrei.

## Tests
`tests/meta-persist.test.ts`: 12 Tests (>= 8 gefordert), Node-Stub ohne Phaser.
Gesamtstand: `npx tsc --noEmit` rc=0, `npm test` grün (68 bestehende
meta/options-bezogene + 12 neue).

## Offene Punkte
- Keine. Ergebnisse.ts/UI.ts/Spielcode außerhalb der Area wurden nicht angefasst.
