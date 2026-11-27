# Lane m10-flock-timeout — flock-Sperren mit `-w` absichern

Datum: 2026-11-27 · Branch: `m10-flock-timeout` · Worktree: `/home/ai/games/lf-lanes/m10-flock-timeout`

## Anlass

Supervisor-Entscheidung 18:38 (m10-dpr-budget-cap): ein Messlauf hing still ≥ 13 min an
`flock /home/ai/games/.lf-perf.lock` **ohne** Wartezeit-Limit. `flock <lock> timeout ...` wartet unendlich —
kein Fail, kein Loop. Lehre 18:37: „Gemeinsame Locks immer mit `flock -w <sek>` absichern“.

## Umfang (nur Lock-Wrapper, keine Messlogik)

| Datei | Stelle | vorher | nachher |
|---|---|---|---|
| `scripts/m10-ground-cost.mjs` | Z. 333 (JSON `command`, instrument) | `flock /home/ai/games/.lf-perf.lock node ...` | `flock -w 520 /home/ai/games/.lf-perf.lock node ...` (Lauf ~400 s + 120 s) |
| `scripts/m10-ground-cost.mjs` | Z. 472 (JSON `command`, Normal-Lauf) | `flock /home/ai/games/.lf-perf.lock node ...` | `flock -w 300 /home/ai/games/.lf-perf.lock node ...` (Lauf ~180 s + 120 s) |
| `scripts/m10-ground-cost.mjs` | Z. 10–16 (Kommentar) | „Laeuft unter flock.“ | Muster mit `-w 300/520` + Timeout-Meldung |
| `scripts/m10-fx-overdraw.mjs` | Z. 4–7 (Startanleitung) | `flock /home/ai/games/.lf-perf.lock` | `flock -w 300 /home/ai/games/.lf-perf.lock` (Lauf ~180 s + 120 s) + Meldungsmuster |
| `scripts/m10-ui-cost.mjs` | Z. 15–17 (Beispiel) | `flock /home/ai/games/.lf-perf.lock timeout 180 ...` | `flock -w 300 ... timeout 180 ... \|\| { echo "...Sperre ... belegt — spaeter erneut versuchen"; exit $?; }` |

**Timeout-Muster** (bei rc != 0): Skriptname + `Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen`
ausgeben und Exitcode weiterreichen. Kein stiller Abbruch, kein unbegrenztes Warten.

Nicht angefasst (Disponent-Ausnahme, laut Briefing): `scripts/m10-dpr-budget.mjs` und `scripts/realtime-run.mjs`
(enthaltens selbst kein flock); keine Änderung an Messlogik, Ausgabeformat oder Messwerten.

## Abnahme-Belege

### (a) Grep-Beleg: alle flock-Spawns in den 3 Dateien nutzen `-w`

```
$ grep -n 'flock /home' scripts/m10-ground-cost.mjs scripts/m10-fx-overdraw.mjs scripts/m10-ui-cost.mjs
(kein Treffer, rc=1)  ← 0 bare-flock-Zeilen

$ grep -n 'flock -w' scripts/m10-ground-cost.mjs scripts/m10-fx-overdraw.mjs scripts/m10-ui-cost.mjs
scripts/m10-ground-cost.mjs:11://   flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs
scripts/m10-ground-cost.mjs:12://   flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument
scripts/m10-ground-cost.mjs:333:      command: "flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument",
scripts/m10-ground-cost.mjs:472:  command: "flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs",
scripts/m10-fx-overdraw.mjs:4:// Start IMMER unter `flock -w 300 /home/ai/games/.lf-perf.lock`
scripts/m10-ui-cost.mjs:15://   flock -w 300 /home/ai/games/.lf-perf.lock timeout 180 node scripts/m10-ui-cost.mjs \
```

### (b) Negativ-Test: Abbruch nach w Sek statt Stillstand

Beleg-Log: `~/tmp/m10-flock-timeout/K3-negativtest.log` (18:53:26Z). Ablauf:

```
$ flock -n /home/ai/games/.lf-perf.lock sleep 5 &     # Sperre testweise halten
$ flock -w 1 /home/ai/games/.lf-perf.lock node --check scripts/m10-ground-cost.mjs
rc=1 nach 1.00s
m10-ground-cost: Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen
```

→ bricht nach ~1 s (=`-w 1`) mit rc=1 ab, Meldung erscheint, Exitcode wird weitergereicht.

**Live-Beleg des ursprünglichen Bugs (18:56Z):** während eine parallele Lane eine Messung hielt,
hing ein bare `flock /home/ai/games/.lf-perf.lock ...` im selben Testlauf **>120 s** (Shell-Timeout,
rc=143 = hart gekillt) — genau der stille Hang aus dem Supervisor-Befund. Im selben Zustand brach
`flock -w 1 ...` nach **1,00 s** mit rc=1 ab. Positive Kontrolle mit freier Sperre (gleiche fs,
`/home/ai/games/.lf-perf-posctl.lock`): rc=0 nach **0,02 s** — `-w` kostet im Happy-Path nichts.

### (c) `node --check` rc=0 für alle drei Dateien

```
$ for f in scripts/m10-ground-cost.mjs scripts/m10-fx-overdraw.mjs scripts/m10-ui-cost.mjs; do node --check $f && echo "CHECK-OK $f"; done
CHECK-OK scripts/m10-ground-cost.mjs
CHECK-OK scripts/m10-fx-overdraw.mjs
CHECK-OK scripts/m10-ui-cost.mjs
```

Sobald die Sperre frei war: `npm run build` rc=0 (built in 499ms), `npm test` rc=0 (Vitest, 2,21 s).

### (d) git diff ausschließlich Lock-Wrapper/Meldung/Kommentare

`git diff HEAD~2 --stat` → nur die drei Skripte + diese Doku; beide Commits
(6226510 K1, 462802a K2) ändern ausschließlich `command:`-Strings, Kommentare und Meldungsmuster —
keine Messlogik, kein Ausgabeformat (abgesehen vom dokumentierten `command`-String selbst, der jetzt
das tatsächlich empfohlene `-w`-Kommando zeigt), keine Messwerte.

## Commits

- `6226510` M10-m10-flock-timeout: #4538 K1 — ground-cost.mjs (`-w 520` instrument / `-w 300` normal) + Meldungsmuster
- `462802a` M10-m10-flock-timeout: #4539 K2 — fx-overdraw.mjs + ui-cost.mjs (`-w 300`) + Meldungsmuster
- K3: Negativ-Test + diese Doku + `.lane-done`

## Offene Punkte / Empfehlung fürs Team

- **Lehre konkretisiert:** der Live-Beleg zeigt, dass bare-flock-Hangs auch beim Testen selbst passieren —
  künftige Startanleitungen/Commits immer mit `flock -w <N>`; N = erwartete Laufzeit + 120 s.
- `package.json`-Scripts (z. B. `npm run perf`, `npm run fullrun`) nutzen weiterhin bare flock in der Doku
  anderer Lanes — dafür fehlte der Datei-Claim (Disponent); Folge-Karte empfohlen.
- Andere `scripts/m10-*.mjs` mit flock-Muster (falls vorhanden) analog umstellen — Grep über das Repo ist
  Folge-Aufgabe, nicht Teil dieses Bereichs.
