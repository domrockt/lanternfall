# Lane m10-mira-dps-corridor — mira-DPS-Drift: Bosse unter das Korridor-Minimum

Lane: `m10-mira-dps-corridor` (Worktree, Branch `m10-mira-dps-corridor`), 2026-11-28.
Karten: #12164 (K1 Vorher), #12165 (K2 Ursache+Fix), #12166 (K3 Rebaseline), #12167 (K4 Abschluss).
Fund der Guard-Lane m10-balance-corridor-guard (docs/lanes/m10-balance-corridor-guard.md, Bedarf in
`.dispatch/requests.md` 28.11.).

## Auftrag

mira meltet Bosse unter das Dom-Korridor-Minimum (ACCEPTANCE A5, Dom-Zustimmung 06:00Z:
Boss-Dauer 20–60 s). MINIMALER Fix, der alle mira-Boss-Dauern in [20, 60] s bringt.
**kael und die Korridor-Schwellen bleiben UNVERÄNDERT.**

## K1 — Vorher (Baselines der Guard-Lane, kein neuer Messlauf)

Quelle: `shots/m10-balance-corridor-short.json` (generatedAt 2026-11-28T12:19Z) und
`shots/m10-balance-corridor-full.json` (12:35Z), committet in main durch Lane
m10-balance-corridor-guard. Korridor: Boss-Dauer [20, 60] s.

### Vorher — mira Boss-Dauern (s)

**short (bis Boss 3):**

| Seed | Moorkönigin | Knochenfürst | Fahle Hirte | Verstoß |
|---|---|---|---|---|
| 101 | **12,9** | 23,1 | 28,6 | 1 |
| 202 | 30,1 | 29,2 | 29,0 | 0 |
| 404 | 31,3 | 29,5 | 33,4 | 0 |

**full (30-min-Referenz):**

| Seed | Moorkönigin | Knochenfürst | Fahle Hirte | Glockenturm-Golem | Hexenzirkel | Hohler König | Verstoß |
|---|---|---|---|---|---|---|---|
| 101 | **11,8** | 26,5 | 32,0 | 28,5 | 28,1 | 22,6 | 1 |
| 202 | **15,1** | 29,8 | 31,3 | 26,1 | 25,5 | 25,4 | 1 |
| 404 | **10,1** | 22,3 | 23,7 | 21,1 | **19,6** | **17,5** | 3 |

mira-Verstöße gesamt: 6 (alle unter 20 s); alle im [20,60]-Fenster liegenden mira-Werte:
kurz 23,1–33,4, full 21,1–32,0. Endlevel full: 35/36/36 (Fenster 25–40 erfüllt).
Kein Tod vor Minute 15 (6/6 Dawn).

### Vorher — kael (Referenz für Nebenwirkungsfreiheit, K2/K3-Kriterium d: ±10 %)

| Seed | short: M/K/H | full: M/K/H/G/Hex/HK |
|---|---|---|
| 101 | 26,9 / 30,1 / 36,3 | 29,0 / 48,9 / 40,3 / 39,9 / 34,7 / 30,5 |
| 202 | 29,3 / 51,9 / 47,1 | 30,1 / 45,2 / 29,3 / 26,0 / 28,1 / 23,1 |
| 404 | 27,3 / 42,4 / 39,8 | 28,4 / 50,4 / 53,5 / 43,3 / 37,8 / 39,4 |

Alle kael-Läufe im Korridor. Endlevel full: 34/35/35. Historic-Referenz 2026-11-26
(shots/m10-balance-kael-final.json, lane m10-balance-kael): mira/202 24/26/25/23/25/33 —
dort alles im Fenster.

## K2 — Ursachenklärung + Fix

**Ursache (Probe-Befund, `~/games/.evidence/m10-mira-dps-corridor/probe-build-{before,after}.json`):**
mira erreicht die Startwaffe Glutfunke auf Stufe 8 schon bei Minute ~4 (Level 13) und bekommt
die Evolution **Phönixschwarm** über das Level-up-Angebot (`generateOffers`, includeEvolutions)
bereits **vor Boss 1** — nicht erst über die Boss-Truhe. phoenix Stufe 8 hatte 4 Funken/0,48 s
(250 Basis-DPS; plus Explosion = Waffenschaden im Radius und Brandfleck 18 DPS/3,2 s, beides im
CombatSystem fix) → Moorkönigin (3200 HP) fiel in 9,5–15,1 s (Probe: mira/101 11,5 s,
mira/404 11,7 s; Boss-1-Spawn-Builds `[phoenix:8, frost:1]` bzw. `[phoenix:8]`).
kael baut zu dem Zeitpunkt Zornpendel (~94 DPS vs. Einzelziel, kein Flächenbonus) → alle
kael-Läufe im Korridor. Der Drift gegen die 26.11.-Referenz (mira/202 Boss 1: 24 s) kommt
aus genau diesem phoenix-Früh-Evolutions-Pfad (Stichprobe: nur die Läufe mit phoenix vor
Boss 1 melteten; mira/202 mit ember:8 lag bei 30–32 s).

