# Lane m10-heap-regression-fix — Heap-Regressionsursache (Nachabnahme F, K4 FAIL)

**Stand:** 2026-11-28, Karte #11389 (K1) in Arbeit · Basis: main 1ebd4cab-Nachfolger (Branch `m10-heap-regression-fix`)

## Ausgangslage

Nachabnahme F (`docs/qa/acceptance-refresh-f-2026-11-28.md`): K1-K3 PASS, K4 FAIL —
Heap-Wachstum Minute 1→29 **+18,2 % / +20,8 %** (Tor ≤ +15 %; Belege
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

### 4. Gegenprobe E-Basis a6f1458

TODO (läuft) — Kurve + Gate-Delta der E-Basis unter identischer Probe.

## K2 — Ursache

(folgt nach Gegenprobe)

## K3/K4

(folgen)
