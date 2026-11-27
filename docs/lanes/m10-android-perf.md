# Lane m10-android-perf — Android/ARM-Tauglichkeit (Mali/Adreno, WebView)

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-android-perf`, Branch `m10-android-perf`.
Ziel: Lanternfall im Android-WebView (Mali/Adreno, Chrome-WebView, Phaser 3.90) messbar machen:
Draw-Calls/Texturwechsel, Texturgrößen, Vollbild-Overlays, preFX/postFX, Canvas-Auflösung,
Startzeit – plus 60-FPS-Grenze und Debug-Report der WebGL-Kontextdaten.

Grundlage: `~/games/coding-brain/Wissen/Android-ARM-Performance.md`
(Tile-Rendering: Füllrate/Overdraw und Framebuffer-/Texturwechsel sind teuer; Mobile Pipeline
auf Android hat nur **eine** Textureinheit → jeder Texturwechsel = neuer Draw-Call).

Messaufruf (kein flock, da keine FPS-Echtzeit-Abnahme der Desktop-Perf):

```
node scripts/android-audit.mjs            # baut dist/ bei Bedarf neu
node scripts/android-audit.mjs --no-build # nur messen
```

## K1 — Audit-Skript und Ist-Messung (`scripts/android-audit.mjs`)

Playwright-Chromium mit **Pixel-7-Profil** (915×412 CSS, dpr 2, Touch, Android-UA) und
CDP `Emulation.setCPUThrottlingRate 4`. Ein `addInitScript` wrappt vor dem Spielstart
`drawArrays/drawElements/drawArraysInstanced/drawElementsInstanced` sowie `bindTexture`
(Texturwechsel = Wechsel der zuletzt gebundenen Textur) und zählt pro Frame.
Gemessen wird 3 s auf dem Titel und 5 s im Run mit gehaltenen **298 Gegnern**.

| Messpunkt | Wert | Befund |
|---|---|---|
| GL-Renderer (Emulation) | ANGLE / SwiftShader Subzero | nur Emulations-Hinweis, **keine** echte Mali/Adreno-Aussage |
| WebGL-Kontext | WebGL 1.0 (OpenGL ES 2.0) | Phaser.AUTO wählt WebGL1 in dieser Emulation |
| MAX_TEXTURE_SIZE | 8192 | ok; Laufzeit-Log ist Pflicht (K2) |
| Extensions | 35 | u. a. `ANGLE_instanced_arrays`, `OES_element_index_uint`, `WEBGL_compressed_texture_etc/astc`, `WEBGL_debug_renderer_info` |
| Texturen gesamt | 581 | davon 445 beim Titel, Rest Chunks/Fog im Run |
| größte Textur | `runtime_atlas` 1024×396 (252 Frames) | ≤ 2048, **keine** Textur > 2048 px |
| Textur-Pixel / ca. VRAM | 2.836.185 px / ~11 MiB | unkomprimiert RGBA geschätzt |
| Canvas-Attribut vs. logisch | 860×360 vs. 860×360 | **ok**: rendert logisch, CSS skaliert auf 1720×720 Gerätepixel |
| Titel Draws/Frame | 364,7 | 181 Frames, 60,3 FPS @ Throttle 4 |
| Titel Texturwechsel/Frame | 368,1 | Wechsel ≈ Draw-Calls |
| Run Draws/Frame (298 Gegner) | 488,6 (p95 648, max 648) | steigt mit Gegnerzahl |
| Run Texturwechsel/Frame | 488,3 (max 784) | **Befund: fast 1:1 zu Draw-Calls → kein Atlast-Batching** |
| Run FPS @ CPU-Throttle 4 | 45,8 | Emulation, nicht Gerätewert |
| Objekte mit Alpha<1 oder ADD | 559 | überwiegend kleine Glows/Partikel |
| Vollbild-Overlays davon | 1 (`vignette`, 100 %, NORMAL, Alpha 0,90) | niedrige Severity; kein Vollbild-ADD |
| preFX/postFX-Objekte | 0 / 0 | ok, keine Shader-Pässe pro Sprite |
| Shader-Programme | 31 | plausibel für Phaser-Pipelines + FX |
| Startzeit bis Titel | 1.356 ms | „gut“ auf Desktop; auf ARM ~3–5× prüfen |

Rohdaten: `shots/m10-android-audit.json`, Sichtbeleg `shots/m10-android-pixel7-run.png`.
0 JS-Fehler im Messlauf (`jsErrors: []`), `passed: true`.

### Wichtigste Befunde

1. **Batching ist der Hebel:** Texturwechsel/Frame ≈ Draw-Calls/Frame (488 bei 298 Gegnern,
   368 auf dem Titel). Die Mobile Pipeline auf Android kann nur eine Textureinheit binden;
   jede andere Textur = neuer Draw-Call. Welt-Sprites (Gegner, Projektile, FX, Gems, Props)
   müssen in **wenige Atlanten ≤ 2048×2048**; `runtime_atlas` deckt nur 252 Frames ab.
2. **Keine Textur > 2048 px** (`maxEdge 1024`) – die harte ARM-Grenze ist aktuell eingehalten.
   `MAX_TEXTURE_SIZE` des Geräts wird ab K2 im Debug-Report geloggt.
3. **Canvas-Auflösung korrekt:** 860×360 logisch, 1720×720 Gerätepixel nur per CSS
   (`pixelated`), kein Rendern in Gerätepixeln.
4. **Overlays:** genau ein echtes Vollbild-Overlay (`vignette`, NORMAL, Alpha 0,90). Nebel/Glow
   sind kleine Sprites; kein Vollbild-ADD. Trotzdem Füllrate im Blick behalten.
5. **Kein preFX/postFX** pro Sprite → kein zusätzlicher Framebuffer-Wechsel pro Objekt.
6. **Startzeit 1,36 s** bis Titel (445 Texturen). Auf ARM realistisch 4–7 s; Messung auf
   echtem Gerät per chrome://inspect steht aus (K3, Bitte an Vera/APK-Debug).

### Grenzen der Messung

- SwiftShader/ANGLE in headless Chromium ist **keine** Mali/Adreno-GPU: absolute FPS und
  Füllraten sind nicht übertragbar, wohl aber Draw-Call-/Texturwechsel-Zahlen und Texturgrößen.
- CPU-Throttle 4 simuliert ARM-Mittelklasse nur grob; JS-Startzeit und GC-Verhalten auf
  echtem Gerät bleiben offen (Thermik/WebView-Version).

## K2 — Mobile Konfiguration und Debug-Report (`src/main.ts`, `src/debug.ts`)

Umgesetzt in `src/main.ts`:

- `fps: { target: 60, limit: 60 }` → Phaser-TimeStep begrenzt auf **60 FPS**; verhindert
  unnötige 90/120-Hz-Frames auf Android (Wärme/Akku, thermische Drosselung).
- `powerPreference: "high-performance"` als **Top-Level-GameConfig** (Phaser 3.90 liest den
  Wert dort, nicht unter `render`).
- Präzision: Phaser-Built-in-Shader (MultiPipeline/FX) sind bereits `mediump`; wir haben keine
  eigenen Shader. Damit ist „mediump wo Phaser das erlaubt“ erfüllt, ohne Config-Hack.
  Der Report loggt die tatsächlich verfügbaren `getShaderPrecisionFormat`-Werte.

Debug-Report `window.__lf.rendererInfo()` (Snapshot zusätzlich in Registry `lf-render-info`
beim `READY`-Event) enthält:

| Feld | Messwert im Pixel-7-Lauf |
|---|---|
| `context` | `webgl1` (WebGL 1.0 / OpenGL ES 2.0, SwiftShader-Emulation) |
| `version` / `shadingLanguage` | `WebGL 1.0 (OpenGL ES 2.0 Chromium)` / GLSL ES 1.0 |
| `maxTextureSize` | **8192** |
| `maxTextureImageUnits` | 8 |
| `extensions` | 35 (u. a. `ANGLE_instanced_arrays`, `OES_element_index_uint`, `WEBGL_compressed_texture_etc/astc`) |
| `contextAttributes.powerPreference` | **high-performance** (angefordert und vom Kontext übernommen) |
| `precision.fragmentMediump` / `fragmentHighp` | 10 Bit / 23 Bit Mantisse (mediump reicht für Pixel-Art) |
| `fps.target / limit / cappedAt60` | 60 / 60 / **true** |
| `canvas` | 860×360 Attribut = logisch; `rendersDevicePixels: false` |
| `textures` | 581, maxEdge 1024, `oversized: []` |

Nachweis: `shots/m10-android-audit.json` (`fpsCapActive: true`, `passed: true`, 0 JS-Fehler),
Titel FPS 60,1 @ Throttle 4, Run mit 298 Gegnern 31,8–45,8 FPS (Host-Streuung, Emulation).
`tests/mobile-config.test.ts` prüft den statischen Config-Vertrag (fps 60/60,
high-performance, MAX_TEXTURE_SIZE/Extensions im Report) und die Audit-Helfer (Texturen >2048,
Vollbild-Alpha/ADD, Perzentile).
