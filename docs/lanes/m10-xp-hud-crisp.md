# Lane m10-xp-hud-crisp — HUD-Pixelqualität (Befundklasse menu-art-crisp F1 am In-Game-HUD)

Datum: 2026-11-28 · Worktree: `lf-lanes/m10-xp-hud-crisp` · Quelle: Dom-Kurs Optik/Effekte (21:45Z)

## Ziel

Dom-Test Ziel 2 („kommerzielles Pixel-Art-Spiel"): HUD (XP-Leiste, Timer, Kill-/Level-Zähler,
Powerup-Icon-Zeile, dazu HP-Leiste + Boss-Leiste im selben Band) muss bei 640x360, 780x360@3 und
1080p auf ganzzahligen Spielpixeln sitzen — keine fraktionalen Kanten, kein Mixel, keine
halbdurchsichtigen Ränder. Pixel-Scan statt Augenmaß, Fixes sofort, dauerhafter Regressionstest.

## Methode (K1, `scripts/m10-xp-hud-crisp.mjs`)

- 3 Formate: `640x360@2` (Viewport 1280x720, dpr 1), `780x360@3` (Viewport 780x360, dpr 3),
  `1080p` (Viewport 1920x1080, dpr 1 → intern 640x360, n=3). Renderbuffer voll (`__rbOverride=1`).
- Gefrorener Frame: Run-Szene pausiert (Phaser rendert PAUSED-Szenen weiter, UI-Szene bleibt aktiv);
  `setSuppressLevelUps(true)` gegen das 0.86-Dim-Overlay des Level-up-Dialogs.
- Scan: alle sichtbaren Objekte der UI-Szene mit Eltern-Transform (Container rekursiv) im HUD-Band
  (top < 64 Spielpixel); Befunde `fractional-scale` (texturierte Objekte mit nicht-ganzzahliger
  Skalierung) und `fractional-edge` (nicht-ganzzahlige Display-Breite/-Höhe bzw. linke/obere Kante).
  XP-/HP-Füllung deterministisch auf Off-Grid-Ratios gesetzt (Teleport in Gegner für HP-Schaden,
  giveXp-Loop für XP). Belege: `shots/m10-xp-hud-<tag>.json` + HUD-Band-Crop je Format
  (`-hud.png`, `-hud-4x.png` via `convert -filter point -resize 400%`) + Full-Shot.
- Läuft ohne flock (keine FPS-Messung). 0 JS-Fehler in allen Läufen.

## Befundliste BEFORE (`shots/m10-xp-hud-before.json`, je Format 11 Befunde, hier 640x360@2)

| # | Objekt | Befund | Vorher-Wert (640 / 780 / 1080p) |
|---|--------|--------|----------------------------------|
| 1 | `hud-xp-fill` (XP-Füllung) | fraktionale Display-Breite | 235.5 / 341.333 / 209.333 px |
| 2 | `hud-hp-fill` (HP-Füllung) | fraktionale Display-Breite | 81.648 px (hp 269/270) |
| 3 | Boss-Bar-Füllung | fraktionale Display-Breite | 221.374 px (ratio 0.971) |
| 4–9 | 6 von 8 Boss-Segmenten | fraktionale x-Position (`i*(236-8)/9 = 25.333`-Raster) | left 231.333 / 256.667 / 307.333 / 332.667 / 383.333 / 408.667 |
| 10–11 | 2 Boss-Endkappen (5 px, Origin 0.5) | fraktionale Kanten | left 194.5 / 430.5 |

Sauber im Scan (Gegenprobe, kein Handlungsbedarf): Timer/LV/KILL-Glyphen (PixelText, floor-Zentrierung),
Icon-Reihe (12x 16-px-Icons, Scale 1, ganzzahlige Positionen), Icon-Hintergrund, Evo-Hinweis,
HUD-Topstreifen, XP-/HP-Rahmen. Halbdurchsichtige Flächen im Band sind die bewussten Dim-Overlays
(Topstreifen 0.82, Icon-BG 0.6 — FILL-Alpha, GAME.md-Ausnahme).

## Fixes (K2, Commit `d6d16be`, nur `src/scenes/UI.ts`)

1. **`crispFillWidth(baseW, ratio)`** (neu, exportiert, rein): Füllbreite als ganzzahlige Spielpixel
   (`round(clamp(ratio) * baseW)`). XP-/HP-/Boss-Füllung nutzt jetzt **1-px-Basis + ganzzahligen
   Scale** statt fraktionaler Scale auf voller Basisbreite → Kanten immer auf Spielpixeln.
