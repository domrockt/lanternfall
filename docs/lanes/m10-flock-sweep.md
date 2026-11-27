# Lane m10-flock-sweep — bare-flock Reste auf `flock -w <N>` umstellen

Datum: 2026-11-27, ~19:03–20:00Z. Folge-Karte zu m10-flock-timeout (Merge in Arbeit,
Muster von dort uebernommen: `Sperre /home/ai/games/.lf-perf.lock belegt — spaeter
erneut versuchen` + Exitcode weiterreichen).

## Geaenderte Dateien (alle claimed, keine Konflikte)

| Datei | Stelle | N | Begruendung N (erwartete Laufzeit + 120 s) |
|---|---|---|---|
| scripts/m10-endgame-fps.mjs | Kommentar Z.8 + summary-command Z.228 | 240 | 3 Laeufe x 6 s + Build/Boot ~120 s |
| scripts/qa-reaccept-perf.mjs | Kommentar Z.3-7 + spawnSync-Array | 420 | gemessen 288 s gesamt (shots/qa-reaccept-perf-summary.json wallSeconds 115+42+29+43+29+30) |
| scripts/m10-damage-batch.mjs | Kommentar Z.7-10 | 240 | 1 Lauf, 10 s Fenster + Build |
| scripts/m10-crowd-probe.mjs | Kommentar Z.8-11 | 240 | 300 Frames + Build |
| scripts/balance.mjs | Kommentar Z.17-22 | 420 | Szenarien bei timeScale 30, ~300 s |
| scripts/m10-chest-timing.mjs | Kommentar Z.4-7 | 240 | 30 min Ingame @ timeScale 30 ~ 60 s real + Build |
| scripts/m10-chest-layout.mjs | Kommentar Z.5-8 | 240 | Layout-Screenshots + Build |
| scripts/verify-display.mjs | Kommentar Z.5-8 | 300 | 7 Geraete-Profile ~180 s |

Zusatz (nur Lock-Wrapper-Logik, keine Messlogik):
- `scripts/qa-reaccept-perf.mjs`: nach dem spawnSync jetzt `run.status !== 0` →
  Meldung `qa-reaccept-perf: Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut
  versuchen` + `process.exit(run.status)` (vorher wuerde das fehlende JSON mit rohem
  ENOENT crashen). Node-Timeout 300_000 → 720_000 (= 420 s Lock-Wartezeit + 300 s
  Messlauf), damit `flock -w` nicht vom Node-Timeout gekillt wird, bevor es abbricht.
- `scripts/m10-endgame-fps.mjs` Z.228: recorded-command-String in der summary-JSON
  (wird kopiert, daher mit `-w 240`).

## Abnahme

### 1) Grep ohne `flock -w` → nur 1 struktureller Treffer

```
$ grep -n 'flock' <8 Dateien> | grep -v 'flock -w'
scripts/qa-reaccept-perf.mjs:36:      "flock",
```

Der eine Treffer ist das argv[0]-Literal im spawnSync-Array; `-w` steht dort als
argv[1] direkt daneben (Z.36-38, `"-w", "420",`). Ein bare `flock <lock>`-Spawn
existiert nach der Umstellung in keiner der 8 Dateien. Alle 4 Kommentare wurden
zusaetzlich so umformuliert, dass sie `flock -w` enthalten (kopierfest).

### 2) Negativtest (Sperre gehalten)

2a) Kommando-Muster je Datei — `flock -n /home/ai/games/.lf-perf.lock sleep 5 &`,
danach `flock -w 1 <lock> node --check <datei>`:

```
m10-endgame-fps rc=1
m10-damage-batch rc=1
m10-crowd-probe rc=1
m10-chest-timing rc=1
m10-chest-layout rc=1
verify-display rc=1
balance rc=1
```

2b) Echter SpawnSync-Pfad (scripts/qa-reaccept-perf.mjs, gleiche Aufrufform
`spawnSync("flock", ["-w", N, lock, ...])`) mit gehaltener Sperre, -w 1:
`status=1` nach ~1 s; Positivkontrolle mit freier Sperre: `status=0` nach 0.02 s
(Treiber: ~/tmp/m10-flock-sweep/negtest.mjs, rc=0). Der neue `run.status !== 0`-Zweig
gibt die Meldung aus und reicht den Exitcode weiter (Z.51-56).
Hinweis: ein erster Testlauf mit `timeout 30` bestätigte das Warteverhalten —
Sperre wurde nach ~4,7 s frei, der Messlauf startete korrekt und wurde nur vom
aeusseren Test-Timeout gekillt (keine Restprozesse, fremde Lanes unberuehrt).

### 3) Syntax + Build + Tests

```
node --check je Datei (8x) → CHECK-OK
npm run build → rc=0 (built in 451ms)
npm test → 50 Dateien / 515 Tests passed, rc=0
```

### 4) git diff

Nur Lock-Wrapper/Kommentare/Meldungen: Kommentare (8 Dateien), `"-w","420"` im
spawnSync-Array, Timeout 300_000→720_000, status-Zweig mit Meldung + exit,
`-w 240` im summary-command-String. Keine Messlogik veraendert.

## NICHT angefasst (fremde Claims, wie beauftragt)

scripts/m10-ground-cost.mjs, scripts/m10-fx-overdraw.mjs, scripts/m10-ui-cost.mjs
(m10-flock-timeout), scripts/realtime-run.mjs + scripts/m10-dpr-budget.mjs
(m10-realtime-stability), alle src/**-Dateien.

## Offene Punkte

- Keine. Merge-Job kann die Lane uebernehmen; die flock-timeout-Kommentare
  (`-w 300`/`-w 520`) und diese Werte sind konsistent (N = Laufzeit + 120 s).
