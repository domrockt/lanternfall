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

## Ergebnis (Endstand)

Alle Karten K0–K3 erledigt, je ein Commit (`d04b684`, `1559a50`, `983f58e`+`a3f8e2e`,
`8ce619a`, `1265c7f`). Gesamturteil: **PASS** — Details in
`docs/qa/reacceptance-b-2026-11-27.md` und `ACCEPTANCE.md` (Abschnitt „Nachabnahme B“).

- Basis auf PIN `49727faa`: build 823 ms rc=0, tsc rc=0, Tests 446/446 (42 Dateien),
  acceptance-count 30/6/6/6/6/2.
- gem-drawcap: Peak-Gems 120 (Cap wirksam), xpLoss 0, Tests 8/8 — PASS.
- menu-touch: Probe auf PIN erneut 36/36 PASS, `shots/qa-reaccb-menu-touch-after.json` — PASS.
- feedback-budget: Shake 2,56 px / Hit-Stop 120 ms / aktive Stop-Frames 125→55 — PASS.
- ambient-batching: 640/M25 Median 54,0→56,3 (≥ 55 PASS), 780/M25 44,8 fill-rate — PASS;
  Lane-Doc `m10-perf-fix-ambient-batching.md` Abschnitte 3+4 nachgetragen.
- 30-min-Echtzeitlauf: offen/blocked (Runner-Limits, Vera), nicht erneut versucht.
