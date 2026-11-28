# M10-tablet-fx-rootcause — Root Cause des GPU-Hotspots auf dem Redmi Pad Pro (nur messen, kein Fix)

Datum: 2026-11-28. Lane: `m10-tablet-fx-rootcause` (Worktree `/home/ai/games/lf-lanes/m10-tablet-fx-rootcause`,
Branch `m10-tablet-fx-rootcause`). Auftrag: Quelle des Device-Hotspots (Adreno 710, 640x360: 109–120 FPS bis
3 Evos, ab Dornensturm-Kombi 43 FPS, Draws 54/Frame, Blend-Wechsel 4→26/Frame, +1 bindFramebuffer, +1 Programm)
eindeutig benennen und einen Fix-Hebel mit erwarteten Zahlen an `m10-tablet-fx-hotspot` übergeben.
**Keine Änderungen an `src/**` oder `tests/**`.**

Belege (außerhalb des Repos): `~/games/.evidence/m10-tablet-fx-rootcause/rc-local.json`
(Gerät: `rc-device.json`, siehe „Offene Punkte“). Skript: `scripts/m10-tablet-fx-rc.mjs`
(`--mode local|device`, 21 Fenster: Basis + 6 Evo-Einzelstufen + 2 Stapel-Reihenfolgen, je 4 s,
200 wisp, god, 640x360, renderer-String im JSON).

## K1 — GL-Aufruf-Matrix (lokal, iGPU `Mesa Intel(R) Graphics (RPL-S)`, WebGL1/ANGLE)

Auszug (`rc-local.json`; draws = drawArrays+drawElements, blend = blendFunc+blendFuncSeparate, /Frame):

| Fenster | FPS | draws | blend | bufferSubData | bindFramebuffer |
|---|---|---|---|---|---|
| base (nur Glutfunke) | 60,3 | 6 | 4,5 | 5,2 | 0,7 (alle null-FB) |
| single:thorn_storm | 60,3 | 5 | 3,4 | 4,1 | 0,7 |
| single:eternal_winter | 60,3 | 11 | 9,6 | 10,3 | 0,7 |
| stackA +1 thorn_storm | 60,3 | 5 | 4 | 4,9 | 0,7 |
| stackA +2 phoenix | 60,3 | 14 | 13 | 13,6 | 0,7 |
| stackA +3 eternal_winter | 60,3 | 29 | 28 | 28,5 | 0,7 |
| stackA +6 (alle) | 60,3 | 36 | 34,6 | 35,3 | 0,7 |
| stackB +6 (alle, reverse) | 60,3 | 31 | 29 | 30,3 | 0,7 |

Befunde:
1. **Blend-Wechsel skalieren mit der Evo-Anzahl, nicht mit einer bestimmten Evo:** base 4,5 → voller Stapel
   29–35/Frame, in beiden Reihenfolgen. Die „Dornensturm-Kombi“ des Device-Reports ist der Punkt, ab dem der
   Stapel die Schwelle überschreitet (thorn_storm allein ist mit 3,4/Frame unauffällig) — Schwelle, kein
   spezifischer Evo.
2. **draws ≈ blend + 1** in jedem Fenster (36/34,6; 29/28; 6/4,5) und **bufferSubData folgt 1:1**
   (5,2 → 35,3): Jeder Blend-Wechsel ist ein voller Batch-Flush (neuer Draw + neuer Vertex-Upload).
   Die Draws sind fast ausschließlich Flush-Splitter, keine zusätzliche Fülllast.
3. **bindFramebuffer: 0,7/Frame, ausnahmslos null-FB; 0 nicht-null FB-Binds in allen 21 Fenstern.**
   Das ist Phasers `preRender`-Clear-Bind (Phaser 3.90 `WebGLRenderer.js:2670`, `gl.bindFramebuffer(FRAMEBUFFER, null)`).
   Der am Gerät gemeldete „+1 bindFramebuffer/Frame“ ist lokal **nicht reproduzierbar** — auch nicht mit vollem
   Evo-Stapel (Details + Fangvorrichtung unten, „Offene Punkte“).