2. **`bossBarGeometry(viewWidth)`** (neu, exportiert, rein): ganzzahlige Boss-Leisten-Geometrie —
   Segment-x je gerundet (vorher 25.333-Raster), Endkappen-Anker `left-5`/`left+barW-5`, Kappe
   5 px mit Origin (0, 0.5) am Anker `sx-3` (vorher Origin 0.5 → Kanten bei sx±2.5).
   Boss-Phase-Text-Anker auf `left + barW - 6` (vorher `cx + barW/2 - 6`, fraktional bei ungerader Breite).
3. Keine inhaltlichen/layoutlichen Änderungen außerhalb dieser Stellen (AE = 0: barW 236, left, fillX,
   fillW 228, Segment-Ankerzahlen identisch bis auf die 0.5-px-Kappen-/Segmentverschiebung).

## Nachher (`shots/m10-xp-hud-after.json`): **0 Befunde in allen 3 Formaten**

- xpRatio 0.333 (fraktional) → displayW **209** (640x360@2) / **256** (780x360@3) / **209** (1080p),
  Scale ganzzahlig. HP-/Boss-Füllung ebenso über `crispFillWidth` gedeckt.
- Hinweis ehrlich: im After-Lauf blieb der Spieler unversehrt (god vor Kontakt-Schaden), der HP-Fill-
  Nachweis mit fraktionalem Ratio stammt aus BEFORE (81.648) + dem Unit-Test-Sweep über `crispFillWidth`;
  in einem Zwischenlauf mit Schaden (243/250) maß der Scan ganzzahlige 80 px.

## Regressionstest (K3, Commit `2729170`, `tests/xp-hud-crisp.test.ts`, 11 Tests)

- `crispFillWidth`: ganzzahlig/monoton/geklammert über Ratio-Sweeps für alle Füll-Basisbreiten;
  Fix-Nachweise gegen die before-Werte (0.375/0.444/0.333/0.996).
- `bossBarGeometry`: ganzzahlig für 640/780/683/1024/400 px; Referenzbreiten pixelgleich zum alten
  Layout (barW 236, fillW 228, 8 Segmente, Kappen-Anker); Segment-x ohne 25.333-Raster.
- `hudAnchorBoxes`: nur ganzzahlige Rechtecke in den 3 Abnahmeformaten.

## Messwerte

- `npm run build`: grün. `npx vitest run`: **1198 Tests / 111 Dateien grün**.
- Scan-Läufe: 0 JS-Fehler je Format (before + after).
- Kein FPS-Lauf nötig (Fix ändert nur Ganzzahl-Mathematik, kein Renderpfad-Mehraufwand; kein flock).

## Abnahme K4 (art-director, 2026-11-28)

**Urteil: PASS — alle 7 Kriterien 5/5** (Ziel ≥ 4/5). Auszüge:
- Pixel-Gegenprüfung der AFTER-Crops: XP-Füllkante `(255,184,77)` → `(6,7,12)` ohne Mischfarbe;
  Boss-Segmentteiler ganzzahlig (25/26-px-Alternation = korrekte ganzzahlige Lösung bei
  228 px / 8 Segmenten, 25,33 px wäre der BEFORE-Fehler); Timer/LV/KILL-Glyphen, HP-Leiste,
  12 Icons (Pitch 17), Evo-Hinweis, Boss-Endkappen sauber.
- BEFORE-Gegenprobe bestätigt die Befundklasse sichtbar (fraktionale Füll-/Segmentkanten).
- „muss neu / nachbessern": nichts.

## Grenzen / offene Punkte

- Scan-Band = top < 64 Spielpixel (HUD-Topstreifen + Boss-Leiste). Level-up-/Truhen-/Pause-Panels
  und Menüs sind bewusst NICHT Teil dieser Lane (eigene Lanes m10-menu-art-crisp / chest-panel).
- `chestBeam`/Licht-/Glow-Texturen (additiv, weiche Gradients) sind nach GAME.md von der
  Mixel-Regel ausgenommen.
- Bei ungeraden Viewbreiten (dynamisches Format) sitzt der Timer-Text-Container auf `GAME_WIDTH/2`
  (kann fraktional sein) — außerhalb der 3 Abnahmeformate, nicht angefasst (PixelText-Glyphen
  selbst sind ganzzahlig); als Beobachtung für eine Folgelane dokumentiert.
