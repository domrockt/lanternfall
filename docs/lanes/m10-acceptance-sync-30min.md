# Lane m10-acceptance-sync-30min — Doc-Sync 30-min-Echtzeitlauf (28.11.)

**Auftrag:** ACCEPTANCE.md widersprach sich beim 30-min-Echtzeitlauf: Z328/Z329
(FPS PASS, Inhalt PASS, `shots/qa-reaccc-realtime-30min.json`) vs. Z363 (A4-Zeile
„offen/blocked (Runner-Limits, Vera) — nicht erneut versucht“) und dem Schlusssatz
des Gesamturteils Nachabnahme B. Doc-Sync-Job, **kein** Mess-Job: keine neuen
Messungen, kein erneuter 30-min-Lauf, 0 Code-Änderungen.

## Karten

1. **#7198 — ACCEPTANCE.md** (Commit `ad37aaa`): A4-Zeile in der Nachabnahme-B-Tabelle
   ersetzt: „offen/blocked (Runner-Limits, Vera)“ → **PASS (iGPU)** mit Verweis auf
   `shots/qa-reaccc-realtime-30min.json` (FPS-Tor PASS: min 60,1 / Median 60,5,
   7307 Samples, 0 Crashes / 0 JS-Fehler; Inhalt PASS: Sieg `dawn` 30,3 Sim-Min,
   6/6 Bosse 300–1800 s ±0 s, 6 Truhen, 3 Evolutionen). Heap-Zeile ehrlich:
   im Lauf selbst **+21 % FAIL** (Minute 1→29, GC-Sägezahn) → entkräftet durch
   Remessung auf main `65a1b74` (Merge `m10-heap-sawtooth`, **+5,2 % ≤ +12 %**,
   Merge-Commit-Text); formaler Tor-Abschluss über `m10-heap-budget` (HARD-Gate
   Fall A: +11,0 % / +11,3 % ≤ +15 % PASS, `shots/m10-heap-budget-before/after.json`).
   Widersprüchlicher Schlusssatz „Gesamturteil Nachabnahme B“ angepasst.
   **Z68 (historische m6-Tabelle) unberührt** wie befohlen.
2. **#7199 — docs/qa/reacceptance-2026-11-27.md** (Commit `1222d56`): Abschnitt
   fa2-04 (= A4) um **Nachtrag: iGPU-Lauf erfolgreich — BLOCKED aufgelöst** ergänzt
   (gleiche Belege, gleiche ehrliche Heap-Darstellung; historischer 15:35Z-Befund
   bleibt stehen) + kurzer Nachtrags-Verweis am fa2-06-Endurteil.

## Abnahme-Belege

- `grep -n "30-min" ACCEPTANCE.md`: kein „offen/blocked“-Widerspruch mehr zu
  Z328/Z329 — Zeile 390 (A4) steht auf PASS (iGPU); verbleibendes „offen/blocked“
  nur in der historischen m6-Tabelle (Z68, ausdrücklich nicht anzufassen).
- `git diff $(git merge-base main HEAD) HEAD --stat`: **nur** ACCEPTANCE.md
  (+9/−4) und docs/qa/reacceptance-2026-11-27.md (+31) — 0 Code-Änderungen,
  keine neuen Messungen.
- Hinweis Merge-Job: main ist parallel weitergelaufen (m10-fullrun-guard,
  Merge `155b3cf`); mein Branch basiert auf `7a67924`, Doku-Änderungen sind
  konfliktfrei (verschiedene Dateien/Abschnitte).

## Offene Punkte

- Keine aus dieser Lane. Die Heap-Tor-Definition ist Eigentum von `m10-heap-budget`
  (bereits in main, Merge `fd507b1`); diese Lane hat sie nur referenziert.
- verify-input ESC-Regression (27/28) bleibt Folge-Karte (nicht diese Lane).
