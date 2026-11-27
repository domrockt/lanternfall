# Lane m10-heap-sawtooth — Heap-Tor +21 % (GC-Sägezahn) im 30-min-Echtzeitlauf

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-heap-sawtooth`, Branch `m10-heap-sawtooth`.

Ziel (Nachabnahme-C-Folge-Job): Heap-Tor Minute 1 → 29 im 30-min-Echtzeitlauf
(`shots/qa-reaccc-realtime-30min.json`: 31,9 → 38,6 MB = +21 %, endMB 27,1 —
GC-Sägezahn, kein monotoner Leak) zuverlässig auf **≤ +12 %** bringen, indem die
Allokations-Spikes gesenkt werden.

## Messmethode

`scripts/m10-heap-sawtooth.mjs` (eigene Lane-Datei): 30-min-**Sim**-Lauf
(timeScale 30, AutoPlay, God, seed 99, Warmlauf bis Sim-Sekunde 60). Je Sim-Minute:

- `rawMB` — rohe `performance.memory.usedJSHeapSize` OHNE GC (Sägezahn-Oberkante),
- `gcMB` — best-of-2 retained Heap nach erzwungenem Voll-GC (Gate-Metrik analog
  `realtime-run.mjs`, dort best-of-3),
- Gegner-/Kill-Zähler, FPS; dazu Sägezahn-Rohkurve (328 Samples) und
  Sampling-Heap-Profil ab Sim-Minute 20. Läuft **ohne flock** (Heap ist
  lastunabhängig, feste Substeps).

## Karte #6178 — Vorher-Messung (BEVOR der Fix beginnt)

Beleg: `shots/m10-heap-sawtooth-before.json` (2026-11-27, 30/30 Sim-Minuten,
0 JS-Fehler, Kills 9099).

| Kennzahl | Wert |
|---|---|
| Minute 1 gcMB | 35,1 |
| Minute 29 gcMB | 33,5 |
| deltaVsMinute1Pct (gcMB) | **−4,6 %** (Zufalls-Pass: Minute 1 zufällig auf Wellenkamm) |
| endGcMB / endRawMB | 34,7 / 35,2 |
| Sägezahn-Amplitude (raw − gc) gesamt | 0–11,3 MB, Mittel Minute 20–30: **6,0 MB** |
| Amplitude-Spitzen | Minute 25: 11,3 MB, Minute 27: 10,5 MB, Minute 29: 8,5 MB |

Einordnung: Der Retained-Heap ist flach (−4,6 %) — das Tor kippt nicht durch einen
Leak, sondern durch die **Amplitude des Sägezahns**: liegt Minute 1 auf einem Tal
und Minute 29 auf einem Kamm der Arbeitsmenge (Gegnerwellen + Churn zwischen den
GCs), meldet das Gate +21 % wie in `qa-reaccc-realtime-30min.json` (31,9 → 38,6 MB,
endMB 27,1). Hebel ist daher die **Allokationsrate zwischen den GCs** (Churn),
nicht Retention.

### Top-Allokationsquellen Minute 20–29 (Sampling-Heap-Profil, 10 Sim-Minuten)

| Site (minifiziert) | Bytes | Attribution |
|---|---|---|
| `set` (Phaser-Component-Setter, Zeile 23/812) | 328 KB | pro neuem GameObject (Sprite/Image) |
| `initialize` (Phaser-Components, 18/810) | 328 KB | pro neuem GameObject |
| `l` / `add` / `initialize` (810) | je 164–295 KB | DisplayList-`add` → neue Sprites |
| `addProp` (812) | 263 KB | GroundRenderer-Props (Bekannt aus m10-heap-margin) |
| `insert` / `initPostPipeline` (812/23) | 197 KB | neue Images/Sprites (Post-Pipeline je Objekt) |
| `t.onended` (808) | 103 KB | WebAudio-Clip-Handler |
| `setOriginFromFrame`, `initPipeline`, `setValue` | je ~100–131 KB | neue Sprites/Texte |

Attribution der minifizierten Sites über Bundle-Kontext (Zeile 810–812 enthält
`chain_link`, `fx_fire`, `fx_halo`, `fx_seal`, `flail_ball`, `shadow`, `ripple`,
`damage`): der Churn sind **neu erzeugte GameObjects je Frame** — konsistent mit
der Churn-Tabelle aus `docs/lanes/m10-heap-margin.md` (chain_link 9 968 / 9 min,
FX-Sprites 10 783, Gegner-Trails 2 348, Prop-Shadows 2 339, Ripples 833).
Zähl-Probe je Textur-Key folgt in Karte #6179.

### Grenzen der Messung

- Sim-Lauf (timeScale 30) ist nicht bitdeterministisch (rAF-Dt-Jitter ändert
  Substep-Gruppierung): Kills 6181 (1. Lauf, defektes Skript, ohne Minute-1-Sample)
  vs. 9099 (2. Lauf) bei gleichem Seed. Für „Verhalten bitgleich“ daher dedizierte
  deterministische Probe (Karte #6180/#6181), nicht der Vergleich zweier 30×-Läufe.
- GC-Trace-Attribution je Minute ist im ReportEvents-Modus erst am Laufende
  ausgewertet worden (alle Events im Bucket Minute 30) — die per-Minute-GC-Zahl
  ist daher nicht belastbar; die Amplituden-Kurve (rawCurve/perMinute) ist die
  primäre Sägezahn-Metrik.

## Karte #6179 — Ursache im Pool-Bereich (Befund)

folgt.

## Karte #6180 — Fix + Regressionsschutz

folgt.

## Karte #6181 — Nachher-Messung + Abschluss

folgt.
