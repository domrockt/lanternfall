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

Suchlauf (Skript `~/tmp/m10-audio-frost-gap/search_winter.py`, pure Python ohne numpy,
Metrik validiert: reproduziert Ist 0,1245 exakt): Runde 1 Gitter 150 Kandidaten
(Terz-Verschiebung 3..7 aufwaerts) — bester OK-Kandidat nur min 0,1286 (Kollision des
hoeheren Glissandos mit phoenix 5600→9800 Hz). Runde 2 erweitertes Gitter 432 Kandidaten
(Verschiebung −8..+6 Halbtoene, Fundament 440..1290 Hz, Mixtur a1 0,12..0,35 /
a2 0,35..0,55, festes Limit, kein Nachschuben): **83 Kandidaten erfuellen alle
Nebenbedingungen**, bester:

**Gewinner: Glissando −6 Halbtoene (3000→6000 wird 2121→4243 Hz), Fundament 760→440 Hz,
Mixtur 0,18/0,55 → 0,12/0,55.** Das Glissando wandert unter Frosts Sweep, die Mixtur wird
fundament-dominiert (Band 5 statt Band 6) — der Lane-Vorschlag „andere Obertoen-Mixtur“
schlaegt die reine Terz nach oben (die kollidiert mit phoenix).

| Kennzahl | vorher | nachher |
|---|---|---|
| frost / eternal_winter | 0,1245 | **0,2391** |
| Minimum aller 66 Paare | 0,1245 (frost/eternal_winter) | 0,1459 (frost/lantern, unverändert) |
| Paare < 0,12 | 0 | 0 |
| Peak sfx_winter | 0,59 | 0,57 (kein Clipping) |
| Dauer / Trend | 0,90 s / rising | 0,90 s / rising (unverändert) |

Band-Energien eternal_winter nachher (B0..B9): 0,0009 / 0,0006 / 0,0005 / 0,0015 /
0,0349 / 0,3244 / 0,1535 / 0,3222 / 0,1533 / 0,0087 — Band 8/9-Ueberlappung mit frost
entfernt, Fundament in Band 5.

Aenderungen: `scripts/gen_sfx.py` (Winter-Block, Kommentar mit Suchlauf-Befund) +
regeneriertes `public/sfx/sfx_winter.wav` (beide laut claims.json unclaimed, Meldung in
`/home/ai/games/.dispatch/requests.md`; Regeneration bit-identisch, nur sfx_winter.wav
geaendert — `git status public/sfx/`). `src/audio/mixing.ts` bewusst UNveraendert:
SFX_CONFIG/Cooldowns/Spam-Regeln sind von der Spektral-Distanz unabhaengig.

Beleg: `shots/m10-audio-frost-gap-matrix-after.json` (alle 66 Paare, engste Paare),
`npx vitest run tests/audio-mix.test.ts` 7/7 gruen.

## Offene Punkte

*(keine)*
