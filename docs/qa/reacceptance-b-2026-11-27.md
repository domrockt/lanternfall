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
| — | `npm run build` | — | — |
| — | `npx tsc --noEmit` | — | — |
| — | `npm test` | — | — |
| — | `node scripts/acceptance-count.mjs` | — | — |

## K2 — Die 4 Merge-Fixes gegen PIN

### a) gem-drawcap — Draw-Cap wirksam

Offen.

### b) menu-touch-targets — Probe 36/36

Offen.

### c) feedback-budget — Peaks verifizieren

Offen.

### d) ambient-batching — Nachher-Zahlen + Lane-Doc

Offen.
