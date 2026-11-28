# m10-atlas-gutter — Runtime-Atlas-Güte: Gutter & Pixel-Bleed

Lane-Worktree: `/home/ai/games/lf-lanes/m10-atlas-gutter`, Branch `m10-atlas-gutter`.
Vorrats-Job (Backlog P5): vollständige Abdeckung der heissen Sprite-Klassen,
2-px-Gutter (`ATLAS_GUTTER`/`ATLAS_PAD`) ohne Pixel-Bleed zwischen Nachbar-Frames.
`src/gfx/textures.ts` war nicht im Bereich (belegt durch m10-evo-fx-gewittersiegel
bzw. main-Merge-Lane) — alles über `atlas.ts` + Audit-Skript geprüft.

## Werkzeug (K1)

`scripts/art/atlas-audit.mjs` (baut auf der Vorlage aus m10-atlas-gaps auf, in
dieser Lane erweitert — 2 Skript-Iterationen: Atlas-Wait nach Boot-Warmup,
dann verbindlich):

- Coverage je `ATLAS_PREFIXES`-Key: erfasste/abgelehnte/existierende Keys,
  Lücken-Liste (`prefixes`-Sektion im JSON).
- Gutter: kleinster Abstand zwischen zwei Frame-Rechtecken, Verstösse < 2 px.
- **Pixel-Bleed (strenge Definition):** jeder opake Pixel im 2-px-Ring
  ausserhalb einer Frame-Zelle wird klassifiziert als transparent (ok),
  **Replika** (pixelidentisch zur geklemmten eigenen Frame-Kante, ok) oder
  **Fremdinhalt** (Nachbar-Pixel = Bleed-Fall). Ausserdem: jedes
  Frame-Inhaltspixel im Atlas muss **pixelidentisch zur Quelle** sein
  (`contentMismatches`).
- `--shot`/`--shot-key`: 4x-Zoom-Screenshot eines kritischen Frames
  (ohne `--shot-key`: Frame mit den meisten opaken Randpixeln), rot
  eingerahmt, auf Schachbrett-Grund (Transparenz im Gutter sichtbar).

Aufruf:

```bash
node scripts/art/atlas-audit.mjs --out shots/m10-atlas-gutter-before.json --shot shots/m10-atlas-gutter-zoom-before.png
```

## Akzeptanz (vor der Messung festgelegt)

0 Bleed-Fälle (Fremd-Pixel im Ring), 0 Inhalts-Differenzen, alle heissen
Klassen erfasst (17/17 Prefixe ohne Lücken), Gutter >= 2 px, tsc + Tests grün,
Vorher-/Nachher-JSON committed.

## Ist-Stand (Vorher, Commit f90f569)

`shots/m10-atlas-gutter-before.json`, Atlas `runtime_atlas` **1024×1359 px**,
**391 Frames** (seit m10-atlas-gaps von 224 auf 391 gewachsen — neuer
FX-/Boss-/Enemy-Content anderer Lanes ist automatisch über die Prefixe
erfasst worden).

- **Coverage: 391/391 (100 %)**, 17/17 Prefixe erfasst, 0 uncovered Hot-Keys.
- **Gutter: min 4 px, 0 Verstösse** (effektiver Sampling-Puffer = 2·`ATLAS_PAD`
  + `ATLAS_GUTTER` = 4 px).
- **Bleed: 0 Fremd-Fälle**, 0 Replika-Pixel (Ring komplett transparent),
  **0 Inhalts-Differenzen** über 391 Frames (391 Quellen lesbar).
- 214 Frames mit opakem Randpixel (randlos gezeichnete FX/Bosse) — durch das
  1-px-Padding abgesichert, kritischster Frame: `fx_shock@4_5`
  (Zoom-Beleg `shots/m10-atlas-gutter-zoom-before.png`: Kante berührt den
  Zellrand, umliegendes Gutter transparent).

