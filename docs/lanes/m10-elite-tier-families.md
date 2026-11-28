# Lane m10-elite-tier-families — Elite-Tier-Familien (Karte #6322 + A10-Restpunkt)

Worktree `/home/ai/games/lf-lanes/m10-elite-tier-families`, Branch `m10-elite-tier-families`.
Aufbau auf dem gemergten `merge-m10-crowd-variety`-Stand (echte Code-Abhängigkeit: der Fix
aendert den Elite-Rim-Frame in `src/gfx/enemySprites.ts`, der auf dem crowd-variety-
Sprite-Stand sitzt).

## Ziel

Elites sind im 300-500er-Chaos ihrer Tier-Familie (Tier 0-4) zuzuordnen — Faerbe-Klassen
je Tier, ohne Silhouetten, crowd-variety-Varianten oder den Elite-Rim-Kontrast (A10,
Amber-Rand) zu brechen. Quelle: Board-Karte #6322 (art-director-Nachbesser aus
m10-enemy-palette: 6 von 30 Typen bleiben blaugrau/weiss dominiert, Familien-Abdeckung
unter Elites duenn) + Dom 21:45Z Punkt 7 (Gegnermasse lesbar).

## Karten

- #7378 K1 Before-Belege (Chaos + Elite-Cluster, 4x-Crop, Renderer-Pflicht).
- #7379 K2 Tier-Faerbe-Klassen in `enemySprites.ts` + Tests (Familien-Kontrast-Metrik,
  Palette-Compliance).
- #7380 K3 Chaos-Nachweis 300+ Gegner + art-director-Abnahme + FPS.
- #7381 K4 Doku + `.lane-done`.

## Mechanik (K2)

- `ELITE_TIER_DYES = [16, 8, 18, 25, 30]` — genau eine Faerbe-Klasse je Tier 0-4
  (T0 glut-braun/emberBrown, T1 dunst/mist, T2 flamme/flame, T3 blut-rot/crimson,
  T4 gruen/marsh). Nur Palettenindizes; min. Paar-Distanz 69, Luminanz 64-123.
- `eliteTierPixel(pixel, tier)`: Innenpixel des Elite-Rim-Frames werden deterministisch
  mit **70 %** Klassenfarbe gemischt und auf den naechsten Palettenindex gerundet.
  Kontur (0) und Augen/Glow (13) geben sich unveraendert zurueck.
  Die Mischung wurde nach der ersten after-Messung von 55 % auf 70 % angehoben (feste
  Kriterium: dominante Klasse je Tier) — helle Elite-Koerper (candleWhite/glow) haben
  die 55 %-Klasse ueberstrahlt (T4 war dominant mittel-neutral statt gruen).
- `eliteRimFrame(index)`: erst Tier-Faerbung des Basis-Koerpers, dann Vollumrandung in
  `ELITE_RIM_COLOR` (Amber, PAL 20). **A10-Vertrag unveraendert:** Randpixel zu 100 %
  Amber (gemessen 1,0 vor/nach), Silhouette gleich, weiterhin genau 1 Frame je Typ,
  Key-Satz `<spriteKey>_rim`, `ELITE_RIM_FRAMES`/`eliteRimDef`/`framesForDef` unveraendert,
  EnemyPool/Run.ts nicht angefasst.
- **Nicht-Elite bytegleich:** `enemySpriteFrames`/`enemyFrameGrids` unveraendert — die
  crowd-variety-Varianten (Frames 2/3) und der enemy-palette-Stand bleiben unberuehrt
  (Test: Basis-Frames werden aus den rohen `GEN_ENEMIES`-Zeilen neu berechnet und
  bytegleich verglichen).

Warum keine Rim-Farb-Klassen (statt Koerper-Faerbe-Klassen)? Der gemergte A10-Stand hat
die Amber-Vollumrandung als Elite-Signal abgenommen (art-director 4/5, 0 Luecken);
eine tier-abhaengige Randfarbe haette den abgenommenen Vertrag und den Wiedererkennungs-
wert ("amber Rand = Elite") gebrochen. Die Tier-Klasse liegt deshalb im Koerper, direkt
unter dem unveraenderten Amber-Rand.

## Fremd-Datei (Disponent-Anfrage)

