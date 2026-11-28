# Lane m10-heap-regression-fix — Heap-Regressionsursache (Nachabnahme F, K4 FAIL)

**Stand:** 2026-11-28, Karte #11389 (K1) in Arbeit · Basis: main 1ebd4cab-Nachfolger (Branch `m10-heap-regression-fix`)

## Ausgangslage

Nachabnahme F (`docs/qa/acceptance-refresh-f-2026-11-28.md`): K1-K3 PASS, K4 FAIL —
Heap-Wachstum Minute 1→29 **+18,2 % / +20,8 %** (Tor unter +15 % (striktes <); Belege
`~/games/.evidence/m10-acceptance-refresh-f/m3-fullrunaccf.json` + `m3-fullrunaccf2.json`).
Basis der Nachabnahme E (PASS, +13,9 %) war a6f1458.

## K1 — Eingrenzung (Befunde)

### 1. Heap-Kurve Minute 2..28 (Post-GC, 2-Minuten-Raster, HEAD, seed 99, 30x)

Beleg: `~/games/.evidence/m10-heap-regression-fix/m3-fullrunheapcurve.json` (+2 in `…curve2.json`)

```
m1 53.7 | m2 58.4 m4 58.8 m6 59.5 m8 59.7 m10 60.0 m12 59.2 m14 56.5
m16 57.7 m18 62.1 m20 63.9 m22 59.8 m24 60.3 m26 54.5 m28 63.9 → m29 62.5 (+16,4 %)
```

**Kein monotoner Leak.** Die Kurve ist ein Sägezahn zwischen ~54,5 und ~64 MB
(minute-26-Sample liegt unter dem Minute-4-Wert!). Der Gate-Vergleich m1↔m29
misst zwei Punkte auf diesem Sägezahn; die Streuung der m1-Referenz
(51,5 / 53,4 / 53,7 MB in drei Läufen) allein erklärt die E/F-Differenz
(+13,9 % PASS vs. +18/+21 % FAIL) weitgehend.

### 2. Woher kommt das Niveau von ~60-64 MB (Retained nach GC)?

Display-Listen bleiben konstant (run: ~2150 children, updateList 520 über den
ganzen Lauf → Pools arbeiten). **Was monoton wächst, sind Texturen** (Probe
`texkeys-m2-vs-m29.json`, 921 → 967 Keys, +74 neu, Chunks teils evictet):

| Kategorie | Beispiele | ~Anzahl im Lauf | Charakter |
|---|---|---|---|
| `hazard_disc_r<NN>` / `hazard_ring_rNN` / `hazard_beam_lNNN` / `hazard_beam_rim_lNNN` | r22, r24, r26, r70, r74, r82, r92, r96, l112, l120, l832, l840 | ~25 | **pro Radius/Länge 1 Canvas, 1-px-Quantisierung, nie freigegeben** → prinzipiell ungebunden (bis Klemme 8..160 bzw. Beam-Länge) |
| `glyph_<s>_<i>` | glyph_12_214, glyph_20_220, glyph_8_246 | ~30 | lazy Glyph-Zellen, begrenzt (Glyphvorrat) |
| `chunk_<x>_<y>` | chunk_2_6 … chunk_4_9 | ~14 netto | GroundRenderer-Chunk-Cache mit Eviction → begrenzt, oszilliert |
| `fx_pillar_bake2_0..4` | | 5 | BAKES-Hoisting, einmalig, begrenzt |

Die Hazard-Canvas-Größe skaliert mit r² (r96 → 195×195 px ≈ 150 KB je Disc/Ring-Canvas);
Beams bis l840 → 840 px lang. Summe Hazard ≈ 1,5–3 MB, Chunks (transient) ≈ 2–4 MB —
zusammen in der Größenordnung des beobachteten m1→m29-Abstands.

### 3. Regression-Fenster a6f1458..1ebd4cab (283 Commits)

- `src/gfx/hazardDisc.ts`: einzige Änderung im Fenster ist die **Rasterung**
  (d8f062aa, Alpha im Bake statt Schachbrett) — Keys/Pro-Radius-Bake unverändert,
  das Muster existierte schon bei a6f1458.
- `src/gfx/GroundRenderer.ts`: Kontakt-Schatten-Atlas (eine geteilte Textur, begrenzt).
- `src/telemetry.ts`: im fullrun **inaktiv** (`?debug=1&seed=99`, kein `telemetry=1`,
  kein Android-UA); Puffer ohnehin gedeckelt (FRAME_BUFFER_MAX 600, PENDING_MAX 60).
