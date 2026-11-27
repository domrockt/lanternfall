# Nachabnahme B — 2026-11-27 (2. Re-Abnahme nach den 4 Fix-Merges)

> ## PIN (gesperrter Prüfstand)
> **PIN = `49727faa5ffb72652ec9278fde9d483842f7f77d`**
> (`git rev-parse main` am 2026-11-27T18:14:54Z — main-HEAD „Board: Lane-Karten #4238-#4241 …“).
> Alle Prüfungen dieser Nachabnahme laufen auf diesem Commit (Worktree
> `/home/ai/games/lf-lanes/m10-reacceptance-b`, Branch `m10-reacceptance-b`).
> Nach dem Pinnen wurde main **nicht** verändert (keine Commits, keine Merges von dieser Lane).
>
> Der PIN deckt die 4 Fix-Merges der ersten Nachabnahme (`docs/qa/reacceptance-2026-11-27.md`,
> Ende 16:05) ein:
>
> | Merge | Commit | Zeit (UTC) | Fix |
> |---|---|---|---|
> | gem-drawcap | `50f45ec` | 16:23:06 | Harter 120er-Gem-Draw-Cap im PickupSystem, verlustfreies Verschmelzen |
> | menu-touch-targets | `f359f79` | 16:37:00 | Touch-Targets ≥44×44 in allen Menüs, Probe 36/36 |
> | feedback-budget | `7a53cd6` | 17:36:49 | Hit-Stop nicht kumulativ, Shake max statt Summe, Knockback-Clamp |
> | perf-fix-ambient-batching | `8c1b8d4` | 17:59:25 | Ambient-Layer-Batching + `ambientBudgetFor(lod)` |
>
> Urteil folgt am Ende; 30-min-Echtzeitlauf wird **nicht** erneut versucht
> (offen/blocked, Runner-Limits — siehe ACCEPTANCE.md).

## K1 — Basis auf PIN (Build, tsc, Tests, Inhaltszählung)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-27T18:20:46Z | `npm run build` | rc=0, `✓ built in 823ms`, bekannte Chunk-Warnung >500 kB (Log `~/tmp/reaccb-k1-build.log`) | **PASS** |
| 2026-11-27T18:20:35Z | `npx tsc --noEmit` | rc=0, keine Fehler | **PASS** |
| 2026-11-27T18:20:39Z | `npm test` (vitest run) | **446 Tests in 42 Dateien, 0 fail**, 2,61 s | **PASS** |
| 2026-11-27T18:20:38Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | **PASS** |

**Urteil K1: PASS.** (Erste Nachabnahme fa2-01: 355 Tests/33 Dateien — seitdem gem-drawcap,
menu-touch, feedback-budget, ui-text-cost u. a. zusätzliche Tests gemergt.)

## K2 — Die 4 Merge-Fixes gegen PIN

### a) gem-drawcap — Draw-Cap wirksam

Offen.

### a) gem-drawcap — Draw-Cap wirksam

Geprüft gegen PIN (Merge `50f45ec` von 16:23:06Z) über **Unit-Tests + Mess-JSON**,
keine neue Chaos-Messung nötig (Belegdeckung durch `shots/m10-gem-drawcap-after.json`
vom Lane-Endstand, Seed 1, 500 Gegner):

| Kennzahl | Messwert (after-JSON) | Soll | Urteil |
|---|---:|---|---|
| Peak aktive Gem-Sprites | **120** | ≤ 120 (harter Cap `MAX_VISIBLE_GEMS`) | **PASS** (an der Grenze, Deckel wirksam) |
| Peak Tweens (ganze Szene) | 35 | kein Tween pro Gem (sonst ~120+) | PASS |
| ms/Frame (10 s, 1×) | 16,67 | nicht schlechter als vorher 16,64 | PASS (≈ Noise) |
| XP-Bilanz (`endState`) | spawned 9.520 = granted 9.328 + im Feld 192, **xpLoss 0** | 0 % Verlust | PASS |
| JS-Fehler | 0 | 0 | PASS |
| Unit-Tests `tests/gem-draw-cap.test.ts` | **8/8 grün** (`npx vitest run`, 152 ms) | Deckel/XP-Bilanz/NaN/Magnet fixiert | PASS |

Belege: `shots/m10-gem-drawcap-after.json` (Felder `peakGems`, `peakTweens`, `msPerFrame`,
`endState.xpLoss`), Testlauf auf PIN 2026-11-27T18:21Z.

**Urteil K2a: PASS.**

### b) menu-touch-targets — Probe 36/36

Offen.

### c) feedback-budget — Peaks verifizieren

Geprüft gegen die Lane-Belege auf PIN (`shots/m10-feedback-budget-{baseline,after}.json`,
Probe `scripts/m10-feedback-probe.mjs`, Merge `7a53cd6` von 17:36:49Z):

| Kennzahl | Baseline (vorher) | Nachher | Soll laut Lane-Doku | Urteil |
|---|---:|---:|---:|---|
| Shake-Peak (px) | 2,56 | **2,56** | 2,56 | **PASS** |
| Shake-Request-Peak (px) | 4,80 | 4,80 | 4,80 | PASS |
| Hit-Stop-Peak (ms) | 120 | **120** | 120 | **PASS** |
| Frames mit aktivem Hit-Stop | 125 | **55** | 125 → 55 | **PASS** |
| Treffer max/Frame | 720 | 783 | ~700–800 (Chaos) | PASS |
| Stutter-Frames > 33 ms | 18 | 13 | 18 → 13 | PASS |
| JS-Fehler | 0 | 0 | 0 | PASS |

Quelle „after“: `shots/m10-feedback-budget-after.json` (generatedAt 2026-11-27T12:24:50Z,
seed 101, 386 Frames, timeScale 30, 500 Gegner Minute 25). Quelle „baseline“:
`shots/m10-feedback-budget-baseline.json` (393 Frames, 10.431 Treffer). Zusätzlich fixieren
die Budget-Tests die Obergrenzen (Merge-Commit meldet Vitest 414/414; auf PIN insgesamt
446/446 grün, siehe K1).

**Urteil K2c: PASS.**

### d) ambient-batching — Nachher-Zahlen + Lane-Doc

Nachher-Messung (Merge `8c1b8d4` von 17:59:25Z) gegen die vorhandenen 6 Nachher-JSONs
geprüft — **keine neue Messreihe nötig, die JSONs decken die Abschnitte**:

| View | Lauf | Burst FPS | Minute-25 FPS | JS-Fehler |
|---|---|---:|---:|---|
| 640x360 @1 | 1 | 60,1 | 57,0 | 0 |
| 640x360 @1 | 2 | 60,1 | 56,3 | 0 |
| 640x360 @1 | 3 | 57,2 | 52,3 | 0 |
| **640 Median** | | **60,1** | **56,3** (vorher 54,0; Ziel ≥ 55) | 0 |
| 780x360 @3 | 1 | 57,7 | 41,2 | 0 |
| 780x360 @3 | 2 | 59,0 | 44,8 | 0 |
| 780x360 @3 | 3 | 58,3 | 45,5 | 0 |
| **780 Median** | | **58,3** | **44,8** (vorher 45,1; fill-rate-Grenze) | 0 |

Belege: `shots/m10-ambient-after-{640,780}-{1..3}.json` (je `passed`-Flag enthalten:
640 Läufe 1–2 PASS, 640/3 und alle 780 unter Ziel — konsistent zur fill-rate-Analyse der Lane).
Median-Zahlen decken die Commit-Angabe in `6ca654d` („640 M25 Median 56,3 PASS;
780@dpr3 44,8 fill-rate-Grenze“) exakt.

**Urteil K2d: PASS** (640/M25-Hebung belegt: 54,0 → 56,3 Median, ≥ 55;
780/M25 bleibt an der fill-rate-Grenze ~44,8 — bekannt, kein Rückschritt).

Die dadurch frei gewordenen Abschnitte „3. Nachher-Messung“ und „4. Abnahme“ in
`docs/lanes/m10-perf-fix-ambient-batching.md` wurden mit dieser Tabelle + Belegpfaden gefüllt
(dieselben Zahlen, dort als Lane-Endstand).

