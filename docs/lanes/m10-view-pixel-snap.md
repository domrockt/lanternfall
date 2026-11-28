# Lane m10-view-pixel-snap — Canvas-Rect auf ganzen Geraetepixeln (2026-11-28)

Bedarf aus Lane m10-view-4k K2 (Bedarfsmeldung 2026-11-28T~10:40Z): Bei nicht
teilbaren Breiten liegt das zentrierte Canvas auf halben Geraetepixeln —
2560x1080@1 liefert intern 853x360, Scale 3, Canvas 2559 Geraetepx bei 2560;
die zentrierte linke Kante liegt bei CSS-x = 0.5 und die linke Randspalte
blurrt zum Seitenhintergrund (Pixel-Scan barsPx.left = 1, Beleg
`/home/ai/games/.evidence/m10-view-4k/m10-view-4k-before.json`).

Fix ausschliesslich in der **POSITIONIERUNG** (`src/main.ts`), nicht in der
View-Rechnung: `src/logic/view.ts` bleibt unangetastet (floor statt round/ceil
ist dort bereits optimal — Defizit statt Crop ist bei unteilbaren Breiten und
ganzzahligem Scale mathematisch unvermeidbar, siehe docs/lanes/m10-view-4k.md).

## K1 Vorher-Scan (#11148, Commit e99ffb8d)

Skript `scripts/m10-view-snap.mjs` (Methodik wie scripts/m10-view-4k.mjs,
zusaetzlich Canvas-Rect in GERAETEpx + Flag `rectIntegerDevice`). Belege:
`/home/ai/games/.evidence/m10-view-pixel-snap/m10-view-snap-before.json` +
Shots. Renderer je Messung: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
OpenGL ES 3.2)` — kein SwiftShader.

| Profil | intern | Scale | Canvas-Rect CSS-x | rectIntegerDevice | barsPx L/R | jsErrors |
|---|---|---|---|---|---|---|
| 2560x1080@1 | 853x360 | 3 | **0.5** | **false** | **1**/0 | 0 |
| 1280x720@1 (Kontrolle) | 640x360 | 2 | 0 | true | 0/0 | 0 |

## K2 Fix (#11149, Commit dd66b021)

- **`snapCanvasRect(leftCss, topCss, dpr)` ADDITIV in `src/logic/view.ts`**
  (bestehende Exporte unveraendert): reine Funktion, liefert die
  CSS-Verschiebung (dx/dy), die eine Kante auf ganze Geraetepixel bringt.
  Immer NACH LINKS/OBEN abrunden (floor) -> Restspalte/-zeile liegt HART
  rechts/unten (Seitenhintergrund mit scharfer Kante) statt zu verblurren.
  Toleranz 1e-4 Geraetepixel frisst Browser-Rect-Rauschen; NaN/Infinity ->
  dx=dy=0; dpr<=0/NaN gilt als 1 (wie computeView).
- **`src/main.ts` `applyView()` konsumiert sie**: Transform vorher loeschen
  (keine Akkumulation ueber Resizes), Canvas-Rect nach dem Layout messen
  (`getBoundingClientRect`), dann `translate(dx, dy)` setzen — nur wenn
  noetig (`alreadySnapped` -> kein Transform).
- CSS-Zentrierung (Flex-Layout in index.html) bleibt unveraendert; der Snap
  kompensiert nur deren halbe Geraetepixel.

**Nachher** (`m10-view-snap-after.json`, Shot gesichtet: Raender hart,
Spielfeld voll, 0 geblurte Spalten):

| Profil | Canvas-Rect CSS-x | rectDevicePx | rectIntegerDevice | barsPx L/R | jsErrors |
|---|---|---|---|---|---|
| 2560x1080@1 | 0 (translate -0.5px) | [0, 0] | **true** | **0**/**1** | 0 |
| 1280x720@1 | 0 | [0, 0] | true | 0/0 | 0 |

Die verbleibende rechte Restspalte (1 Geraetepx, 0,04 % der Breite) ist die
dokumentierte, mathematisch unvermeidbare 2560 = 3*853 + 1-Rest — jetzt mit
HARTER Kante statt Verblurren links.

## K3 Guard + Stichprobe + Abschluss (#11150)

- `tests/view-pixel-snap.test.ts`: 13 Tests — Grundregeln (floor-Richtung,
  keine Akkumulation, dpr-Anomalien, 1e-4-Rauschen) + Display-Matrix
  (2560x1080@1, 1280x720@1, 3840x2160@1, 3440x1440@1, 1280x540@2): View-
  Rechnung unveraendert (Defizit statt Crop), gesnappte Rect-Grenzen
  ganzzaehlig, rechte Kante ganzzahlig (harte Kante), Defizit exakt wie
  erwartet.
- Stichprobe 2 weitere Formate (`m10-view-snap-after-probe.json`): 3440x1440@1
  und 1920x1080@1 — je 0 Balken, rectIntegerDevice true, Transform `none`
  (kein Over-Snapping), pixel-perfect, 0 JS-Fehler. Kein Rueckschritt.
- `npm test`: 187 Testdateien / 2045 Tests gruen. `npm run build` rc=0.

## Abnahme (Briefing)

- [x] 2560x1080@1: barsPx.left = 0, Canvas-Grenzen auf ganzen Geraetepixeln
      (rectDevicePx [0,0]), 0 geblurte Randspalten (after-JSON + Shot).
- [x] Stichprobe 2 weitere Formate: kein Rückschritt (Spielfeld voll,
      pixel-perfect, 0 Balken).
- [x] npm test gruen (2045), npm run build rc=0.

Offene Punkte: keine. Hinweis fuer Merge: `scripts/m10-view-snap.mjs` ist ein
Mess-Werkzeug (1 Edit-Iteration), Belege liegen ausserhalb des Repos.
