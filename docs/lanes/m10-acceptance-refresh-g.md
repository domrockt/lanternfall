# Lane m10-acceptance-refresh-g — Nachabnahme G (2026-11-28)

Auftrag: Nachabnahme G direkt nach dem Merge des Heap-Regressions-Fixes
(`9153181d` Merge branch `m10-heap-regression-fix`, auf dem Lane-Branch gemessen
auf main `b69ede5c`). Nur Messen/Doku, **kein** src-/tests-Code.
Briefing: `.briefs/m10-acceptance-refresh-g.md`, Karten #11949–#11952 (K1–K4).

- Worktree: `/home/ai/games/lf-lanes/m10-acceptance-refresh-g` (Branch `m10-acceptance-refresh-g`)
- Basis: main @ `b69ede5c` (Merge m10-texture-glow-swap-r2, 2026-11-28)
- QA-Doku: `docs/qa/acceptance-refresh-g-2026-11-28.md`
- Belege (außerhalb git): `/home/ai/games/.evidence/m10-acceptance-refresh-g/`
- Lange Läufe: `flock /home/ai/games/.lf-perf.lock`
- Renderer-Pflicht: WebGL-Renderer-String in jedem FPS/Heap-Beleg; SwiftShader ungültig.
- F-Basis (Vergleich, Abweichungen ≥ 5 % markieren):
  `docs/lanes/m10-acceptance-refresh-f.md` — Tests 1957/179, Burst 780@3 60,0,
  Minute-25 780@3 60,1, 960x540 60,1, Heap-Tor **FAIL +18,2/+20,8 %**, fullrun
  fpsMin 60,4/60,3.

## Karten

| Karte | Inhalt | Status |
|---|---|---|
| #11949 | K1 K-Basis: tsc/build/test/acceptance-count/verify:final | erledigt |
| #11950 | K2 FPS-Kerne: Burst 640x360 + 780x360@3, Minute-25 780x360@3 | erledigt |
| #11951 | K3 Heap-Tor: 2x 30-min-fullrun (retained < +15 %) | erledigt |
| #11952 | K4 Doku + Gesamturteil + .lane-done | erledigt |

## K4 (2026-11-28, ~13:5xZ)

- `docs/qa/acceptance-refresh-g-2026-11-28.md`: K-Tabellen, Gesamturteil **PASS**,
  3 markierte Abweichungen ≥ 5 % gegen F, Befundliste B1–B5 mit Hebel-Pointern
  (ACCEPTANCE.md-Eintrag nachgeholt im nächsten Lauf — Datei durch
  m10-v10-device-acceptance belegt; Befunde sonst an Dora).
- Dora-Meldung (B1/B3/B5) in `/home/ai/games/.dispatch/requests.md` eingetragen.
- `.lane-done` gesetzt.

Urteil K4: **PASS**.

## Lane-Ergebnis

**Nachabnahme G: ABGENOMMEN (PASS, 4/4).** Heap-Tor geräumt (+8,9 %/+9,2 %
< +15 %, 2 Läufe), FPS am 60-Cap, Tests/Inhalt/verify grün, Renderer-Belege
gültig (Mesa Intel RPL-S). Kein src-/tests-Code geändert.

## K1 (2026-11-28, ~12:1x–12:2xZ, auf `b69ede5c`)

- `npx tsc --noEmit`: **rc=0** (`~/tmp/m10-acceptance-refresh-g/tsc.log`)
- `npm run build`: **rc=0**, `✓ built in 542ms` (bekannte phaser-Chunk-Warnung)
- `npm test`: **2243/2243 in 201 Dateien**, 0 fail
  — **Abweichung ≥ 5 % gegen F** (1957 in 179): +14,6 % Tests; Ursache: neue
  Testdateien anderer Lanes zwischen F-Basis (1ebd4cab) und Merge-Stand
  (u. a. Heap-Fix-Lane meldete bereits 2110 vor dem Merge). Kein Regressions-
  signal, alle grün.
- `node scripts/acceptance-count.mjs`: **ok:true, 30/6/6/6/6/2** (Soll = Ist)
- `node scripts/verify-final.mjs`: **7/7 PASS**, rc=0, **errors: []** (0 JS-Fehler)
  — Belege: `~/games/.evidence/m10-acceptance-refresh-g/k1-final-verify.json`
  (+ Screenshots unter `~/games/.evidence/verify-hygiene/2026-11-28T12-20-25-*`)

