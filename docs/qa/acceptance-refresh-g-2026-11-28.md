# Nachabnahme G (2026-11-28) — Nachabnahme nach Heap-Regressions-Fix

**Basis:** main @ `b69ede5c` (nach `9153181d` Merge `m10-heap-regression-fix`).
**Anlass:** Nachabnahme F (2026-11-28) scheiterte ausschließlich am Heap-Tor
(+18,2 %/+20,8 % > +15 %, 2 Läufe, reproduziert). Die Fix-Lane diagnostizierte
Gate-Unsoundness (GC-Sägezahn, kalte m1-Referenz) statt Code-Regression und
entzerrte das Tor auf **retained Heap über Szenen-Teardown** (endMB nach Results +
GC vs. startMB nach Boot + GC, strikt < +15 %) — Belege:
`docs/lanes/m10-heap-regression-fix.md`.
**Lane:** `m10-acceptance-refresh-g` (NUR-PRÜF, kein src-/tests-Code),
Karten #11949–#11952. Belege: `~/games/.evidence/m10-acceptance-refresh-g/`.

## Gesamturteil: **PASS** (4/4 Karten PASS, keine Blocker)

| K | Kriterium | Ergebnis | Urteil |
|---|---|---|---|
| K1 | Build/Tests/Inhalt/verify:final | build rc=0, Tests **2243/2243** (201 Dateien), acceptance-count **30/6/6/6/6/2**, verify:final **7/7 PASS**, 0 JS-Fehler | PASS |
| K2 | FPS-Kerne (iGPU) | Burst 640x360 **60,0** (≥55), Burst 780x360@3 **60,0** (≥55), Minute-25 780x360@3 **60,1** (≥50) | PASS |
| K3 | Heap-Tor 2x fullrun | retained **+8,9 % / +9,2 % < +15 %** in BEIDEN Läufen; 6/6 Bosse+Truhen exakt, Sieg `dawn`, fpsMin 60,4/60,3, 0 JS-Fehler | PASS |
| K4 | Doku + Urteil | dieses Dokument + `docs/lanes/m10-acceptance-refresh-g.md` | PASS |

Renderer-Pflicht erfüllt: **jeder** FPS-/Heap-Beleg trägt
„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“,
`swiftshader:false` (kein SwiftShader).

## K1 — K-Basis

- `npx tsc --noEmit` rc=0; `npm run build` rc=0 (`✓ built in 542ms`)
- `npm test`: **2243/2243 in 179→201 Dateien**, 0 fail
- `node scripts/acceptance-count.mjs`: ok:true, **30/6/6/6/6/2** (Soll = Ist)
- `node scripts/verify-final.mjs`: **7/7 PASS**, errors []
- Belege: `k1-final-verify.json` (+ Screenshots unter `~/games/.evidence/verify-hygiene/2026-11-28T12-20-25-*`)

## K2 — FPS-Kerne (unter `flock /home/ai/games/.lf-perf.lock`)

Harness `scripts/m10-refresh-g-perf.mjs`; Belege `k2-perf-accg-640.json`,
`k2-perf-accg-780d3.json`.

| Messung | G (2026-11-28) | Tor | F-Basis | ≥5 %-Abweichung |
|---|---|---|---|---|
| Burst 640x360 | **60,0 FPS** | ≥55 | nicht gemessen | — |
| Burst 780x360@3 | **60,0 FPS** | ≥55 | 60,0 | nein |
| Minute-25 780x360@3 | **60,1 FPS** | ≥50 | 60,1 | nein |

Alle Werte am 60-Cap. Harness-Quirk (wie F-Audit-Restmangel 3): Minute-25
`minEnemies` niedrig (God-Mode-Bot räumt schneller ab als der Director spawnt) —
Tor ist ausschließlich FPS, `minEnemies` nur Info im JSON.

## K3 — Heap-Tor (2x 30-min fullrun unter `flock`)

Belege `m3-fullrunaccg1.json`, `m3-fullrunaccg2.json`; Skripte nur konsumiert.

