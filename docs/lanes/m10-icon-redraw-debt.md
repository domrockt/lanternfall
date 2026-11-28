# Lane m10-icon-redraw-debt — Icon-Design-Debt: heart/charm/boots neu zeichnen

Setzt Board-Karte **#7149** um (art-director-Muss-Liste aus den Lanes menu-art-crisp / icon-contrast):
die drei Icons sind formal palettentreu und kontrastgrün, aber formal schwach gezeichnet und
fallen gegen die übrigen 9 Icons ab. Dom-Ziel: „Qualität der Pixelgrafik muss hochwertig sein“.

**Area (Disponent):** scripts/art/gen_icons.py, scripts/art/icons_src.py, src/gfx/icons.ts,
src/gfx/gen-icons.ts, tests/icon-redraw.test.ts, scripts/m10-icon-redraw.mjs,
docs/lanes/m10-icon-redraw-debt.md, shots/m10-icon-redraw-*, .lane-done

## K1 — Befund sichern (Commit `M10-m10-icon-redraw-debt: #7149 K1`)

Belege: `shots/m10-icon-redraw-before-sheet.png` (Kontakt aller 12 Icons, 4x-nearest, HUD-BG),
12 Crops `shots/m10-icon-redraw-before-<key>.png`, Metriken `shots/m10-icon-redraw-before.json`
(Mess-Skript `scripts/m10-icon-redraw.mjs`, Kontrast-Methode identisch `tests/icon-contrast.test.ts`).

Metriken before (Auszug, siehe JSON für alle 12):

| Icon | HUD-Kontrast | Panel-Kontrast | Kanten->1px-Sprünge | Materialien |
|---|---|---|---|---|
| passive_heart | 5.38:1 | 4.93:1 | 0 | 5 |
| passive_charm | 4.53:1 | 4.15:1 | 0 | 6 |
| passive_boots | 4.53:1 | 4.15:1 | 0 | 3 |

Kontrast ist also NICHT das Problem (alle >= 3:1) — die Form ist das Problem. Muss-Icons konkret:

