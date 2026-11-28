# Lane m10-fps-pacing-timestep — Fix-Job TimeStep/rAF-Skip (vorgehängt an m10-janky-remeasure)

**Job (Briefing):** Wenn m10-janky-remeasure auf der 60-Hz-APK (MainActivity-Refresh-60-Hz-Fix) MIT
m10-fps-cap-stackfix-Merge **immer noch janky >= 10 %** meldet, ist die Rest-Ursache-Klasse
„TimeStep/rAF-Skip-Logik" zu fixen. **K1 (bedingt):** bei janky < 10 % → Doku-only abschließen,
KEINE Code-Änderung. **K2:** Hebel liegt in `src/logic/fps-cap.ts` oder `src/main.ts`
(Merge-Area von merge-m10-mobile-fps-cap) → NICHT anfassen, Bedarfsmeldung statt Änderung.

## K1: Urteil aus docs/lanes/m10-janky-remeasure.md — Trigger NICHT erfüllt

Quelle: `docs/lanes/m10-janky-remeasure.md` (K2/K3 10-min-Läufe, Redmi Pad Pro, Adreno 710,
Panel 60 Hz, Build `0ce7164a` mit stackfix; Belege `~/games/.evidence/m10-janky-remeasure/k{2-cap60,k3-max}-device.json`).

| Messung | K2 Cap 60 | K3 MAX |
|---|---|---|
| gfxinfo janky | **0 %** (0/29 058 Frames) | **0 %** (0/32 114 Frames) |
| FPS avg | 50,1 | 50,0 |
| rAF p95 / p99 | 33,4 / 50,0 ms | 33,4 / 33,4 ms |

- **Fix-Trigger des Briefings („immer noch janky >= 10 %") ist NICHT erfüllt:** janky = 0 % in
  BEIDEN Läufen, weit unter der 10-%-Schwelle. Das janky-Problem, das den Job auslöste
  (13,44 %/13,90 % in m10-v10-device-acceptance K3), ist durch die vorgelagerten Fixes
  (60-Hz-Panel-Refresh + fps-cap-stackfix) behoben — 0 Loop-Tötungen (vorher 9 je Lauf), 0 JS-Fehler.
- Der REMAINING Gate-FAIL der Remeasure-Lane ist **nicht** die janky-Klasse: FPS avg 50,1 < 60 und
  rAF-p95 33,4 ms > 16 ms = 2-Vsync-Pacing (bimodal p50 16,7 / p95 33,4), Present/Frame-Arbeit,
  nicht Sim-Last (Tail auch im Leerlauf-Fenster p95 33,33 ms, nicht Gegner-last-skaliert).

**K1-Urteil: janky < 10 % → Doku-only, keine Code-Änderung.**

## K2: Hebel-Lokalisierung (Lesezugriff, kein Eingriff)

- `src/scenes/Run.ts` (eigene Datei) hat **keinen eigenen Pacing-/Akkumulator-Hebel**:
  `update(time, delta)` ist ein dünner Sim-Schritt, einzige Zeit-Behandlung ist der bestehende
  Delta-Deckel `Math.min(0.05, delta / 1000)` (Run.ts:529). Frame-Pacing passiert vor dem Sim-Schritt
  in Phasers TimeStep — eine Run.ts-Änderung kann die Present-Zeiten (33,4-ms-2-Vsync-Frames) nicht
  verschieben.
- Die Skip-/Pacing-Logik liegt in **Phasers TimeStep, verdrahtet über `src/main.ts`** (fps.limit am
  Boot, `applyFpsLimit` + `sleep()/wake()`-Rebind, main.ts ~Z.163) und **`src/logic/fps-cap.ts`**
  (`resolveFpsLimit`, `applyFpsLimit`, RAF-Step-Binding-Kommentar Z.111–118) — genau die
  **Merge-Area von merge-m10-mobile-fps-cap / m10-fps-cap-stackfix** (gemergt als `aa8739f0`,
  `1d52d406`). Briefing-K2 verbietet den Eingriff: **NICHT angefasst.**

**K2-Urteil: Hebel liegt in fremder Merge-Area (src/main.ts, src/logic/fps-cap.ts) → Bedarfsmeldung statt Änderung.**

## Ergebnis

- **KEINE Code-Änderung in dieser Lane** (K1-Trigger nicht erfüllt UND K2-Hebel fremd-claimed).
- Bedarfsmeldung ergänzt in `/home/ai/games/.dispatch/requests.md` (2026-11-28, m10-fps-pacing-timestep):
  der offene Pacing-Hebel (fpsAvg 50 → 57–60, rAF-p95 33,4 → ~16,8 ms) braucht eine Lane mit Claim auf
  `src/main.ts` / `src/logic/fps-cap.ts`; konkret: Late-Frame-Toleranz im TimeStep (dt > 17 ms → Sim
  entlasten statt 2-Vsync-Fall) laut Hebelliste Punkt 1 der Remeasure-Lane. Sekundär-Hebel (ADD-/FX-Cap
  medium-Tier, `src/data`/quality) wäre Hebel 2, falls Hebel 1 nicht reicht.
- **Endabnahme-Lauf bleibt gesperrt** (Empfehlung der Remeasure-Lane K4 übernommen): Tor-Metrik muss
  FPS avg + rAF-p95 neben janky führen, da gfxinfo-janky bei 2-Vsync-Pacing 0 % meldet und nicht
  unterscheidend ist.
- Regressionstest `tests/fps-pacing-timestep.test.ts` (K4) **entfällt mit Begründung**: kein Fix →
  kein neues Verhalten abzusichern; der Cap-60-Vertrag ist durch die bestehenden fps-cap-Tests
  (`tests/*fps-cap*`) unangetastet abgedeckt.

## Prüfungen

- `npx tsc --noEmit` rc=0; `npm test` grün (Stand ohne Code-Änderung, nur Doku).
- `git status --ignored` vor `.lane-done`: keine Reste (keine Mess-Skripte, keine Temp-Dateien —
  die Lane brauchte keinen Lauf, alle Messwerte stammen aus der Remeasure-Lane).

## Karte

- #13619 (m10-fps-pacing-timestep): K1+K2 Urteil + Lokalisierung, Abschluss Doku-only.