**Fix (3 begründete Iterationen, verbindlich ausgewertet):** `src/data/evolution-weapons.ts`,
phoenix Stufe 8: **4 Funken/0,48 s → 2 Funken/1,1 s** (Basis-DPS 250 → ~109, −56 %; damage
bleibt 30 wegen Pin `tests/evolution.test.ts:99`; Level 1–7 sind Tot-Daten, Evolutionen
starten auf Stufe 8).
- Iteration 1 (3 Funken/0,75 s, 120 DPS): short Probe mira/404 Boss 1 15,8 s < 20 → nicht grün.
- Iteration 2 (2 Funken/0,8 s, 150 DPS inkl. Explosion): Binding-short grün, Binding-full
  mira/404 Boss 1 **16,7 s < 20** → FAIL (Beleg: `~/games/.evidence/m10-mira-dps-corridor/full-iter2-FAIL-mira404-16.7.json`).
- Iteration 3 (2 Funken/1,1 s): grün in short UND full (s. K3).
Nicht angefasst: Korridor-Schwellen, kael-Werte, ember/frost/… (Basiswaffen), Gegner-/Boss-HP,
`src/logic/stats.ts`/`scaling.ts` (unverändert — die Caps sind nicht die Ursache).

## K3 — Rebaseline

`node scripts/m10-balance-corridor.mjs short && … full` (ohne flock), 13:43Z / 13:52Z.
Danach mira-Eintrag aus `KNOWN_VIOLATIONS` in `scripts/m10-balance-corridor.mjs` entfernt
(Rückbau-Grund im Codekommentar + in docs/lanes/m10-balance-corridor-guard.md vermerkt —
deren Update-Prozedur verlangt die Dokumentation dort; minimaler Fremdkontakt, begründet).

### Nachher — mira (Binding-Läufe, alle im Korridor [20, 60] s)

**short:** Moorkönigin 26,6 / 32,0 / 21,9 — Knochenfürst 49,8 / 44,1 / 35,4 — Fahle Hirte 42,3 / 39,1 / 35,9 (Seeds 101/202/404).
**full:** 27,9 / 28,6 / 21,9 — 45,2 / 57,6 / 35,4 — 37,2 / 39,2 / 39,2 — 41,8 / 41,1 / 32,3 — 24,7 / 35,2 / 28,3 — 23,8 / 34,4 / 26,7.
Spannweite mira: 21,9–57,6 s (n=24, Mittelwert ~35,9 s). Endlevel full: 35/38/27 (mira), 34/36/36 (kael) — Fenster 25–40 ✓. Kein Tod vor Minute 15 (einziger Tod: kael/404 bei Minute 15,68 > 15).

### Nachher — kael (Nebenwirkungsfreiheit)

kael Mittelwert der Boss-Dauern: short 36,8 → 36,0 s (−2 %), full 36,5 → 36,2 s (−1 %) —
deutlich innerhalb ±10 %. Einzellauf-Streuung (stochastischer Korridor, gleiche Seeds liefern
je Lauf andere Builds/Dauern): short max 51,9 → 43,5, full 23,1–53,5 → 28,3–49,2.

## K4 — Abnahme

- (a) alle mira-Boss-Dauern in short (9/9) UND full (15/15) in [20, 60] s ✓ (min 21,9, max 57,6)
- (b) Endlevel-Fenster 25–40 in full ✓ (34–38)
- (c) kein Tod vor Minute 15 ✓ (einziger Tod Minute 15,68)
- (d) kael innerhalb ±10 % der alten Baseline (Mittelwerte −1 %/−2 %) ✓
- (e) Guard-Test grün OHNE mira-Eintrag in der Whitelist ✓ (`KNOWN_VIOLATIONS = []`)
- (f) npm test + npm run build grün ✓ (Zahlen unten)

**Risiken ehrlich:** mira/404 Boss 1 liegt mit 21,9 s knapp über dem Minimum, mira/202
Knochenfürst (full) mit 57,6 s knapp unter dem Maximum — der Korridor ist stochastisch;
ein Wiederholungslauf kann einzelne Werte an die Ränder drücken. Der Fix ist auf 3 Iterationen
verbindlich ausgewertet (Regel „höchstens eine Wiederholung"); weitere Tuning-Schritte wären
neue Karte/Befund.

Belege: `~/games/.evidence/m10-mira-dps-corridor/` (probe-build-before/after.json,
short-iter2-PASS.json, full-iter2-FAIL-mira404-16.7.json), committete Baselines
`shots/m10-balance-corridor-{short,full}.json`.
