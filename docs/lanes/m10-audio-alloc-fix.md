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

## K2 — Fix (Karte #12130)

(kommt)

## K3 — Nachher-Messung (Karte #12131)

(kommt)

## K4 — Regressionstest + Abschluss (Karte #12132)

(kommt)
