# Lane m10-audio-alloc-fix (M10, 2026-11-28)

Bedarf aus docs/lanes/m10-run-cpu-budget.md ("Offene Bedarfe"): AudioSystem-SFX-Allokationen sind der
größte verbleibende Allokations-Rest im Run-Loop (Phaser-WebAudio `onended` je SFX) und belasten über
GC-Druck das JS-Frame-Zeit-p95-Tor (v1.0-Gerätetor). **Area: nur `src/audio/AudioSystem.ts`** —
`src/audio/mixing.ts` ist bewusst nicht in der Area (wartender Konflikt mit m10-thermal-tier-types).

## Methode (K1, Karte #12129)

`scripts/m10-audio-alloc.mjs` — Chaos-Lauf wie m10-run-cpu.mjs (Seed 1, Minute 25, 6 Waffen Lv8 +
6 Evolutionen + 6 Passives St. 5, 500 Gegner gehalten, god/autoplay, 20 s Fenster, Viewport 640x360),
dort wird nur die Allokations-Seite des SFX-Pfads gemessen:

- CDP Sampling-Heap-Profiler, Intervall 512 B (feiner als die 32 kB der Sister-Lane, weil je-Play-
  Allokationen ~100-200 B klein sind).
- **SFX-Pfad = alle Allokationen, deren Stack durch einen benannten App-`play`-Frame läuft**
  (AudioSystem.play). Alles andere (Run-Szene, Renderer, AI) ist nicht Audio und wird nicht gezählt.
- Gruppen: `audio-system` (AudioSystem.ts-eigen), `mixing` (mixing.ts, fremd), `phaser-sfx`
  (WebAudioSound/EE3-Churn, engine-seitig), `sfx-other` (Builtins ohne URL).
- Attribution braucht Funktionsnamen → Skript baut temporär unminifiziert und stellt danach den
  normalen Build wieder her. Probe: AudioSystem liegt im gfx-Chunk (`play @ gfx:3281`).
- Plays-Zähler: `__lf.audio().sfxPlayed`-Delta (erlaubte Voice-Starts), Normalisierung B/Play.
- Läuft OHNE flock (kein FPS-/Echtzeit-Lauf). Belege: `~/games/.evidence/m10-audio-alloc-fix/`.

## Vorher-Baseline (K1, #12129)

`~/games/.evidence/m10-audio-alloc-fix/m10-audio-alloc-before.json`
(324-325 erlaubte Plays / 20 s ≈ 16,2 Plays/s, 0 JS-Fehler, Renderer iGPU-String im JSON)

| Gruppe | B/Frame | B/Play | Anteil |
|---|---|---|---|
| **SFX-Pfad gesamt** | **~55-61** | **~198-218** | 100 % |
| audio-system (AudioSystem.ts) | 22-27 | 77-96 | ~35 % |
| phaser-sfx (WebAudioSound + EE3-Listener) | 14-15 | 51-54 | ~23 % |
| mixing (planPlay/notePlayed, fremd) | 2-13 | 7-48 | ~22 % |
| sfx-other (Builtins) | 11-12 | 41-42 | ~19 % |

Top-Sites vorher: `play`-Frame-Selbstallokationen (76 B/Play: `req`-Literal, `release`-Closure,
`noteOpts`-Literal, Factory-Closure), EE3 `addListener @ phaser` (42 B/Play: 2× `once` pro Play),
`source.onended @ phaser:147728` (Engine, von der Sister-Lane als ~141 B/Frame gemeldet — hier im
Subtree-Abzug konsistent sichtbar, aber kleiner, dacooldown-gedrosselt).

## Abnahmekriterium (VOR dem Fix festgelegt)

- **Primär:** audio-system-Gruppe (der einzige Teil in der Area) ≤ 50 % der Vorher-B/Play (≤ 48 B/Play
  gegen Baseline ~96; konservativ gegen den kleinsten Baseline-Wert 77 → Ziel ≤ 38 B/Play).
- Gesamt-SFX-Pfad (inkl. fremder Gruppen) wird berichtet; verbleibende Fremdanteile (mixing.ts,
  Phaser `createBufferSource`/`onended`) werden als Residual benannt — wie in der Sister-Lane
  ("Benannt, aber außerhalb des Claims").
