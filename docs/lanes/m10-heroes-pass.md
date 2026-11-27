# Lane m10-heroes-pass — Mira & Kael bei 1× im Gedränge

**Ziel:** Die zwei Helden aus Doms Auftrag (Mira Ashwick + Bruder Kael) sind bei
1× Kamera und 300+ Gegnern sofort unterscheidbar und wirken hochwertig: eigene
Silhouette, eigene Akzentfarbe, saubere 4-Richtungs-Laufzyklen ohne
Frame-Duplikate.

## Ausgangslage

- `src/gfx/gen-chars.ts` ist AUTO-GENERIERT aus `scripts/art/gen_chars.py`.
- `src/gfx/chars.ts` definiert `PLAYER_FRAMES` (4 Richtungen × 4 Frames) und
  `createCharTextures`.
- `src/scenes/Run.ts` blieb in dieser Lane unberührt.
- K1-Baseline: Pixel-Differenz Mira↔Kael min **48,5 %**, mean 56,2 %,
  0 Frame-Duplikate, 0 Off-Palette-Pixel, Alpha nur 0/255.

## Änderungen

### K2 — Silhouette + Akzentfarbe (`#2399`, Commit `ebe2bc1`)

- **Mira:** schmaler Umhang mit 12–17 px Breite, goldene Saumborte (Laternen-Gold
  `20/21`), Hut-Silhouette bleibt der Anker.
- **Kael:** breite Schulterplatten, Axt-Blatt einschneidig nur **außen** (rechts),
  Stahlschneide `30/31` + Rost-Socket `17/18`; Kael führt kein Gold mehr
  (vorher wirkten beide Helden durch Gold zu ähnlich).
- Neue `tests/char-frames.test.ts` (5 Fälle): 2 Helden × 3 Laufrichtungen
  (+ gespiegelt links) × 4 Frames, konstante Frame-Größe 32×32, paarweise
  verschiedene Frames je Richtung, nur Palette-Indizes 0–31, Alpha nur 0/255,
  Pixel-Differenz je Richtung/Frame ≥ 35 %.

### K3 — Lauf-/Bob-Zyklus (`#2400`, Commit `065c232`)

- Bob-Sign korrigiert: Frames 1 und 3 verschieben Oberkörper/Kopf **1 px nach
  unten** (`[0, 1, 0, 1]`), Frames 0/2 bleiben auf Standhöhe. Belege: per
  Hutkrempen-Oberkante (`brimTopY`) gemessen ergibt sich in allen drei
  Richtungen exakt `0/1/0/1` px (`shots/m10-heroes-walk.json`).
- **Kael wirkt schwerer/langsamer:** breitere Stiefel (5 px vs. Mira 4 px),
  kleinere Vor-/Rückschrittweiten (`[1, 0, -2, -1]` vs. `[2, 1, -2, -1]`) und
  nur 1 px Bein-Lift statt 2 px. Der Massenschwerpunkt (`comY`) verschiebt sich
  bei Kael um 0,75 px, bei Mira um 0,68 px pro Bob-Frame.
- Belege: `shots/m10-heroes-walk.gif` (beide Helden, down/side/up, 24 Frames),
  `shots/m10-heroes-walk-{down,side,up}-8x.png`, `shots/m10-heroes-ingame.png`
  (Mira, 5:00, 286 Gegner) und `shots/m10-heroes-ingame-kael.png`
  (Kael, 5:00, 327 Gegner), jeweils 1× Kamera, 0 JS-Fehler.

## Kennzahlen vorher/nachher

Alle Pixel auf 32×32, 4 Frames × 3 Richtungen je Held.

