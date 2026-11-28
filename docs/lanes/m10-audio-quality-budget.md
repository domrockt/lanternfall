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
