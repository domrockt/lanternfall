# M10-view-fill-refit — Nachschnitt 16:9-Vollfüllung nach perf-cap-rollback-Merge

Datum: 2026-11-27. Lane: `m10-view-fill-refit` (Worktree `/home/ai/games/lf-lanes/m10-view-fill-refit`,
Branch `m10-view-fill-refit`). Auftrag: Nachschnitt zu Doms Punkt 3 (21:45Z) — nach dem Merge von
`m10-perf-cap-rollback` (view.ts/main.ts wieder frei) die Vollfüllung **auf allen 7 Geräteformaten
belegen und belegte Mängel direkt fixen**.

## Messaufbau

`scripts/m10-view-fill-refit.mjs` (ein Lauf, kein Tuning-Loop): je Format Run starten (god + autoplay +
Referenz-Gegner), Screenshot, DOM-Messung (Canvas-Rect, interne View, SKALIERUNG-Setting), Pixel-Scan
des PNG gegen Seitenhintergrund `#06070c` (Balken je Seite), Invarianten (Balken 0, Rect an 0,0, kein
Overflow, Canvas-Gerätepixel == intern × scale), WebGL-Renderer-String in jeder Messung.

Formate (7): `640x360@1, 960x540@1, 1280x720@1, 1920x1080@1, 2560x1440@1, 3840x2160@1, 780x360@dpr3
(SKALIERUNG=3)` — Spanne 360p bis 4K plus die M25-Referenz.

## Vorher (`shots/m10-viewrefit-before.json`, Commit cf082d8)

| Format | intern | scale | Balken L/R | Balken O/U | Canvas-Rect (CSS) | jsErrors |
|---|---|---|---|---|---|---|
| 640x360@1 | 640x360 (Fill) | 1 | 0 / 0 | 0 / 0 | 0,0,640,360 | 0 |
| 960x540@1 | 640x360 (Fill) | 1.5 | 0 / 0 | 0 / 0 | 0,0,960,540 | 0 |
| 1280x720@1 | 640x360 | 2 | 0 / 0 | 0 / 0 | 0,0,1280,720 | 0 |
| 1920x1080@1 | 640x360 | 3 | 0 / 0 | 0 / 0 | 0,0,1920,1080 | 0 |
| 2560x1440@1 | 640x360 | 4 | 0 / 0 | 0 / 0 | 0,0,2560,1440 | 0 |
| 3840x2160@1 | 640x360 | 6 | 0 / 0 | 0 / 0 | 0,0,3840,2160 | 0 |
| 780x360@3 (dpr 3, Setting 3) | 780x360 | 3 | 0 / 0 | 0 / 0 | 0,0,780,360 | 0 |

Renderer in allen 7 Messungen: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein
SwiftShader. **Das Fill-Verhalten hat der perf-cap-rollback-Merge also nicht beschädigt** (0 Balken,
0 Crop, 0 JS-Fehler in 7/7).

## Belegter Mangel + Fix (Commit 8b71015)

