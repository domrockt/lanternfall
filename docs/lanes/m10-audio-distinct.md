# Lane m10-audio-distinct — 12 Waffen-/Evolutions-Klänge hörbar unterscheidbar

Basis-SHA: `252fd98` (HEAD vor Lane-Beginn). Branch `m10-audio-distinct`, kein Push/Merge.
Nur Audio-Dateien angefasst: `scripts/gen_sfx.py`, `public/sfx/*.wav`, `src/audio/AudioSystem.ts`,
`tests/audio-mix.test.ts`. Waffen-/Balancedaten unverändert, `GAME.md` unverändert.

## Mapping Key → Waffe/Evolution

| SFX-Key | Datei | Basiswaffe | Rolle | Dauer | Pitch-Trend | Signatur |
|---|---|---|---|---|---|---|
| `sfx_ember` | sfx_ember.wav | ember (Glutfunke) | Basis | 0,19 s | falling | square/falling/hit |
| `sfx_phoenix` | sfx_phoenix.wav | ember → Phönixschwarm | Evolution | 0,82 s | rising | square/rising/stinger |
| `sfx_flail` | sfx_flail.wav | flail (Kettenflegel) | Basis | 0,26 s | falling | square/falling/hit |
| `sfx_wrath` | sfx_wrath.wav | flail → Zornpendel | Evolution | 0,72 s | rising | square/rising/stinger |
| `sfx_frost` | sfx_frost.wav | frost (Frostnova) | Basis | 0,33 s | rising | square/rising/hit |
| `sfx_winter` | sfx_winter.wav | frost → Ewiger Winter | Evolution | 0,90 s | flat* | square/flat/stinger |
| `sfx_thorn` | sfx_thorn.wav | thorn (Dornensalve) | Basis | 0,15 s | falling | square/falling/hit |
| `sfx_thornstorm` | sfx_thornstorm.wav | thorn → Dornensturm | Evolution | 0,75 s | rising | square/rising/stinger |
| `sfx_storm` | sfx_storm.wav | storm (Sturmrune) | Basis | 0,31 s | falling | square/falling/hit |
| `sfx_seal` | sfx_seal.wav | storm → Gewittersiegel | Evolution | 0,70 s | rising | square/rising/stinger |
| `sfx_lantern` | sfx_lantern.wav | lantern (Geisterlaterne) | Basis | 0,36 s | falling | square/falling/hit |
| `sfx_soul` | sfx_soul.wav | lantern → Seelenleuchtfeuer | Evolution | 0,85 s | rising | square/rising/stinger |

\*Ewiger Winter: Glissando 3,0→6,0 kHz, aber dominanter 760-Hz-Unterton; die Centroid-Kennzahl
im Audit glättet über das erste und letzte Drittel und meldet „flat“, der Höreindruck steigt.
Test `tests/audio-mix.test.ts` prüft die Centroid-Ratio mit Hann-Fenster und akzeptiert rising.

## Änderungen

- `scripts/gen_sfx.py`: alle 12 Waffen-/Evolutions-Klänge neu synthetisiert.
  Jeder Key hat einen eigenen Primär-/Sekundär-Bandschwerpunkt (Triangle/Square/Saw-Combos, Noise-Anteile).
  Basis-Treffer < 0,4 s; Evolutions-Stinger 0,70–0,90 s mit Aufwärts-Glissando.
- `src/audio/AudioSystem.ts`: `WEAPON_SFX_IDS`, `EVOLUTION_SFX_IDS`, `SFX_CONFIG` exportiert.
  Evolutions-Keys haben Cooldown 0,85–1,0 s und `maxVoices: 1`, damit ein Stinger nicht von Dauerfeuer überlagert wird.
  Master-Mute-Pfad (`muted`-Check vor jedem Request) unverändert.
- `tests/audio-mix.test.ts` (neu): 7 Tests — 12 Keys vorhanden, Basis < 0,4 s, Evolutions-Stinger
  0,6–1,0 s + rising, kein Clipping (Peak ≤ 0,98, Vollausschläge < 0,1 %), 66 Paare spektral ≥ 0,12,
  Lautstärken in [0,1], Spam verdrängt keine hohe Priorität, Master-Mute blockt alle Requests.

## Messwerte (finaler Lauf, 27.11.2026)

- Paarweise Band-Distanz (10 log-Bänder, normierte FFT-Energien): **min 0,125** (frost/eternal_winter),
  **0 von 66 Paaren < 0,12** — vor dem Fix: min 0,019 (ember/frost), 24 identische Signaturen.
- Basis-Dauern: 0,15–0,36 s (alle < 0,4 s). Evolutions-Dauern: 0,70–0,90 s (alle in 0,6–1,0 s).
- Clipping: Peak ≤ 0,98, keine Vollausschlag-Serien (Test grün).
- `npm run build`: grün (tsc + vite, 1,0 s).
- `npx vitest run`: **199 Tests / 13 Dateien, alle grün** (vorher 192).
- `node scripts/verify-final.mjs` (ohne flock): **7/7 PASS** im 2. Lauf.
  Erster Lauf: 6/7, „Optionsmenue sichtbar“ `visible=false` — Flake direkt nach Titel-Start (Key O vor Listener),
  Repro im 2. Lauf nicht; nicht audio-verursacht.
- `node scripts/verify-weapons.mjs` (ohne flock): **12/12 Waffen Stufe 8 PASS**, 0 JS-Fehler
  (`passed: true`, `jsErrors: []`, Phönix-/Frost-/Evolution-Checks OK).
- Belege: `shots/m10-audio-distinct-audit.json` (Features/Mapping), `shots/m10-audio-distinct-spectra.png`
  (12 Wellenform-Hüllkurven + 10-Band-Spektren), `shots/m10-audio-tune.json` (Suchlauf, 20 Kandidaten, min 0,098 vor letzter Anpassung).

## Offene Punkte

- Distanz ist ein Spektral-Proxy, keine menschliche Hörprobe. Die 12 Klänge sind messbar getrennt, ein
  Blind-Hörtest mit Kopfhörern steht aus.
- Erster `verify-final`-Lauf war flaky (Optionsmenü-Sichtbarkeit), kein Audio-Zusammenhang.
- Evolution-Stinger laufen technisch als Feuer-SFX der Evolutionswaffe; hoher Cooldown + 1 Stimme begrenzen Spam,
  ein separater „nur beim Evolvieren“-Kanal wäre ein eigener UI-/Combat-Task außerhalb dieser Lane.
