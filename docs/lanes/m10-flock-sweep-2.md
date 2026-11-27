# Lane m10-flock-sweep-2 — letzte bare-flock-Reste: ground-cost-Spawns + kopierbare Anleitungen

Datum: 2026-11-27, ~19:55–20:10Z. Folge-Karte zu m10-flock-sweep (dort durften diese 4 Dateien
wegen Claim-Konflikt mit merge-m10-flock-timeout nicht angefasst werden; Claims seit ~19:05 frei).
Muster wie docs/lanes/m10-flock-timeout.md: `Sperre /home/ai/games/.lf-perf.lock belegt —
spaeter erneut versuchen` + Exitcode weiterreichen.

## Wichtiger Befund: Dopplung mit m10-flock-timeout

Der Branch `m10-flock-timeout` (K1 6226510, K2 462802a) hat ground-cost/fx-overdraw/ui-cost
bereits identisch umgestellt, ist aber **nicht in main gemerged** (Merge angehalten bei
28c425e, Rechner-Shutdown). Diese Lane hat die 3 Dateien **byte-identisch** zum
flock-timeout-Diff umgestellt (belegt: `git diff main...m10-flock-timeout -- <3 Dateien>`
vs. `git diff` — diff der Patches leer → „IDENTISCH ZU FLOCK-TIMEOUT-BRANCH“). Ein Merge
beider Branches löst damit automatisch auf (identischer Inhalt), kein Konflikt zu erwarten.
heap-margin.mjs ist NEU (flock-timeout hatte die Datei nicht angefasst).

## Geaenderte Dateien (alle claimed: scripts/m10-ground-cost.mjs, m10-fx-overdraw.mjs,
m10-ui-cost.mjs, m10-heap-margin.mjs, docs/lanes/m10-flock-sweep-2.md)

| Datei | Stelle | N | Begruendung N (erwartete Laufzeit + 120 s) |
|---|---|---|---|
| scripts/m10-ground-cost.mjs | Z. 333 (JSON `command`, instrument) | 520 | aus m10-flock-timeout-Doku uebernommen: instrument-Lauf ~400 s + 120 s |
| scripts/m10-ground-cost.mjs | Z. 472 (JSON `command`, Normal-Lauf) | 300 | Normal-Lauf ~180 s + 120 s |
| scripts/m10-ground-cost.mjs | Z. 10–14 (Kommentar) | 300/520 | Muster mit `-w` + Timeout-Meldung, kopierfest (wortl. `flock -w`) |
| scripts/m10-fx-overdraw.mjs | Z. 4–7 (Startanleitung) | 300 | ~180 s + 120 s |
| scripts/m10-ui-cost.mjs | Z. 15–18 (Beispiel) | 300 | timeout 180 + 120 s Puffer, `\|\| { echo …; exit $?; }` |
| scripts/m10-heap-margin.mjs | Z. 7–12 (Kommentar) | 300 | fullrun: 30-Min-Sim @ timeScale 30 ~ 60–120 s real + Build/Boot ~120 s (Korroboriert durch chest-timing N=240 bei gleicher Sim-Laenge) |

heap-margin: Das **Heap-Szenario laeuft absichtlich OHNE Lock** (lastunabhaengig) — die
„OHNE flock“-Begründung bleibt (Z. 7); nur die fullrun-FPS-Anleitung bekam `flock -w 300`.

Keine Messlogik, kein Ausgabeformat und keine Messwerte geaendert — nur `command:`-Strings,
Kommentare und Anleitungen. Kein Spielverhalten beruehrt.

## Abnahme-Belege

### 1) Vorher/Nachher-Grep

Vorher auf main@9055126 (18 Treffer gesamt, davon 7 in den 4 Area-Dateien):

```
$ git grep -n 'flock' 9055126 -- scripts/ | grep -v 'flock -w' | grep -E 'ground-cost|fx-overdraw|ui-cost|heap-margin'
9055126:scripts/m10-fx-overdraw.mjs:4:// Start IMMER unter `flock /home/ai/games/.lf-perf.lock`.
9055126:scripts/m10-ground-cost.mjs:10:// Laeuft unter flock.
9055126:scripts/m10-ground-cost.mjs:328:      command: "flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument",
9055126:scripts/m10-ground-cost.mjs:467:  command: "flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs",
9055126:scripts/m10-heap-margin.mjs:7:// Heap-Szenario: OHNE flock (lastunabhaengig). Nur echte fullrun-FPS-Messungen
9055126:scripts/m10-heap-margin.mjs:8:// laufen unter flock /home/ai/games/.lf-perf.lock.
9055126:scripts/m10-ui-cost.mjs:15://   flock /home/ai/games/.lf-perf.lock timeout 180 node scripts/m10-ui-cost.mjs \
```

Nachher (Worktree, nach den Aenderungen):