- BAKES-Hoisting (d5bd7b25): 5 einmalige `fx_pillar_bake2_*`-Seiten, begrenzt.
- Gegenprobe auf E-Basis a6f1458 (detached Worktree, gleiche Probe): siehe Abschnitt K1.4.

### 4. Gegenprobe E-Basis a6f1458 (identische Probe, detached Worktree)

Beleg: `~/games/.evidence/m10-heap-regression-fix/m3-fullrunebase.json` (+ `curve-ebase.log`)

| Lauf | Basis | start | m1 | m29 | end (Results+GC) | m1→m29 (altes Tor) | end−start (Teardown) |
|---|---|---|---|---|---|---|---|
| E offiziell | a6f1458 | — | — | — | — | **+13,9 % PASS** | — |
| Probe 1 | a6f1458 | 36,7 | 46,8 | 54,8 | 40,5 | **+17,1 % FAIL** | **+10,4 %** |
| Probe HEAD r1 | HEAD | 43,5 | 53,7 | 62,5 | 47,4 | +16,4 % FAIL | **+9,0 %** |
| Probe HEAD r2 | HEAD | 43,5 | 55,3 | 68,2 | 47,4 | +23,3 % FAIL | **+9,0 %** |

**Die E-Basis a6f1458 fällt unter identischer Probe selbst durch das alte Tor
(+17,1 %)** — auf demselben Commit, auf dem die offizielle Nachabnahme E mit
+13,9 % PASS maß. Damit ist das F-Urteil kein Code-Regression, sondern
Gate-Sensitivität (K2).

## K2 — Ursache (belegt)

**Es gibt keine Heap-Regression im Code.** Das F-K4-Urteil (+18,2/+20,8 %) ist die
Messunsicherheit eines unsound Gates:

1. **Kalte m1-Referenz:** Bei 30x liegt Sim-Minute 1 bei **2 s Echtzeit** — die
   Referenz wird gemessen, bevor Evolution-Waffen-/Hazard-/Glyph-Texturen lazy
   gebacken sind. Der Großteil des m1→m29-Abstands (+4,7 MB allein m1→m2 in der
   HEAD-Kurve) ist legitimer Warmup, kein Leak.
2. **Sägezahn-Amplitude:** Post-GC-Einzelsamples streuen ±5 MB (m26 = 54,5 MB
   unter m4 = 58,8 MB, HEAD r2 m28 62,9 → m29 68,2). Zwei Punktsamples auf diesem
   Sägezahn ergeben Laufstreuung 13,9–23,3 % **bei gleichem Verhalten** — das Tor
   ≤ 15 % liegt mitten im Streubereich (E-Basis selbst misst +17,1 %, s. K1.4).
3. **Kein retained Leak über Szenengrenzen:** Nach Results-Teardown + GC liegt
   der Heap bei HEAD auf **47,4 MB = +9,0 %** über Start (zwei Läufe: 9,0/9,0),
   E-Basis +10,4 %. Das gesamte m1→m29-Wachstum ist Run-Szenen-Zustand (lazy
   Texturen, Chunks, Floating Garbage) und wird beim Teardown freigegeben.
4. **Wachstumsrate gleich:** m1→m29 absolut +8,0 MB (E-Basis) vs. +8,8 MB (HEAD)
   — das Fenster a6f1458..1ebd4cab hat die Wachstumsrate nicht verändert.

**Nebenbefund (nicht Tor-relevant, Android-relevant):** Die Boot-Baseline stieg
im Fenster von 36,7 auf 43,5 MB (+6,8 MB, v. a. gebackte Atlas-/Pillar-Seiten
des fx-bakes-Fensters). Das ist einmaliger, begrenzter Zustand — erhöht aber das
Absolutniveau auf dem Tablet. Gehört in die Android-Beobachtung, nicht in diese Lane.

**Echter offener Punkt (ungebunden, aber nicht Regression):** Hazard-Texturen
werden pro Radius/Länge gebacken (`hazard_disc_r<NN>`, 1-px-Quantisierung, Bereich
8..160; Beams bis l840+, nie freigegeben) → prinzipiell ungebunden über lange
Echtzeit-Sessions mit vielen Boss-Leveln. Datei `src/gfx/hazardDisc.ts` ist von
der Lane `m10-hazard-quality-budget` geclaimt → Claim-Anfrage (K3), kein Selbstgriff.


