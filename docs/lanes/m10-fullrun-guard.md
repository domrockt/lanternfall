# Lane m10-fullrun-guard — Abnahme-Wächter (automatisierter Beleg)

**Ziel:** Die Inhaltstore aus ACCEPTANCE.md als automatisierten Beleg sichern, bevor die laufenden
Optik-Lanes weiter am Spiel drehen: ein beschleunigter 30-min-Sim-Lauf (autoPlay + timeScale 30,
Muster `scripts/fullrun.mjs`) prüft die Tore und schreibt ein Maschinen-JSON. Kein Balance-/Spielcode-Eingriff.

## Deliverables

| Datei | Zweck |
|---|---|
| `scripts/m10-fullrun-guard.mjs` | Guard-Skript: Messlauf (nur bei direktem Start, `isMain`) + reine Tor-Definitionen (`evaluateGuardGates`, exportiert, unit-getestet). Exit 1 bei jeder Torverletzung. |
| `tests/fullrun-guard.test.ts` | Unit-Tests der Tor-Definitionen (8 Tests, deterministische Fixtures, kein echter 30-min-Lauf, negative Testfälle inklusive). |
| `shots/m10-fullrun-guard-baseline.json` + `-results.png` | Ist-Messung auf aktueller main (K1). |
| `shots/m10-fullrun-guard.json` + `-results.png` | Finaler Nachweis-Lauf (K4), identisches Tor-Ergebnis. |

## Tor-Definitionen (hart, Exit 1)

1. **Bosse:** 6/6 Wellen bei 300/600/900/1200/1500/1800 s, ±2 s Toleranz
2. **Besiegte Bosse:** ≥ 6
3. **Truhen:** ≥ 6
4. **Sieg:** `resultReason === "dawn"`
5. **JS-Fehler:** 0 (pageerror + console.error)
6. **Heap:** Minute 1 → Ende (JS-Heap nach erzwungenem GC, 3× gemessen, kleinster Wert) ≤ +15 %

Aufruf (Mess-Sperre nur für diesen FPS/Echtzeit-Lauf):

```
flock /home/ai/games/.lf-perf.lock node scripts/m10-fullrun-guard.mjs --out shots/m10-fullrun-guard.json
```

## Messwerte (beide Läufe, Seed 99, 960×540@1, 30,2 Sim-Minuten in je 72 s Echtzeit)

| Tor | Ist (Baseline / Nachweis) | Status |
|---|---|---|
| Bosse 300/600/900/1200/1500/1800 s | exakt 300/600/900/1200/1500/1800 (beide Läufe) | PASS |
| Bosse besiegt | 6 / 6 | PASS |
| Truhen | 6 / 6 | PASS |
| Sieg | dawn („Morgendämmerung — Sieg“, Zeit 30:11, Screenshot) / dawn | PASS |
| JS-Fehler | 0 / 0 | PASS |
| Heap M1 → Ende | 39,1 → 30,9 MB = **−21 %** / 39,1 → 30,9 MB = **−21 %** (M29 41,0/40,6 MB) | PASS |

Der Heap-Tor-Wert liegt weit unter +15 %; der bekannte GC-Sägezahn (endMB < M1, siehe
m10-heap-budget-Lane) zeigt sich auch hier: Minute 29 liegt über dem Endwert.

## Exit-Code-Verhalten

- Alle Tore grün → JSON mit `passed: true`, Exit 0 (beide Läufe belegt, rc=0).
- Torverletzung → `passed: false`, `failures` nennt die Tornamen, Exit 1. Unit-getestet:
  Boss +3 s, fehlende Welle, 5 Truhen, 5 besiegte Bosse, `resultReason=death`, JS-Fehler,
  Heap +21 % und unmessbarer Heap werden korrekt als FAIL erkannt (8/8 Tests).

## Qualität

- `npx tsc --noEmit` rc=0
- `npx vitest run tests/fullrun-guard.test.ts`: 8/8
- `npm test`: 941/941 in 90 Dateien, `npm run build` rc=0

## Offene Punkte

- Keine. Das Skript misst nur; der Guard kann nach jedem Merge als billiger Inhalts-Check
  (~72 s) gegen die Tore laufen.
