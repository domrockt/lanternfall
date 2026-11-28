# Lane m10-acceptance-refresh-f — formale Nachabnahme F (2026-11-28)

Auftrag: Nachabnahme F auf aktuellem main nach der FX-/Menue-/Android-Merge-Welle.
Nur Messen, **kein** src-/tests-Code. Briefing: Vorrat-Job, Karten K1–K4.

- Worktree: `/home/ai/games/lf-lanes/m10-acceptance-refresh-f` (Branch `m10-acceptance-refresh-f`)
- Basis: main @ `1ebd4cab` (2026-11-28T10:07:09Z, „merge-m10-fx-bakes-evo-r2: Lane-Karten …“)
- QA-Doku mit Tabellen + Urteilen: `docs/qa/acceptance-refresh-f-2026-11-28.md`
- Belege (JSON/PNG außerhalb git): `/home/ai/games/.evidence/m10-acceptance-refresh-f/`
- Lange Läufe (perf/fullrun): `flock /home/ai/games/.lf-perf.lock`
- Renderer-Pflicht: jeder FPS-Beleg nennt den WebGL-Renderer-String; SwiftShader-Belege ungültig.
  Erwartet: „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“.

## Karten (Board #10904–#10907)

| Karte | Inhalt | Status |
|---|---|---|
| #10904 | K1 Build rc + Testzahl + acceptance-count (Soll 30/6/6/6/6/2) | K1 erledigt |
| #10905 | K2 verify:final (7/7 PASS, 0 JS-Fehler) + verify:terrain/terrain-coverage (0 schwarze Fläche, 960/1280/1920) | erledigt |
| #10906 | K3 Burst + Minute-25 auf iGPU (780x360@3, 960x540), Renderer-String je Beleg | erledigt |
| #10907 | K4 fullrun-Guard (6/6 Bosse + Truhen, Heap-Tor) + ACCEPTANCE.md Ergänzung | erledigt (Heap-Tor FAIL dokumentiert) |

## Ergebnisse

### K1 (2026-11-28, 10:08–10:09Z, auf main @ `1ebd4cab`)

- `npm run build`: **rc=0**, `✓ built in 947ms` (bekannte phaser-Chunk-Warnung)
- `npm test`: **1957/1957 Tests in 179 Dateien**, 0 fail (5,80 s)
- `node scripts/acceptance-count.mjs`: **ok:true, 30/6/6/6/6/2** (Soll = Ist)

Urteil K1: **PASS**.

### K2 (2026-11-28, 10:11–10:14Z)

- `node scripts/verify-final.mjs`: **7/7 PASS**, rc=0, 0 JS-Fehler
- `node scripts/verify-terrain.mjs`: rc=0, **0 schwarze Fläche** bei 960/1280/1920
  (maxRegion 0/0 start/end je View), `rendererValid:true`, `jsErrors:[]`
- Terrain-Coverage ist Teil von `verify-terrain.mjs` (gleicher Lauf, Schwarz-Pixel-Guard)

Belege: `~/games/.evidence/m10-acceptance-refresh-f/2026-11-28T10-10-33-835Z-final-verify.json`
(+2 Screenshots), `k2-verify-terrain.json`.

Urteil K2: **PASS** (iGPU „Mesa Intel(R) Graphics (RPL-S)“ belegt, kein SwiftShader).

### K3 (2026-11-28, 10:15–10:17Z, unter `flock /home/ai/games/.lf-perf.lock`)

Ein Lauf je View, Messlogik = scripts/perf.mjs + Renderer-Pflichtfeld im selben JSON
(`~/tmp/m10-acceptance-refresh-f/perf-f.mjs`):

| View | Burst | Minute 25 | Renderer |
|---|---|---|---|
| 780x360@3 | **60,0 FPS** | **60,1 FPS** | RPL-S (swiftshader:false) |
| 960x540 | **60,1 FPS** | **60,1 FPS** | RPL-S (swiftshader:false) |

Belege: `~/games/.evidence/m10-acceptance-refresh-f/k3-perf-accf-780x360d3.json`,
`k3-perf-accf-960x540.json`.

Urteil K3: **PASS** (beide ≥ 55 FPS-Ziel, am 60-Cap; Minute-25-780 +18…+25 % gegen 27.11.-FAIL).

### K4 (2026-11-28, 10:18–10:38Z, fullrun unter `flock /home/ai/games/.lf-perf.lock`)

- `npm run fullrun -- --tag accf` und `--tag accf2` (Wiederholung 1): je **6/6 Bosse exakt
  300–1800 s, 6 Truhen, Sieg `dawn`, fpsMin 60,4/60,3, 0 JS-Fehler** — aber
  **Heap-Tor +18,2 % / +20,8 % > +15 %: FAIL (reproduziert)**. Formales Tor-Skript
  `m10-heap-budget.mjs` crashete mittendrin (10:23–10:38Z) → UNMESSBAR; fullrun-Beleg verbindlich.
  Hinweis (Audit): fullrun-JSON enthält keinen Renderer-String (Skript schreibt keins);
  iGPU via heap-budget/K3-Läufe auf demselben Host belegt.
- `ACCEPTANCE.md`: Abschnitt „Nachabnahme F (2026-11-28)“ ergänzt, E-Werte unverändert,
  Abweichungen ≥ 5 % markiert (Tests +18,2 %; Heap-Tor +13,9 % → +18,2/+20,8 %).

Urteil K4: **FAIL (nur Heap-Tor)**; Inhalt/FPS/Truhen/JS-Fehler grün.

## Audit

`acceptance-auditor` (2026-11-28, ses_dde42a5c): **PASS** — alle K-Zahlen gegen die
JSON-Belege gegengeprüft (inkl. md5-Vergleich Belegkopien vs. shots-Originale), Lane hat
keinen src-/tests-Code geändert, FAIL korrekt als Blocker geführt. 3 Restmängel
(Dok-Zeitpunkte, fehlender Renderer-String im fullrun-JSON, K3-Harness-Quirk
`minute25.passed:false` bei sachlich erfüllten Kriterien) sind in der QA-Doku
nachgetragen und urteilsändernd nicht.

## Lane-Ergebnis

**Nachabnahme F: NICHT ABGENOMMEN** — K1/K2/K3 PASS, K4 FAIL (einziger Blocker
Heap-Tor > +15 %, 2 Läufe). Belege in `~/games/.evidence/m10-acceptance-refresh-f/`,
Urteile in `docs/qa/acceptance-refresh-f-2026-11-28.md`. Folge-Bedarf:
Heap-Regressions-Diagnose (Karte für Dora), kein Fix durch diese Lane.