- **passive_heart** (`before-passive_heart.png`): liest als Erdbeer-/Fleisch-Blob. Es fehlt die
  Kern-Form „Herz“: keine zwei Ohren mit mittiger Kerbe (Cleavage ist zu einem Nub oben-links
  verschmolzen), keine Spitze unten — stattdessen rundes_mass mit fleckiger Schattierung und
  einem beliebigen weißen L-Glanz. Silhouette muss glatte Kurvenkanten ohne Zeilen-Alternation
  bekommen (art-director FAIL-Text #7149).
- **passive_charm** (`before-passive_charm.png`): liest als Hose/Greif-U. Es fehlt jede
  Gliederung: keine Kette, kein Öhr/Bügel, kein Fassungs-Ring — ein grauer Hufeisen-Blob mit
  Bernstein-Klecksen. braucht mehrgliedrige Silhouette (Kette + Medaillon + Edelstein-Kern).
- **passive_boots** (`before-passive_boots.png`): liest als graue Treppe/„L“. Ein flacher
  grauer Schaft ohne Material (Leder fehlt komplett — 3 Materialien, alles Dunst/Knochen-Rampe),
  Schnürung = 2 fast unsichtbare Pünktchen, Sohle kaum abgesetzt, keine Spitze/Ferse lesbar.

Referenz-Niveau innerhalb des Sets: weapon_lantern / passive_tome / passive_hourglass (11.4:1,
klare Kern-Form + Materialien) — daran muss sich heart/charm/boots messen lassen.

## K2 — Zeichnen (Commit `ac70049`)

Geändert: `scripts/art/icons_src.py` (neues `ICON_REDRAW_ROWS`: die drei Icons als
handgesetzte ASCII-Raster, Materialzonen auf Rampen-Mitten) und `scripts/art/gen_icons.py`
(`special()` stellt heart/charm/boots auf diese Raster um; die alten Primitiven-Blöcke entfernt).
Regeneration über `python3 scripts/art/gen_icons.py` → `src/gfx/gen-icons.ts` (AUTO-GENERIERT,
nie von Hand editiert). Regeln eingehalten: 16x16, nur Palettenfarben, binäres Alpha,
mehrgliedrige Silhouette (Kern-Form + 1 dunkle Kontur via Pipeline-outline + max. 1 Highlight),
eine Pixelgröße.

**Wichtiger Pipeline-Befund (Rampen-Versatz):** `normalize()` mappt Zeichnungs-Indizes auf die
Rampe, in der sie zuerst vorkommen — 25→23 (sehr dunkel), 8→7, 9→6, 21→20, 12→11, 13→12,
17→16, 20→19, 27→26. Gezeichnet wird deshalb über die helle Quellstufe der Zielfarbe
(Karmesin-Kern = 26 zeichnen → 25; Dunst-Mitte = 10 zeichnen → 8; blasser Dunst = 11 → 9).
Zudem kippt ein 2-px-Glint seitlich ins Dunkel (Schatten der Glint-Rampe) — Glints sind deshalb
Einzel-Pixel.

**Drift-Fix passive_tome (nicht Teil der Muss-Liste, aber nötig):** das committed
`gen-icons.ts` war für den Tome direkt hand-editiert worden (Vor-Lane icon-contrast, Commit
00c500e) und war von der Pipeline nicht reproduzierbar — die erste Regeneration lieferte
Kontrast 2.16:1 und liess `tests/icon-contrast.test.ts` rot fallen. Das freigegebene
Tome-Design ist jetzt 1:1 als Raster in `ICON_REDRAW_ROWS` gepflegt (Index-Versatz wie oben,
gleiche Materialfamilien), damit `gen-icons.ts` wieder voll generiert ist. Der Tome ist damit
in meiner Area-Datei `scripts/art/icons_src.py` — begründete Randberührung, siehe oben.

Begruendete Randberuehrung: `python3 scripts/art/gen_icons.py` schreibt bei der Regeneration
auch `shots/m4-sheet-icons.png` neu (Pipeline-Nebenprodukt, deterministisch aus den Daten).

## K3 — Tests (Commit `cfda1b0`)

`tests/icon-redraw.test.ts` (9 Tests, grün): für die 3 neuen Icons
- Silhouette sichtbar: 1-px-Ink-Kontur vorhanden (>= 30 px) und jeder Kontur-Pixel berührt
  Koerper; Kern-Farbe >= 20 % des Koerpers; Materialtiefe >= 3 Farben;
- konkrete Kern-Form: Herz = oberste Koerperzeile mit genau 2 getrennten Segmenten (Ohren)
  + unterste Zeile <= 4 px (Spitze); Charm = Kette oberhalb + Medaillonbreite >= 10 + Rubin
  (Karmesin 23-27) im Kern; Boots = unterste Zeile >= 12 px (Sohle) + Schaftzeilen vorhanden;
- 0 Off-Palette-Pixel; binäres Alpha (nur '.' oder opaker Palettenindex, kein AA).

Bestehende Tests unangetastet und grün: `icon-contrast` (19), `palette-compliance` (16),
`chest-icon-crisp` (14). Full-Suite nach K4: 1331/1331 grün, `npm run build` grün.

## K4 — Nachher-Beleg + Abnahme

Belege: `shots/m10-icon-redraw-after-sheet.png` + 12 Crops `shots/m10-icon-redraw-after-<key>.png`
+ `shots/m10-icon-redraw-after.json` (gleiche Methode wie before, direkt vergleichbar).

Metriken after vs. before (Auszug; vollständige Tabelle im JSON):

| Icon | HUD-Kontrast | Panel-Kontrast | Materialien | Off-Palette |
|---|---|---|---|---|
| passive_heart | 5.38 → 3.30 | 4.93 → 3.02 | 5 → 5 | 0 |
| passive_charm | 4.53 → 4.40 | 4.15 → 4.03 | 6 → 9 | 0 |
| passive_boots | 4.53 → 4.53 | 4.15 → 4.15 | 3 → 10 | 0 |
| passive_tome | 10.93 → 8.18 | 10.01 → 7.49 | 6 → 11 | 0 |
| übrige 8 Icons | identisch | identisch | identisch | 0 |

Ehrliche Anmerkung zum Kontrast: heart/tome liegen numerisch unter dem Vorher-Wert, weil die
Vorher-Fassungen Kontrast über unsaubere Grau-/Weiss-Flecken (heart) bzw. Hand-Edit ohne
Pipeline (tome) bekamen. Alle 12 Icons bleiben klar über der 3:1-Schwelle (worst: heart 3.02
auf Panel); die Form-Lesbarkeit — das eigentliche Muss — ist sprunghaft besser. Alle 12 Icons
zeigen 0 Off-Palette-Pixel; die 8 nicht berührten Icons sind Pixel-identisch
(vom art-director per ImageChops-Diff bestätigt: `identical`).

## art-director-Abnahme (4x-Crop, kommerzieller Massstab)

**Runde 1:** heart **4,5/5** (auslieferungsreif), charm **4,5/5** (auslieferungsreif),
boots **4/5** — **FAIL** allein wegen 4 hellen boneLight-Pixeln entgegen der Lichtrichtung an
der Rist-Diagonalkante (7,8),(8,9),(9,10),(10,11); gefordert fog `#4e5f6e` (PAL 7). Optional,
nicht blockierend: charm Kettenspitze (8,4) etwas heller. Gesamtnote 4,3.

**Fix (in K4 committet):** die Rist-Kante wird in `ICON_REDRAW_ROWS` als Quellindex 7
gezeichnet — `normalize()` mappt 7→5, das Licht-Gleichstands-Rennen (dt+dl = db+dr = 2) wählt
Licht → finale Farbe exakt PAL 7 (fog). Pixeldump bestätigt (7,8),(8,9),(9,10),(10,11) = 7;
die Diagonale liest sich jetzt boneLight-Front → mist → fog-Kante. Nicht umsetzbar ohne
Silhouetten-Änderung: der charm-Bail-Pixel (8,4) liegt mit seiner Unterseite direkt am
Medaillon — die Schattenseite gewinnt dort per Regelwerk immer (db+dr=2 < dt+dl=3); als
Kompromiss bleibt die Kette in einer Familie, der Pixel ist bewusst der Schatten des
Ketten-Materials. Verbleibt als dokumentierter 1-px-Kompromiss (laut art-director nicht
blockierend).

**Runde 2 (Re-Abnahme): PASS.** passive_boots **4,5/5** (auslieferungsreif): Pixeldump des
art-directors bestätigt die 4 Pixel als PAL 7 fog in sauberer 45°-Diagonale als Schattenseite
unten-rechts, Stiefel weiterhin klar lesbar (Cuff, Schnür-Zickzack, Rist bone→mist→fog,
amberne Sohle), NETTO deutlich besser als die Vorher-Fassung. Optionaler charm-Punkt (8,4)
wird nicht blockierend geführt. Endurteil: heart 4,5 / charm 4,5 / boots 4,5 —
**kein Icon schlechter als vorher** (die 8 unberührten Icons sind pixelidentisch).