- Audioausgabe-Verhalten unveraendert: Pre-Check in play() spiegelt exakt die ersten drei
  planPlay-Checks (priority < 0, perSoundVoices, cooldown) — diese liegen in planPlay VOR allen
  Seiteneffekten (pruneStarts), d. h. übersprungene planPlay-Aufrufe wären dort sowieso früh
  ausgestiegen ⇒ bitgleich by construction; Verhalten-Test in tests/audio-alloc.test.ts.

## K2 — Fix (Karte #12130, Commit 71d44521)

Nur `src/audio/AudioSystem.ts` (mixing.ts unangetastet):

1. **Wiederverwendete Play-Parameter:** `req` (SoundRequest) und `noteOpts` (NoteOptions) sind jetzt
   Instanz-Felder; je Play werden nur Felder mutiert statt zwei Objekt-Literale alloziert. Alle
   Konsumenten (effectiveVolume/pickupDampGain/planPlay/notePlayed) lesen synchron, keine Retention.
2. **planPlay-Frühcheck:** play() spiegelt exakt die ersten drei planPlay-Prüfungen
   (priority < 0, perSoundVoices, cooldown). Diese liegen in planPlay VOR allen Seiteneffekten
   (pruneStarts/Filters) — für hier verworfene Requests wäre planPlay sowieso vor allen Filter-/Set-
   Allokationen ausgestiegen ⇒ bitgleich by construction; verworfene Requests kosten jetzt zwei
   Feldvergleiche.
3. **Listener-Batching:** complete/stop-Listener werden EINMALIG je Stimme in der Voice-Fabrik
   registriert (`on`, permanent) statt 2× `once` je Play — EventEmitter3 alloziert je `once`-Aufruf
   einen Wrapper + Array-Churn (vorher 42 B/Play). Der `busy`-Guard ersetzt den Token-Snapshot:
   Eine Stimme ist nur frei, wenn ihr Playback beendet/verdrängt wurde, und Phaser emittiert
   COMPLETE nur beim echten Ende des aktuellen Buffers; Verdrängung setzt busy vor stop() auf false.
   Der `token` bleibt (evictVoice), hat aber keine Freigabe-Rolle mehr.
4. **Voice-Fabrik-Closure je SFX gecacht** (`voiceFactories`-Map) statt Closure je Play.
5. **PICKUP_IDS als Set** statt Array.includes je Play; **sfxVolume-Cache** (getSettings() spread't
   je Aufruf — Cache wird in updateSettings() aktualisiert; alle Änderungen laufen über
   applyOptions → updateSettings, d. h. verhaltensgleich).

Unvermeidbarer Minimal-Eingriff in fremde Dateien (begruendet, Disponent wird im Merge informiert):
4 Test-Mocks (tests/audio-mix.test.ts, audio-mix-chaos.test.ts, music-dawn.test.ts,
pickup-sfx-distinct.test.ts) um eine `on: () => {}`-Zeile ergänzt, weil die Mocks vorher nur `once`
kannten und die Fabrik sonst ins Catch lief (play() → false). Keine Verhaltensänderung der Tests.

Verifikation K2: `npx tsc --noEmit` grün, Suite **2289/2289**, `npm run build` rc=0.

## K3 — Nachher-Messung (Karte #12131)

`~/games/.evidence/m10-audio-alloc-fix/m10-audio-alloc-after.json` — eingefrorenes Skript, identische
Parameter (Seed 1, 321 Plays / 20 s, 0 JS-Fehler, Renderer `ANGLE (Intel, Mesa Intel(R) Graphics
(RPL-S), OpenGL ES 3.2)`):

| Gruppe | Vorher B/Play | Nachher B/Play | Δ | Anteil Nachher |
|---|---|---|---|---|
| **SFX-Pfad gesamt** | **~218** | **89** | **−59 %** | 100 % (24 B/Frame, vorher 55-61) |
| audio-system (Area) | 77 | **3** | **−96 %** | 3,9 % |
| phaser-sfx (Engine) | 51 | 23 | −55 % | 26,2 % |
| mixing (fremd) | 48 | 52 | ~±10 % Rauschen | 58,7 % |
| sfx-other (Builtins) | 42 | 10 | −76 % | 11,2 % |

**Abnahmekriterium (vor dem Fix festgelegt, siehe oben): erfüllt.** audio-system 3 B/Play ≤ 38 B/Play
(≤ 50 % der kleinsten Baseline 77) — Faktor ~25 unter dem Tor. Auch die Gesamtmetrik liegt mit 41 %
des Vorherwerts unter 50 %.

