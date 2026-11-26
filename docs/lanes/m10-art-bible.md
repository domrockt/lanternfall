# Lane m10-art-bible — ART.md/GAME.md vs. echter Datenstand

Basis-SHA beim Start: **48d590c** (Worktree `/home/ai/games/lf-lanes/m10-art-bible`, Branch `m10-art-bible`).
Nur lesend geprüft; **ART.md und GAME.md bleiben in dieser Lane unverändert**.

## Karten-Checkliste

- [x] #1 Matrix bauen: GAME.md/ART.md-Einträge vs. ENEMIES/BOSSES/CHARACTERS vs. GEN_*-Frames.
      Abnahme: 38 Zeilen mit Soll/Ist je Feld → `shots/m10-art-bible-matrix.json` (38 rows), Log `shots/m10-art-bible-matrix.out`. Skript: `~/tmp/m10-art-bible/matrix.mjs`.
- [x] #2 Diff + Bilder: je Abweichung ein 4x-Beleg-Shot nach `shots/m10-art-bible-*`, Abweichung in Worten.
      Belege: `shots/m10-art-bible-enemy-height.png`, `-enemy-color.png`, `-boss-size.png`, `-boss-frames.png`, `-chars.png` (alle 4x nearest, beschriftet). Skript: `~/tmp/m10-art-bible/shots.py`.
- [ ] #3 Report: Tabelle, Empfehlung je Abweichung (Doku oder Code) — keine Änderung an ART.md/GAME.md.

## Ergebnis Karte #1 (Basis 48d590c)

Geprüfte Felder je Eintrag: Archetyp (GAME.md-Tabelle vs. `src/data/enemies.ts`), Tier/Größe
(ART-Proportionen vs. GEN-Canvas), sichtbare Höhe (ART-Rampe vs. Pixel-BBox), Frames (ART
„2–4“ bzw. Boss „Idle2/Windup1/Attack1“ vs. GEN-Array), Palette-Rampe (nur Indizes 0–31,
Kontur 0, Tier-Akzent), Datenfarbe (`color` aus `enemies.ts` im Sprite verwendet).

Abweichungen (Details + Belege folgen in Karte #2):

- **7 Gegner:** `color`-Palettenindex aus `src/data/enemies.ts` kommt im generierten Sprite nicht vor
  (wisp, crow, bomber, wraith, gargoyle, abom, voidcaller).
- **18 Gegner:** sichtbare Höhe außerhalb der ART-Tier-Rampe (z. B. spider 13 px statt 18–22,
  centipede 15 px statt 26–30, knight 28 px statt 22–26).
- **5 Bosse:** Canvas-Größe weicht von ART-Boss-Liste ab (moor_queen 56 vs 48, bone_lord 64 vs 56,
  pale_shepherd 72 vs 64, bell_golem 80 vs 72, coven 96 vs 80); hollow_king 96 = 96 ok.
- **6 Bosse:** nur 3 GEN-Frames statt der in ART beschriebenen 4 Posen (Idle 2 + Wind-up 1 + Angriff 1).
- **Doku-Stale:** GAME.md M3-Status nennt „30 Platzhalter-Sprites (24×24, 2 Frames)“ und „Bosse 40×40“,
  tatsächlich sind es 16–32 px je Tier bzw. 56–96 px; `artNote` in `characters.ts` sagt „16x16“, real 32×32.

## Ergebnis Karte #2 (Basis 48d590c) — Belege

Matrix-Rohdaten liegen bereits im Supervisor-Snapshot `519329b` (`shots/m10-art-bible-matrix.json`,
`-matrix.out`), daher no-op im Karten-Commit #1. Die 4x-Shots unten sind in diesem Commit.

| Abweichung | Anzahl | Beleg-Shot | In Worten |
|---|---|---|---|
| Sichtbare Höhe außerhalb ART-Tier-Rampe | 17 Gegner | `m10-art-bible-enemy-height.png` | z. B. spider 13 px (Soll 18–22), centipede 15 px (26–30), imp 18 px (22–26); skeleton/ghoul/witchling/scarecrow liegen 1–2 px über ihrer Rampe. Das Canvas-Größenraster stimmt, die Silhouette füllt es aber nicht gemäß ART. |
| Datenfarbe `color` fehlt im Sprite | 7 Gegner | `m10-art-bible-enemy-color.png` | Swatch links = Soll-Farbe aus `src/data/enemies.ts`, rechts der generierte Sprite; wisp/lantern, crow/fog, bomber/flame, wraith/lanternWhite, gargoyle/flameBright, abom/glow, voidcaller/nightMid kommen im Sprite nicht vor. |
| Boss-Canvas weicht von ART-Liste ab | 5 Bosse | `m10-art-bible-boss-size.png` | Roter Rahmen = Soll-Größe aus ART, Sprite = Ist. moor_queen 56 (Soll 48), bone_lord 64 (56), pale_shepherd 72 (64), bell_golem 80 (72), coven 96 (80); hollow_king 96 = 96. Die ART-Liste ist faktisch um einen Schritt verschoben. |
| Boss-Frames < 4 Posen | 6 Bosse | `m10-art-bible-boss-frames.png` | Alle Bosse haben 3 GEN-Frames; ART fordert Idle 2 + Wind-up 1 + Angriff 1 = 4. Frame 3 (Angriff) fehlt überall. |
| `artNote` „16x16“ vs. real 32×32 | 2 Charaktere | `m10-art-bible-chars.png` | Beide Spieler sind 32×32 mit 8 Anim-Keys (down/up/side + je Idle, plus Hit); der Kommentar in `characters.ts` ist veraltet, GAME.md/ART.md (32×32, 4-Frame-Lauf) stimmen. |
| GAME.md M3-Text „24×24, 2 Frames / Bosse 40×40“ | 1 Doku-Stelle | `m10-art-bible-boss-size.png`, `-enemy-height.png` | Ist sind Gegner 16–32 px je Tier mit 2–4 Frames und Bosse 56–96 px mit 3 Frames. |

Keine Abweichung gefunden bei: Gegner-Archetyp (30/30), Gegner-Canvas-Größe je Tier (30/30),
Gegner-Framezahl 2–4 (30/30), Palette nur 0–31 + Kontur 0 (alle), Tier-Akzentfarbe vorhanden (30/30).