| | accg1 | accg2 | Tor |
|---|---|---|---|
| **retained end−start** | **+8,9 %** (43,6→47,5 MB) | **+9,2 %** (43,6→47,5 MB) | < +15 % — **PASS beide** |
| In-run m1→m29 (Beobachtung) | +10,7 % (53,5→59,2) | +14,9 % (54,2→62,3) | nur Beobachtung |
| Bosse / Truhen / Sieg | 6/6 / 6/6 / `dawn` | 6/6 / 6/6 / `dawn` | grün |
| Boss-Zeiten | exakt 300..1800 s | exakt 300..1800 s | grün |
| fpsMin | 60,4 | 60,3 | ≥55 grün |
| JS-Fehler | 0 | 0 | grün |

**Abweichungen ≥ 5 % gegen F-Basis** (F-Werte unverändert in
`docs/lanes/m10-acceptance-refresh-f.md`):
1. Heap-Tor: F +18,2/+20,8 % (altes m1→m29-Tor, FAIL) → G +8,9/+9,2 %
   (retained-Tor, PASS). Gegenstand des Fix-Jobs, kein Spielpfad-Change.
2. In-run-Beobachtung: F +18,2/+20,8 % → G +10,7/+14,9 % (GC-Sägezahn-Streuung).
3. Tests: F 1957 → G 2243 (+14,6 %, neue Testdateien anderer Lanes).

## Befundliste (Fix-Jobs → Dora)

| # | Befund | Severity | Hebel-Pointer |
|---|---|---|---|
| B1 | ACCEPTANCE.md-Eintrag „Nachabnahme G“ **nicht** geschrieben: Datei zur Laufzeit durch `m10-v10-device-acceptance` belegt (Karte #11900 offen, Briefing-Grenze). **Nachholen im nächsten Abnahme-Lauf** — Tabelle oben ist kopierfertig. | Doku | `ACCEPTANCE.md` (wenn frei); Commit-Referenz dieser Lane |
| B2 | In-run m1→m29 bleibt lauf-streuentransparent instabil (+10,7 %/+14,9 % bei identischem Code; Fix-Lane K1: Sägezahn 54,5–64 MB). Tor bleibt retained; das In-run-Feld sollte in Abnahme-Dokus nie wieder als Tor zitiert werden. | Info | `scripts/fullrun.mjs` (`inRunGrowthObservation`) |
| B3 | Boot-Baseline 43,5–43,6 MB (Fix-Lane-Nebenbefund: +6,8 MB im fx-bakes-Fenster) — Android-Absolutniveau, einmalig/begrenzt. | Niedrig (Android) | `Wissen/Android-Optimierung-Praxis.md`, Android-Beobachtung |
| B4 | Hazard-Texturen pro Radius/Länge ungebound (Fix-Lane: offener Punkt) —Claim lag bei `m10-hazard-tex-cap` (läuft parallel); Resultat hier **nicht** bewertet. | Folge-Karte | `src/gfx/hazardDisc.ts` / Lane `m10-hazard-tex-cap` |
| B5 | fullrun-Harness: 1× Serverstart-Fehler bei Port-Konflikt mit Parallel-Lane (Wiederholung erfolgreich). Ggf. Port-Retry im Harness. | Niedrig | `scripts/harness.mjs` `startServer` |

## Belege

Alle JSON-Belege: `/home/ai/games/.evidence/m10-acceptance-refresh-g/`:
`k1-final-verify.json`, `k2-perf-accg-640.json`, `k2-perf-accg-780d3.json`,
`m3-fullrunaccg1.json`, `m3-fullrunaccg2.json`. Logs: `~/tmp/m10-acceptance-refresh-g/`.

**Nachabnahme G: ABGENOMMEN (PASS).** Kein Blocker. Die einzige FAIL-Basis von F
(Heap-Tor) ist mit dem entzerrten retained-Tor in beiden Läufen geräumt.
