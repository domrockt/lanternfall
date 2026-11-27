# Lane m10-boot-startup — Kaltstart bis Titel (Bedarf: m10-android-perf, 2026-11-27)

**Ziel:** Startzeit bis Titel-Szene messen und den kritischen Pfad verkürzen. Ziel des
Bedarfs: < 5 s auf einem echten ARM-Gerät — **Gerätemessung bleibt Vera-Eskalation**
(offener Punkt, siehe unten). Keine Gameplay-/Grafikinhalte geändert.

## K1 — Messbasis

Skript: `scripts/m10-boot-startup.mjs` (Playwright, frischer Browser-Context je Lauf =
kalter Cache, kein flock — kein FPS-Langlauf). Gemessen: `navigationStart → erstes
gerendertes Titel-Frame` (`window.__bootTimings.titleRendered`, siehe K2 zur Metrik),
Texturen bis dahin, JS-Fehler.

Erste Messung (K1-Stand, State-Poll-Metrik, 498 Texturen, 0 Fehler):
avg 987 ms, max 1225 ms. Bezug zur Bedarfsmeldung (1,36–1,77 s bei 445 Texturen):
schnelleres Desktop-Env, mehr Texturen (498 — Stand nach m10-death-fx-frames),
gleiches Muster.

## K2 — Diagnose (Phasen-Messung)

Instrumentierung in `src/scenes/Boot.ts` (`window.__bootTimings`, 3 Läufe):

| Phase | Lauf 1 | Lauf 2 | Lauf 3 |
|---|---|---|---|
| preload (SFX laden + Lade-Text) | 40 ms | 9 ms | 9 ms |
| **createAllTextures (498 Texturen)** | **682 ms** | **559 ms** | **533 ms** |
| buildRuntimeAtlas | 22 ms | 9 ms | 11 ms |
| initAudio | 0 ms | 0 ms | 0 ms |
| gesamt bis titleStart | 1209 ms | 783 ms | 769 ms |

→ ~70 % der Boot-Zeit ist prozedurale Textur-Generierung; die Titel-Szene braucht im
`create()` davon nur einen Bruchteil. Gegner/Bosse/FX/Icons/Projektile sind im Titel
nicht sichtbar. Messskript-Drift entdeckt und behoben: ein State-Poll ("Szene aktiv")
löst im Nachher-Lauf erst nach dem Warmup-Makrotask aus und verschluckt den Gewinn —
deshalb misst das Skript jetzt `titleRendered` (erstes gerendertes Titel-Frame) und die
Baseline wurde mit demselben Skript neu gemessen (`shots/m10-boot-startup-baseline.json`,
Daten vom K1-Code-Stand `c1b2906`).

**Fix (K2, Commit `c4076c1`):**
- `Boot.create()` erzeugt nur noch die Titel-kritischen Texturen (`createTitleTextures`:
  alle `GEN_TITLE`-Keys + `ui_frame`/`title_logo` aus `GEN_UI` + `light_radius` +
  `vignette`) und startet die Titel-Szene sofort — **13 Texturen statt 498** im
  kritischen Pfad. Font-Glyphen erzeugt PixelText weiter lazy.
- Der Rest wird als **Warmup** nachgezogen: `createAllTextures` erneut aufrufen — alle
  Creator sind idempotent (`textures.exists`-Guards), es entstehen nur fehlende Texturen.
  Danach `buildRuntimeAtlas` → der **Atlas-Key-Vertrag hält**: heiße Klassen
  (`enemy_/boss_/gem_/fx_/...`) sind gepackt, sobald ein Run startet.
- Warmup läuft bewusst **hinter dem ersten gerenderten Titel-Frame**: Das CREATE-Event
  der Title-Szene feuert noch vor dem Rendern (Phaser-Quelle, SceneManager.create
  emittiert synchron am Ende von scene.create), deshalb Verschiebung um einen Makro-Task
  nach CREATE. Zwei Häppchen mit `setTimeout(0)` (Texturen, dann Atlas), damit der Titel
  zwischen den Blöcken eingabefähig bleibt. warmStart liegt ~66-83 ms nach titleStart.
