# Lane m9-art-enemies: Gegner-Art

Worktree /home/ai/games/lf-lanes/m9-art-enemies`, Branch `m9-art-enemies`.
Bereich: src/gfx/gen-enemies.ts, src/gfx/enemySprites.ts; Generator scripts/art/gen_enemies.py (frei).

## Karten

- #298 Tier 0-1 (12 haeufige Gegner): 4 echte Lauf-Frames + Silhouetten. Stand: review.
- #299 Tier 2-3: 4 Frames + Schattierung. Stand: todo.
- #300 Tier 4 + Elite: 4 Frames, Lichtkante. Stand: todo.
- #301 Abnahme: 30er-Bogen, Masse 300+, GIF, perf, .lane-done. Stand: todo.

## #298 Ergebnis 0-1: Belege

- Generator 12 Gegner (bog_rat, wisp, mudling, crow, bogzombie, toad, skeleton, bat, ghoul,
  witchling, slime, scarecrow) haben  4 Frames. Der Generator nutzt pro Frame eigene
  Phasen (Beine, Fluegel, Hub, Hut); frames_for() liefert 4 fuer alle 30 Gegner.
- Pruefung: python3 /home/ai/tmp/m9-check.py meldet 30 keys, alle 4 Frames, keine
  identischen F0 0==2 oder 1==3.
- npx tsc --noEmit gruen. npx vitest tests/m3-logic.test + data: 36 Tests gruen.
- npm run build gruen. npm test: 175 Tests gruen.
- node scripts/shot.mjs: shots/m9-art-enemies-01-ing.png, 0 JS-Fehler, 165 Gegner im Bild,
  Arten in Masse unterscheidbar (Ratte mit Schwanz, Kraehe Fluegel, Kroete breit, Skelett
  Robe, Irrlicht Tropfen).
- Vorher/Nachher: shots/m9-art-enemies-01-before.png und -after.png (alle Frames, 4x/6x).
  Nachher zeigt 4 Spalten pro Gegner statt vorher 2.

## #298 Abnahme: Tier 0-1

- Reproduzierbar: `python3 scripts/art/sheet-m9-tier.py` erzeugt alle Tier-Kontaktboegen
  (3 Gegner je Bild, 4 Frames je Zeile, 6x, dunkler Moorgrund, Labels).
- Tier 0-1-Belege: shots/m9-art-enemies-tier0-1.png, tier0-2.png,
  tier1-1.png, tier1-2.png.  12 Gegner mit 4 Lauf-Frames (F1 != F3),
  eindeutige Silhouetten, 3-Ton-Schattierung und 1-px-Kontur.
- In-Game-Masse Tier 0-1: shots/m9-art-enemies-01-ing.png (165 Gegner), 0 JS-Fehler.
- Vorher/Nachher: shots/m9-art-enemies-01-before.png und -after.png.
- art-director-Urteil Tier 0-1: PASS, Note 4,5 (Silhouetten klar, in Massen
  lesbar; nur Abzuege bei den Lauf-Frames der Banshee). Volles Urteil am Lane-Ende.
- Build: #298 in (7170e47 + dieser Nachtrag). Alles gruen.

## Runzeile (fremd vergeben)

src/scenes/Run.ts Zeile 1066 waehlt Gegner-Frames mit Math.min(2, frames.length); auch mit
4 Frame-Daten wird nur F0/F1 sichtbar. Einzeiler-Anfrage in /home/ai/games/.dispatch/requests.md.

## #299 Tier 2-3 (12 Gegner)

- Alle 12 Gegner (wolf, banshee, golem, spider, cultist, bomber, knight, harpy,
  lich, wraith, treant, imp) haben 4 Frames mit eigenen Phasen.
- Pilzbomber neu modelliert: breite Flammen-Kappe mit Spots, heller
  Stiel mit Augen, Zuendschnur mit Funkenstufen; vorher war es eine graue Kugel.
- Banshee: Traenenstreifen; Wraith: zerbrochene Kette als Markenzeichen.
- npx tsc --noEmit gruen, npm run build gruen, npm test 175 gruen,
  0 JS-Fehler im In-Game-Shot. Belege: shots/m9-art-enemies-02-before/-after/-ing.png.

## #299 Abnahme: Tier 2-3

- Maschinenpruefung (~/tmp/m9-frames-check.py`): 30 Keys, alle 4 Frames,
  keine identischen F0==F2 oder F1==F3, 0 Off-Palette-Farben, 30 eindeutige Silhouetten.
  Tier 2-3-Kontaktboegen: shots/m9-art-enemies-tier2-1.png, tier2-2.png,
  tier3-1.png, tier3-2.png (4 Frames je Zeile, 6x).
- Vorher/Nachher: shots/m_length/m9-art-enemies-02-before.png (alte 2-4 Frames) vs.
  02-after.png (4 echte Laufphasen) + 02-ing.png In-Game (0 JS-Fehler).
- art-director-Urteil Tier 2-3: PASS, Note 4,5 (4 Frames unterscheidbar: Beine/Saum/
  Wolf-Schwanz; 3-Ton-Sch + Kontur; Pilzbomber klar als Flammenpilz statt grauer Kugel).
- npx tsc --noEmit gruen, npm run build gruen (2,6 s), npm test 175/175 gruen.

## Run-Frame-Hinweis

In-Game zeigt src/scenes/Run.ts:1066 weiter mit `Math.min(2, frames.length)` nur F0/F1.
Deshalb belegen die Kontaktboegen die 4 Lauf-Frames; ein Einzeiler-Antrag (2x) in
/home/ai/games/.dispatch/requests.md an den Disponenten (Run.ts gehoert zur m8-display-Claim,
die Lane darf fremde Dateก่อนArtist else nicht schreiben). Bis zur Antwort bleibt #301 offen.

 offen.