**Kein Defekt im Runtime-Atlas:** Der Packer-Fix aus m10-atlas-gaps (Gutter +
Padding in `packAtlas`, Merge `41451ce`) hält — auch über die auf 391 Frames
gewachsenen Texturen hinweg. K2 war therefore kein Code-Fix in `atlas.ts`
nötig; stattdessen Test-Härtung (unten).

## K2 — Tests gehärtet statt Fix (Commit ba09e06)

- `tests/atlas.test.ts` pinnte den veralteten m10-atlas-gaps-Stand (227 Frames,
  alter Beleg-JSON). Frame-Zahl wird jetzt **aus dem Audit-Beleg selbst
  abgeleitet** (`frameCount === frames.length === coverage.total`) mit Floor
  227 — zukünftiges Wachstum bricht den Test nicht mehr.
- **Neue Bleed-Invariante zwischen benachbarten Frames:** der um `ATLAS_PAD`
  erweiterte Bereich jedes Frames darf keinen fremden Frame-Inhalt enthalten;
  Nachbar-Paare (erweiterte Rechtecke im Abstand <= `ATLAS_GUTTER`) werden
  gezählt, damit der Test an echten Nachbarn prüft.
- **Worst-Case-Packung:** 200 × 64-px-Frames — gleiche Invariante.
- Audit-Beleg-Test erweitert: 0 `contentMismatches`, Prefix-Lücken-Prüfung.

### Befund: tote Prefixe (Audit-Transparenz K1c)

- `arrow_chest` (0 existierende Texturen) — **Cross-File-Bug**: `ChestSystem.ts`
  bindet den Truhern-Randpfeil an die Textur `arrow_chest`, aber **kein Code
  erzeugt sie** (Grid im M6-robust-Refactor aus `textures.ts`/`SPRITE_GRIDS`
  verloren gegangen, `git log -S` belegt). Runtime-Gegenprobe
  (`~/tmp/m10-atlas-gutter/probe-arrow.mjs`): `textures.exists('arrow_chest')`
  = **false**, das Pfeil-Image hängt an **`__MISSING`** → sobald eine Truhe
  ausserhalb des Kamerabereichs liegt, rendert der Randpfeil den
  Phaser-Platzhalter statt eines Pfeils. **Fix liegt ausserhalb des
  Lane-Bereichs** (`ChestSystem.ts`/`textures.ts`) → Eintrag in
  `/home/ai/games/.dispatch/requests.md`; das Atlas-Prefix bleibt erhalten,
  damit die wiedereingerichtete Textur automatisch atlasiert.
- `bone_` (0 existierende Texturen) — kein Bug: Boss-Angriff `bone_boomerang`
  wirft `enemy_shot_bone` (über Prefix `enemy_shot_` erfasst); das eigene
  `bone_boomerang`-Sprite existiert nicht mehr. Im Test als erlaubter toter
  Prefix dokumentiert (neue tote Prefixe schlagen an).

## Nachher (K3)

`shots/m10-atlas-gutter-after.json` + `shots/m10-atlas-gutter-zoom-after.png`
(`fx_shock@4_5`, 4x, nearest): identisch sauber —

- Coverage 391/391 (100 %), 17/17 Prefixe ohne Lücken
- Gutter min 4 px / 0 Verstösse
- Bleed 0, Inhalts-Differenzen 0
- `npx tsc --noEmit` grün, `npm test` 1240/1240 grün, `npm run build` grün

Vorher/Nachher sind inhaltlich gleich (beide PASS): Die Lane bestätigt die
Atlas-Güte auf dem aktuellen 391-Frames-Stand und macht Abweichungen künftig
sichtbar (Audit + Tests), statt einen Defekt zu fixen, den m10-atlas-gaps
bereits behoben hatte.

## Offene Punkte

1. **arrow_chest-Textur wieder einrichten** (fremde Datei, siehe requests.md):
   Grid in `textures.ts` `SPRITE_GRIDS` ergänzen; Atlas-Seite passt automatisch.
2. `shots/m10-atlas-audit.json` (Beleg für `tests/atlas.test.ts`) wird vom
   Audit aktualisiert und ist committed — bei neuem Content Audit neu laufen
   lassen und JSON mits-committen.
