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

## K3 — Befunde für andere Dateien (Fix-Empfehlungen, NICHT selbst geändert)

Messstreuung auf dem geteilten Host: Run-FPS 31,8–45,8, Draws/Frame 382,9–498,8 bei 298 Gegnern,
Titel-Draws 288,9–364,7. Die Relation **Texturwechsel ≈ Draw-Calls** war in allen Läufen stabil
und ist der eigentliche ARM-Befund. Desktop-`perf` bleibt unverändert grün (siehe unten).

| # | Befund | Datei(en) | Fix-Empfehlung | Erwartete Wirkung |
|---|---|---|---|---|
| A1 | Texturwechsel/Frame ≈ Draw-Calls (488/489 bei 298 Gegnern) → Mobile Pipeline bindet pro Draw neu | `src/gfx/textures.ts`, `src/gfx/enemySprites.ts`, `src/gfx/gen-fx.ts`, `src/gfx/GroundRenderer.ts`, `src/gfx/atlas.ts` | Welt-Sprites (30 Gegner, Projektile, FX, Gems, Props) in **wenige Atlanten ≤ 2048×2048** packen (2–3 Atlanten à 2048), `runtime_atlas` erweitern; Frame-Keys stabil halten | Draw-Calls pro Frame von ~490 auf **< 120**; Mali/Adreno spart pro Texturwechsel einen Batch-/Framebuffer-Aufwand |
| A2 | 581 Phaser-Texturen, viele kleine Einzel-Canvas-Texturen (445 beim Titel) | `src/gfx/textures.ts`, `src/gfx/gen-*.ts` | Beim Boot generierte Sprites in Atlas-Seiten rendern statt je `generateTexture`; unveränderte Keys/Frames | Weniger Texture-Uploads/Bindings, kleinere VRAM-Streuung; Startzeit sinkt |
| A3 | Vollbild-Overlay `vignette` (100 %, NORMAL, Alpha 0,90) plus Nebel-/Glow-Sprites | `src/scenes/Run.ts` (Ambient/Vignette), `src/gfx/textures.ts` | Nur **eine** Vollbild-Ebene zulassen; Nebel als kleine, gecappte Sprites; kein zusätzliches Vollbild-ADD | Füllrate/Overdraw sinkt auf Tile-GPUs; keine Änderung an Gameplay |
| A4 | 559 Objekte mit Alpha<1 oder ADD (überwiegend kleine Glows/Partikel) | `src/systems/FxSystem.ts` | ADD-Partikel klein halten und über bestehende LOD-Caps zählen; keine neuen bildschirmfüllenden ADD-Effekte | Füllrate bleibt beherrschbar; Lesbarkeit unverändert |
| A5 | Startzeit bis Titel 1,36–1,77 s (Desktop, 445 Texturen) | `src/gfx/textures.ts`, `src/scenes/Boot.ts` | Auf echtem Gerät messen (chrome://inspect); bei >5 s Atlas vorbacken oder Texturen cachen | Kaltstart auf ARM verkürzen |
| A6 | Keine Textur > 2048 px (maxEdge 1024) – Ziel eingehalten | – | Beim Atlas-Pack (A1) harte 2048er-Grenze je Seite einhalten und im Audit erneut prüfen | Verhindert schwarze/gestauchte Flächen auf Mali/Adreno |

**APK-Debug-Variante (Bitte an Vera, nicht in diesem Repo):** Debug-Build mit
`WebView.setWebContentsDebuggingEnabled(true)`, `android:hardwareAccelerated="true"` und
chrome://inspect über USB/ADB, damit WebGL-Kontext, Extensions, MAX_TEXTURE_SIZE und
Thermik-FPS auf echtem Mali/Adreno gemessen werden können. Details in
`/home/ai/games/.dispatch/requests.md`.

## Desktop-Regression `npm run perf` (flock)

```
flock /home/ai/games/.lf-perf.lock npm run perf -- --out shots/m10-android-desktop-perf.json
```

| Messung | FPS | Frames | worstFrameMs | Bewertung |
|---|---|---|---|---|
| Burst 500 Gegner, 10 s | **60,1** | 601 | 16,8 | ≥ 55, kein Rückschritt (vorher 55–58) |
| Minute 25 (300 Gegner + Evolutionen) | **60,0** | 601 | 33,3 | ≥ 55 |

0 JS-Fehler, `passed: true` (`shots/m10-android-desktop-perf.json`).
Mobile Konfiguration (`fps.limit 60`, `powerPreference`) kostet auf Desktop keine FPS.

## Offene Punkte

- Echte Mali/Adreno-/WebView-Messung fehlt (nur SwiftShader-Emulation, CPU-Throttle 4).
  APK-Debug-Build + chrome://inspect ist als Bitte an Vera in `requests.md`.
- Atlas-Pack (A1/A2) und Overlay-/FX-Reduktion (A3/A4) sind **fremde Dateien**; Dora macht
  daraus Jobs, dieser Lane-Worktree ändert sie nicht.
- Startzeit auf ARM ist ungemessen; Desktop-Wert 1,36–1,77 s dient nur als Untergrenze.
