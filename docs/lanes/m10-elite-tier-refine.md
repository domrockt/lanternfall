# Lane m10-elite-tier-refine — Elite-Tier-Nachbesserungen (art-director 4/5-Reste)

Worktree `/home/ai/games/lf-lanes/m10-elite-tier-refine`, Branch `m10-elite-tier-refine`.
Rettung der 3 Nachbesserungen aus `docs/lanes/m10-elite-tier-families.md` (Abschnitt
„Abnahme“; deren backlog-Karten #7382-#7384 sind beim Board-Reconcile auf main verloren
gegangen — hier als Lane-Karten #7523-#7525 neu angelegt, Notiz `lane #7382-#7384`).

## Karten

- #7523 K1 T4/Terrain-Kontrast (Priorität): T4-Klasse `marsh` (30) → `marshLight` (31).
- #7524 K2 T0/T2 trennen: T2-Klasse `flame` (18) → `flameBright` (19).
- #7525 K3 70 %-Mix bei kollabierten Schattierungsstufen → Soft-Mix 0,65/0,6.

Alle drei sind **übernommen**; jede Änderung wurde vor der Übernahme gegen die
Akzeptanzgrenzen gemessen (Offline-Suchlauf mit festem Iterationslimit + Laufzeit-Lauf).

## Mechanik

- `ELITE_TIER_DYES = [16, 8, 19, 25, 31]` (vorher `[16, 8, 18, 25, 30]`).
- Neu: `eliteTierMixFor(id)` — deterministische Mischung je Typ. Default bleibt 0,7;
  Soft-Mix 0,65 für `wisp/knight/harpy/lich/wraith/treant` (2 → 3 Innen-Schattierungs-
  stufen), 0,6 für `imp` (2 → 4). `eliteTierPixel(pixel, tier, mix = 0.7)` hat einen
  optionalen mix-Parameter; das Default-Verhalten ist unveraendert.
- **Unangetastet (Verträge):** A10 — Randpixel zu 100 % Amber (PAL 20, Laufzeit 1,0
  vor/nach), Silhouette/Kontur(0)/Augen(13) bytegleich, genau 1 Frame je Typ, Key-Satz
  `<spriteKey>_rim`, `ELITE_RIM_FRAMES`/`eliteRimDef`/`framesForDef`, Nicht-Elite-Frames
  bytegleich (crowd-variety-Stand), EnemyPool/Run.ts und der Elite-Aura-Pfad in Run.ts.
- Nur Palettenindizes (`nearestPaletteIndex`), binäres Alpha, eine Pixelgröße.

## Warum diese Werte (Offline-Suchlauf, 2 Iterationen, festes Limit)

Replica der Laufzeit-Metrik in vitest (exakt dieselbe Mischformel, Laufzeit-Subset =
die 17 `ELITE_TYPES` aus `scripts/m10-elite-tier.mjs`, pixelgewichtet je Tier):

- **K1:** Unter Dye 30 landen 66-99 % der T4-Innenpixel auf 30/31 — genau die Farben
  des hellen Moorgrases (`src/gfx/tiles.ts`: Grasrampe 28/29/30 haeufig, 31 nur
  Details) → T4 dort nur über Kontur+Rim lesbar. Dye 31 liegt als Flächenfarbe
  außerhalb der häufigen Rampe. Trade-off, dokumentiert: T4-Bucket `gruen`
  82 % → 77,3 % (bleibt dominant; centipede/voidcaller landen teils auf paleMist 9).
  min Tier-Zentroid 43,8 (≥ 30).
- **K2:** T2-Bucket `glut-braun` 85 % → 83,2 % (≥ 82 %, dominant erhalten);
  Zentroid T0/T2 97,6 → 135,4, T2/T3 56,8 → 90,9.
- **K3:** Kollaps auf 2 Stufen bei 0,7 betrifft genau die Soft-Typen; `skeleton`/`bat`
  bleiben 2 Stufen (0,6/0,65 bringt nichts → unverändert 0,7), T0-Basen bleiben
  1 Stufe (nicht heilbar), `banshee` kollabiert nicht (4 Stufen).
- Test-Guard `tests/elite-tier-families.test.ts`: Dye-Paar-Distanz 60 → 55
  (T1 mist 8 vs. T4 marshLight 31 = 55,6; die eigentliche Trennung wird über die
  Zentroid-Metrik ≥ 30 bewacht, die weiter von Bestandswerten fern bleibt).

## Messungen (`scripts/m10-elite-tier.mjs`, identischer Aufbau, EIN Lauf je Stand)

Chaos: 305 Nicht-Elites (Tier-Mix 0-4, Ring 130-240) + Elite-Cluster: 2 Instanzen je
17 Elite-Typen (Radius 30-75); 640x360-Spielfenster bei 960x540 (2x), 4x-nearest-Crop
in-page. Metrik aus den echten Laufzeit-Texturen (Palettenindex-Klassifikation wie
`tests/enemy-palette.test.ts`).

| Metrik | Vorher (`refine-before`, a5d0d7b) | K1 (`refine-k1`, a0e3b99) | K2 (`refine-k2`, 8d4043e) | Nachher (`refine-after`, 0dc4bc0) |
|---|---|---|---|---|
| T0 dominant | glut-braun 100 % | 100 % | 100 % | 100 % |
| T1 dominant | mittel-neutral 92 % | 92 % | 92 % | 92 % |
| T2 dominant | glut-braun 85 % | 85 % | **glut-braun 83,2 %** | 83,2 % |
| T3 dominant | blut-rot 98 % | 98 % | 98 % | blut-rot 98,6 % |
| T4 dominant | gruen 82 % | **gruen 77,3 %** | 77,3 % | 77,3 % |
| Amber-Rim-Anteil (A10) | 1,0 | 1,0 | 1,0 | 1,0 |
| min Tier-Zentroid (Offline, exakt) | 56,8 (T2/T3) | 43,8 (T1/T4) | 69,3 (T1/T4) | 43,8 (T1/T4, ≥ 30) |
| Zentroid T0/T2 | 97,6 | 97,6 | **135,4** | 135,4 |
| Burst-FPS (median/mean, 240 Ticks, flock) | 60 / 60 | 60 / 60 | 60 / 60 | 60 / 60 |
| JS-Fehler / lebende Gegner / Elites / texMiss | 0 / 339 / 34 / 0 | 0 / 339 / 34 / 0 | 0 / 339 / 34 / 0 | 0 / 339 / 34 / 0 |
| Renderer (Pflicht) | Mesa Intel RPL-S (iGPU) | dito | dito | dito |

FPS liegt within noise (60/60 in allen vier Läufen, unter
`flock /home/ai/games/.lf-perf.lock`) — die Änderungen sind Re-Colorings des
bestehenden Rim-Frames, keine zusätzlichen Draw Calls oder Texturen.

## Abnahme

- `npx tsc --noEmit` grün, `npm run build` grün, `npm test` 1219/1219 grün
  (darunter elite-tier-families 6, elite-rim 8, crowd-variety 6, enemy-palette 6) —
  jeweils einmal pro Karte vor dem Commit und erneut nach dem Review-Fix.
- art-director (streng, Maßstab kommerziell auslieferbar, am 8x-gesichteten 4x-Crop
  Chaos+Elite-Cluster): **PASS 4,5/5**. K1 GELÖST (T4-Körper messbar außerhalb der
  Grasrampe, 31 Distanz 158/134/88 zu 28/29/30), K2 GELÖST (T0/T2-Helligkeits-Hue-
  Sprung, T0/T2-Zentroid 97,6 → 135,4), K3 für die benannten Typen GELÖST und
  unabhängig verifiziert (wisp/knight/harpy/lich/wraith/treant 3 Stufen, imp 4);
  A10-Rim (rimFehler=0 über 18 Typen), Silhouetten, Nicht-Elite-Masse, Palette,
  Pixelgröße, Chaos-Lesbarkeit ok. „muss neu": nichts.
  Re-Abnahme nach dem Review-Fix: Fix bestätigt (imp misst 4 Stufen), Note 4,5.
  Nicht-blockierende Nachbesserung als backlog **#7526** (T4-Stufenkollaps: horror 1
  Innenstufe, übrige T4-Typen 2 → Soft-Mix 0,55-0,6 mit Gegenprobe Bucket ≥ ~75 %).
