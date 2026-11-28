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

## K2 — Zeichnen

Geändert: `scripts/art/icons_src.py` (die drei Icons als handgezeichnetes ASCII-Art in
`ICON_ROWS`, Materialzonen auf Rampen-Mitten) und `scripts/art/gen_icons.py` (die drei
Primitiven-Blöcke in `special()` entfernt — handdrawn-Pfad übernimmt). Regeneration über
`python3 scripts/art/gen_icons.py` → `src/gfx/gen-icons.ts` (AUTO-GENERIERT, nie von Hand
editiert). Regeln: 16x16, nur Palettenfarben, binäres Alpha, mehrgliedrige Silhouette
(Kern-Form + 1 dunkle Kontur via Pipeline-outline + max. 1 Highlight), eine Pixelgröße.

Begruendete Randberuehrung: `python3 scripts/art/gen_icons.py` schreibt bei der Regeneration
auch `shots/m4-sheet-icons.png` neu (Pipeline-Nebenprodukt, deterministisch aus den Daten).

## K3 — Tests

`tests/icon-redraw.test.ts`: für die 3 neuen Icons Silhouette-sichtbar (Kontur-Pixel vorhanden
und berühren den Körper, Kern-Form >= 2 Materialien im Körper), 0 Off-Palette-Pixel, binäres
Alpha (nur '.'/Index). Bestehende `tests/icon-contrast.test.ts` (>= 3:1) und
`tests/palette-compliance.test.ts` bleiben unangetastet und grün.

## K4 — Nachher-Beleg + Abnahme

`shots/m10-icon-redraw-after-*.png/.json` (+ sheet), art-director-Urteil am 4x-Crop
(commerziell auslieferbar, >= 4/5, kein Icon schlechter als vorher).
