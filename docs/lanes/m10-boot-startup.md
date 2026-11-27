# Lane m10-boot-startup — Kaltstart bis Titel (Bedarf: m10-android-perf, 2026-11-27)

**Ziel:** Startzeit bis Titel-Szene messen, kritischen Pfad verkürzen (Ziel < 5 s auf ARM,
Gerätemessung bleibt Vera-Eskalation → offener Punkt, siehe unten).

## K1 — Messbasis

Skript: `scripts/m10-boot-startup.mjs` (Playwright, frischer Browser-Context je Lauf =
kalter Cache, kein flock — kein FPS-Langlauf). Gemessen: `navigationStart → Titel-Szene
aktiv` (`window.__lf.state().scene === "title"`), Texturen bis dahin, JS-Fehler.

**Baseline** (`shots/m10-boot-startup-baseline.json`, 3 Läufe):

| Lauf | Titel sichtbar | Texturen | JS-Fehler |
|---|---|---|---|
| 1 | 1225 ms | 498 | 0 |
| 2 | 863 ms | 498 | 0 |
| 3 | 873 ms | 498 | 0 |
| **avg / max** | **987 / 1225 ms** | 498 | 0 |

Bezug der Bedarfsmeldung (1,36–1,77 s bei 445 Texturen): schnelleres Desktop-Env,
mehr Texturen (498 — Stand nach m10-death-fx-frames), gleiches Muster.

## K2 — Diagnose (Phasen-Messung)

Instrumentierung in `src/scenes/Boot.ts` (`window.__bootTimings`, 3 Läufe):

| Phase | Lauf 1 | Lauf 2 | Lauf 3 |
|---|---|---|---|
| preload (SFX laden + Lade-Text) | 40 ms | 9 ms | 9 ms |
| **createAllTextures (498 Texturen)** | **682 ms** | **559 ms** | **533 ms** |
| buildRuntimeAtlas | 22 ms | 9 ms | 11 ms |
| initAudio | 0 ms | 0 ms | 0 ms |
| gesamt bis titleStart | 1209 ms | 783 ms | 769 ms |

→ ~70 % der Boot-Zeit ist prozedurale Textur-Generierung, davon braucht die
Titel-Szene im `create()` nur einen Bruchteil (Titelbild, Menü-Rahmen,
`light_radius`, `vignette`, lazy Font-Glyphen). Gegner/Bosse/FX/Icons/Projektile
sind im Titel nicht sichtbar.

**Fix (K2):**
- `Boot.create()` erzeugt nur noch die Titel-kritischen Texturen
  (`createTitleTextures`) und startet die Titel-Szene sofort.
- Der Rest wird als **Warmup** nachgezogen: `createAllTextures` erneut aufrufen —
  alle Creator sind idempotent (`textures.exists`-Guards), es entstehen nur noch
  fehlende Texturen. Danach `buildRuntimeAtlas` → der **Atlas-Key-Vertrag hält**:
  heiße Klassen (`enemy_/boss_/gem_/fx_/...`) sind gepackt, sobald ein Run startet.
- Warmup läuft bewusst **hinter dem ersten gerenderten Titel-Frame** (CREATE-Event
  der Title-Szene feuert noch vor dem Rendern → Verschiebung um einen Makro-Task),
  in 2 Häppchen mit `setTimeout(0)`, damit der Titel zwischen den Blöcken
  eingabefähig bleibt.
- Keine Gameplay-/Grafikinhalte geändert; Atlas-Packing unverändert.

**Fremd-Datei-Anfrage (Disponent):** `src/gfx/textures.ts` brauchte 2 Zeilen
(`export` vor `createLightTexture`/`createVignetteTexture`, beide bereits
idempotent). Begründung in `.dispatch/requests.md`, 2026-11-27T20:15Z.
Status: [wird beim Abschluss aktualisiert]

## K3 — Nachher

[wird ausgefüllt]

## Grenzen / offene Punkte

- **Gerätemessung fehlt:** Alle Zahlen stammen aus dem Desktop-Playwright-Lauf.
  Ob das Ziel < 5 s auf echtem ARM-Gerät erreicht ist, bleibt die
  **Vera-Eskalation** (Geräte-Lauf). Relative Verbesserung überträgt, absolute
  Zahl nicht.
- Lauf-1-Ausreißer (erster Lauf nach Browserstart) ist in avg/max enthalten —
  bewusst, weil Kaltstart gerade das Thema ist.
- Der Warmup erzeugt Texturen nach dem Titel: Es gibt ein kurzes Fenster, in dem
  der Titel angezeigt ist, aber der Atlas noch nicht gebaut ist. Startet ein
  Nutzer den Run in diesem Fenster, rendert Phaser über die Original-Texturen
  (Fallback in `applyTexture`/`makeImage`) — korrekt, nur unkompaktiert. In der
  Praxis ist der Warmup nach 2 Makro-Tasks fertig, lange vor jeder Navigation.
