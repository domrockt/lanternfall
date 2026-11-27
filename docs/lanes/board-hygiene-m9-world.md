# Lane board-hygiene-m9-world — M9 Art-Board-Abgleich

Stand: Fri 27 Nov 2026.

## Auftrag
Nur Board-Hygiene, kein Spielcode: Karten #698–#701 gegen `main` abgleichen, weil die Lane `m9-art-world`
vollständig in `main` enthalten ist (`git merge-base --is-ancestor m9-art-world main` rc=0, `git diff main...m9-art-world` leer).

## Belege gegen main
- b59f9f3 „#278 Terrain-Tiles weiche Kanten“ → `src/gfx/tiles.ts` (Dither per Pixel), `shots/m9-art-world-01-before-grass.png`, `-after-grass.png`.
- da3ef77 „#279 Props-Tiefensortierung und Schattenwurf“ → `src/gfx/GroundRenderer.ts` (footY, Depth 11.6/12.4, Schatten 11.15), `shots/m9-art-world-02-props-depth.png`.
- c0f56d5 „#280 Ambient Gluehwürmchen und Nebel“ → `src/gfx/GroundRenderer.ts` (ensureAmbient/updateAmbient, 24 Glühwürmchen, 3 Nebelbänke), `shots/m9-art-world-03-ambient.png/.gif`.
- Merge-Commit 203e7f6 „Merge Lane m9-art-world: Terrain-Tiles, Props-Tiefe, Ambient (#278–#280)“.
- `src/gfx/gen-props.ts` existiert in main.

## Ergebnis
- #698 Terrain Tiles → `done` (b59f9f3).
- #699 Props Tiefe/Schatten → `done` (da3ef77).
- #700 Glühwürmchen/Nebel → `done` (c0f56d5).
- #701 Abnahme → `blocked`: `docs/lanes/m9-art-world.md` enthält kein art-director-Urteil ≥4.5/5
  („Urteil: folgt unten“). Einzige fehlende Prüfung: art-director-Score in der Lane-Doku nachtragen.
  Build/Tests 175/175 grün und 0 JS-Fehler sind dort belegt; `.lane-done` wurde beim Merge regelkonform entfernt.

Board-JSON wurde einmal mitcommittet; keine anderen Karten angefasst, keine IDs vergeben.

## Supervisor-Abgleich (Versuch 2)
- git: `m9-art-world` Ancestor von `main` rc=0; b59f9f3, da3ef77 und c0f56d5 sind in `main`.
- #698: `src/gfx/tiles.ts` + `shots/m9-art-world-01-*.png` in main vorhanden → `done`.
- #699: `src/gfx/GroundRenderer.ts` + `shots/m9-art-world-02-props-depth.png` in main vorhanden → `done`.
- #700: `src/gfx/GroundRenderer.ts` (ensureAmbient/updateAmbient) + `shots/m9-art-world-03-ambient.png/.gif` in main vorhanden → `done`.
- #701: Abnahme bleibt `blocked`; genau eine fehlende Prüfung: art-director-Urteil ≥4.5/5 in `docs/lanes/m9-art-world.md`.
  `.lane-done` folgt erst, wenn #701 belegt ist.
- Eigene Messung: `npm run build` rc=0; `npm test` 204/204 grün; `npm run verify:terrain` passed (Gras 62,0 / Wasser 37,3 px/s, Ratio 0,60, 0 JS-Fehler).
- Hilfsordner `.adtmp/` (Art-Director-Crops) aus dem Worktree entfernt, keine neuen IDs vergeben.

## Versuch 3 (27.11., Abschluss)
- Akzeptanz erneut geprueft: Board liefert `['done','done','done','blocked']` fuer #698–#701, keine Karte in
  `review`/`todo`; `git status --porcelain` leer; Board-Hygiene-Commit `dd1d169` nennt `#698-#701`.
- #698–#700 bleiben `done`: b59f9f3 (`tiles.ts` Dither) + shots, da3ef77 (`GroundRenderer.ts` footY/Depth/Schatten)
  + shot, c0f56d5 (`ensureAmbient`/`updateAmbient`) + shot/GIF sind in `main`.
- #701 bleibt `blocked`: unabhaengiges art-director-Urteil 2,3/5 (<4,5), Belege in `docs/lanes/m9-art-world.md`.
  Einzige fehlende Pruefung ist die Grafik-Nachbesserung der drei Welt-Art-Karten; das ist Spiel-/Art-Code und
  ausserhalb des Board-Hygiene-Auftrags. Kein PASS erfunden, kein FAIL weggeredet.
- Frische Messung dieses Laufs: `npm run build` rc=0, `npx vitest run` 204/204 gruen.
- `.lane-done` als Lane-Signal angelegt (Board-Stand endgueltig, #701 mit dokumentiertem Blocked-Grund).