Urteil K1: **PASS**.

## K2 (2026-11-28, ~12:4xZ, unter `flock /home/ai/games/.lf-perf.lock`)

Harness: `scripts/m10-refresh-g-perf.mjs` (Messlogik wie scripts/perf.mjs, Pflicht-
Renderer-String im selben JSON). Belege:
`~/games/.evidence/m10-acceptance-refresh-g/k2-perf-accg-{640,780d3}.json`.

| Messung | Wert | Tor | F-Basis | ≥5 %-Abweichung |
|---|---|---|---|---|
| Burst 640x360 | **60,0 FPS** | ≥55 | — (F maß nicht) | — |
| Burst 780x360@3 | **60,0 FPS** | ≥55 | 60,0 | nein |
| Minute-25 780x360@3 | **60,1 FPS** | ≥50 | 60,1 | nein |

- Renderer je Beleg: „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)",
  `swiftshader:false` — gültige iGPU.
- jsErrors: [] in beiden Läufen.
- Harness-Quirk (wie F-Audit-Restmangel 3, urteilsändernd nicht): Minute-25
  `minEnemies` niedrig (God-Mode-Bot räumt schneller ab als der Director spawnt);
  Tor ist ausschließliche FPS-Grenze, `minEnemies` als Info im JSON.

Urteil K2: **PASS** (alle Tore erfüllt, am 60-Cap, keine Abweichung ≥ 5 % gegen F).

## K3 (2026-11-28, ~13:0x–13:4xZ, 2x `flock /home/ai/games/.lf-perf.lock npm run fullrun`)

Skripte nur konsumiert (`scripts/fullrun.mjs` mit dem entzerrten Heap-Tor aus
`m10-heap-regression-fix`, Commit 78cb1bc5; kein src-/tests-/Skript-Change).
Belege: `~/games/.evidence/m10-acceptance-refresh-g/m3-fullrunaccg{1,2}.json`.

| | Lauf 1 (accg1) | Lauf 2 (accg2) | Tor | F-Basis | Abweichung |
|---|---|---|---|---|---|
| **Heap retained (end−start)** | **+8,9 %** | **+9,2 %** | < +15 % (beide) PASS | FAIL +18,2/+20,8 % | ja, markiert (s. u.) |
| Bosse / Truhen | 6/6 | 6/6 | grün | 6/6 | nein |
| Boss-Zeiten | exakt 300..1800 s | exakt 300..1800 s | grün | ±2 s | nein |
| Sieg (`dawn`) | ja | ja | grün | ja | nein |
| fpsMin | 60,4 | 60,3 | ≥ 55 grün | 60,4/60,3 | nein |
| JS-Fehler | 0 | 0 | grün | 0 | nein |
| Renderer | Mesa Intel RPL-S | Mesa Intel RPL-S | gültig | — | — |
| In-run-Beobachtung m1→m29 | +10,7 % (53,5→59,2 MB) | +14,9 % (54,2→62,3 MB) | nur Beobachtung | +18,2/+20,8 % | markiert |

**Abweichungen ≥ 5 % gegen F (F-Werte bleiben unverändert in
`docs/lanes/m10-acceptance-refresh-f.md`):**
1. Heap-Tor: F maß mit dem alten Zwei-Punkte-Tor +18,2/+20,8 % (FAIL); G misst
   mit dem entzerrten retained-Tor +8,9/+9,2 % (PASS). Das ist der Gegenstand
   des geprüften Fix-Jobs, kein Verhaltenswechsel im Spielpfad.
2. In-run-Beobachtung m1→m29: F +18,2/+20,8 % vs. G +10,7/+14,9 % (≥ 5 %);
   laut K2-Diagnose der Fix-Lane GC-Sägezahn-Streuung, nur Beobachtungswert.
3. Tests (K1): 2243 vs. 1957 (+14,6 %) — neue Testdateien anderer Lanes.

Zwischenfall: 1. accg2-Lauf scheiterte am Serverstart („Statischer Server konnte
nicht gestartet werden“, Port-Konflikt mit Parallel-Lane, Log
`~/tmp/m10-acceptance-refresh-g/k3-fullrun.log`) — Wiederholung 1 erfolgreich,
kein Messwert-Einfluss.

Urteil K3: **PASS** — das Heap-Tor ist in BEIDEN Läufen geräumt
(+8,9 % / +9,2 % < +15 %), Inhalt/FPS/Truhen/JS-Fehler grün.
