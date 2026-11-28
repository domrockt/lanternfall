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
| #11950 | K2 FPS-Kerne: Burst 640x360 + 780x360@3, Minute-25 780x360@3 | offen |
| #11951 | K3 Heap-Tor: 2x 30-min-fullrun (retained < +15 %) | offen |
| #11952 | K4 Doku + Gesamturteil + .lane-done | offen |

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
