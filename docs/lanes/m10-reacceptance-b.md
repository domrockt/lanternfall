# Lane m10-reacceptance-b — 2. Nachabnahme (27.11.2026)

Zweite Re-Abnahme auf einem bei Job-Start gepinnten main-Commit. Die erste Nachabnahme
(`docs/qa/reacceptance-2026-11-27.md`) endete 16:05; danach landeten 4 Fix-Merges ohne
Abnahme-Beleg: gem-drawcap (`50f45ec`), menu-touch-targets (`f359f79`), feedback-budget
(`7a53cd6`), perf-fix-ambient-batching (`8c1b8d4`).

## Geltungsbereich

- **PIN = `49727faa5ffb72652ec9278fde9d483842f7f77d`** (main @ 2026-11-27T18:14:54Z).
  Alle Prüfungen laufen auf PIN; nichts auf main geschrieben, nichts gemergt, kein
  Spielcode geändert.
- Abnahme-Doku: `docs/qa/reacceptance-b-2026-11-27.md` (wächst mit den Karten).
- Ergebnis je Kriterium: `ACCEPTANCE.md`, Abschnitt „Nachabnahme B (27.11., PIN)“.

## Karten

| Karte | Inhalt | Ergebnis |
|---|---|---|
| K0 | PIN dokumentieren | siehe QA-Doku-Kopf |
| K1 | build / tsc / test / acceptance-count auf PIN | s. QA-Doku K1 |
| K2 | 4 Merge-Fixes einzeln belegen (a gem-drawcap, b menu-touch, c feedback-budget, d ambient-batching) | s. QA-Doku K2 |
| K3 | ACCEPTANCE.md-Abschnitt + .lane-done | s. ACCEPTANCE.md |

## Offene Punkte

- Der 30-min-Echtzeitlauf wird nicht erneut versucht (Runner-Limits, Vera) —
  wird als offen/blocked in ACCEPTANCE.md übernommen.
