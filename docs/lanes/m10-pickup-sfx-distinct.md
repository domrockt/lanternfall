# Lane m10-pickup-sfx-distinct

Ziel: XP-Gem, Powerup, Level-Up und Truhe-Öffnen hörbar unterscheidbar (Paar-Distanz >= 0,15),
kein SFX-Spam/Clipping im 500er-Chaos. Musik-Übergänge (music-dawn-Merge) unangetastet,
Master-Mute bitgleich (A7). Keine Balance-/Daten-Änderungen.

Board-Karten: #9584 K1 Vorher-Messung, #9585 K2 Signaturen, #9586 K3 Mixer, #9587 K4 Test+Doku.

## K1 — Vorher-Messung (#9584)

Skript: `scripts/m10-pickup-sfx.mjs` (einmalig gebaut, 2 Edit-Iterationen: guard für fehlende
SFX_CONFIG-Einträge, Instrumentierung der Pickup-Klasse auf statischer Liste). Läuft rein in Node
mit echter `src/audio/mixing.ts`-Logik (`--experimental-strip-types`).

Belege (außerhalb des Repos, Regel 28.11 — shots/m10-pickup-sfx-before.json ist in .gitignore
nicht whitelistet, `git add -f` ist verboten):
`/home/ai/games/.evidence/m10-pickup-sfx-distinct/m10-pickup-sfx-before.json`

### Befund Matrix (vor K2)

Korrektur 28.11. (K2): Die im K1-Commit genannten Distanzen (0,137/0,012/0,085) stammten aus
einer fehlerhaften FFT-Kopie im Messskript (in der Bit-Reversal-Schleife fehlte `j ^= bit;` —
der Test in tests/audio-mix.test.ts ist korrekt, meine Kopien nicht). Korrigierte Before-Werte
(echtes FFT-Spektrum, Beleg `/home/ai/games/.evidence/m10-pickup-sfx-distinct/m10-pickup-sfx-before.json`):

| Paar | Distanz | Ziel |
|---|---|---|
| xp/levelup | 0,125 | >= 0,15 |
| xp/chest | **0,011** | >= 0,15 |
| levelup/chest | 0,094 | >= 0,15 |
| powerup | WAV existierte nicht | — |

Alle drei Paare verletzen das Ziel (xp/chest praktisch identisch).

### Befund Voice-Last (500er-Burst, 60 s, Seed 411)

- 900 XP-Requests, nur **65 gespielt** (7 %), 838 abgelehnt — davon 622× `rateFair`
  (Fair-Share 1/s bei 13 aktiven IDs im Waffen-Band), 216× `rate`. Pickup-Starts avg 1,08/s.
- 0 Clipping-Samples, Mix-Peak −17,3 dBFS, max 12 Voices (Limiter/Budget funktionieren).
- levelup/chest/powerup sind Pause-Events und kaum betroffen (1–2 Starts).

**Schlussfolgerung:** K2 (eigene Signaturen) + K3 (eigene Pickup-Klasse mit eigenem Kontingent,
Priorität 2 statt Verhungern, Dämpfung bei Massen-Events) nötig. Abnahme-Kriterium K4:
alle 6 Paare >= 0,15, 0 Clipping, XP-Starts im Burst deutlich über 7 %, Master-Mute bitgleich,
music-dawn-Tests grün.

## K2 — Signaturen (#9585)

`scripts/gen_sfx.py` erzeugt jetzt vier Pickup-WAVs `public/sfx/sfx_pickup_{xp,powerup,levelup,chest}.wav`
(separater RNG-Stream + Stream-Alignment: alle anderen 22 WAVs bitgleich, Beleg `git status`).
`mixing.ts`: `SFX_KEYS` xp/levelup/chest auf die neuen Dateien umgemappt, neuer Key `powerup`
(Priority weapon, Cooldown 0,15, 2 Stimmen, vol 0,5 — Feintuning in K3).
**Powerup-Verdrahtung NICHT in dieser Lane:** der pre-commit-Claimcheck blockierte
`src/systems/PickupSystem.ts` — die Datei gehört inzwischen der Lane `m10-powerup-sfx-wire`
(das Ansehen von claims.json beim Lane-Start war veraltet). Meine 1-Zeilen-Änderung
(`getAudio().play("powerup")` in `playPowerupMoment`) wurde zurückgenommen; die Wire-Lane
verdrahtet den Aufruf gegen den hier bereitgestellten Key `powerup` + WAV. Der One-Zeiler steht
in requests.md zur Info.

Parameterwahl per Sweep-Skript (ein Lauf, 8^4 = 4096 Kombinationen, Kandidaten-Grid je Rolle;
Beleg `/home/ai/games/.evidence/m10-pickup-sfx-distinct/k2-sweep-result.json`), Gewinner
`xp_H_up + pu_A_warm + lu_F_low + ch_E_rumble`:

| Paar | Distanz | | Paar | Distanz |
|---|---|---|---|---|
| xp/powerup | 0,841 | | powerup/chest | 0,862 |
| xp/levelup | 0,459 | | levelup/chest | **0,310** (min) |
| xp/chest | 0,542 | | | |

Alle 6 Paare >= 0,310 (Ziel 0,15) — PASS. Grün: tsc, audio-mix, audio-mix-chaos, audio-frost-gap,
pickup-sfx-distinct (24 Tests). Kein Clipping, Mix-Peak −15 dBFS.

## Notizen / Abweichungen

- **Supervisor-Fehlalarm #9196** (2026-11-28, „du bearbeitest die falsche Karte"):
  Karte #9196 `m10-props-wiring K4` wurde von dieser Lane NIE angefasst — ihr `doing`-Stand
  stammt aus einer Note von `build` (05:45Z), die vor Lane-Start im Board lag. Diese Lane hat
  ausschließlich #9584–#9587 angelegt (#9584 → doing, 09:00Z). #9196 bewusst NICHT
  zurückgesetzt (fremde Karte, Board-Hygiene zuständig).
- **flock:** das Messskript ist eine deterministische Festsubstep-Simulation (60 s Spielzeit,
  keine FPS/Echtzeit) wie `scripts/m10-audio-mix.mjs` (dessen Header: „kein Browser, kein
  flock — misst keine FPS"). Läuft deshalb ohne `/home/ai/games/.lf-perf.lock`.
- **Fremd-Datei-Anfrage (Disponent):** `src/systems/PickupSystem.ts` — minimaler 1-Zeilen-Audio-Aufruf
  `getAudio().play("powerup")` in `playPowerupMoment()` (Powerup hat heute GAR KEINEN Sound;
  der Moment wird in PickupSystem erzeugt, es gibt kein Event, über das Run.ts hören könnte).
  Eingetragen in `/home/ai/games/.dispatch/requests.md`; Änderung wird in K2 begründet
  und im Commit genannt.
- Belege grundsätzlich nach `~/games/.evidence/m10-pickup-sfx-distinct/`; nur Abnahme-Bilder
  nach `shots/abnahme/`.
