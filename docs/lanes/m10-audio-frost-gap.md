# Lane m10-audio-frost-gap — Paar-Distanz frost/eternal_winter auf >= 0,15 heben

Stand 28.11.2026, Worktree `/home/ai/games/lf-lanes/m10-audio-frost-gap` (Branch `m10-audio-frost-gap`).
Offener Punkt aus `docs/lanes/m10-audio-distinct.md`: `frost`/`eternal_winter` liegen mit **0,125**
knapp ueber der 0,12-Schwelle (66er-Paar-Matrix). Ziel: frost/eternal_winter **>= 0,15**, ohne
andere Paare unter 0,12 zu druecken.

**Dateien (Disponent):** `src/audio/mixing.ts`, `tests/audio-frost-gap.test.ts`,
`docs/lanes/m10-audio-frost-gap.md`, `.lane-done`. Keine Aenderung an `AudioSystem.ts`/`options.ts`.

## Metrik (identisch zu tests/audio-mix.test.ts)

10 Band-Energien aus einem 4096er-Hann-Fenster in der WAV-Mitte (Bandkanten
[0,4,8,16,32,64,128,256,512,1024,2048] Bins @ 22050 Hz = Bandbreite ~21,5 Hz..~5,4 kHz),
normiert, Kosinus-Distanz `1 - cos(a,b)`. Beleg-Skript: `scripts/m10-audio-frost-gap.mjs`
(messread, kein flock). Das Skript reproduziert den Ist-Stand exakt: frost/eternal_winter
**0,1245** (Audit m10-audio-distinct: 0,125).

## Vorher-Matrix ( shots/m10-audio-frost-gap-matrix-before.json, 66 Paare )

Engste Paare:

| Paar | Distanz |
|---|---|
| **frost / eternal_winter** | **0,1245** |
| frost / lantern | 0,1459 |
| lantern / eternal_winter | 0,1712 |
| ember / lantern | 0,1731 |
| thorn / wrath_pendulum | 0,2740 |

Alle 66 Paare >= 0,12; Minimum = frost/eternal_winter.

Band-Energien (normiert, B0..B9):

| Key | B0 | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 |
|---|---|---|---|---|---|---|---|---|---|---|
| frost | 0 | 0 | 0,0001 | 0,0001 | 0,1903 | 0,0392 | 0,0380 | 0,0296 | 0,5496 | 0,1531 |
| eternal_winter | 0,0008 | 0,0006 | 0,0006 | 0,0028 | 0,0054 | 0,0101 | 0,2777 | 0,0366 | 0,5357 | 0,1297 |

**Ursache:** Das Winter-Glissando (3000→6000 Hz) kreuzt Frosts Sweep (4600→4400 Hz) im
Fenster: beide Klänge dominieren in Band 8 (~4,4–5,5 kHz, 0,55/0,54) und teilen Band 9
(~5,5–11 kHz, 0,15/0,13). Frosts Fundament liegt in Band 4 (172–344 Hz), Winters in Band 6
(689–1373 Hz) — die Fundamente trennen bereits, die Obertöne nicht.

## K2 — Ansatz (Lane-Vorschlag: Terz hoeher bzw. andere Obertoen-Mixtur)

Automatisierter Suchlauf (Tuning-Regel, festes Iterationslimit, pure Python ohne numpy,
Skript in `~/tmp/m10-audio-frost-gap/`): Gitter ueber Glissando-Terz-Verschiebung,
Fundament-Frequenz und Amplituden-Mixtur des Winter-Stingers; Zielmetrik = Minimum der
Distanzen von eternal_winter zu den 11 anderen Klaengen, Nebenbedingungen: frost-Paar
>= 0,15, alle Paare >= 0,12, Peak <= 0,98, Vollausschlagsanteil < 0,1 %, Stinger 0,6–1,0 s
mit Aufwaerts-Trend (Test-Kriterien aus tests/audio-mix.test.ts unveraendert).

**Anmerkung zu den claims:** Die Noten-/Mixtur-Daten liegen nicht in `src/audio/mixing.ts`
(dort nur Mixer-/Limiter-/Config-Tabellen — Band-Distanzen sind von Volume unabhaengig),
sondern in `scripts/gen_sfx.py` + `public/sfx/sfx_winter.wav`. Beide sind laut
`claims.json` von niemandem geclaimed; die minimalen Aenderungen sind in
`/home/ai/games/.dispatch/requests.md` gemeldet. `mixing.ts` bleibt unveraendert
(SFX_CONFIG/Cooldowns/Spam-Regeln unangetastet).

## Nachher (K2)

*(wird nach K2 eingetragen)*

## Offene Punkte

*(keine)*
