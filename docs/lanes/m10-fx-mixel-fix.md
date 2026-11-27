# Lane m10-fx-mixel-fix — Mixel-Fix große Feuer-/Aura-Effekte

Dom-Wunsch 21:15Z, Punkt 4a (Optik-Mangel): große Feuer-/Aura-Effekte sind grobe
6–8-px-Blöcke (Mixel: Effekt-Texturen liegen in anderer Pixelgröße als die
Sprites und werden hochskaliert) — z. B. Explosion links unten in Minute 20,
Karo-Halo hinter dem Spieler. Referenz: `shots/m10-realtime-minute-20.png` /
`-30.png` (Lauf 2, iGPU).

## 1. Ist-Zustand (Karte #6098, Commit 176dc18)

Skript `scripts/m10-fx-mixel.mjs` stellt die Mixel-Szene nach: fx_fire-Explosion
(Scale 1,4/2,0), fx_halo-Halo (2,8/4,6), fx_halo_cold (1,8), fx_shock-Ring (3,3)
— die realen Caller-Scales aus CombatSystem/Run — in 640x360 und 960x540 (je
2x-nearest vergrößert). Draw-Pfad legacy = Level-1-Textur, Sprite-Scale = Scale.

Belege: `shots/m10-fx-mixel-before-640.png`, `-960.png`, `before.json`.

**Mixel-Befund (before.json):** `worstBlockGamePx = 4,6` (Boss-Tod-Halo),
12 der 12 Showcase-Zeichnungen mit Scale > 1 — ein fx_halo-Textur-Pixel deckte
bis zu 4,6 Spielpixel ab (bei dpr 3 ≈ 14 Device-Pixel Blockgröße).

