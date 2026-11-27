# Nachabnahme nach dem Performance-Fix — 2026-11-27

Unabhängige Re-Abnahme auf `main` @ **`78cca7e`** (Merge-Nachlauf m10-ground-cost,
2026-11-27 12:28:03 UTC), headless Chromium auf diesem Rechner.
Lange Läufe serialisiert über `flock /home/ai/games/.lf-perf.lock`.
Jede Karte hat einen eigenen Commit; dieses Dokument wächst mit den Karten.

> Status: **in Arbeit** — Urteil folgt am Ende (Abschnitt „Urteil").

## fa2-00 — Ausgangslage und Geltungsbereich

- `main` enthält seit der Endabnahme (Basis `2204ddc`) zusätzlich die Lanes
  `m10-separation-crowd` (Separation-Härtung + SpatialHash-Nachbar-Query),
  `m10-perf-rootcause` (nur A/B-Messung/Doku), `m10-ground-cost` (nur Messung/Doku,
  Chunk-Composite verworfen) sowie `m10-chaos-qa` (Lesbarkeits-Matrix), `m10-fx-evolution`,
  `m10-boss-onscreen`, `m10-heroes-pass`, `m10-palette-guard`, `m10-weapons-stable`,
  `m10-death-fx`, `m10-evolution-hint`, `m10-heap-acceptance-sync`.
- **Nicht in main:** die Lanes `m10-endgame-fps` (Frame-Budget-Regler),
  `m10-perf-recovery` (Fix-Karte #2678 blocked) und `m10-ui-text-cost`;
  d. h. der in der Endabnahme benannte Code-Fix für den Endgame-FPS-Pfad ist
  **nicht** Bestandteil des geprüften main. Geprüft wird der tatsächliche Ist-Stand.

## fa2-01 — Schnelle Checks (Build, Tests, Inhalte, verify:final)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-27T13:15:29Z | `npm run build` (`tsc --noEmit && vite build --base ./`) | rc=0, `✓ built in 862ms`, Chunk-Warnung 1.854 kB (bekannt) | OK |
| 2026-11-27T13:15:30Z | `npm test` (`vitest run`) | **355 Tests in 33 Dateien, 0 fail**, 1,16 s | OK (+16,3 % gegen 305 der Endabnahme; neue Lanes) |
| 2026-11-27T13:15:32Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | OK |
| 2026-11-27T13:15:47–13:15:59Z | `node scripts/verify-final.mjs` | **7/7 PASS**, 0 JS-Fehler: Master-Mute gesetzt/blockt/persistiert, Aggregation 110 aus / 129 an, Ergebnis-Screen `dawn` mit 12 Waffen | OK |

Rohlog: `/tmp/lf-fa2/fa2-01.log`, `/tmp/lf-fa2/fa2-01-final.log`,
`shots/final-verify.json` (vom Skript neu geschrieben).

**Urteil fa2-01: PASS.**

## fa2-02 — Performance Burst + Minute 25 (640×360 und 780×360@3, je 3 Läufe, flock)

Alle 6 Läufe serialisiert unter `flock /home/ai/games/.lf-perf.lock`,
`scripts/perf.mjs --viewport <WxH> --dpr <n>`, 500 Gegner im Burst, 300 Gegner + 6
Evolutionen in Minute 25, je 10 s. Host-loadavg beim Start ist mit notiert.

| View | Lauf | loadavg Start | Burst FPS (500 Gegner) | Burst worst | Minute-25 FPS (300) | M25 worst | JS-Fehler |
|---|---|---|---|---|---|---|---|
| 640×360 dpr1 | 1 | 12,98 | **59,9** | 33,4 ms | 50,9 | 33,5 ms | 0 |
| 640×360 dpr1 | 2 | 14,77 | **60,1** | 16,8 ms | 51,4 | 33,4 ms | 0 |
| 640×360 dpr1 | 3 | 13,34 | **60,1** | 16,8 ms | **54,0** | 33,5 ms | 0 |
| **640 min** | | | **59,9 / Ziel 55 → PASS** | | **50,9 / Ziel 50 → PASS (knapp)** | | 0 |
| 780×360 dpr3 | 1 | 15,87 | 54,7 | 33,4 ms | 45,7 | 33,4 ms | 0 |
| 780×360 dpr3 | 2 | 14,61 | 55,2 | 33,4 ms | 42,1 | 33,5 ms | 0 |
| 780×360 dpr3 | 3 | 14,84 | **56,1** | 33,4 ms | 46,4 | 33,4 ms | 0 |
| **780 min** | | | **54,7 / Ziel 55 → FAIL (2/3 PASS, −0,5 %)** | | **42,1 / Ziel 50 → FAIL** | | 0 |

Roh-JSON: `shots/qa-reaccept-640-r{1,2,3}.json`, `shots/qa-reaccept-780-r{1,2,3}.json`.
Screenshots: `shots/perf-500.png`, `shots/perf-minute25.png` (neu geschrieben).

**Befund:** Der 640×360-Burst ist von 46,3 (Endabnahme) auf min **59,9 FPS** gestiegen
→ Punkt **grün**. Minute 25 bei 640 liegt mit min **50,9** knapp über dem 50er-Ziel.
Der 780×360-Burst ist grenzwertig (min 54,7, 2/3 ≥ 55), Minute 25 bei 780 bleibt mit
42,1–46,4 FPS klar unter 50 → **rot**. Keine JS-Fehler in allen 6 Läufen.

**Urteil fa2-02: TEILWEISE PASS** (Burst 640 PASS, M25 640 knapp PASS, Burst 780
grenzwertig FAIL, M25 780 FAIL).

## fa2-03 — 30-min-autoPlay fullrun (30×), Boss-/Truhen-Timing, Sieg, Heap

`flock /home/ai/games/.lf-perf.lock node scripts/fullrun.mjs --viewport <WxH> --dpr <n>`,
je View **einmal** (kein Wiederholungslauf). Host-loadavg bei Start: 7,46 (640×360 dpr1)
bzw. 15,79 (780×360 dpr3).

| View | Sim-Dauer | Bosse 300/600/900/1200/1500/1800 s | Truhen | Sieg | Kills / Level | Elites | Heap Δ (Min 1→29) | fpsMin (29:20–Sieg, 1×) | JS-Fehler |
|---|---|---|---|---|---|---|---|---|---|
| 640×360 dpr1 | 30,2 min | **6/6** (`defeated 6`, `flags` alle true) | **6** | `dawn` | 4.134 / 36 | 156 | 30,9 → 33,6 MB = **+8,7 % (≤15 %, PASS)** | **35,7 (<55 → FAIL)** | 0 |
| 780×360 dpr3 | 30,2 min | **6/6 exakt** (300/600/900/1200/1500/1800 s) | **6** | `dawn` | 5.074 / 38 | 176 | 31,6 → 36,4 MB = **+15,2 % (>15 %, knapp FAIL)** | **34,8 (<55 → FAIL)** | 0 |

Rohlog mit beiden Zusammenfassungen: `/tmp/lf-fa2/fa2-03-fullrun.log`.
Vollständiges Ergebnis-JSON des letzten Laufs (780): `shots/m2…` → `shots/m3-fullrun.json`
(inkl. aller 6 Boss-Spawnzeiten, `phasesSeen 5:1/5:2/5:3`, 6 Truhen, `dawn`).
Minuten-Screenshots: `shots/m3-fullrun-minute25.png`, `shots/m3-fullrun-results.png`.

**Befund:** Inhaltlich alles grün (alle 5-Minuten-Bosse mit Truhe, Endboss-Phasen,
Sieg nach 30:00, 0 JS-Fehler). Performance im Endgame-Fenster bleibt **rot**:
fpsMin 35,7 / 34,8 FPS gegen das 55-Ziel. Heap ist bei 640 grün (+8,7 %), bei 780
marginal über dem Ziel (+15,2 %, 0,2 pp).

**Urteil fa2-03: Inhalt PASS, Performance FAIL (Endgame-Fenster), Heap 1× PASS / 1× knapp FAIL.**
