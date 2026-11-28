# Lane m10-android-scale-floor-r2 — Text zerfällt auf Android-Tablet

Ziel (Dom 2026-11-28): Level-Up-Text als Strichreste auf dem Tablet. Ursache: der
Teiler-Regler aus m10-dpr-budget-cap (`src/logic/scale.ts`, SCALE_LOW_FPS 45) senkt
den Renderpuffer bei Ruckeln auf 320×180 → 1-px-Pixelschrift verliert Zeilen.
Regeln: `coding-brain/Wissen/Android-Optimierung-Praxis.md` (1: nie unter logische
Auflösung, 3: Qualitätsstufen statt Auflösungsregler).

## K1 — Repro (Vorher-Beleg) #10605

Skript: `scripts/m10-android-scale.mjs` — Playwright `devices["Galaxy Tab S4 landscape"]`
(SM-T837A, dpr 2.25), Run → giveXp(40) → Level-Up-Panel, Screenshots bei
`?rbscale=1` und `?rbscale=2`.

Belege (außerhalb des Repos): `~/games/.evidence/m10-android-scale-floor-r2/`
- `m10-android-scale-before.json` — Renderer-String `ANGLE (Intel, Mesa Intel(R)
  Graphics (RPL-S), OpenGL ES 3.2)` (echte iGPU, kein SwiftShader), 0 JS-Fehler,
  rbDbg: rb1 → 640×360, rb2 → 320×180.
- `android-tabS4-levelup-rb2-before.png` — Repro des Dom-Fotos: "LE-VEL UP",
  Untertitel Strichreste, Karten-Text unlesbar.
- `android-tabS4-levelup-rb1-before.png` — Referenz: Text sauber.

Sichtprüfung (Crops 2x): rb2 zerfällt, rb1 lesbar. ✔ Karte 1 abgeschlossen.