Ehemalige Top-Sites weg: `play`-Frame-Selbstallokationen (76 B/Play) und EE3 `addListener`-Churn
(42 B/Play) sind aus dem Profil. Verbleibende Residuals (außerhalb des Claims, wie in der Sister-Lane):
- `mixing.ts` planPlay-interne Closures/Filter (46 B/Play) — Bedarf: eigener Pass, sobald der
  Konflikt mit m10-thermal-tier-types gelöst ist; `notePlayed`-Pushes (6 B/Play).
- Phaser-Engine-Churn je Play: `createBufferSource` + `source.onended` + `emit` (~23 B/Play) —
  WebAudio-BufferSource ist One-Shot, nicht aus AudioSystem.ts hebelbar.


## K4 — Regressionstest + Abschluss (Karte #12132)

`tests/audio-alloc.test.ts` (6 Tests, Suite **2295/2295**, build rc=0, tsc grün) friert die Hebel ein:

1. **Play-Objekt-Reuse:** planPlay/notePlayed sehen über 12 Plays hinweg stets dasselbe req- bzw.
   noteOpts-Objekt (Identität via Capture-Wrapper), Feld-Snapshots je Aufruf korrekt gesetzt —
   "keine neuen Play-Objekte pro Stimme" ist damit guardet.
2. **Listener-Batching:** genau 1 complete- + 1 stop-Listener je Stimme (`on`, permanent), auch nach
   Wiederverwendung; Voice-Pool bleibt hart auf maxVoices begrenzt; weiterer Play bei vollem Pool
   wird verworfen statt einen neuen Sound anzulegen.
3. **planPlay-Frühcheck bitgleich:** über ein Grid aus (voices × lastPlayed × Cooldown-Grenzen):
   verwirft der Frühcheck, wird planPlay nicht gerufen UND planPlay würde denselben Staat ebenfalls
   verwerfen; ruft play() planPlay, übernimmt es das Urteil unverändert.
4. **Freigabe/Verdrängung:** complete gibt die Stimme frei (Wiederverwendung ohne neues `sound.add`),
   complete+stop-Doppel-Feuern wird nicht doppelt freigegeben, Verdrängung stoppt die älteste
   niederpriorere Stimme und gibt sie im Mixer frei.
5. **sfxVolume-Cache** folgt updateSettings() (0 → blockt, 0.8 → spielt wieder).

## Lane-Abschluss

- Commits: a9531aac (#12129 K1), 71d44521 (#12130 K2), c3cf13ca (#12131 K3), <K4> (#12132).
- Belege ausschließlich `~/games/.evidence/m10-audio-alloc-fix/` (m10-audio-alloc-before/after.json);
  `shots/m10-audio-alloc-*.json` sind Arbeitskopien (gitignored).
- **Ergebnis:** SFX-Pfad-Allokationen 218 → 89 B/Play (−59 %, 24 B/Frame vorher 55-61); der
  AudioSystem-Anteil (Area) 77 → 3 B/Play (−96 %). Abnahmekriterium (≤ 50 %, vor dem Fix
  festgelegt) auf beiden Metriken erfüllt.
- **Fremd-Dateien (minimal, begründet):** 4 Test-Mocks um `on: () => {}` ergänzt (audio-mix,
  audio-mix-chaos, music-dawn, pickup-sfx-distinct) — die Mocks kannten nur `once`, der
  Listener-Batching-Fix registriert permanente Listener via `on`; ohne Zeile lief die Voice-Fabrik
  ins Catch (play() → false). Keine Testabsichten geändert.
- **Offene Bedarfe (nicht diese Lane):**
  - `src/audio/mixing.ts` planPlay-interne Allokationen (~46-52 B/Play: Filter-Arrays, Set,
    Plan-Objekte, notePlayed-Pushes) — größter verbleibender Posten im SFX-Pfad; Pass sinnvoll,
    sobald der wartende Konflikt mit m10-thermal-tier-types gelöst ist.
  - Phaser-Engine-Churn je Play (`createBufferSource` + `source.onended` + `emit`, ~23 B/Play) —
    engine-seitig, nur mit eigenem WebAudio-Pfad in AudioSystem hebelbar (hoher Risiko-Change).