- Caching entfällt bewusst: Texturen leben im game-weiten TextureManager und überleben
  Szenenwechsel; es gibt in einer Session keinen zweiten Generierungskosten-Anfall.

**Fremd-Datei-Anfrage (Disponent):** `src/gfx/textures.ts` ist Claim der Lane
m10-atlas-pack. Angefragt: 2 Zeilen (`export` vor `createLightTexture`/
`createVignetteTexture`, beide bereits idempotent), siehe
`.dispatch/requests.md` 2026-11-27T20:06Z. Bis zur Freigabe erzeugt `Boot.ts` beide
Texturen lokal (1:1-Kopie, idempotent, kein Doppel-/Konfliktfall mit dem Warmup);
bei Freigabe Import ziehen und Kopie löschen.

## K3 — Vorher/Nachher (Metrik `titleRendered`, je 3 Läufe, kalter Cache)

| | avg | max | Texturen bis Titel gerendert |
|---|---|---|---|
| Vorher (K1-Code, `c1b2906`) | 1025 ms | 1263 ms | 498 |
| Nachher (K2-Code, `c4076c1`) | **497 ms** | **697 ms** | **13** |
| **Delta** | **−52 %** | **−45 %** | −97 % |

Belege: `shots/m10-boot-startup-baseline.json` (Vorher, K1-Code-Stand),
`shots/m10-boot-startup-after.json` + `shots/m10-boot-startup-after.png` (Nachher).
Warmup-Nachprobe in jedem Lauf: nach 800 ms sind alle 498 Texturen erzeugt und
`runtime_atlas` existiert; 0 JS-Fehler in allen Läufen.

Titel-Sichtprüfung: `shots/m10-boot-startup-after.png` vs. Baseline — pixelidentisch
bis auf die Animationsphase der pulsierenden Mond-Glow-Ringe (`compare -metric AE`
16588 px = ausschließlich der Glow oben rechts, kein Missing-Texture-Fall; der
erste Nachher-Lauf mit fehlendem `title_logo` wurde über den Screenshot gefunden und
gefixt — dafür existiert `TITLE_UI_KEYS` in `Boot.ts`).

Build + Tests: `npm run build` grün, `npx vitest run` 53 Dateien / 534 Tests grün
(Stand K2-Commit).

## Grenzen / offene Punkte

- **Gerätemessung fehlt:** Alle Zahlen stammen aus Desktop-Playwright-Läufen
  (Chrome/WebKit-Desktop). Ob < 5 s auf dem echten ARM-Gerät erreicht ist, bleibt
  die **Vera-Eskalation**. Die relative Verbesserung (−52 %) und die Pfad-Verkürzung
  (13 Texturen statt 498 im kritischen Pfad) übertragen sich, die absolute Zahl nicht.
- Erst-Lauf-Ausreißer (Browserstart, JIT) ist in avg/max enthalten — bewusst, weil
  Kaltstart genau das Thema ist.
- Kurzes Fenster zwischen dem ersten Titel-Frame und `warmTexturesDone` (~0,5 s):
  Startet ein Nutzer in diesem Fenster den Run, existieren die Run-Texturen
  (`enemy_`/`gem_`/Icons/...) noch nicht — Phaser würde `__MISSING` rendern
  (`applyTexture`/`makeImage` wählen nur Atlas-vs-Original-Key, sie erzeugen keine
  Texturen). Real unerreichbar (Eingabe braucht deutlich länger; der Warmup ist nach
  ~2 Makro-Tasks fertig), aber der Fall ist hier explizit benannt.
- textures.ts-Export (2 Zeilen) läuft noch beim Disponenten; bis dahin lokale
  Licht/Vignette-Kopie in `Boot.ts` (idempotent, mit Verweis auf die Anfrage).