4. `useProgram` 0/Frame lokal: ein einziges MultiPipeline rendert alles. Das „+1 Shaderprogramm“ am Gerät
   gehört wahrscheinlich zum nicht-null-FB-Pfad (Pipeline-Wechsel), ebenfalls geräteseitig zu verifizieren.

## K2 — Quelle der Blend-Explosion (Datei + Zeile)

**Mechanik (Engine):** Phaser 3.90, `node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:1815–1839`
(`setBlendMode`): beim Rendern jedes Objekts, dessen Blend-Modus vom aktuellen abweicht, ruft Phaser
`this.flush()` + `gl.blendFunc(...)` — d. h. **jede ADD↔NORMAL-Grenze in der depth-sortierten Anzeigeliste
kostet einen vollen Batch-Flush** (Draw-Aufruf + blendFunc + Vertex-Upload). Der Stack-Beleg im JSON
(`blendStacks`) zeigt genau diese Stelle im Build-Bundle.

**Bevölkerung (unsere Szene):** Census im selben Fenster (`stackA:+6`, alle sichtbaren Objekte):
**38 Sprites mit ADD (blend1)** vs. **26 Sprites mit NORMAL (blend0)**, alle aus derselben
`runtime_atlas`-Textur — plus 45 SKIP_CHECK-Objekte (Grafik/Overlays) und Boden-Chunks. Die ADD-Sprites
sind die Glow-Halos des FxSystem, die NORMAL-Sprites sind FX-Formen, Projektile, Gegner, Gems.

**Verantwortliche Code-Pfade (App):**
- `src/systems/FxSystem.ts:323` (spawn), `:226` (Update-Loop), `:667`/`:754` (Partikel): jede FX erhält je
  nach Glow-Budget (`GlowBudget.request()`) **entweder ADD oder NORMAL** — bei volem Budget>Cap fällt sie auf
  NORMAL zurück. Ergebnis: ADD- und NORMAL-Sprites *derselben Effekt-Familie* existieren gleichzeitig.
- `src/gfx/depth.ts:6–14` (verbindliche Ordnung): trail 6 < fxLow 7 < death 8 < enemy 9 < … < enemyShot 14.
  ADD-Glows sitzen auf `DEPTH.fxLow` (7) **mitten zwischen** NORMAL-Draws (Gems 5, Gegner 9, Projektile 14).
  Die Render-Walk-Reihenfolge ist dadurch zwangsläufig gemischt → ~1 Flush pro Grenze, gemessen 29–35/Frame.
- `src/systems/CombatSystem.ts:1092–1106`: Dornensturm spawnt 12 Projektile mit `trailInterval 0,05`
  (≈ 240 FX/s) + 16 Partikel/Schuss + Krone — das ist der Nachschub, der die Population groß hält. Daher
  korreliert die Sichtbarkeit von thorn_storm im Stapel mit der Schwelle, obwohl seine eigenen
  Einzel-Messwerte klein sind (3,4/Frame).
- `src/scenes/Run.ts:351` (+ `GroundRenderer.ts:512/816`): weitere permanente ADD-Sprites (Lichtkreis,
  Laternen-Glows) — klein, aber Teil der Grenzen.

**Wichtige Korrektur zum Device-Report:** `setSuppressFx(true)` wirkt **nur auf Ereignis-FX**
(`src/scenes/Run.ts:1923–1925`, `suppressEventFx` — Level-up-Säule etc.), **nicht** auf Waffen-/FxSystem-FX.
Der frühere Probe „setSuppressFx ändert nichts → nicht die FxSystem-Sprites“ ist damit **inkonklusiv**; die
FxSystem-Sprites sind nach dieser Messung sehr wohl der Haupttäter (Blend-Grenzen).

