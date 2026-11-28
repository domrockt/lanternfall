# m10-audio-music-dawn — Musik-Stufenuebergänge (Titel → Run → Boss → Morgendaemmerung/Sieg)

Stand 28.11.2026, Worktree `/home/ai/games/lf-lanes/m10-audio-music-dawn`
(Branch `m10-audio-music-dawn`). Bereich: `src/audio/AudioSystem.ts`,
`tests/music-dawn.test.ts`, `scripts/m10-music-dawn.mjs`, Belege in `shots/`.
`GAME.md` unverändert; Master-Mute-Verhalten bitgleich (A7).

## Auftrag (Vorrats-Job)

Die Musik-Umschaltung Titel → Run → Boss → Morgendaemmerung/Sieg war unbeleuchtet:
Uebergangspunkte, kein Knackser/Dopplerton beim Wechsel, Master-Mute blockt Musik
weiter bitgleich (A7), Voice-Budget hält bei Boss + 500 Gegnern.

## Messaufbau (`scripts/m10-music-dawn.mjs`, einmalig gebaut, dann eingefroren)

Reines Node (kein Browser, kein flock — misst keine FPS). Es nutzt die **echte**
`AudioSystem`-Klasse (`node --experimental-strip-types` + Loader-Hook: phaser-Stub,
extensionless TS-Imports) mit einem Ereignis-Stub-Game: jedes
`game.sound.add/play/stop/destroy` wird geloggt, SFX-Stimmen enden mit ihrer echten
WAV-Dauer (Header aus `public/sfx/*.wav`), Musik läuft als Loop. Szenarien:

1. `matrix_unmuted` — Titel → Run → Boss → Run → Sieg (`victory` + `stopMusic`).
2. `matrix_muted` — dito mit persistiertem Master-Mute (A7).
3. `repeat_same_track` — Wiederhol-Start derselben Stufe (Erwartung: No-op).
4. `mute_unmute_midrun` — Mute mitten im Run, dann Unmute.
5. `reload_muted` — Reload mit persistiertem Mute (`initAudio`-Pfad), dann Unmute + Matrix.
6. `chaos_500` — SFX-Flood (Waffen/Hit/Kill/XP-Bänder + 7 P3-Events gestaffelt) mit
   parallelen Musik-Wechseln, 1,5 s Echtzeit.

Akzeptanzgrenzen (vor der Messung festgelegt): `maxLiveMusic ≤ 1`,
`startBeforeStop = 0`, `stuckAfterUnmute = false`, Mute: 0 Musik-Starts + SFX
geblockt, Chaos: Mixer-Voices ≤ 12 + 1 P3-Bypass (wie `tests/audio-mix-chaos`).

## Ist-Befund (Vorher, `shots/m10-music-dawn-before.json`)

| Szenario | maxLiveMusic | startBeforeStop | Befund |
|---|---|---|---|
| matrix_unmuted | 1 | 0 | sauber: alter Voice stop/destroy VOR neuem add/play |
| matrix_muted | 0 | 0 | Mute blockt bitgleich (A7) |
| repeat_same_track | 1 | 0 | Wiederhol-Start bereits No-op |
| reload_muted | 1 | 0 | **FAIL: musicTrack lügt** — `setMusic` während Mute setzte den Track ohne Sound; nach Unmute blieb die Stufe dauerhaft stumm (`silentTrackSteps=2`, `stuckAfterUnmute=true`), weil der Wiederhol-Aufruf als No-op durchlief |
| chaos_500 | 1 | 0 | Budget hält (12 + 1 P3-Bypass), Musik im Chaos sauber |

**Kein Dopplerton/kein Knackser in der Ist-Umschaltung** — die Reihenfolge
(stop vor add) war bereits korrekt. Der reale Bug war der **Phantom-Track**:
`debugState().musicTrack` behauptete eine Stufe, die nicht klingt.

## Änderungen

1. **`src/audio/AudioSystem.ts` — `setMusic()`:** bei `muted`/`failed` wird
   `musicTrack` nicht mehr gesetzt (bleibt ehrlich `"none"`); ein fehlgeschlagener
   `sound.add()` (`catch`) setzt den Track ebenfalls zurück. Ein späterer echter
   Stufenwechsel startet dadurch sauber neu — kein eingefrorener Zustand.
   Wechsel-Reihenfolge und Mute-Pfad unverändert (bitgleich zu A7).
2. **`mixing.ts` unverändert** — WEAPON/HIT-Band-Grenzen (12/12, 24/s) unangetastet;
   Musik ist nicht Teil des Mixer-Budgets (eigene Keys, nicht in `SFX_CONFIG`).
3. **`tests/music-dawn.test.ts` (7 Tests):** Uebergangs-Matrix, Stop-vor-Start,
   Wiederhol-No-op, Mute bitgleich, Phantom-Track-Verbot, Reload+Unmute-Recovery,
   Budget-Trennung, Load-Fail-Retry.

## Nachher (`shots/m10-music-dawn-after.json`)

Alle Szenarien `PASS=true`: `maxLiveMusic ≤ 1` überall, `startBeforeStop = 0`,
`silentTrackSteps = 0`, `stuckAfterUnmute = false` (Vorher: `reload_muted` FAIL),
Chaos `maxMixerVoices = 13 = 12 + 1 P3-Bypass`. `npx tsc --noEmit` rc=0,
`npm test` grün inkl. 7 neuer Tests; audio-mix-chaos (11) und audio-frost-gap
bleiben unveraendert grün (23/23 vor K3-Commit geprüft, im Full-Run bestätigt).

## Offene Punkte

- **Unmute mid-run startet die Musik nicht sofort:** `setMuted(false)` ist weiterhin
  ein No-op (bitgleich); die Musik kommt beim nächsten echten Stufenwechsel zurück
  (Run-Szenenstart ruft `setMusic("run")`). State ist jetzt ehrlich (`"none"`).
  Falls Dom sofortige Rückkehr will: separate Karte, ändert beobachtbares Mute-Verhalten.
- Kein eigener „Dawn"-Track vorhanden: Morgendaemmerung = `stopMusic()` + `victory`-Stinger
  (Run.ts). Ein dritter Loop (`MUSIC_KEYS.dawn`) wäre Daten-Arbeit (gen_sfx.py), nicht Logik.
