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

## K2 — Renderpuffer hart auf 1 #10606

`src/logic/scale.ts`: `RENDER_SCALE_MAX = 1` — der Teiler-Regler kann den
Renderbuffer nicht mehr unter die logische Auflösung senken (Android-Praxisregel 1).
`?rbscale` bleibt als Debug-Override, wird aber auf 1 geklemmt (`parseRenderScaleOverride`
liefert für 2/3 jetzt null, `applyRenderScaleOverride` klemmt). `renderBufferSize`
liefert jede Stufe als volle logische Größe. Der Soll/Ist-Vergleich in
`config.ts installRenderBudget()` bleibt (stellt Buffer-Resets wieder her).

Begründung fremde Dateien: `tests/fx-add-cap.test.ts`, `tests/boss-fx-contrast.test.ts`
und `tests/boss-camera-width.test.ts` erwarteten den alten Teiler-Cap
(FxSystem cappt ADD-Glows nur bei `RENDER_SCALE > 1`) — Erwartungen auf das neue
Invarianten-Verhalten umgestellt; der echte Glow-Flächen-Cap kommt mit K3 über die
Qualitätsstufe zurück.

Belege: `npx vitest run` 1921/1921 grün, `npx tsc --noEmit` ok, `npm run build` ok.
Commit 3bb22cd6. ✔ Karte 2 abgeschlossen.

## K3 — Qualitätsstufen statt Auflösung #10607

Neu `src/logic/quality.ts` (rein, ohne Phaser/Uhr):
- Stufen `high/medium/low` mit Budgets `QUALITY_BUDGETS`: maxFxSprites 220/140/90,
  maxAddArea ∞/9216/2025 Device-px, particlesPerHit 24/14/8,
  damageNumbersPerSec 24/14/8, maxDamageLabels 12/8/5, glow an/an/aus.
- Hysterese-Regler `stepQuality`: < 45 FPS 3 s kumulativ → Stufe runter,
  > 57 FPS 12 s am Stück → rauf, Totzone 45–57 friert Timer ein (kein Pumpen).
- Helper: glowAreaCapForQuality, glowSlotCapForQuality/glowEnabledFor,
  damageLabelCapForQuality, damageNumbersPerSecFor, particlesPerHitFor.

Verdrahtung NUR an bestehenden Caps (kleinste Änderung):
- `FxSystem`: ADD-Flächen-Deckel (2 Spawn-Stellen) liest jetzt
  `glowAreaCapForQuality(QUALITY)` statt des toten `glowAreaCapForRenderScale`;
  Glow-Slot-Request (4 Stellen) zusätzlich mit `glowEnabledFor(QUALITY)` —
  low fällt auf NORMAL-Blend zurück (wie beim Slot-Fallback).
- `DamageNumbers.viewLimit`: min mit `damageLabelCapForQuality(QUALITY)`.
- `config.ts`: live-Binding `QUALITY`, Laufzeit-Regler ruft `stepQuality`
  (ersetzt den toten Teiler-Regler im rAF-Tick).
- `debug.ts`: `__lf.state().quality` (Abnahme-Kriterium).

Begründung fremde Dateien: Verdrahtung nur am existierenden Cap möglich
(FxSystem.ts, DamageNumbers.ts, debug.ts) — je 1–4 Zeilen plus Import.
Budget-Werte maxFxSprites/particlesPerHit/damageNumbersPerSec sind als
Budget-Daten geliefert (Emissions-Caps existieren dort noch nicht; Bedarf
gemerkt, keine neue Caps gebaut).

Belege: `npx vitest run` 1936/1936 grün (neu: tests/quality-tier.test.ts,
15 Tests), `npx tsc --noEmit` ok, `npm run build` ok.

Nachcommit (Claim freigegeben): `src/systems/FxSystem.ts` Commit 65f72821 —
ADD-Flächen-Deckel liest `glowAreaCapForQuality(QUALITY)`, Glow-Slots mit
`glowEnabledFor(QUALITY)` (low = NORMAL-Fallback). Request-Eintrag in
`.dispatch/requests.md` ist damit erledigt. ✔ Karte 3 abgeschlossen.

## K4 — Nachher-Belege #10608

Belege in `~/games/.evidence/m10-android-scale-floor-r2/`:
- `android-tabS4-levelup-rb2-after.png` + `m10-android-scale-after.json`:
  `?rbscale=2` wird auf 1 geklemmt → rbDbg.scale 1, Buffer 640×360,
  Level-Up-Text voll lesbar (Sichtprüfung Crop 2x, identisch zu rb1),
  Renderer `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`,
  0 JS-Fehler. Abnahme-Kopie in git: `shots/abnahme/m10-android-scale-levelup-rb2-after.png`.
- `m10-android-scale-throttle.json` (Skript `scripts/m10-android-scale-throttle.mjs`):
  Tab-S4-Emulation + CDP-Throttle 4x; da die iGPU vsync-60 hält, wird der
  FPS-Eingang des Reglers deterministisch gestreckt (rAF-Deltas ≥ 33,4 ms ≈
  30 FPS — synthetische Last, im JSON gekennzeichnet). Ergebnis: Tier-Spur
  high → medium → low (`tiers: ["medium","low"]`, `tierChanged: true`),
  `minCanvasW = 640 = logicalW` → **nie unter logische Auflösung**, Renderer-String
  im JSON. Qualitätsstufe sichtbar in `__lf.state().quality`.

Abnahme gesamt: kein Codepfad rendert unter 640×360 logisch (K2-Invariante +
K4-Lauf), Level-Up-Text in allen Fällen lesbar, Stufenwechsel im Debug-State
sichtbar, `npx vitest run` 1936/1936, `npx tsc --noEmit` grün, 0 JS-Fehler.
✔ Karte 4 abgeschlossen.

## Offen / Hinweise
- Reviewer (PASS, 2026-11-28): 3 Sollte-Punkte direkt nachgezogen (Commit
  folgt) — belowMs-Überlauf auf low behoben (+Test), maxFxSprites als
  „Budget-Daten, nicht verdrahtet“ gekennzeichnet, glowSlotCapForQuality als
  Debug-/Test-Helfer dokumentiert. Nit: im Forced-Override-Modus (?rbscale=0/1)
  friert QUALITY auf high (bewusst, Debug-Messmodus).
- Budget-Werte `maxFxSprites`/`particlesPerHit`/`damageNumbersPerSec` sind als
  Daten in quality.ts geliefert, aber (noch) nicht verdrahtet — es existieren
  dort (noch) keine Caps; Bedarf für Folgekarten gemerkt.
- Echte Gerätefreigabe bleibt die Telemetrie (`http://10.10.50.185:5180/latest`,
  Praxisregel 8); der Ersatztest deckt CPU-/GC-Regressionen.