**Nebenbefund (im selben Commit gefixt, Eingriff in Level-1-Frames):**
`blob()`/`ring()` kodierten Ramp-Indizes mit `String.fromCharCode(97 + ramp[idx])`
statt `charOf(...)` = `97 + idx - 10`. Jeder Ramp-Index ≥ 10 landete damit 10
Palettenplätze weiter (Lantern 21 → 'v' → Palette 31, Amber 20 → 'y' → Clamp 31,
fx_dusk 5/4/3 → Ember-Töne). Das erklärt die lachsroten Feuer-/Halo-Blöcke im
Ist-Zustand (Histgramm before: #FF8A6B, #E4574D, #B8303F, Moosgrün). Fix:
`charOf(ramp[idx])` in beiden Generatoren — geprüft gegen die eigene Zeichentabelle
("0-9 a-v = Palette 0-31"); keine Tests pinnsten die alten Zeichen.

Hinweis: Ein Rerun von `--path legacy` mit dem aktuellen Code zeigt deshalb
ANDERE Farben als die committeden before-PNGs (die zeigen den ausgelieferten
Ist-Zustand inkl. Farbbug). Die before-PNGs wurden vor dem Farbfix erzeugt.

## 2. Fix an der Quelle (Karte #6099, Commit 805da9b)

**src/gfx/gen-fx.ts — Bake-Stufen:**
- `blob`, `ring`, `coldHaloFrame`, `shockFrame` haben einen `density`-Parameter:
  dieselbe normierte Geometrie wird in w0*L x h0*L Pixeln gerendert (Level 1
  byte-identisch). Glow läuft damit in 1-px-Stufen (Rampe quantisiert pro Pixel).
- `MIXEL_BAKE_DEFS` + `FX_MIXEL_BASES`: fx_fire (max L 3), fx_halo (max L 6,
  deckt Boss-Tod-Scale 4,6), fx_halo_cold (max L 3), fx_shock (max L 4).
  `createFxTextures` registriert alle Stufen ≥ 2 unter Keys `fx_<name>@<L>`
  (Frames `fx_<name>@<L>_<i>`); Level-1-Keys bleiben unverändert (Direkt-Pfade
  wie makeImage("fx_halo") funktionieren weiter — sie bleiben aber Mixel, s. u.).
- Helper: `mixelTextureKey`, `mixelBaseFor` (längste Basis zuerst, damit
  fx_halo_cold gewinnt), `mixelFrameKey`, `mixelLevelFor` (kleinste Stufe ≥
  |scale|, 1 bei Scale ≤ 1), `mixelMaxLevel`, `mixelBakes()`,
  `mixelLevel1Frames()`.
- fx_boss_core und die Evo-Signaturen bleiben absichtlich handgesetzte 32x32-
  Frames mit Tintenkontur (eigene Silhouette, kein weicher Glow).

**src/systems/FxSystem.ts — Draw-Pfad (FxSystem + ParticleSystem im selben File):**
- Beim Spawn: `mixelLevel = mixelLevelFor(frames[0], max(|scaleFrom|, |scaleTo|))`;
  Frames werden auf Stufen-Keys umgeschrieben, Sprite-Draw-Scale = Scale/L.
  Damit ist der Draw-Scale ≤ 1, solange der gewünschte Scale ≤ maxLevel der
  Basis ist (für alle dokumentierten Caller-Scales erfüllt, s. tests/fx-mixel).
- `FxRuntime.scaleFrom/scaleTo` bleiben die gewünschte Größe in Spielpixeln
  (Semantik für Aufrufer/Deckel unverändert); neu: `FxRuntime.mixelLevel`.
- Der ADD-Glow-Screengrößen-Deckel (M10-A4) rechnet unverändert mit der
  Level-1-Textur und Spielpixel-Scale — Device-Fläche texW*L * (Scale/L)² ist
  identisch, Deckel-Mathematik und Tests semantics bleiben.
- `update()` teilt in jedem Schritt durch mixelLevel (Tween from→to bleibt ≤ 1).

**Fremd-Dateien (unvermeidbar, minimal):**
- `tests/fx-add-cap.test.ts` (unclaimed): 1 Sprite-Scale-Assertion — alter
  Draw-Scale 3 → neuer Draw-Scale 3/3 = 1 (fx_halo Scale 6 → Deckel 3 → Stufe 3).
  Begründung hier dokumentiert; Eintrag in /home/ai/games/.dispatch/requests.md.
- Kein Eingriff in CombatSystem/Run: die direkten makeImage-Halos
  (CombatSystem ~364 flail-Halo Scale radius/18, ~817 orb-Halo 1,8/0,8) und die
  fx_pillar/fx_shock-Tweens in Run.ts umgehen den FxSystem-Draw-Pfad und bleiben
  beim Level-1-Key (unverändertes Verhalten). Das ist der Restbefund unten.

**Reviewer-Befunde (PASS, nachgezogen in Commit `dc0f1ff`):**
1. Deckel-Kommentar korrigiert: die echte Device-Fläche texW*L * (Scale/L)² =
   texW*Scale²/L bleibt um Faktor L UNTER der Deckel-Obergrenze (nicht identisch).
   Richtung safe: der Deckel bleibt gültige Obergrenze, Spielpixel-Größe unverändert.
2. **Scale > maxLevel fällt stumm auf den alten Mixel-Look zurück** (Draw-Scale
   = Scale/maxLevel > 1, Verhalten = exakt der alte Zustand, nicht schlechter).
   Betroffen wären nur Scales über den dokumentierten Caller-Grenzen (fx_halo
   > 4,6, fx_shock > 3,3, fx_fire > 3, fx_halo_cold > 3). In den aktuellen
   Calls (CombatSystem radius/12, radius/16, radius/30 etc.) ist das Radius-
  ende auf diese Grenzen abgestimmt; falls künftig ein Caller größere Scales
   nutzt, muss entweder maxLevel der Basis oder der Caller angepasst werden.
3. `mixelBaseFor`/`mixelFrameKey` erkennen jetzt auch bereits umgeschriebene
   Stufen-Keys ("fx_halo@2_1") — idempotenter Roundtrip, mit Tests gesichert.

## 3. Regressionstests (Karte #6100, Commit 4ced0f7)

`tests/fx-mixel.test.ts` (16 Tests):
- Bake-Groesse = Sprite-Pixelgröße: w0*L x h0*L, Frame-Zeilen passend, binäres
  Alpha, Frame-Counts wie Level 1.
- Level-Auswahl: Draw-Scale ≤ 1 für alle realen Caller-Scales; Stufe = ceil(Scale);
  Scale ≤ 1 und nicht-Mixel-Keys (fx_star, fx_boss_core, Evo-Signaturen) bleiben
  Level 1; NaN-Schutz.
- Stufen-Keys: Prefix-Transfer (fx_fire_5 → fx_fire@2_5), fx_halo_cold gewinnt
  gegen fx_halo, Todes-Sets unberührt.
- FxSystem/ParticleSystem: kein Scale > 1 in spawn und update; Scale ≤ 1 bleibt
  Level 1; nicht-Mixel-Effekte behalten Draw-Scale = Scale.
- Glow-Abstufungen: Rampen-Band wird L-fach in mehr Texturpixeln aufgelöst bei
  gleicher physikalischer Bandbreite (run/L == run1 ± 1), Palette-Rampe vollständig.

Suite: 75 Dateien / 779 Tests grün. `npx tsc --noEmit` rc=0, `npm run build` rc=0.

## 4. Nachher + Abnahme (Karte #6101)

Belege: `shots/m10-fx-mixel-after-640.png`, `-960.png`, `after.json`
(worstBlockGamePx = 1, mixelCount = 0, alle Stufen-Keys im JSON).

**art-director-Sichtprüfung (Vision): PASS** (alle 5 Kriterien):
1. Keine Mixel-Blöcke mehr: BEFORE zeigt Blockgitter bis 4,6 Spielpixel,
   AFTER saubere 1-px-Stufen (Rosette, weicher Glow); after.json bestätigt
   worstBlockGamePx=1, SpriteScale 0,7–1,0.
2. Gleiche Effektgrößen/Positionen wie BEFORE (nur Textur-Auflösung geändert).
3. Farbrampe warm statt Crimson: alle 11 AFTER-Farben sind Paletten-Einträge
   (emberDark…lanternWhite/candleWhite), kein Verlaufsglättungs-Fremdcolor.
4. Lesbarkeit auf nightDeep gegeben.
5. Pixel-Ästhetik gewahrt (harte 1-px-Stufen, keine Sub-Pixel-Kanten).
Anmerkung (kein FAIL): flameBright (#EF9130) fehlt im AFTER-Histogramm — Rampe
nutzt amber/flame direkt nebeneinander; visuell kein Sprung.

**Perf (M25 780x360@3, flock-Lauf):** `shots/m10-fx-mixel-perf-m25.json` —
burst 60,1 FPS (500 Gegner), minute25 60,0 FPS (300 Gegner), beide passed=true,
0 JS-Fehler. Renderer-String (ANGLE / Mesa Intel RPL-S, OpenGL ES 3.2),
swiftShader=false — gemessen mit `scripts/m10-fx-mixel-renderer.mjs`, der den
String in die Mess-JSON anhängt (perf.mjs selbst ist fremd).

## Offene Punkte / Restbefunde

1. **Direkt-Pfade bleiben Mixel:** die makeImage-Halos in CombatSystem
   (~Zeile 364 flail-Halo `setScale(radius/18)`, ~817 orb-Halo `setScale(1.8)`)
   und die fx_pillar/fx_shock-Tweens in Run.ts (playEvolutionFx/playLevelUpFx)
   zeichnen Level-1-Texturen mit Scale > 1 — sie umgehen FxSystem.spawn.
   Für den vollen Fix müssten diese Aufrufer Stufen-Keys + geteilte Scale
   nutzen; die Dateien gehören anderen Lanes (Anfrage gestellt). Das
   Dom-Beispiel "Karo-Halo hinter dem Spieler" (Boss-Intro/Level-up-Halo via
   spawnAnim) ist abgedeckt; die orb-Halos betreffend soul_beacon/flail.
2. flameBright-Lücke in der fx_halo-Rampe (kosmetisch, art-director nicht blockierend).
3. Atlas: die Stufen-Keys fallen unter das ATLAS_PREFIXES-"fx_" und werden mit
   gepackt (Atlas wächst um ~1,6 Mio px², M25-Perf bleibt 60 FPS — kein Handlungsbedarf).

## Commits

- 176dc18 — #6098 Ist-Messung + Bake-Infrastruktur + Off-by-10-Farbfix
- 805da9b — #6099 FxSystem/ParticleSystem Draw-Pfad (Draw-Scale ≤ 1)
- 4ced0f7 — #6100 tests/fx-mixel.test.ts (16 Tests), Suite 779 grün
- (dieser Commit) — #6101 after-Belege, art-director PASS, Perf, Doku