- Reviewer: FAIL (mix-Parameter halb angewendet — Klassenfarbe weiter mit Konstante
  0,7 statt `mix`) → Fix im Produktionscode + Determinismus-Test über den mix-Pfad
  + erneuter refine-after-Lauf; **Re-Check PASS** (konvexe Mischung, Testdeckung,
  Belege 23f8824/0dc4bc0, 17/17 Stichprobe + Full-Run 1219/1219 grün).
- Renderer-String-Pflicht erfüllt: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
  OpenGL ES 3.2)` (iGPU, kein SwiftShader) in allen vier JSONs.
- FPS-Burst 60/60 median/mean unter flock — within noise.
- Mess-Skript-Budget: 1 Edit-Iteration (Crop-Artefakt-Fix: rAF-Zeichnung +
  Schwarz-Falle), nach dem ersten schwarzen Crop4x des Fix-Laufs (502-Byte-PNG,
  WebGL-Buffer-Race; Beleg in `shots/m10-elite-tier-refine-analysis.json`).

## Belege

- `shots/m10-elite-tier-refine-before.json/.png/-crop4x.png` (a5d0d7b, Baseline)
- `shots/m10-elite-tier-refine-k1.json/.png/-crop4x.png` (a0e3b99)
- `shots/m10-elite-tier-refine-k2.json/.png/-crop4x.png` (8d4043e)
- `shots/m10-elite-tier-refine-after.json/.png/-crop4x.png` (0dc4bc0, Final)
- `shots/m10-elite-tier-refine-analysis.json` (Offline-Suchlauf: Kandidaten-Tabelle,
  Index-Verteilungen, Schattierungsstufen, Aufnahme-Kriterien je Karte,
  Kontrolleur-Runden)
- `shots/m10-elite-tier-refine-{before,k1,after}-crop4x-view8x.png`,
  `shots/m10-elite-tier-refine-after-view2x.png` (Sichtungs-Views der Abnahme)

## Offene Punkte / Abgrenzung

- T4-Bucket `gruen` liegt mit 77,3 % unter dem 82 %-Niveau des families-Stands —
  bewusster Trade-off zugunsten des Terrain-Kontrasts (art-director-Priorität 1);
  `gruen` bleibt dominant, min Tier-Zentroid 43,8 ≥ 30.
- `centipede`/`voidcaller` (helle Basen) mischen bei T4 teils auf paleMist (9) —
  im Bucket `mittel-neutral`, aber im Crop über Rim+Silhouette weiterhin als
  T4-Elites lesbar; falls art-director das strengt, wäre eine per-Type-Dye-Abweichung
  eine eigene Karte.
- `skeleton`/`bat` behalten 2 Schattierungsstufen (0,6/0,65 restauriert keine dritte);
  T0-Basen bleiben 1 Stufe — nicht heilbar ohne neuen Palettenindex.
- Disponent-Mapping: die Claim-Liste nennt `tests/elite-tier.test.ts`; die einzige
  Elite-Tier-Testdatei im Repo ist `tests/elite-tier-families.test.ts` — sie ist als
  diese Datei bearbeitet (Lane-Notiz #7523).
