# Lane m10-acceptance-g-sync (2026-11-28, Versuch 2)

**Ziel:** Offene Dora-Bedarfe aus der Nachabnahme G (Befundliste
`docs/qa/acceptance-refresh-g-2026-11-28.md`): B1 (ACCEPTANCE.md-Eintrag
nachholen) und B5 (Port-Retry im Harness). B3 macht Dora selbst, nicht diese Lane.

**Basis:** main @ `f3a94bb2`. Karten #12395–#12398.

## K1 — #12395: ACCEPTANCE.md „Nachabnahme G“ (B1)
- Commit `08b3df71`: neuer Abschnitt „Nachabnahme G (2026-11-28) — Nachabnahme
  nach Heap-Regressions-Fix“ am Dateiende (32 Zeilen, **nur Anhang** —
  `git diff`: 32 insertions, 0 deletions, keine anderen Abschnitte verändert).
- Tabelle 4/4 PASS aus der QA-Doku übernommen, Abweichungen ≥ 5 % vs. F markiert,
  Befundliste B1–B5 referenziert (B1 als hier nachgeholt markiert).

## K2 — #12396: Port-Retry in `scripts/harness.mjs startServer` (B5)
- Commit `e8266d29`: bis zu 3 Versuche, jeweils nächste Port-Nummer
  (basePort+attempt), klare Fehlermeldung mit Port-Range bei Erschöpfung.
- Sofort beendeter Prozess (Bind-Fehler „address in use“) bricht den Poll
  früh ab statt 6 s zu warten; Erfolgspfad bitgleich (gleicher Spawn,
  gleiches 100-ms-Poll, `npx tsc --noEmit` rc=0).
- Optionale `opts`-Parameter nur für den Guard-Test; Produktionsaufrufer
  unverändert.

## K3 — #12397: Guard-Test `tests/harness-port-retry.test.ts`
- Commit `c729b9c1`: 3 Tests — belegter Port → Retry auf nächste Nummer →
  Erfolg (Spawn-Args + sauberes `kill` geprüft); frührer Bind-Fehler bricht
  Poll ab; Erschöpfung → erwartete Fehlermeldung `Port-Konflikt auch nach 3
  Versuchen (Ports 9000-9002)`.
- `npm test`: **2348/2348 (213 Dateien) grün** (vorher 2243, G-Basis; +105
  durch andere Lanes/Tests dieser Lane: +3).

## K4 — #12398: Smoke + Abschluss
- Harness-Lauf (der geänderte `startServer` im Erfolgspfad): Burst 640x360
  **60,1 FPS** (Tor ≥55; G-Basis 60,0 — unverändert), Minute-25 780-Pfad
  **60,1 FPS**, Renderer `Mesa Intel(R) Graphics (RPL-S)`, `swiftshader:false`,
  0 JS-Fehler.
- Beleg: `~/games/.evidence/m10-acceptance-g-sync/k2-perf-m10-acgsync-smoke.json`,
  Log `~/tmp/m10-acceptance-g-sync/k4-smoke.log`.

## Ergebnis
B1 und B5 aus der Nachabnahme G sind erledigt; verbleibende Befunde (B2 Info,
B3 Android/Dora, B4 hazard-tex-cap-Lane) sind nicht Gegenstand dieser Lane.
