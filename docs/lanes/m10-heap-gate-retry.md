# Lane m10-heap-gate-retry (M6, 2026-11-28)

Ziel: Tor-Skript-Instabilität fixen. Nachabnahme F: `scripts/m10-heap-budget.mjs`
crashete mittendrin („Browser-Target closed") → gate=UNMESSBAR, der verbindliche
Beleg musste über den fullrun laufen. Das FAST hard gate (retained ≤ +15 %) ist in
main und war 2/2 PASS — aber ein Tor, das per Zufall UNMESSBAR werfen kann, ist in
der Endabnahme ein Risiko. Retry-Muster existiert: `scripts/harness.mjs` `startServer`
(Port-Retry, B5, gemergt).

## K1 — Fehlerklassen des Gate-Laufs (Karte #13424)

### Befund: beide historischen Crashes sind dieselbe Klasse

| Beleg | fatal-Meldung | Abbruch bei | crashes[] | errors[] | gate.verdict |
|---|---|---|---|---|---|
| `~/games/.evidence/m10-acceptance-refresh-f/k4-heap-budget-partial.json` | `Error: page.waitForTimeout: Target page, context or browser has been closed` | simSeconds 881,4 (Minute ~15 von 30) | leer | leer | UNMESSBAR |
| `~/games/.evidence/m10-heap-gate-recovery/k1-run2.json` | `Error: page.evaluate: Target page, context or browser has been closed` | simSeconds 1168,4 (Minute ~19 von 30) | leer | leer | UNMESSBAR |

Interpretation:
- **Klasse „target-closed"**: der Chromium-Renderer (oder der ganze Browser) stirbt
  mitten im 30-min-Echtzeitlauf. Playwright wirft beim nächsten `page.*`-Aufruf
  `Target page, context or browser has been closed`. Das Skript fängt den Fehler
  (`try/catch`, Skript-Kommentar „Haertung K4 m10-heap-regression-fix"), schreibt
  partielles JSON mit `fatal`-String — das Tor bleibt aber UNMESSBAR, weil `endMB`
  bzw. Minute-1-Daten unvollständig sind.
- **Kein `crash`-Event**: Playwrights `page.on("crash")` bleibt leer (beide Belege),
  d. h. der Tod wird nicht als Renderer-Crash signalisiert, sondern erst beim
  nächsten CDP/evaluate-Aufruf sichtbar. Man kann sich also nicht aufs crash-Event
  verlassen — die Retry-Logik muss den **Fehler der Messaktion** klassifizieren,
  nicht ein Event abwarten.
- **Wann:** Abbruch nach 15–19 Sim-Minuten, also mitten im Lauf — nicht beim Start.
  Ein Retry kann daher nicht beim Start (Server/Browser-Start) ansetzen, sondern
  muss die **gesamte Messung** (Browser + Lauf + endMB) neu ansetzen; nur Teile
  (z. B. endMB) nach einem Target-Tod neu messen wäre kein valider Beleg mehr.

### Fehlerklassen-Tabelle (aus dem Code abgeleitet, scripts/m10-heap-budget.mjs + harness.mjs)

| Klasse | Erkennung (Message-Muster) | Auftrittsort | Zuständig | Status |
|---|---|---|---|---|
| target-closed | `Target page, context or browser has been closed`, `Target closed`, `Session closed` | `page.evaluate` / `page.waitForTimeout` / CDP (`heapGC`) mitten im Lauf | **diese Lane (K2)** — Browser-Neustart + Messung neu, max. 2 Retries | offen |
| port-conflict | Server-Bind-Fehler, Port belegt | `startServer` (harness.mjs) | harness.mjs Port-Retry (B5, gemergt, getestet in tests/harness-port-retry.test.ts) | gelöst |
| timeout | `Timeout ... exceeded` (waitForTimeout/goto/evaluate mit Timeout) | Lauf-Loop, `startRun` | **diese Lane (K2)** — gleiche Retry-Stelle, retryable | offen |
| cdp-detached | `CDP session ... detached` o. ä. | CDP-Heap-Messung (`heapGC`) | **diese Lane (K2)** — gleiche Retry-Stelle, retryable | offen |
| browser-close beim Aufräumen | Fehler in `browser.close()` nach FATAL | Endaufräumen | bereits gefangen (Kommentar „Haertung K4", catch + Log) | gelöst |
| andere (nicht retryable) | alles übrige | — | eindeutiges UNMESSBAR mit Ursachefeld (K2) | offen |

### Referenz-Retry-Pattern (harness.mjs, startServer, B5)

`startServer` versuch es bis zu `attempts`-mal (Default 3) und erkennt einen
sofort beendeten Spawn (Bind-Fehler) über ein `exit`-Flag, um den Poll früh
abzubrechen; bei Erfolg ist das Verhalten bitgleich. Für K2 übernommen wird das
**Prinzip** (begrenzte Versuche, klare Fehlermeldung nach dem letzten Versuch),
nicht der Port-Mechanismus: hier ist die Einheit der komplette Messversuch
(Browser-Neustart + Lauf), da nach Target-Tod kein valider Teilbeleg bleibt.

### Gate-Verhalten

An den Tor-Definitionen (`scripts/m10-heap-budget-gate.mjs`, getestet in
`tests/heap-budget.test.ts`) ändert diese Lane **nichts**. Das Skript schreibt bei
endgültigem Scheitern aller Versuche eindeutig `verdict: UNMESSBAR` plus
Ursachefeld (`gate.cause`), statt einen Halbsatz im Log zu hinterlassen.
