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
- **17 Gegner:** sichtbare Höhe außerhalb der ART-Tier-Rampe (z. B. spider 13 px statt 18–22,
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

## Ergebnis Karte #3 (Basis 48d590c) — Lückenliste mit Empfehlung

Gesamt: **38 Einträge** (30 Gegner, 6 Bosse, 2 Charaktere), jeder mit Soll/Ist geprüft —
**0 Einträge ohne Prüfung**. Von 38 Einträgen haben 26 mindestens eine Abweichung, 12 sind sauber.
Summe der fehlgeschlagenen Felder: **35**.

| Lücke | Betroffen | Empfehlung | Ziel |
|---|---|---|---|
| Sichtbare Höhe driftet von ART-Tier-Rampe | 17 Gegner (skeleton 20/14–18, ghoul 19, witchling 19, slime 13, scarecrow 20, wolf 17/18–22, golem 24, spider 13, bomber 24, knight 28/22–26, wraith 21, treant 28, imp 18, horror 23/26–30, centipede 15, gargoyle 25, abom 24) | **Doku + Code splitten:** ART.md sagt, ob die Rampe Canvas oder BBox meint, und erlaubt ±2 px; Code-Karte für spider/centipede/imp (≥ 4 px unter Soll) mit größerer Silhouette im bestehenden Canvas. | ART.md (Merge-Job/Dom) + neue Code-Karte |
| `color` aus `enemies.ts` fehlt im Sprite | wisp (lantern 21), crow (fog 7), bomber (flame 18), wraith (lanternWhite 13), gargoyle (flameBright 19), abom (glow 22), voidcaller (nightMid 3) | **Code:** entweder `color` als garantierten Basiston/Akzent in die Sprite-Generierung aufnehmen und per Test prüfen, oder das Feld entfernen (es ist derzeit tote Daten). Empfehlung: Feld behalten + Test `color in Sprite-Palette` für alle 30. | Code-Karte (`src/data` + `src/gfx/enemySprites`) |
| Boss-Canvas weicht von ART-Liste ab | moor_queen 56 (Soll 48), bone_lord 64 (56), pale_shepherd 72 (64), bell_golem 80 (72), coven 96 (80); hollow_king 96 = 96 | **Doku:** ART.md-Bossliste auf Ist korrigieren: 56 / 64 / 72 / 80 / 96 / 96. GAME.md M3-Text „40×40“ mitkorrigieren. Kein Code-Eingriff nötig. | ART.md + GAME.md |
| Boss-Frames nur 3 statt ART 4 Posen | alle 6 Bosse (moor_queen, bone_lord, pale_shepherd, bell_golem, coven, hollow_king) | **Code (Art-Pass):** je Boss einen eigenen Angriffs-Frame ergänzen (Idle 2 + Wind-up 1 + Angriff 1). Bis dahin ART.md nicht ändern, damit die Lücke sichtbar bleibt. | neue Code-/Art-Karte |
| `artNote` „M1-Platzhalter 16x16“ veraltet | mira, kael (real 32×32, 4-Frame-Lauf) | **Code:** `artNote` in `src/data/characters.ts` auf den Ist-Stand (32×32, 4-Frame-Lauf, 8 Anim-Keys) aktualisieren. | Code-Karte |
| GAME.md M3-Status nennt „30 Platzhalter-Sprites 24×24, 2 Frames“ und „Bosse 40×40“ | 1 Doku-Stelle (GAME.md Zeilen ~168/171) | **Doku:** Text auf 16–32 px je Tier, 2–4 Frames bzw. 56–96 px, 3 Frames korrigieren. | GAME.md (Merge-Job/Dom) |

Nicht zu ändern in dieser Lane: ART.md, GAME.md, `src/**`, `scripts/**`, `tests/**`, `index.html`, `public/**`.

## Anhang — alle 38 Einträge (Prüfstatus)

| # | Typ | ID | Felder geprüft | Abweichungen | Beleg |
|---|---|---|---|---|---|
| 1 | enemy | bog_rat | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 2 | enemy | wisp | 6 | Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 3 | enemy | mudling | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 4 | enemy | crow | 6 | Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 5 | enemy | bogzombie | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 6 | enemy | toad | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 7 | enemy | skeleton | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 8 | enemy | bat | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 9 | enemy | ghoul | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 10 | enemy | witchling | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 11 | enemy | slime | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 12 | enemy | scarecrow | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 13 | enemy | wolf | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 14 | enemy | banshee | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 15 | enemy | golem | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 16 | enemy | spider | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 17 | enemy | cultist | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 18 | enemy | bomber | 6 | Sichtbare Höhe, Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 19 | enemy | knight | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 20 | enemy | harpy | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 21 | enemy | lich | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 22 | enemy | wraith | 6 | Sichtbare Höhe, Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 23 | enemy | treant | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 24 | enemy | imp | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 25 | enemy | horror | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 26 | enemy | centipede | 6 | Sichtbare Höhe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 27 | enemy | gargoyle | 6 | Sichtbare Höhe, Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 28 | enemy | reaper_bat | 6 | — | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 29 | enemy | abom | 6 | Sichtbare Höhe, Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 30 | enemy | voidcaller | 6 | Datenfarbe | shots/m10-art-bible-enemy-height.png / -enemy-color.png |
| 31 | boss | moor_queen | 5 | Größe (ART Boss0), Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 32 | boss | bone_lord | 5 | Größe (ART Boss1), Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 33 | boss | pale_shepherd | 5 | Größe (ART Boss2), Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 34 | boss | bell_golem | 5 | Größe (ART Boss3), Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 35 | boss | coven | 5 | Größe (ART Boss4), Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 36 | boss | hollow_king | 5 | Frames (ART Idle2/Windup1/Attack1) | shots/m10-art-bible-boss-size.png / -boss-frames.png |
| 37 | character | mira | 5 | — | shots/m10-art-bible-chars.png |
| 38 | character | kael | 5 | — | shots/m10-art-bible-chars.png |
