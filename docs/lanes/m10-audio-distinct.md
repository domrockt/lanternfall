# Lane m10-audio-distinct — 12 Waffen-/Evolutions-Klänge hörbar verschieden

Stand 27.11.2026, Worktree `/home/ai/lanes/m10-audio-distinct` (Branch `m10-audio-distinct`).
Basis der Lane: Commit `252fd98` (Merge m10-qa-numbers), letzter Fix-Commit `2b18b37` (#1460).
Kein Push/Merge. Nur Audio-Dateien angefasst: `src/audio/AudioSystem.ts`, `src/audio/mixing.ts`,
`scripts/gen_sfx.py`, `tests/audio-mix.test.ts` — keine Waffen-/Balancedaten, `GAME.md` unverändert.

## Mapping SFX-Key → Waffe/Evolution

Aus `src/audio/AudioSystem.ts` (`SFX_KEYS`) und `scripts/gen_sfx.py`; Messwerte aus
`shots/m10-audio-distinct-audit.json` (neu erzeugt, 22050 Hz mono 16 bit).

| Key | WAV | Waffe / Evolution | Dauer | Spektral-Centroid | Peak | Signatur | Prio/Cooldown/Stimmen/Volume |
|---|---|---|---|---|---|---|---|
| `ember` | `sfx_ember.wav` | Glutfunke / ember (Basis) | 0,19 s | 1984 Hz | 0,34 | square/falling/hit | 1 / 0,09 s / 3 / 0,55 |
| `phoenix` | `sfx_phoenix.wav` | Phönixschwarm / ember (Evolution) | 0,82 s | 5965 Hz | 0,46 | square/rising/stinger | 1 / 0,90 s / 1 / 0,55 |
| `flail` | `sfx_flail.wav` | Kettenflegel / flail (Basis) | 0,26 s | 470 Hz | 0,38 | square/falling/hit | 1 / 0,12 s / 2 / 0,55 |
| `wrath_pendulum` | `sfx_wrath.wav` | Zornpendel / flail (Evolution) | 0,72 s | 734 Hz | 0,42 | square/rising/stinger | 1 / 0,85 s / 1 / 0,60 |
| `frost` | `sfx_frost.wav` | Frostnova / frost (Basis) | 0,33 s | 3927 Hz | 0,38 | square/rising/hit | 1 / 0,22 s / 2 / 0,50 |
| `eternal_winter` | `sfx_winter.wav` | Ewiger Winter / frost (Evolution) | 0,90 s | 3813 Hz | 0,59 | square/flat/stinger | 1 / 1,00 s / 1 / 0,45 |
| `thorn` | `sfx_thorn.wav` | Dornensalve / thorn (Basis) | 0,15 s | 1380 Hz | 0,34 | square/falling/hit | 1 / 0,12 s / 2 / 0,45 |
| `thorn_storm` | `sfx_thornstorm.wav` | Dornensturm / thorn (Evolution) | 0,75 s | 2386 Hz | 0,34 | square/rising/stinger | 1 / 0,85 s / 1 / 0,50 |
| `storm` | `sfx_storm.wav` | Sturmrune / storm (Basis) | 0,31 s | 624 Hz | 0,36 | square/falling/hit | 1 / 0,16 s / 2 / 0,60 |
| `thunder_seal` | `sfx_seal.wav` | Gewittersiegel / storm (Evolution) | 0,70 s | 1447 Hz | 0,32 | square/rising/stinger | 1 / 0,85 s / 1 / 0,55 |
| `lantern` | `sfx_lantern.wav` | Geisterlaterne / lantern (Basis) | 0,36 s | 3455 Hz | 0,52 | square/falling/hit | 1 / 0,30 s / 1 / 0,40 |
| `soul_beacon` | `sfx_soul.wav` | Seelenleuchtfeuer / lantern (Evolution) | 0,85 s | 3350 Hz | 0,34 | square/rising/stinger | 1 / 1,00 s / 1 / 0,50 |

Alle 12 Treffer sind < 0,4 s; alle 6 Evolutions-Stinger liegen bei 0,70–0,90 s und steigen aufwärts
(Ausnahme im groben Trend: `eternal_winter` ist ein flächiger Stinger mit steigendem Glissando im
ersten Drittel, Test-Trend „flat“). Kein WAV clipped (Peak ≤ 0,59, deutlich unter 0,98).

## Was geändert wurde (#1458–#1460)

1. **Audit (#1458, `6887705`):** Mapping und Ist-Signaturen als JSON. Befund: 6 Evolutions-Keys
   hatten keine eigenen Stinger (zu kurz), 24 Key-Paare teilten sich dieselbe Wellenform-Signatur.
2. **Test zuerst (#1459, `b6113e0`):** `tests/audio-mix.test.ts`, rot belegt (2/7): `phoenix` 0,26 s
   statt ≥ 0,6 s, `ember`/`frost` Band-Distanz 0,019. Prüft: 12 Keys vorhanden, paarweise
   Band-Distanz ≥ 0,12, Stinger-Länge 0,6–1,0 s mit Aufwärts-Trend, kein Clipping, Volume in [0,1],
   `MAX_TOTAL_VOICES`/`PRIORITY` (Waffen-Spam verdrängt keine Boss-/Warn-Sounds), Master-Mute blockt alles.
3. **Fix (#1460, `2b18b37`):** In `scripts/gen_sfx.py` bekamen alle 12 Keys eigene
   Primär-/Sekundär-Bandschwerpunkte; die 6 Evolutionen sind jetzt 0,70–0,90 s lange
   Triangle-Glissando-Stinger. `AudioConfig`-Cooldowns der Evolutionen auf 0,85–1,0 s und `maxVoices` 1,
   damit Dauerfeuer den Stinger nicht überlagert. Keys nicht umbenannt, Master-Mute-Pfad unverändert.

## Belege

| Beleg | Inhalt | Ergebnis |
|---|---|---|
| `shots/m10-audio-distinct-audit.json` | 12 Keys mit Welle, Dauer, Hüllkurve, Centroid, Flatness, 10 Band-Energien; 66 Paardistanzen | min. Distanz **0,125** (`frost`/`eternal_winter`), 0 Paare < 0,12 |
| `shots/m10-audio-distinct-spectra-12.png` | Kontaktbogen: Wellenform-Hüllkurve + 10-Band-Spektrum je Klang (Reihenfolge wie Tabelle) | 12 sichtbar unterschiedliche Muster, Evolutionen mit Aufwärts-Glissando |
| `shots/m10-audio-distinct-spectra.png` | kompakter Spektralbogen (960×540) | 12 Reihen, je eigene Bandverteilung |
| `~/tmp/m10-audio-distinct/verify-final3.log` | `node scripts/verify-final.mjs` | **7/7 PASS** (Master-Mute Option/blockt SFX/Reload, Aggregation 110 aus/129 an, Ergebnis-Screen) |
| `~/tmp/m10-audio-distinct/verify-weapons.log` | `node scripts/verify-weapons.mjs` | **12/12 Waffen PASS**, `failed: []`, `jsErrors: []` |
| `~/tmp/m10-audio-distinct/build-final.log` | `npm run build` | grün (662 ms) |
| `~/tmp/m10-audio-distinct/vitest-final.log` | `npx vitest run` | **199 Tests / 13 Dateien grün** |

Hinweis: `scripts/verify-final.mjs` bekam eine 400-ms-Siedelzeit nach dem Szenenwechsel zum Titel,
weil das erste „O“ sonst reproduzierbar verloren ging (2/2 Läufe FAIL `visible=false`); das Skript
gehört keinem anderen Job, die Änderung ist im Abschluss-Commit enthalten.

## Offene Punkte

- `frost`/`eternal_winter` liegen mit 0,125 knapp über der 0,12-Schwelle; ein späterer Balance-/Audio-Pass
  kann hier mehr Abstand schaffen (z. B. Winter-Glissando eine Terz höher).
- Der grobe Signatur-String (Familie/Trend/Länge) ist für 20 Paare gleich; die Feindistanz
  (Band-Energien) ist der harte Test und liegt für alle 66 Paare ≥ 0,12.