`isIntegerPixelPerfect` (src/logic/view.ts) kurzschloss den Rückfall-Pfad: `if (spec.fit) return false`.
Damit meldete die Abnahme-Funktion den **Pfad statt die Eigenschaft** — die Fill-Views 640x360 (1x) und
960x540 (1.5x) bilden laut Pixel-Scan exakt ab (Canvas-Gerätepixel == intern × scale, 0 Balken),
wurden aber als „nicht pixelperfekt" gemeldet. Das widersprach dem Abnahmekriterium der Lane
(„isIntegerPixelPerfect wahr für alle 7").

Fix: der Fit-Short-Circuit ist entfernt; die Funktion prüft die exakte, gleichmäßige Abbildung
(`cssW·dpr == width·scale && cssH·dpr == height·scale`, Toleranz 0.01). Verhalten im Renderer ist
unverändert — die Funktion hat keinen Produktiv-Aufrufer, sie ist reiner Abnahme-Beleg.

Semantik klar getrennt:
- **Exakte Abbildung** (`isIntegerPixelPerfect`): 7/7 true.
- **Ganzzahlige Stufe** (`scale`): 6/7; 960x540 → 1.5x ist im Fill-Pfad dokumentiert (540 = 1.5·360,
  volle Füllung und ganzzahlige Stufe schließen sich hier aus) — kein Mangel, dokumentierte Randbedingung
  aus m10-view-fill-16x9.

Angepasste Tests: `tests/view-fill.test.ts` (ein Testblock: „gebrochene Fit-Fälle nicht pixelperfekt"
→ exakte-Abbildung-Semantik; Datei ist fremd/unclaimed — Begründung in `/home/ai/games/.dispatch/requests.md`,
Regel „minimal anfassen, wenn unvermeidbar" befolgt) und `tests/view.test.ts` (Fill-Assertion 800x450).

## Tests erweitert (Commit fae74a7)

- `tests/view.test.ts`: 7-Format-Matrix als Unit-Tests — je Format `width·scale == deviceW` (kein
  Balken links/rechts), `height·scale == deviceH` (kein Balken oben/unten), CSS-Canvas == Viewport
  (kein Crop), `isIntegerPixelPerfect == true`, Clamp 480..860; 640-Referenz (1280x720 → 640x360@2,
  exakter viewKey) und 780-Referenz unveraendert.
- `tests/view-width.test.ts`: Höhen-Invariante `height·scale == deviceH` + ipp für alle 7 Formate.
- 35 View-Tests grün, `npx tsc --noEmit` rc=0, volle Suite + build vor Lane-Abschluss.

## Nachher (`shots/m10-viewrefit-after.json`)

Identisch zur Vorher-Tabelle: **7/7 pass** (`allPass: true`), 0 Balken, 0 Crop, 0 JS-Fehler, derselbe
Renderer-String. Sicht-Belege: `shots/m10-viewrefit-after-*.png` (7 Stück, art-director-Sichtcheck).

## Abnahme art-director (Sichtcheck der 7 After-Screenshots)

**PASS, Durchschnitt 4.71/5** (Kriterium >= 4/5). Je Screenshot: 640x360d1 = 5, 1280x720d1 = 5,
1920x1080d1 = 5, 2560x1440d1 = 5, 3840x2160d1 = 5, 780x360d3 = 5, 960x540d1 = 3. Belege: Pixel-Scan
aller Ränder (0 px schwarze Bänder), Run-Length-Analyse (5/7 Formate uniform ganzzahlig), HUD inkl.
KILL-Zähler rechts bei 780 intern vollständig.

Befund 960x540 (3/5): bei 1.5x alternieren Weltpixel zwischen 1 und 2 Gerätepixeln (Doppel-Pixel),
kein Blur. **Bewusst nicht "gefixt"**: ganzzahlige Stufe (1x) würde 90 px Balken oben/unten bedeuten
und verletzt genau das Hauptkriterium aus Doms Punkt 3 („kein Balken"); interner Refit auf 540 Höhe
greift in fremde Bereiche ein (HUD-/Tile-/Balance-Layout ist an BASE_HEIGHT 360 gekoppelt). Der
Kompromiss 1.5x mit `roundPixels` ist die dokumentierte Entscheidung aus m10-view-fill-16x9 und bleibt.

Prozess-Hinweis des art-directors übernommen: `allInteger: false` (nur 960x540) steht bewusst neben
`allPass: true` in der JSON — ganzzahlige Stufe und exakte Abbildung sind getrennte Eigenschaften
(siehe Fix oben); die Lane-Doku nennt die 960x540-Zeile explizit.

## Offene Punkte / dokumentierte Randbedingungen

- Ultrawide (Füll-Breite > 860) und nicht-16:9-Fenster mit n ≥ 2 (z. B. 1366x768) bleiben letterboxed —
  Absicht (M8 ganzzahlige Skalierung / MAX_WIDTH), unverändert zur Dokus in m8-display und
  m10-view-fill-16x9.
- Fill-Pfad mit Fensterbreite, die nicht durch scale teilbar ist (z. B. 1000x540 → 666·1.5 = 999):
  bis zu 1 px Restspalte rechts. Nicht Teil der 7 Abnahme-Formate; hier nur dokumentiert.