`tests/elite-rim.test.ts` (in claims.json von niemandem geclaimed): EINE Assertion
additiv relaxiert — "Innenpixel unveraendert" zu "Innenpixel = `eliteTierPixel(Basis,
Tier)`" (Kontur 0 / Augen 13 geben sich unverändert zurueck, also auch dort bytegleich).
Alle anderen elite-rim-Vertraege laufen unveraendert gruen (Rand voll Amber, Silhouette,
1 Frame, Key-Satz, `ELITE_RIM_COLOR = 20`, EnemyPool-Verhalten). Begruendung und
Anfrage: `/home/ai/games/.dispatch/requests.md` (2026-11-28T01:45Z).

## Messungen (`scripts/m10-elite-tier.mjs`, identischer Aufbau vor/nach, EIN Lauf je Stand)

Chaos: 305 Nicht-Elites (Tier-Mix 0-4, Ring 130-240) + Elite-Cluster: 2 Instanzen je
18 Elite-Typen aller 5 Tiers (Radius 30-75) um den Spieler; 640x360-Spielfenster bei
960x540 (2x), 4x-nearest-Crop in-page (imageSmoothingEnabled=false). Metrik aus den
ECHTEN Laufzeit-Texturen (Palettenindex-Klassifikation wie `tests/enemy-palette.test.ts`).

| Metrik | Vorher (#7378, Commit 417e404) | Nachher (#7380, Commit 6d1943a) |
|---|---|---|
| Amber-Rim-Anteil (Randpixel PAL 20, alle Typen) | 1,0 | 1,0 |
| Dominante Familie T0 | gold | glut-braun 100 % |
| Dominante Familie T1 | hell-neutral | mittel-neutral 92 % |
| Dominante Familie T2 | **mittel-neutral** | glut-braun 85 % (Index 18, T0: 16) |
| Dominante Familie T3 | **mittel-neutral** | blut-rot 98 % |
| Dominante Familie T4 | **mittel-neutral** | gruen 82 % |
| min. Tier-Zentroid-Distanz (Unit-Test, exakt) | 13,2 | **56,8 (4,3x)** |
| Burst-FPS (median/mean, 240 rAF-Ticks, flock) | 60 / 60 | 60 / 60 |
| JS-Fehler / lebende Gegner | 0 / 339 | 0 / 339 |
| Renderer | Mesa Intel RPL-S (iGPU) | Mesa Intel RPL-S (iGPU) |

Vorher waren die Elites der Endgame-Tiers 2-4 farblich nicht von der Grau-Masse
unterscheidbar; nachher traegt jedes Tier eine dominante Klasse (>= 82 % seiner
Elite-Koerperpixel). Die Familien-Buckets sind grob (glut-braun fasst Index 14-19,
daher T0/T2 im selben Bucket — aber mit 5 verschiedenen Palettenindizes und
Zentroid-Distanz 56,8).

Unit-Test-Metrik (`tests/elite-tier-families.test.ts`): min. Paar-Distanz der 5
Tier-Zentroiden ueber die echten Elite-Rim-Frames — vorher (Basis-Ruheposen) 13,2,
nachher 56,8; Assert: >= 30 UND >= 2x vorher.

## Belege

- `shots/m10-elite-tier-before.json/.png/-crop4x.png` (Commit 417e404)
- `shots/m10-elite-tier-after.json/.png/-crop4x.png` (Commit 6d1943a)
- Renderer-String in beiden JSONs: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU, Pflicht)

## Abnahme

- art-director (streng, Subagent, 28.11.): **PASS 4/5** (Ziel >= 4 erreicht).
  Befunde: Tier-Klassen before -> after deutlich lesbar (T3 blut-rot/T2 flamme sofort,
  T4 gruen/T0 rostbraun klar, T1 bewusst Dunst); Amber-Rim als 1-px-Kante intakt
  (eigene Zooms + Code-Sichtung, binäres Alpha); Silhouetten/Kontur/Augen bytegleich;
  Nicht-Elite-Masse unverändert (eigener Pixel-Diff: Änderungen konzentriert im
  Elite-Cluster, Terrain < 0,3 % Glühwürmchen/Nebel-Drift); Palette-Disziplin sauber
  (Paletten-Guard 458 Assets / 0 off-palette); Chaos-Lesbarkeit nicht schlechter als
  before, in warmen Tiers besser. "muss neu": nichts.
  Nachbesserungen (kein Abnahme-Blocker, als backlog-Karten angelegt):
  1. T4-Klasse vs. Terrain-Kontrast: `marshLight` (31) statt `marsh` (30) messen —
     T4-Elite auf hellem Moorgras aktuell nur ueber Kontur+Rim lesbar (Priorität).
  2. T0/T2-Paar trennen (min Zentroid 56,8): T2-Mix Richtung flameBright (19) messen.
  3. 70-%-Mix bei kleinen Sprites (Banshee, 2 statt 3 Schattierungsstufen) auf
     60-65 % testen, sofern Metrik >= 30 haelt.
- Tests: `npm test` 1086/1086 gruen, `npx tsc --noEmit` gruen, `npm run build` gruen
  (Paletten-Guard-Tests: elite-tier-families 5, elite-rim 9, crowd-variety 6,
  enemy-palette 6 — alle gruen).
- FPS: Burst median 60 fps vor/nach (unter `flock /home/ai/games/.lf-perf.lock`), kein
  Unterschied — die Faerbung ist eine Re-Color der bestehenden Rim-Textur, keine
  zusaetzlichen Draw Calls oder Texturen.

## Offene Punkte / Abgrenzung

- T0 und T2 teilen sich den groben Familien-Bucket "glut-braun" (Palettenindizes 16 vs
  18, dunkles Rost vs. helles Orange); falls art-director eine strengere Bucket-Trennung
  will, muesste eine der Klassen auf eine andere Palette-Familie umziehen (eigene Karte).
- `wraith`/`banshee`-Elite-Klassen lesen sich wegen ihrer hellen Basis heller als die
  uebrigen Typen ihres Tiers; die Klassenzugehoerigkeit bleibt erkennbar (Bucket-Anteil
  je Tier >= 82 %).
- Der Elite-Aura-Pfad in Run.ts (M9-K3) ist unveraendert; die Aura bleibt Amber-getintet
  hinter dem jetzt tier-gefaerbten Koerper.
- Supervisor-Hinweis (28.11.) umgesetzt: keine weiteren Edits am Mess-Skript nach K1;
  FPS-Laeufe (Burst-Pflichtwert) unter flock, Screenshot-/Probe-Anteile im selben Lauf.
