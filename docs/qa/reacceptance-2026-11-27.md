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
