# Lane m10-heap-softprint (Bedarfsmeldung m10-heap-softgate-fix, 2026-11-28)

Konsolen-Print in `scripts/m10-heap-budget.mjs` zeigte weiterhin das rohe
`softVerdict` (reaccd: „FAIL +41,5 %"), obwohl das robuste Urteil
`gate.softFloorVerdict` aus `scripts/m10-heap-budget-gate.mjs` seit
Merge `merge-m10-heap-softgate-fix` existiert (robust PASS +23,8 %).

## K1 — Print umgestellt (Commit 887388e)

- `scripts/m10-heap-budget.mjs` (Print vor `browser.close()`): druckt jetzt
  `gate.softFloorVerdict` + `maxWindowFloor`/`maxWindowFloorPct` +
  `softReferenceMB` (Floor Fenster 0). Die Rohpeaks bleiben als
  Beobachtungsfeld sichtbar (`Rohpeak-Beobachtung: maxWindowPeak …`) und
  vollständig im JSON (`gate.windowPeaks`).
- `scripts/m10-heap-budget-gate.mjs` **unangetastet** (kein Mess-/Gate-
  Verhalten geändert; `node --check` OK).

## K2 — Verifikation

**Replay gegen shots/m10-reaccd-heap.json** (Beleg
`shots/m10-softprint-replay.json`; `evaluateHeapGate` über die Original-Rohdaten
`minute1MB 54,9 / endMB 60,8 / minutePeaks`, Print im neuen Format):

```
gate=PASS (endMB 60.8 MB vs Minute1 54.9 MB = 10.7 %, Tor <= +15 %),
soft=PASS (Beobachtung, robust) (maxWindowFloor 70.3 MB = 23.8 % vs Floor
Fenster 0 56.8 MB, Tor <= +25 %; Rohpeak-Beobachtung: maxWindowPeak 77.7 MB
= 41.5 %), renderer=ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)
```

- HARD PASS +10,7 % — identisch zur reaccd-Referenz.
- Robustes Urteil im Print: **PASS +23,8 %** (vorher Fehl-„FAIL +41,5 %").
- Rohpeaks (+41,5 %) weiterhin sichtbar, aber ausdrücklich als Beobachtung.

**Kontrolllauf live** (`shots/m10-softprint-control.json`, `--minutes 2`,
iGPU Intel RPL-S, 0 JS-Fehler): `gate=PASS (0.4 %), soft=PASS
(Beobachtung, robust) (maxWindowFloor 61 MB = 9.3 %; Rohpeak 81.9 MB = 48.1 %)`
— der echte Läufer druckt das robuste Urteil end-to-end.

**Build/Tests:** `npx tsc --noEmit` OK; `npm test` 143 Dateien / 1506 Tests
grün (inkl. `tests/heap-budget.test.ts` — Gate-Definition unverändert).

## Offene Punkte

- Keine. Der Print ist die einzige Druckstelle des rohen Urteils im Läufer;
  JSON-Felder (`softVerdict`, `windowPeaks`) bleiben unverändert erhalten.
