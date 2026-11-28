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

Stand: Läufe gestartet. Ergebnis hier, sobald beide Läufe vorliegen.