**Framebuffer-Wechsel:** lokal 0 nicht-null FB-Binds in allen Fenstern (auch voller Stapel). Der am Gerät
gesehene „+1/Frame“ kann mit dem lokalen Befund nicht erklärt werden; src/** nutzt keine RenderTexture/
Pipeline/PostFX (grep-leer). Siehe „Offene Punkte“.

## K3 — Fix-Empfehlung (für m10-tablet-fx-hotspot)

**Hebel: Blend-Kontinuität in der Render-Walk-Reihenfolge — nicht weniger FX, sondern zusammenhängende
Blend-Blöcke.** Konkret (eine der zwei Varianten, V1 bevorzugt):
- **V1 (klein, lenkend):** Alle ADD-Glow-Sprites des FxSystem in einen **zusammenhängenden Depth-Band**
  zeichnen, z. B. alle Glow-Sprites auf `DEPTH.fxLow + 0.1`-Band oberhalb der NORMAL-FX-Bänder (oder ein
  zweiter Sprites-Layer), sodass der Walk alle NORMAL-FX/Gegner/Projektile zuerst und alle ADD-Glows in
  einem Block rendert. Kollision mit der GAME.md-Ordnung (Spieler-VFX < Gegner) prüfen: Glows sind additive
  Lichter, Lesbarkeitsrisiko gering (sie liegen heute teils schon über/unter Gegnern).
- **V2 (robust):** Auf dem Device-LOD-Pfad (die Lane `m10-android-scale-floor` verdrahtet gerade
  Qualitätsstufen an den ADD-Caps in `FxSystem.ts:226/323/667/754`) die Glow-Promotion ganz auslassen —
  alle FX NORMAL. Verliert additive Glühen, aber garantiert 2 Blend-Zustände gesamt.

**Erwartung in Zahlen** (aus K1; Phasers Flush-Kosten pro Grenze sind rendererunabhängig):
- Blend-Wechsel/Frame: 26–35 → **< 8** (Ziel: Grund-Grenzen Boden/Gems/Licht/UI ≈ 3–5,Stretch < 8).
- Draws/Frame: 36 (lokal, voller Stapel) bzw. 54 (Gerät) → **~10–14** (−60 bis −75 %); bufferSubData sinkt
  entsprechend (35,3 → ~8/Frame).
- FPS am Gerät (Adreno 710, 43 → ): Gerät lief mit ≤ 3 Evos und blend ≈ 10–13 bei 109–120 FPS. Da CPU 65 %
  idle war und die Flush-Zerlegung die Draw-Zahl pro Frame annähernd halbiert, wird **≥ 90 FPS** im
  Dornensturm-Kombi-Fenster erwartet; Akzeptanzschwelle für den Fix-Job: **Blend < 8/Frame, 0 nicht-null
  FB-Wechsel, FPS ≥ 90** am Gerät im selben Szenario (640x360, 200+ Gegner, Kombi).
- Lokaler Korridor zur Verifikation des Fixs ohne Gerät: `scripts/m10-tablet-fx-rc.mjs --mode local`,
  Fenster `stackA:+6` — blend ≤ 8, draws ≤ 14 (vorher 34,6/36).

## Offene Punkte (ehrlich)

1. **Gerät offline:** Die Bridge `http://172.17.0.1:5181/status` antwortet, aber adb meldet
   `device '10.10.40.27:35099' not found` (letzte Device-Belege 09:35Z, `~/games/.evidence/device/`).
   Der Geräte-Lauf ist vorbereitet und braucht nach dem Wiederverbinden nur:
   `node scripts/m10-tablet-fx-rc.mjs --mode device --out ~/games/.evidence/m10-tablet-fx-rootcause/rc-device.json`
   Das Skript fängt u. a. **nicht-null-FB-Stacks** (`fbStacks`, `fbNonNullPerFrame`) — damit ist die Quelle
   des „+1 bindFramebuffer/Frame“ und „+1 Shaderprogramm“ mit Datei+Zeile belegt.
2. Arbeitshypothese bis dahin: Der FB-Bind am Gerät kommt aus einem Pfad, der lokal nicht greift
   (CanvasTexture-Update/Readback bei Chunk-Generierung während des Laufs oder Chrome-Android-Sonderweg).
   Lokal ausgeschlossen: PostFX/Pipelines/RenderTexture im Spielcode (grep-leer) und der Evo-Stapel selbst
   (0 nicht-null FB-Binds in 21 Fenstern inkl. vollem Stapel).
3. Lokale FPS sagen nichts über das Gerät aus (iGPU rendert 60,3 = VSync-Cap); die K1-Matrix ist bewusst
   als GL-Aufruf-Zählung (rendererunabhängig) gebaut, nicht als FPS-Vergleich.