| Kennzahl | K1 Baseline (`before`) | Nach K2/K3 (`after`) | Ziel |
|---|---|---|---|
| Pixel-Differenz Mira↔Kael, Minimum | 48,54 % | **49,12 %** | ≥ 35 % |
| Pixel-Differenz Mira↔Kael, Mittel | 56,15 % | **58,74 %** | ≥ 35 % |
| Frame-Duplikate | 0 | **0** | 0 |
| Off-Palette-Pixel | 0 | **0** | 0 |
| Alpha ∉ {0, 255} | 0 | **0** | 0 |
| Frame-Größe konstant | ja (32×32) | ja (32×32) | ja |
| Bob-Höhe je Richtung | 0/−1/0/−1 (nach oben) | **0/1/0/1 (nach unten)** | 0/1/0/1 |

Messung: `python3 ~/tmp/m10-heroes-pass/measure_heroes.py after` (liest
`scripts/art/gen_chars.py`), Rohdaten `shots/m10-heroes-after.json`.

## Belege

- `shots/m10-heroes-before-1x.png`, `-before-4x.png`, `-before.json`
- `shots/m10-heroes-after-1x.png`, `-after-4x.png`, `-after.json`
- `shots/m10-heroes-walk.gif`, `-walk.json`, `-walk-{down,side,up}-8x.png`
- `shots/m10-heroes-k2-1x.png`, `-k2-4x.png`, `-k2-4x.json`
- `shots/m10-heroes-ingame.png` / `.json` (Mira, 5:00, 286 Gegner)
- `shots/m10-heroes-ingame-kael.png` / `.json` (Kael, 5:00, 327 Gegner, 0 JS-Fehler)

## Abnahme

- `npm run build`: **rc=0**, grün (807 ms, `vite build`).
- `npm test`: **rc=0**, **273/273 Tests** in 24 Dateien grün.
- Akzeptanz: Pixel-Differenz min 49,12 % (Ziel ≥ 35 %), 0 Frame-Duplikate,
  0 Off-Palette-Pixel, Alpha nur 0/255.

## Art-Director-Abnahme

**Urteil: JA — beide Helden sind bei 1× Kamera im Gedränge in ≤ 1 s
unterscheidbar.** Gesamt **4,5/5**.

| Kriterium | Note | Befund |
|---|---|---|
| Silhouette | 5/5 | Mira: breite Hutkrempe + schmaler Umhang; Kael: breite Schulterplatten + Axt-Blatt außen. Kein Verwechseln im 1×-Bogen. |
| Akzentfarbe | 5/5 | Mira Laternen-Gold (Hutborte, Saum, Laterne); Kael Rost/Stahl ohne Gold. Farbidentität auch im Rost-Rudel lesbar. |
| Lauf-/Bob-Zyklus | 4/5 | 0 Duplikate, Bob exakt 0/1/0/1 px je Richtung; Kael schwerer (5-px-Stiefel, kleinerer Schritt, 1-px-Lift). 1-px-Hub am 1×-Gegnerbild dezent, im 8×-Lauf klar. |
| Palette/Lesbarkeit im Gedränge | 4/5 | `shots/m10-heroes-ingame.png` (Mira, 5:00, 286 Gegner) und `shots/m10-heroes-ingame-kael.png` (Kael, 5:00, 327 Gegner): Held jeweils mittig, warme Laterne vs. dunkle Stahl-Silhouette sofort auffindbar. 0 JS-Fehler. |

Geprüfte Belege: `m10-heroes-after-1x.png`, `-after-4x.png`,
`m10-heroes-walk.gif`, `-walk-{down,side,up}-8x.png`, beide In-Game-Shots.

## Offene Punkte

- Keine offenen Restpunkte aus A10; der Helden-Pass ersetzt die bisherige
  „nur vorhanden“-Lücke, ohne `Run.ts` oder `GAME.md` anzufassen.

## Commits

- K1 `752d9c5` — Baseline-Kontaktbogen + Kennzahlen (`#2398`)
- K2 `ebe2bc1` — Silhouette + Akzentfarbe, `tests/char-frames.test.ts` (`#2399`)
- K3 `065c232` — Bob-Zyklus nach unten, Walk-GIF + In-Game-Shot (`#2400`)
- K4 (dieser Commit) — After-Kontaktbogen, Art-Director-Urteil, `.lane-done`
