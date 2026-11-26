# Lane m10-art-bible — ART.md/GAME.md vs. echter Datenstand

Basis-SHA beim Start: **48d590c** (Worktree `/home/ai/games/lf-lanes/m10-art-bible`, Branch `m10-art-bible`).
Nur lesend geprüft; **ART.md und GAME.md bleiben in dieser Lane unverändert**.

## Karten-Checkliste

- [x] #1 Matrix bauen: GAME.md/ART.md-Einträge vs. ENEMIES/BOSSES/CHARACTERS vs. GEN_*-Frames.
      Abnahme: 38 Zeilen mit Soll/Ist je Feld → `shots/m10-art-bible-matrix.json` (38 rows), Log `shots/m10-art-bible-matrix.out`. Skript: `~/tmp/m10-art-bible/matrix.mjs`.
- [ ] #2 Diff + Bilder: je Abweichung ein 4x-Beleg-Shot nach `shots/m10-art-bible-*`, Abweichung in Worten.
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
