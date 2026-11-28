# Lane m10-audio-quality-budget (M10)

Ziel: Audio-Kosten auf schwachen Geraeten an die Qualitaetsstufe koppeln
(Android-Blocker-Runde, Dom 09:25Z). Stimmen-/Start-Budgets je QualityTier
skalieren; Musik/SFX-Unterscheidbarkeit bleibt. Aenderung NUR in
`src/audio/mixing.ts` + `src/audio/AudioSystem.ts` (reine Funktionen getestet),
keine WAV-/gen_sfx-Aenderungen.

## K1 — Ist-Messung (#11542)

Muster: `scripts/m10-audio-mix.mjs` (synthetischer 500-Gegner-Chaos-Lauf,
Minute 25: 12 Waffen-/Evo-Klaenge im Dauerfeuer, 53 Hits/s, 15 Kills/s,
15 XP/s, 60 s Spielzeit, echte Mixer-Logik + WAV-Superposition).

Vorher (Tier HIGH, heutige Werte): Beleg
`/home/ai/games/.evidence/m10-audio-quality-budget/before-high.json`

| Kennzahl | Wert |
|---|---|
| Voice-Starts/s (avg) | 21.92 |
| Voice-Starts/s (max, Prio<3) | 24 (Deckel) |
| Gleichzeitige Voices (max) | 12 (= MAX_TOTAL_VOICES) |
| Mix-Peak | -7.01 dBFS, 0 Clipping |
| Burst-Worst-Case-Peak | -3.17 dBFS, 0 Clipping |
| Klänge verhungert | 0 (12/12 hörbar, min 32 Starts) |

Bewertung: Bei HIGH sind Start-Rate (24/s) und Voice-Limit (12) beide am
Deckel — genau diese beiden Budgets skalieren je Tier; der Limiter hält den
Peak unabhängig davon unter -1 dBFS (0 Clipping bleibt Abnahmekriterium).

## K2 — Budgets je Tier (#11543)

`src/audio/mixing.ts`: neues `AudioBudget` + `audioBudgetFor(tier)` (Rückfall
HIGH bei unbekanntem Tier). `planPlay` nimmt das Budget als optionalen
Parameter (Default `AUDIO_BUDGET_HIGH` = exakt die Legacy-Konstanten — alle
bestehenden Aufrufe bleiben bitgleich). `src/audio/AudioSystem.ts` liest je
`play()` das Live-Binding `config.QUALITY` (Laufzeit-Regler aus
src/logic/quality.ts) und reicht `audioBudgetFor(QUALITY)` durch.

| Budgetfeld | HIGH | medium | low |
|---|---|---|---|
| maxTotalVoices | 12 | 8 | 4 |
| maxStartsPerSecond | 24 | 16 | 8 |
| weaponBandStartsPerSec | 12 | 8 | 4 |
| hitBandStartsPerSec | 12 | 8 | 4 |
| pickupBandStartsPerSec | 8 | 6 | 3 |

Band-Verhältnisse bleiben zueinander erhalten (Unterscheidbarkeit im Chaos
kippt nicht); SFX_CONFIG/WAVs unverändert.

## K3 — Tests (#11544)

`tests/audio-quality-budget.test.ts` (10 Tests, grün): Tier-Matrix
(low < medium < high in allen Feldern), HIGH bitgleich zu den Legacy-Konstanten
(sogar dieselbe Objektreferenz), `audioBudgetFor`-Rückfall, realer
WAV-Burst-Worst-Case je Tier mit 0 Clipping-Samples, Verdrängung bis zum
Tier-Budget, Chaos-Lauf: LOW drosselt Starts und Stimmen messbar.
Alte Audio-Suiten (audio-mix-chaos, audio-mix, audio-frost-gap,
audio-settings) unverändert grün: 31/31.

## K4 — Nachher je Tier (#11545)

Belege in `/home/ai/games/.evidence/m10-audio-quality-budget/`:
`after-tiers.json` (Tier-Vergleich, scripts/m10-audio-quality.mjs) und
`after-high.json` (identisches Muster-Skript m10-audio-mix.mjs nach dem Fix).

**HIGH bitgleich:** `after-high.json` vs. `before-high.json` unterscheiden
sich nur in `label`/`generatedAt` — alle Messwerte (Starts/s 21.92 avg /
24 max, 12 Voices, Peak -7.01 dBFS, 0 Clipping, Burst -3.17 dBFS,
12/12 hörbare Waffen) sind identisch.

**Tier-Vergleich** (gleiche Chaos-Methode, Pickup-Klasse wie AudioSystem):

| Kennzahl | HIGH | medium | low |
|---|---|---|---|
| Voice-Starts/s (avg) | 23.55 | 18.82 | 10.62 |
| Gleichzeitige Voices (max) | 13 | 9 | 5 |
| Mix-Peak dBFS | -6.40 | -7.09 | -8.53 |
| Clipping (Mix + Burst) | 0 | 0 | 0 |
| Burst-Stimmen | 23 | 19 | 15 |
| Hörbare Waffen-IDs | 12/12 | 12/12 | 12/12 |

LOW startet 55 % weniger Voice-Starts/s (10.62 vs. 23.55) und hält maximal
5 statt 13 gleichzeitige Stimmen — die Audio-Mix-Kosten sinken auf schwachen
Geräten deutlich, alle Klänge bleiben hörbar, 0 Clipping in allen Tieren.

## Offene Punkte

- Die Verdrahtung liest `config.QUALITY` (Laufzeit-Regler, Start: high);
  keine eigenen Änderungen an Regler/Szenen (Disponent-Bereich).
- Keine WAV-/gen_sfx-Änderungen; SFX_CONFIG unverändert.
- Reviewer-Nit (kein Blocker): Nach einem Laufzeit-Downgrade klingen bereits
  aktive Stimmen natürlich ab, statt auf das neue `maxTotalVoices` abgebaut
  zu werden (Verdrängung ist 1:1-Ersatz). Betrifft HIGH nicht (bitgleich);
  ggf. Nachfolge-Karte „Tier-Wechsel: aktive Stimmen aufs neue Budget
  zusammenziehen".


