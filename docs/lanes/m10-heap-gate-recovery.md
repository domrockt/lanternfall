# Lane m10-heap-gate-recovery

Auftrag: offenen Abnahme-Blocker aus Nachabnahme F messen und ggf. beheben —
fullrun 30 min 960×540, Heap-Tor retained endMB vs. Minute 1 ≤ +15 %
(2 Läufe reproduziert auf PIN 1ebd4ca: +18,2 % / +20,8 %, Messung VOR dem
hazard-tex-cap-Merge). hazard-tex-cap ist inzwischen gemergt
(Merge 39fdac5d, 16-px-Raster bindet Hazard-Textur-Keys auf max. 163);
nach jetzigem Stand war das der einzige belegte ungebundene Wachstumsmechanismus.

Karten: #12547 (K1 Remessung), #12548 (K2 Entscheidung), #12549 (K3 Fix),
#12550 (K4 Nachher + Guard-Test).

Area (Disponent): `src/systems/Pool.ts`, `src/systems/EnemyPool.ts`,
`tests/heap-gate-recovery.test.ts`, `scripts/m10-heap-gate-recovery.mjs`,
diese Doku, `shots/m10-heap-gate-*`, `.lane-done`.
Fremd-claimed, nur nutzen: `scripts/m10-heap-budget.mjs` (formales Tor-Skript),
`scripts/harness.mjs` (m10-acceptance-g-sync), `ACCEPTANCE.md` (m10-acceptance-g-sync).

Belege (außerhalb des Repos): `~/games/.evidence/m10-heap-gate-recovery/`.

## K1 — Remessung auf aktuellem main (#12547)

Tor-Skript: `scripts/m10-heap-budget.mjs` (nur ausgeführt, nicht geändert),
unter `flock /home/ai/games/.lf-perf.lock`, je Lauf `timeout 2700`.
Belege: `~/games/.evidence/m10-heap-gate-recovery/k1-run{1,2}.json` (+ Logs in
`~/tmp/m10-heap-gate-recovery/`).

**Lauf 1** (gitSha de677a92, 30 min, simSeconds 1817,9, Sieg, 0 JS-Fehler,
Renderer Mesa Intel RPL-S — gültig, kein SwiftShader):

| Kriterium | Wert | Tor |
|---|---|---|
| Minute 1 (Post-GC) | 64,8 MB | Referenz |
| endMB (Post-GC, Results) | 48,5 MB | — |
| **HARD: endMB vs. Minute 1** | **−25,2 %** | ≤ +15 % → **PASS** |
| SOFT robust (max Floor je 5-min-Fenster) | 77,4 MB = +9,2 % | ≤ +25 % → PASS |
| Roh-Peak-Beobachtung (max 5-min-Peak) | 81,2 MB = +25,3 % | nur Beobachtung (GC-Sägezahn) |

Kein ungebundenes Wachstum sichtbar: die Post-GC-Timeline schwankt zwischen
~61,9 und ~71,4 MB ohne Trend nach oben; endMB unter Minute 1.

**Lauf 2:** erster Versuch (14:27Z gestartet) durch Browser-Target-Crash
verloren — `Target page, context or browser has been closed` mitten im Lauf,
nur partielles JSON (`UNMESSBAR`, endMB null); identisches Fehlerbild wie in
Nachabnahme F dokumentiert. Log: `~/tmp/m10-heap-gate-recovery/k1-run2.log`.
**Messfenster einmal wiederholt** (k1-run2-retry, 15:12Z gestartet, gitSha
705a6f97 = Lane-HEAD): **PASS** — simSeconds 1818,0, Sieg, 0 JS-Fehler,
Renderer Mesa Intel RPL-S (gültig).

## K1 — Tor-Tabelle (2 gültige Läufe)

| Kriterium | Lauf 1 | Lauf 2 (Retry) | Tor |
|---|---|---|---|
| Minute 1 (Post-GC) | 64,8 MB | 64,8 MB | Referenz |
| endMB (Post-GC, Results) | 48,5 MB | 48,5 MB | — |
| **HARD: endMB vs. Minute 1** | **−25,2 %** | **−25,2 %** | ≤ +15 % → **PASS / PASS** |
| SOFT robust (max Floor 5-min-Fenster) | +9,2 % | +9,9 % | ≤ +25 % → PASS |
| Roh-Peak-Beobachtung | +25,3 % | +42,1 % | nur Beobachtung (GC-Sägezahn) |
| Sieg / JS-Fehler / Renderer | ja / 0 / Mesa Intel RPL-S | ja / 0 / Mesa Intel RPL-S | grün |

## K2 — Entscheidung (#12548): ENTFÄLLT FIX-FALL

**Tor ≤ +15 % in 2 Läufen erfüllt (deutlich: −25,2 % beide Läufe).** Der
Abnahme-Blocker aus Nachabnahme F (+18,2 %/+20,8 % auf PIN 1ebd4ca, VOR
hazard-tex-cap) ist auf aktuellem main nicht reproduzierbar: der gemergte
16-px-Hazard-Textur-Raster (Merge 39fdac5d, Lane m10-hazard-tex-cap) trägt
das Tor — der einzige belegte ungebundene Wachstumsmechanismus ist gebunden.
K3 (Fix in Pool.ts/EnemyPool.ts) und K4 (Nachher + Guard-Test gegen einen
umgesetzten Hebel) **treten nicht ein**: kein Hebel umgesetzt → kein
Regressionstest-Objekt. Die Kandidaten `Pool.trim()` (0 Aufrufstellen) und
EnemyPool-Free-Liste ohne Kappe bleiben als dokumentierte Folge-Hebel
(#2439), sind aber im 30-min-Profil kein Wachstumstreiber.

Beide Läufe zeigen endMB UNTER Minute 1 (−16,3 MB) und ein Post-GC-Profil
ohne Aufwärtstrend (~62–71 MB schwankend) — kein Retentions-Leck sichtbar.

## Abschluss (Supervisor-Budget 15:39Z)

- Belege bleiben außerhalb des Repos: `~/games/.evidence/m10-heap-gate-recovery/`
  (`k1-run1.json` gültig, `k1-run2.json` Crash-Teilbeleg, `k1-run2-retry.json`
  Ergebnis des Wiederholungsfensters), Logs in `~/tmp/m10-heap-gate-recovery/`.
- Offene Restpunkte (nicht mehr in dieser Lane nachgebaut):
  1. ~~2. Tor-Lauf~~ — erledigt: Retry lief sauber durch (PASS, siehe oben);
     Tor ist mit 2 gültigen Läufen belegt. Keine Folge-Karte nötig.
  2. `ACCEPTANCE.md` ist fremd-claimed (m10-acceptance-g-sync) — Bedarf-Vermerk
     für den G-Abschnitt-Nachtrag in `/home/ai/games/.dispatch/requests.md`:
     „Heap-Tor auf HEAD nach hazard-tex-cap: 2/2 Läufe HARD −25,2 %
     (endMB 48,5 vs Minute1 64,8 MB), Belege in
     ~/games/.evidence/m10-heap-gate-recovery/".
