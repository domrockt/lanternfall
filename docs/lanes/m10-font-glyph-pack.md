# M10 Lane: font-glyph-pack — Glyphen in den Baked-Atlas (2026-11-27)

Branch: `m10-font-glyph-pack` (Worktree `/home/ai/games/lf-lanes/m10-font-glyph-pack`)
Briefing: `.briefs/m10-font-glyph-pack.md` (aus Bedarfsmeldung m10-atlas-pack, 2026-11-27T18:40Z)

## Problem

`ensureGlyph` (src/gfx/font.ts) legte vor m10-atlas-pack für jede Glyphe eine
EIGENE Canvas-Textur an (`scene.textures.addCanvas(key, canvas)`). ~250
Glyph-Einzeltexturen = ~250 GL-Texturen → jeder HUD-/Damage-Text-Draw mit
wechselnden Glyph-Keys erzwang Texturwechsel/Flushes im WebGL-Batcher.

## Ergebnis

**K1 — `ensureGlyph` packt Glyphen in den Baked-Atlas: bereits durch Merge
`5fa1c87` (m10-atlas-pack, „Font-Integration") auf dem Branch.** Der Lane-Plan
sah diese Änderung als eigene Karte vor; sie wurde mit dem Atlas-Merge
ausgeliefert (`packCanvasTexture` aus src/gfx/bakeAtlas.ts, Import in font.ts).
Diese Lane liefert die vorgesehenen Nachweise:

- `tests/font-glyph-pack.test.ts` (neu, 5 Tests) belegt:
  1. Glyph-Keys werden als `__BASE`-Frames auf EINER geteilten inkrementellen
     Atlas-Seite registriert; `addCanvas` nur für die Seite selbst
     (`calls.addCanvas == ["baked_page_0"]`).
  2. Pro Glyphe entsteht KEINE neue Canvas-Textur (Wiederverwendung:
     `canvases.length` und `calls.create.length` konstant über `setText`
     mit bereits existierenden Zeichen).
  3. Glyph-Geometrie bit-identisch zur alten addCanvas-Erzeugung
     (5x7-Canvas, `fillStyle = "#"+PAL[color].hex`, exakt dieselbe
     fillRect-Menge in derselben Reihenfolge — Vergleich gegen
     `git show bd779f5:src/gfx/font.ts`).
  4. Key-Schema `glyph_<color>_<charCode>`, `GLYPH_W=5 / GLYPH_H=7 /
     GLYPH_ADVANCE=6`, `PixelText.textWidth` — unverändert.
- Kontrolleur test-auditor: **PASS** (vitest 5/5, `npx tsc --noEmit` rc=0,
  Mock-ABI geprüft gegen `packCanvasTexture`, bakeAtlas.ts:112ff).
- Commit: `9000a09` (`#5498`).

**K2 — Vor/Nach-Screenshots (AE=0) + Texturwechsel-Zahlen.**

Methode (deterministisch, kein Echtzeit-Run): Shot-Skript
`~/tmp/m10-font-glyph-pack/font-shots.mjs` (wg. Disponent-Claims nicht
committet; Kern: `scripts/harness.mjs` ensureBuild/startServer/Playwright,
`?debug=1&seed=1`, Real-Scenes `title/charselect/run/ui` stoppen, neue Szene
`font_compare` mit 14 `PixelText`-Zeilen — HUD-Strings „HP 12/88", „LP 88",
„00:01", „aü9?" und Damage-Text „12", „225", „KRIT!", „1 050" … in 4
Palettenfarben —, Screenshot + Textur-Report als JSON).

| Messung | vor (addCanvas) | nach (packCanvasTexture) |
|---|---|---|
| `glyph_*`-Textur-Keys | 131 | 43 |
| GL-Texturen für Glyphen | 131 (je 1 pro 5x7-Canvas) | 1 (alle Keys teilen die GL-Textur der 512x512-Seite `baked_page_0`, `__BASE`-Frame = Zelle; bakeAtlas.ts `registerBaked`) |
| `baked_page_0` | 2048x94 (statischer Bake der Sprite-Gruppen) | 512x512 (inkrementelle Seite, Glyphen live eingepackt) |
| Renderer | WebGL (type 2) | WebGL (type 2) |
| JS-Fehler | 0 | 0 |

Belege im Repo:
- `shots/m10-font-glyph-before.png` / `-after.png` — **pixelidentisch,
  `compare -metric AE` = 0** (ImageMagick 7; Kontrollprobe before-vs-before
  ebenfalls 0).
- `shots/m10-font-glyph-before.json` / `-after.json` — Texturzahlen, Renderer,
  JS-Fehler, `window.__lfText`-Zähler.

Damit ist das Abnahmekriterium erfüllt: **0 neue Einzel-Glyph-Texturen pro
Frame** (Laufzeit-Glyphen landen als Frames auf der geteilten Seite; die
Textur bleibt eine GL-Textur pro Seite → HUD-/Damage-Text kann batchen),
**HUD-/Damage-Text pixelidentisch (AE=0)**.

## Kleine Ergänzung in font.ts (K2)

`window.__lfFont = { PixelText }` (Dateiende, nach der Klassendeklaration,
nur im Browser) — für Mess-/Shot-Skripte, analog zum bestehenden
`window.__lfText`. Kein Verhalten im Spiel geändert.

## Offene Punkte

- Keine. Der Shot-Skript-Quelltext liegt unter `~/tmp/m10-font-glyph-pack/`
  (Disponent-Claim `scripts/*` gehört dieser Lane nicht); bei Bedarf kann er
  als Karte später nach `scripts/` übernommen werden.
- `m10-ui-cost.mjs` (Texturwechsel-Zähler) bleibt unberührt (Claim
  m10-flock-timeout).