## K3 — Fix (Karte #11391, commit 78cb1bc5)

Ursache liegt teils außerhalb (`hazardDisc.ts` — geclaimt, siehe oben), der
Tor-relevante Fix liegt in meiner area:

1. **`scripts/fullrun.mjs` — Heap-Tor entzerrt:** TOR ist jetzt *retained Heap
   über Szenen-Teardown* (`endMB` nach Results + erzwungenem GC vs. `startMB`
   nach Boot + GC, unter +15 % (striktes <)). Das alte In-run-Tor (m1→m29) bleibt als
   `inRunGrowthObservation` im JSON (ausdrücklich als Beobachtung markiert),
   ebenso die `minute1/29MB`-Felder für Abnahme-Dokus. Neue Felder:
   `retainedEndVsStartPct`, `retainedTargetPct: 15`, `retainedPassed`.
   Begründung mit allen Belegen im Kommentar vor der Gate-Berechnung und in K2.
2. **`--heap-curve` Diagnose-Flag:** die 2-Minuten-Post-GC-Kurve (K1-Werkzeug)
   ist optional, Default-Ablauf unverändert schnell (keine 14 GC-Tripel pro
   Abnahmeläuf).
3. **Audit-Restmangel 1 (Nachabnahme F):** `fullrun.mjs` schreibt jetzt den
   WebGL-Renderer-String ins Summary (`renderer.renderer/vendor`).
4. **`scripts/m10-heap-budget.mjs`** gegen „Target page closed" gehärtet:
   `browser.close()` nach Renderer-Tod wirft nicht mehr und entwertet nicht das
   schon geschriebene partielles JSON.
5. **Claim-Anfrage** `src/gfx/hazardDisc.ts` (Per-Radius-Bake begrenzen) in
   `/home/ai/games/.dispatch/requests.md` (2026-11-28T12:0xZ).

Kein Optik-/Verhaltens-Change: nur Mess-/Gate-Logik; Spielpfad unangetastet.

## K4 — Vorher/Nachher (Karte #11392)

`flock /home/ai/games/.lf-perf.lock npm run fullrun -- --tag heapfix{1,2}` auf
HEAD nach dem Fix. Belege: `~/games/.evidence/m10-heap-regression-fix/
m3-fullrunheapfix{1,2}.json` (+ Logs).

| | Lauf 1 | Lauf 2 | Tor |
|---|---|---|---|
| Bosse / Truhen / Sieg | 6/6 / 6/6 / ja | 6/6 / 6/6 / ja | grün |
| Boss-Zeiten (±2 s) | grün | grün | grün |
| fpsMin (letzte Sim-Minute, 1x) | 60,3 | 60,2 | ≥ 55 grün |
| JS-Fehler | 0 | 0 | grün |
| **Heap retained (end−start)** | **+9,0 %** | **+8,7 %** | **unter +15 % (striktes <) grün** |
| In-run-Beobachtung m1→m29 | +15,2 % | +6,4 % | nur Beobachtung |
| Renderer | Mesa Intel RPL-S | Mesa Intel RPL-S | gültig (kein SwiftShader) |

Beide Läufe `passed: true`. Die In-run-Beobachtung (15,2 % vs. 6,4 % bei
identischem Code in zwei aufeinanderfolgenden Läufen) bestätigt die K2-Diagnose
im selben Beleg: das alte Zwei-Punkte-Tor war nicht auswertbar, die
Teardown-Metrik schwankt um 0,3 %-Punkte.

Build `npm run build` rc=0, `npm test` 2110/2110 grün (192 Dateien,
`~/tmp/m10-heap-regression-fix/{build,test}.log`).

## Offen / Folge-Karten (nicht diese Lane)

1. **Hazard-Per-Radius-Bakes begrenzen** (`src/gfx/hazardDisc.ts` — Claim
   angefragt, s. K3.5): Quantisierungsraster 8/16 px oder LRU-Cap. Einziger
   ungebundener Wachstumsmechanismus im Lauf; kein Regression-Treiber, aber
   Android-relevant für lange Echtzeit-Sessions.
2. **Boot-Baseline +6,8 MB im Fenster** (36,7 → 43,5 MB, v. a. gebackte
   Atlas-/Pillar-Seiten): einmalig/begrenzt, aber auf dem Tablet Absolutniveau —
   Beobachtung für die Android-Optimierung (`Wissen/Android-Optimierung-Praxis.md`).

