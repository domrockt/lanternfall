# Lane m10-audio-mix-chaos — SFX-Mix-Budget im 500-Gegner-Chaos

Stand 27.11.2026, Worktree `/home/ai/games/lf-lanes/m10-audio-mix-chaos`
(Branch `m10-audio-mix-chaos`). Bereich: nur `src/audio/*`,
`tests/audio-mix-chaos.test.ts`, `scripts/m10-audio-mix.mjs`, Belege in `shots/`.
`GAME.md` unverändert; Master-Mute-Verhalten bitgleich (siehe unten).

## Auftrag (Dom, 21:45Z)

Im 500-Gegner-Chaos lief der SFX-Mix ungezählt an: hunderte Voice-Start-Versuche
pro Frame riskieren Clipping und überdecken die Waffen-Sounds. Ziel: Voice-Starts/s
decken (≤ 24/s), 0 Clipping (Peak ≤ −1 dBFS), alle 12 Waffen-/Evolutions-Klänge im
Chaos hörbar, Master-Mute unverändert.

## Messaufbau (`scripts/m10-audio-mix.mjs`, einmalig gebaut, dann eingefroren)

Synthetischer 500-Gegner-Chaos-Lauf (Minute 25): 60 s Spielzeit bei 60 Hz, alle 12
Waffen-/Evo-Klänge im Dauerfeuer (Versuchsrate 1/Cooldown), Treffer 53/s, Kills 15/s,
XP 15/s (Baseline aus `shots/m10-feedback-budget-baseline.json`), Boss-Events selten.
Die ECHTE Mixer-Logik aus `src/audio/mixing.ts` (per `--experimental-strip-types`)
entscheidet; der Mix-Peak wird per Sample-Superposition der rohen WAVs (22050 Hz)
mit den effektiven Stimmlautstärken gemessen. Zusätzlich eine deterministische
Worst-Case-Phase: alle 23 SFX starten ihre `maxVoices`-Stimmen im selben Moment
(gestaffelt um Cooldown) — die dichtestmögliche Überlagerung.

## Vorher/Nachher

| Metrik | Vorher (`m10-audio-mix-before.json`) | Nachher (`m10-audio-mix-after.json`) |
|---|---|---|
| Voice-Starts/s (avg) | 52,65 | **22,65** |
| Voice-Starts/s (max) | 64 | **24** (Prio<3-Band, Deckel greift) |
| Gleichzeitige Voices (max) | 13 | **12** (Budget inkl. Verdrängung) |
| Mix-Peak Chaos (dBFS) | −3,84 | **−6,46** |
| Worst-Case-Burst (dBFS) | **+0,77 → 5 Clipping-Samples** | **−1,37, 0 Clipping** |
| Clipping-Fälle gesamt | 5 Samples | **0** |
| Klang-IDs im Chaos gestartet | 12/12 (min 15) | **12/12 (min 29)** |
| Verdrängungen | 0 (nur Ablehnung) | 1 (Fairness statt Ablehnung) |

Interpretation: Im gemittelten Chaos clippte der Ist-Stand noch nicht (−3,84 dBFS),
aber der Worst-Case-Burst lag bei +0,77 dBFS mit 5 Clipping-Samples — das Risiko aus
dem Briefing ist messbar real. Nachher deckelt der Limiter jeden Fall bei −1 dBFS;
im Burst liegt der Peak bei −1,37 dBFS (Peak-Positionen der WAVs liegen nicht exakt
gleichzeitig). Die Voice-Starts halbieren sich (52,65 → 22,65/s, Deckel 24/s), und
trotz Drossel hört man jede Waffe: 29–60 Starts je ID in 60 s statt nur Ember/XP
den Band-Kuchen fressen zu lassen.

## Was geändert wurde (#6539, #6540)

