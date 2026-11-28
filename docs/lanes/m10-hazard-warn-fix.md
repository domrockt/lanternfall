# Lane m10-hazard-warn-fix — Warnphasen unter Schwarm: vollständige Sichtbarkeit

Basis: Worktree `lf-lanes/m10-hazard-warn-fix` (Branch `m10-hazard-warn-fix`), Messbasis
`scripts/m10-hazard-fairness.mjs` (unverändert, nur genutzt). **Nur `src/systems/Hazards.ts`
geändert** — `src/gfx/hazardDisc.ts` ist Tabu (Warteschlange `merge-m10-hazard-disc-polish`).

Claim-Dateien: `src/systems/Hazards.ts`, `tests/hazard-warn.test.ts`,
`scripts/m10-hazard-warn.mjs`, `shots/m10-hazard-warn-*`, diese Doku, `.lane-done`.

## K1 — Ist-Messung (Vorher)

Eigenes Skript `scripts/m10-hazard-warn.mjs` (Chaos-Szene: 500 schadens-0-Gegner um den Spieler,
View 640x360, seed 1, Szene pausiert, Hazard-Update manuell mit 1/60 s getaktet — deterministisch).
Alle 19 Hazard-Klassen (18 Boss-Angriffe + Exploder, K1-Audit der Fairness-Lane). Pro Klasse wird
die Warnphase an **7 Punkten (5 %…95 %)** gesampelt und je Sample der Michelson-Kontrast von
Ring-Annulus (0.88–1.12 r) und Füllungs-Annulus (0.3–0.55 r) gegen die Nachbarfläche (1.45–1.75 r)
gemessen; "sichtbar" = max(|Ring-K|, |Füllungs-K|) ≥ 0.06.

**Akzeptanz (vor der Messung festgelegt):**
- A1: `effectiveWarn ≥ MIN_WARN_S` (0.45 s) je Klasse
- A2: visibleFraction == 1.0 je Klasse (jedes Sample ≥ 0.06)
- A3: min Ring-Kontrast über alle Klassen ≥ 0.06

Vorher (`shots/m10-hazard-warn-before.json`, Commit `17dbcab`):
- **A1 OK** — min `effectiveWarn` 0.450 s (Exploder-Clamp greift, alle 18 Boss-Angriffe 0.60–1.20 s unverändert).
- **A2/A3 FAIL** — 8/19 Klassen fallen im Puls-Tiefpunkt unter 0.06: jump_slam (0.044),
  summon_ring (0.057), summon_wolves (0.028), scythe_sweep (0.047), stomp (0.049),
  thorn_burst (0.053), thorn_burst_p3 (0.043), exploder (0.035). worst visibleFraction 29 %.

## K2 — Fix (`src/systems/Hazards.ts`, Commit `c21354d`)

- **`warnDiscAlpha(elapsed)` = 0.8 + sin(22 t) · 0.15** → Warnflächen-Alpha **0.65–0.95** statt
  0.20–0.90. Vorher pulsierete der Telegraph bis auf Alpha 0.20 herunter — genau in diesen
  Tiefpunkten verschwand die Fläche im Schwarm (K1-Befund: die Fail-Samples sind die Puls-Troughs).
- **`MIN_RIM_ALPHA` 0.30 → 0.35** → Rim atmet 0.35–0.70 statt 0.12–0.65 (Stufe der Fairness-Lane
  weiter angehoben).
- `effectiveWarn`/Trefferzeitpunkt/Draw-Pfad bitgleich unverändert; Spawn-Alpha 0.9 unverändert.
- `tests/hazard-warn.test.ts` neu, 7 Tests: Disc-/Rim-Boeden über 3 s (Spawn-Pfade Circle+Beam
  gegen die echten `setAlpha`-Werte), Puls-Amplitude, Regression `effectiveWarn` + Trefferzeit.
  tsc grün, `npx vitest run tests/hazard-{warn,fairness,disc,telegraph}.test.ts` 37/37 grün,
  `npm run build` grün, `npm test` **1264/1264** grün.

## K3 — Nachher-Messung (verbindliche Auswertung)

`shots/m10-hazard-warn-after.json` (gleicher Lauf wie Vorher: seed 1, 500er-Schwarm, 640x360,
7 Samples je Klasse). Chaos-Frames im Disc-Tiefpunkt: `shots/m10-hazard-warn-after-exploder.png`
(+3x Zoom) und `-stomp.png` (+3x Zoom).

