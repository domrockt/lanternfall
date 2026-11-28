# Lane m10-gem-rows-texture — Gem-Rows-Rampenfarben (Bedarfsmeldung m10-gem-value-reading, Versuch 2)

Datum: 2026-11-28 · Owner: Lane m10-gem-rows-texture · Karten #11128–#11130 (reservierter Block)

## Auftrag

Bedarfsmeldung der Lane `m10-gem-value-reading` (Versuch 2, 2026-11-28T09:05Z): die Gem-Sprite-Rows
`gem_small`/`gem_medium` in `src/gfx/textures.ts` sollten die Rampenfarben (Silber/Gold/Rubin) malen,
damit Gems ihren Wert visuell lesen. Die Lane hatte den Commit fertig (art-director r2 4,5/5,
reviewer PASS, Suite grün, build rc=0), scheiterte aber am Claimcheck (`textures.ts` →
`m10-fx-bakes-evo-r2` → `m10-chest-arrow-texture-r2`). Dieser Job reiht den Schnitt hinter die Kette.

## K1 — Befund: Schnitt NICHT in main (2026-11-28T10:35Z)

- `git log main -- src/gfx/textures.ts`: letzter Touch ist `a0c04e23` (chest-arrow-texture-r2 K2);
  `git diff main..HEAD -- src/gfx/textures.ts` leer.
- Inhaltlicher Vergleich: main hat noch den **alten gem-magnet-Stand** (`ef5d88e3`): `gem_small`
  = Moor-Gruen (PAL 31, Rows `0vmv0`), `gem_medium` = Amber ohne Sparkle.
- Die Lane `m10-gem-value-reading` hat den r3-Patch nur **uncommitted** im Worktree
  (`git diff HEAD` dort: gem_small r3-Kommentar + Rows; das gem_medium-Sparkle ist zwar in
  `27a1837e` committed, dieser Commit ist aber nicht in main).
- ⇒ K2/K3 fahren die Patch-Übernahme auf frischer Basis (inkl. arrow_chest aus der meanwhile
  gemergten Kette).

## K2 — Patch-Übernahme (Commit 9884157b)

- Exakte Übernahme des r3-Stands aus `lf-lanes/m10-gem-value-reading/src/gfx/textures.ts`:
  - `gem_small` 7x7: Kern **bone (PAL 10, `a`)**, Glanz **candleWhite (PAL 12, `c`)**,
    1 px Sparkle **lanternWhite (PAL 13, `d`)** — Silber-Ende der Rampe.
  - `gem_medium` 9x9: Amber/Laterne (PAL 20/21) + **3 px lanternWhite-Sparkle**.
  - Kommentare r3 (r1 mist = Rat-Flankenfarbe FAIL, r2 fogBlue = 29,45 % Moor-Kollision).
- Diff-Prüfung: nur gem_small/gem_medium-Rows + Kommentare, **0 Änderungen an fx-Blöcken**,
  arrow_chest und gem_large unberührt.
- Vorher/Nachher-Messung (`scripts/m10-gem-rows.mjs`, Chaos-Frame 500 Gegner, Seed 1, god,
  autoPlay, Kernfarbe = Dominantfarbe des Atlas-Frames ohne Ink; Belege in
  `/home/ai/games/.evidence/m10-gem-rows-texture/`):

| Stufe  | Vorher core | Nachher core | Rampenfarbe |
|--------|-------------|--------------|-------------|
| small  | `#6f9b58` (Moor-Gruen 31) | `#b8c4c2` (bone 10) + `#f2edd8` 2px + `#fff8e6` 1px | Silber |
| medium | `#ffb84d` (amber 20, ohne Sparkle) | `#ffb84d` + `#fff8e6` 3px | Gold |
| large  | `#b8303f` (karmesin 25) | `#b8303f` (unverändert) | Rubin |

- Binäres Alpha: offAlpha = 0 in allen Frames, vor UND nachher. 0 JS-Fehler in allen Läufen.

## K3 — Test, Abnahme, Doku (Commit <K3>)

- `tests/gem-rows-texture.test.ts` (10 Tests): Dimensionen unverändert 7x7/9x9/11x11
  (Pixel-Grid/Mixel-Regel, Draw-Scale 1), binäres Alpha (nur `.` oder PAL 0–31),
  Rampenzahlen je Stufe (a=14/c=2/d=1 small; k=19/l=15/d=3 medium; p,q large),
  Regressions-Guards gegen r1 mist (`8`) und r2 fogBlue (`6`), Atlas-Pfad
  (`shouldAtlasKey("gem_*")` = true, nearest-Bake).
- Suite: **2042/2042 grün** (187 Files), `npx tsc --noEmit` grün, `npm run build` rc=0.
- Abnahme-Shots (git): `shots/abnahme/m10-gem-rows-960.png`, `shots/abnahme/m10-gem-rows-640.png`
  — frischer Chaos-Lauf auf gepatchter Basis; Sichtung (3x nearest): Silber-/Gold-/Rubin-Gems
  lesen sich im Chaos klar getrennt gegen Moor-Boden, Glow- und Brand-Decals. Die
  art-director-Sichtung der Ursprungs-Lane (r2 4,5/5 auf
  `shots/abnahme/m10-gem-value-reading-{960,640}.png`) gilt als Vorab-Freigabe des Pixel-Stands;
  Rows sind identisch übernommen.

## Offene Punkte

- Keine. `.lane-done` gesetzt.