1. **`src/audio/mixing.ts` (rein, unit-getestet):**
   - `planPlay`/`PlayPlan`: Prio ≥ 2 (Treffer/Kills) verdrängt bei vollem Budget die
     **älteste** (Gleichstand: leiseste) niederpriorere aktive Stimme, statt abgelehnt
     zu werden; Waffen-Spam (Prio 1) wird weiterhin abgelehnt; Prio ≥ 3 (Boss/Warn)
     läuft wie bisher ohne Budget-/Rate-Grenze und wird nie verdrängt.
   - Rate-Deckel **24 Voice-Starts/s** (Prio < 3) in zwei Bändern: Waffen/Evos/XP 12/s,
     Treffer/Kills 12/s; innerhalb des Bandes erhält jede Klang-ID einen **Fair-Anteil**
     (Band-Deckel / aktive IDs, mindestens 1/s) — auch bei vollem Band, damit keine
     Waffe im Chaos verstummt.
   - Limiter `TARGET_PEAK = −1 dBFS` (0,891 linear): `limiterGain` berechnet einen
     Faktor `target/(sum+incoming)`, mit dem **alle** aktiven Stimmen gleichmäßig
     zurückgenommen werden (nie Stummschaltung, Faktor > 0). Die Summe der
     Lautstärken aktiver Stimmen kann −1 dBFS nicht überschreiten.
   - `MixerState` trägt `active` (Lautstärke/Start pro Stimme) und `starts`
     (Rollfenster 1 s); `notePlayed` akzeptiert Endlautstärke + Skalierungsfaktor.
   - Datentabellen `SFX_KEYS`/`SFX_CONFIG`/`WEAPON_SFX_IDS`/`EVOLUTION_SFX_IDS` leben
     hier (phaser-frei, für Tests/Messskripte); `AudioSystem.ts` re-exportiert unverändert.
2. **`src/audio/AudioSystem.ts`:** `play()` nutzt `planPlay`, stoppt verdrängte Stimmen
   über `evictVoice` (Token-Invalidierung gegen Doppel-Freigabe) und wendet den
   Limiter-Faktor auf alle laufenden Stimmen an. **Master-Mute-Pfad bitgleich:**
   `muted`-Check bleibt die erste Prüfung in `play()`, `setMuted`/`stopMusic`/
   `applyOptions` unverändert (`verify-final` 7/7-Verhalten bleibt).
3. **`tests/audio-mix-chaos.test.ts` (11 Tests):** Voice-Limit hart, 200-Stimmen-Welle
   deterministisch ≤ −1 dBFS, Master-Mute blockt SFX **und** Musik vor jeder
   Mixer-Prüfung, 24/s-Deckel, Fair-Anteil ≥ 1 Start/s je ID, Prio-3-Schutz,
   Verdrängung nur bei vollem Budget. Testbefund dabei: die erste Limiter-Formel
   oszillierte und schaltete Stimmen zwischenzeitlich auf 0 — korrigiert auf
   `target/(sum+incoming)`.

## Belege

| Beleg | Ergebnis |
|---|---|
| `shots/m10-audio-mix-before.json` | 52,65 Starts/s, Burst +0,77 dBFS / 5 Clipping-Samples |
| `shots/m10-audio-mix-after.json` | 22,65 Starts/s (P3-max 24), Burst −1,37 dBFS / 0 Clipping, 12/12 IDs |
| `tests/audio-mix-chaos.test.ts` | 11/11 grün |
| `npx vitest run` (gesamt) | 845/845 grün (83 Dateien), inkl. bestehende `tests/audio-mix.test.ts` (7/7) |
| `npx tsc --noEmit` / `npm run build` | rc=0 je Karte |

## Offene Punkte

- Der Mix-Peak im Chaos liegt mit −6,46 dBFS unter dem Deckel — der Limiter greift
  nur in Sättigungs­momenten. Wem der Mix zu leise wirkt, kann `SFX_CONFIG`-Volumes
  anheben; der Deckel hält das weiterhin bei −1 dBFS (eigene Karte, Balance).
- `scripts/m10-audio-mix.mjs` modelliert die Lautstärke-Superposition offline (kein
  Browser-WebAudio). Ein echtes Ausgabe-Messung (AnalyserNode) wäre genauer, lohnt
  aber erst, wenn der Offline-Peak und das Gehörtest-Ergebnis auseinanderlaufen.