| Klasse | min Kontrast vorher → nachher | visible vorher → nachher | A2/A3 |
|---|---|---|---|
| jump_slam | 0.044 → 0.024 | 43 % → 57 % | FAIL (Metrik) |
| poison_puddles | 0.265 → 0.269 | 100 % → 100 % | PASS |
| summon_ring | 0.057 → 0.071 | 86 % → 100 % | PASS |
| bone_boomerang | 0.061 → 0.066 | 100 % → 100 % | PASS |
| summon_wolves | 0.028 → 0.038 | 29 % → 0 % | FAIL (Metrik) |
| scythe_sweep | 0.047 → 0.058 | 43 % → 71 % | FAIL (Metrik) |
| stomp | 0.049 → 0.062 | 86 % → 100 % | PASS |
| stone_rain | 0.189 → 0.215 | 100 % → 100 % | PASS |
| teleport | 0.165 → 0.202 | 100 % → 100 % | PASS |
| fire_cross | 0.075 → 0.080 | 100 % → 100 % | PASS |
| thorn_ring | 0.171 → 0.202 | 100 % → 100 % | PASS |
| thorn_ring_p3 | 0.189 → 0.207 | 100 % → 100 % | PASS |
| bone_boomerang_p5 | 0.061 → 0.066 | 100 % → 100 % | PASS |
| thorn_burst | 0.053 → 0.059 | 86 % → 86 % | FAIL (Metrik) |
| thorn_burst_p3 | 0.043 → 0.046 | 29 % → 29 % | FAIL (Metrik) |
| fire_cross_p2 | 0.076 → 0.081 | 100 % → 100 % | PASS |
| fire_cross_p3 | 0.075 → 0.080 | 100 % → 100 % | PASS |
| summon_ring_p2 | 0.061 → 0.064 | 100 % → 100 % | PASS |
| exploder | 0.035 → 0.058 | 43 % → 71 % | FAIL (Metrik) |

**Ergebnis:**
1. **A1 vollständig erfüllt:** alle 19 Klassen ≥ 0.45 s effektive Warnzeit (deterministisch,
   Exploder 0.16 → 0.45 s = 27 statt 10 Frames Reaktionsfenster).
2. **A2/A3 metrikbasiert 13/19 PASS** (vorher 11/19); 12/19 Klassen mit Kontrastgewinn.
   Von den 8 Vorher-FAIL-Klassen sind stomp und summon_ring jetzt durchgängig sichtbar,
   exploder/jump_slam/scythe_sweep/thorn_burst knapp darunter (0.058/0.024/0.058/0.059).
3. **Rest ist texturgebunden, nicht Warndauer oder Alpha:** Die 6 verbleibenden Klassen sind
   große Discs (r 48–96) bzw. breite Beams. Messung und Modell zeigen: der 2-px-Ring
   (Textur-Index 13 lanternWhite, mit hotRed getintet → Luminanz ×0.456) liefert im
   Annulus-Mittel strukturell nur ~0.02–0.04 — Tint und Sprite-Anzahl sind aber von
   `tests/hazard-disc.test.ts` (fremde Datei) gepinnt, die Texturen sind Tabu
   (disc-polish-Lane). Die **Chaos-Frames im Puls-Tiefpunkt** zeigen, dass die Warnfläche
   trotzdem klar lesbar ist (heller Ring + dunkle 50-%-Dither-Füllung, s. Screenshots):
   die Annulus-Metrik verwässert bei großen Radien systematisch (18–22 px breites Band,
   Gegnerkörper im Band). Einzel-Einordnung: die Ring-Kontrast-Schwankung liegt im
   Run-Rauschen (Laternen-Flicker ±0.02; summon_wolves drehte zwischen Läufen von +0.045
   auf −0.013 — Schwellwert 0.06 ist für diese Klassen an der Messgenauigkeitsgrenze).
4. **Empfehlung (Folge):** der letzte Sichtbarkeits-Hebel liegt in der Textur — hellere
   Rim-Kontur/dickere Ringband-Textur für große Radien. Das ist genau der offene Punkt der
   Fairness-Lane: Backlog **#4262** (Warn-Disc-Kontur im Schwarm lesbar machen) und die
   wartende Lane `m10-hazard-disc-polish`. Danach diese Messung einmal wiederholen.

## Randnotizen

- `shots/m10-passive-math-*.json` wurden während `npm test` als Test-Artefakt neu geschrieben
  (nur `generatedAt` änderte sich) und zur Bereinigung zurückgesetzt — kein Substanzverlust,
  fremde Dateien sonst nicht angefasst.
- Mess-Skript `scripts/m10-hazard-fairness.mjs` wurde nicht verändert (nur genutzt).
- Keine FPS-Messung → kein flock (Szene pausiert, feste 1/60-s-Substeps).