```
$ git grep -n 'flock' -- scripts/ | grep -v 'flock -w' | grep -E 'ground-cost|fx-overdraw|ui-cost|heap-margin'
scripts/m10-heap-margin.mjs:7:// Heap-Szenario: OHNE flock (lastunabhaengig, WHY: Heap-Messung ist lastunabhaengig).
```

→ In den 4 geaenderten Dateien bleibt **0 unkommentierte Treffer**; nur die gewollte
„OHNE flock“-Begründung (heap-margin, Heap-Szenario) bleibt. Alle übrigen Treffer im
Skript-Verzeichnis sind „kein Lock nötig“-Begründungen (m10-chest-arrow, m10-death-frames,
m10-ember-readability, m10-evo-signature-shots, m10-feedback-probe, m10-hazard-fairness,
m10-results-attribution/-layout-check/-overlap, m10-separation-budget, m10-weapons-stability)
und der qa-reaccept-perf-Split-Line-False-Positive (`"flock",` in Z. 36, `-w 420` als
argv[1] direkt daneben) — absichtlich nicht geaendert.

Alle 10 flock-Spawns/-Anleitungen in den 4 Dateien nutzen jetzt `-w`:

```
$ grep -n 'flock' scripts/m10-ground-cost.mjs scripts/m10-fx-overdraw.mjs scripts/m10-ui-cost.mjs scripts/m10-heap-margin.mjs | grep -v 'OHNE flock'
scripts/m10-ground-cost.mjs:10:// Laeuft unter `flock -w` (Wartezeit-Limit = erwartete Laufzeit + 120 s Puffer):
scripts/m10-ground-cost.mjs:11://   flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs
scripts/m10-ground-cost.mjs:12://   flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument
scripts/m10-ground-cost.mjs:333:      command: "flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument",
scripts/m10-ground-cost.mjs:472:      command: "flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs",
scripts/m10-fx-overdraw.mjs:4:// Start IMMER unter `flock -w 300 /home/ai/games/.lf-perf.lock`
scripts/m10-ui-cost.mjs:15://   flock -w 300 /home/ai/games/.lf-perf.lock timeout 180 node scripts/m10-ui-cost.mjs \
scripts/m10-heap-margin.mjs:8:// Nur echte fullrun-FPS-Messungen laufen unter `flock -w`:
scripts/m10-heap-margin.mjs:9://   flock -w 300 /home/ai/games/.lf-perf.lock npm run fullrun
```

### 2) Negativ-Test am echten Spawn (ground-cost)

Beleg-Log: `shots/m10-flock-sweep-2-negativtest.log` (20:07:29Z, Kopie von
`~/tmp/m10-flock-sweep-2/K-negativtest.log`). Ablauf: Sperre testweise halten
(`flock -n /home/ai/games/.lf-perf.lock sleep 5 &`), dann der echte Spawn (Z. 333) mit `-w 1`:

```
$ flock -w 1 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument
instrument rc=1                                    ← bricht nach ~1 s ab, keine Messung gestartet
$ flock -w 1 ... node scripts/m10-ground-cost.mjs --instrument || { echo "m10-ground-cost: Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen"; exit 1; }
m10-ground-cost: Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen
wrapper rc=1                                       ← Meldungsmuster + Exitcode weiterreichen
$ flock -w 1 /home/ai/games/.lf-perf.lock node --check scripts/m10-ground-cost.mjs
check rc=1 nach 1.00s                              ← -w bricht exakt nach 1 s ab
```

Kein Voll-Lauf der Mess-Skripte noetig: bei belegter Sperre startet flock das Kommando
gar nicht erst (rc=1 von flock selbst, Node laeuft nicht).

### 3) `node --check` gruen fuer alle 4 geaenderten .mjs

```
$ for f in scripts/m10-ground-cost.mjs scripts/m10-fx-overdraw.mjs scripts/m10-ui-cost.mjs scripts/m10-heap-margin.mjs; do node --check "$f" && echo "CHECK-OK $f"; done
CHECK-OK scripts/m10-ground-cost.mjs
CHECK-OK scripts/m10-fx-overdraw.mjs
CHECK-OK scripts/m10-ui-cost.mjs
CHECK-OK scripts/m10-heap-margin.mjs
```

### 4) Scope

`git diff --stat` → nur die 4 Skripte + diese Doku + shots/m10-flock-sweep-2-negativtest.log.
Keine Änderungen an src/**, realtime-run.mjs, m10-realtime-probe.mjs oder fremden Skripten.

## Offene Punkte

- m10-flock-timeout ist weiterhin **nicht in main gemerged** — der Merge-Job sollte beide
  Branches mitnehmen; die 3 doppelt geaenderten Dateien sind byte-identisch und lösen
  im Merge automatisch auf.
