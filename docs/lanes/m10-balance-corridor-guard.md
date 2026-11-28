# Lane m10-balance-corridor-guard — Dauerhafter Dom-Balance-Korridor (Guard)

Lane: `m10-balance-corridor-guard` (Worktree, Branch `m10-balance-corridor-guard`), 2026-11-28.
Karten: #11872 (K1 Skript), #11873 (K2 Guard-Test), #11874 (K3 Baseline + Doku).

## Zweck

Das Dom-Balance-Kriterium war nur per Einzelmessung belegt (shots/m10-balance-kael-final.json,
lane m10-balance-kael) — kein Regressionsschutz in `npm test`. Diese Lane verankert den
Korridor als dauerhaften Suite-Guard, BEVOR die Evo-FX-/Heap-Welle main weiter umschreibt.

## Dom-Kriterium (ACCEPTANCE A5, Dom-Zustimmung 2026-11-28 06:00Z)

| Marke | Korridor |
|---|---|
| Endlevel (Run-Ende, 6/6 Läufe) | 25–40 |
| Boss-Dauer (jeder Boss mit messbarer Dauer) | 20–60 s |
| Tod | keiner vor Minute 15 |

## Guard-Aufbau

- **Skript** `scripts/m10-balance-corridor.mjs` (Messwerkzeug, kein Guard):
  - `node scripts/m10-balance-corridor.mjs short` — 3 Seeds (101/202/404, wie Dom-Referenz)
    × mira/kael, timeScale 30, autoPlay, KEIN god, 960×540 @dpr 1; kurzskaliert bis Boss 3
    (Index 2, „Der Fahle Hirte") besieg ist, ~47 s Wandzeit/Lauf, ~5 min gesamt.
  - `node scripts/m10-balance-corridor.mjs full` — 30-min-Referenz, 6/6 Läufe bis Run-Ende
    (Dawn/Tod), ~90 s Wandzeit/Lauf, ~10 min gesamt.
  - Output: `shots/m10-balance-corridor-short.json` / `-full.json` (Endlevel, Boss-Dauern,
    Todeszeitpunkt, Renderer-String, JS-Fehler). Läuft **ohne flock** (Balance, feste Substeps).
- **Guard-Test** `tests/balance-corridor.test.ts` (Muster: tests/golden-frame.test.ts):
  führt KEINE Messläufe aus, sondern bewertet die committeten Marken **unabhängig vom
  Skript** streng gegen den Dom-Korridor. Jede Abweichung muss in der committeten
  `knownViolations`-Liste **mit Grund** abgedeckt sein — sonst FAIL. Explizites
  Test-Zeitbudget 15 s (kein 5-s-Timeout-Flake).

## Abweichungen: knownViolations-Whitelist

Die Baselines enthalten dokumentierte Abweichungen vom strikten Korridor (alle mit Grund
im JSON, Datei `scripts/m10-balance-corridor.mjs` → `KNOWN_VIOLATIONS`):

1. **Fund (an Dom zurückgemeldet via `.dispatch/requests.md`): mira meltet Bosse unter das
   20-s-Minimum.** Boss 1 (Moorkönigin) 9,5–15,1 s über Seeds/Läufe; mira/404 (30-min-Referenz)
   auch Hexenzirkel 19,6 s und Hohler König 17,5 s. Referenz 2026-11-26: alles 24–60 s.
   **Alle kael-Läufe liegen im Korridor.** Ursachenklärung/Fix braucht `src/**` (in dieser
   Lane gesperrt) — deshalb als knownViolation dokumentiert statt still geschönt.
   **GELÖST (2026-11-28, Lane m10-mira-dps-corridor):** Ursache war phoenix L8
   (4 Funken/0,48 s = 250 Basis-DPS; mira erreicht ember:8 bei Minute ~4 und bekommt die
   Evolution über das Level-up-Angebot vor Boss 1). Fix: phoenix L8 → 2 Funken/1,1 s
   (src/data/evolution-weapons.ts); der mira-Eintrag wurde aus `KNOWN_VIOLATIONS` entfernt
   (Rückbau-Grund + Vorher/Nachher: docs/lanes/m10-mira-dps-corridor.md). Neue Baselines
   `shots/m10-balance-corridor-{short,full}.json` (13:43Z/13:52Z): alle mira-Boss-Dauern
   21,9–57,6 s, kael 28,3–49,2 s, alles im Korridor, Guard-Test grün ohne Whitelist.
2. Endlevel aller 6/6 Referenzläufe: 34–36 — im Dom-Fenster [25, 40], keine Abweichung.

## Grenzen des Guards (wichtig)

- **Stochastisch, kein bitgenauer Determinismus-Anspruch:** empirisch belegt liefern gleiche
  Seeds je Lauf verschiedene Boss-Dauern (mira/202: 30,1 s im Kurzlauf vs. 15,1 s im
  30-min-Lauf). Der Korridor prüft Schwellen über 3 Seeds × 2 Charaktere; bitgenauen
  Determinismus sichert der Golden-Frame-Guard (tests/golden-frame.test.ts), nicht dieser Test.
- Der Kurzmodus kann das Endlevel-Kriterium nicht prüfen (Run endet bei Boss 3); dort ist
  das Endlevel eine informative Marke (25–27 beobachtet). Endlevel 25–40 wird nur in der
  committeten 30-min-Referenz erzwungen.
- Whitelist-Änderungen NUR mit Grund in dieser Doku + Commit; nie stillschweigend.

## Update-Prozedur (Rebaseline)

1. Gewollte Verhaltensänderung (z. B. Balance-Merge) → Baseline NEU erzeugen:
   `node scripts/m10-balance-corridor.mjs short && node scripts/m10-balance-corridor.mjs full`
   (ohne flock; zur Not nur `short`, `full` bei Balance-Merges).

2. Neue Abweichungen: zuerst klären, ob sie das Dom-Kriterium verletzen. Ja → als
   `knownViolation` MIT Grund aufnehmen (Skript + JSON) und Dom/Supervisor informieren;
   nein → Fehler im Messlauf suchen, nicht rebaseln.

3. Commit mit `#11874`-Bezug und Begründung; der Guard-Test muss danach 0 fail zeigen.

## Dry-Run-Beleg (Guard erkennt Verstöße)

In tests/balance-corridor.test.ts, Test 4 (`Gegenprobe`), 2 Szenarien, beide FAILen wie erwartet:

- **Synthetischer Verstoss-Entwurf** (kael/202: Endlevel 41, Boss-Dauer 90 s, Tod Minute 10 —
  bewusst NICHT whitelistgedeckt): strenge Auswertung liefert genau 3 Violations
  (`bossDuration`, `deathBefore15`, `endLevel`), `unknownOf` = 3 → Guard würde FAILen.
- **Angehobene Schwelle gegen die reale Baseline:** Boss-Korridor [30, 60] s statt
  [20, 60] s → mehrere reale Baseline-Boss-Dauern fallen durch, `unknownOf` > 0 → FAIL.

## Belege

- `shots/m10-balance-corridor-short.json` / `-full.json` (committete Marken + verdict).
- Mess-Logs: `~/tmp/m10-balance-corridor-guard-k1-short2.log`, `...-k3-full2.log`.
- Bedarfsmeldung: `/home/ai/games/.dispatch/requests.md` (mira-DPS-Drift, 2 Einträge 28.11.).
- Suite: `npm test` 2228/2228 grün (200 Dateien), `npm run build` rc=0 (403 ms) — 28.11.

## Board-/Bereichs-Notizen

- `.gitignore`: eine Whitelist-Zeile `!shots/m10-balance-corridor-*.json` ergänzt (minimaler,
  unvermeidlicher Fremdkontakt — Fixture-JSONs müssen im Repo liegen, Muster
  `!shots/m10-golden-frame-*.json`). `.dispatch/requests.md` bedarfsgemäß beschrieben.
- Vom Disponenten zugewiesene Dateien sonst eingehalten: scripts/m10-balance-corridor.mjs,
  tests/balance-corridor.test.ts, docs/lanes/m10-balance-corridor-guard.md,
  shots/m10-balance-corridor-*, .lane-done.
