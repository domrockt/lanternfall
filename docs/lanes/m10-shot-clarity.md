# Lane m10-shot-clarity — Optik-Kurs Gegner-Projektile im Chaos (Dom 21:45Z, hoechster Vorrang)

**Ziel:** Gegner-Projektile im 300/500-Gegner-Chaos sofort lesbar und unterscheidbar; Spieler-Schuesse klar getrennt; kein Near-White-Verstoss. Reine Optik — Treffer-/Waffen-Logik bitgleich.

**Befund/Ansatz:** `src/systems/EnemyProjectiles.ts` exportiert `shotTextureFor` + `EnemyProjectilePool`; die Schuss-Optiken liegen als `HD_GRIDS` in dieser Datei und sind ohne `src/gfx/gen-fx.ts` / `src/systems/FxSystem.ts` (belegt) aenderbar. `src/systems/CombatSystem.ts` unangetastet.

## Messwerkzeug

`scripts/m10-shot-clarity.mjs` (Playwright, dist-Build, seed=1, Minute-25-Chaos):
- Zwei Chaos-Szenen (300/500 Gegner; Mix: toad=spit, witchling=bone, lich=shadow, horror=fire + Fuell-Schwarm; Gegner unverwundbar, KI schießt 2 s Echtzeit).
- Schuesse je Typ aus `enemyShots.active` (Textur) + Pool-Statistik.
- Near-White der Schuss-Pixel, Definition **A7** (r,g,b ≥ 150 **und** r ≥ 235, Kalibrierung wie ACCEPTANCE A7 / m10-ember-readability); klassifiziert per Palette-Nahe-Suche (Toleranz 34 RGB-Euklid, deckt den Alpha-Puls 0,84–1,0) in der Shot-Box (±18 px) um jedes aktive Projektil.
- WCAG-Kontrast je Schuss-Pixel gegen Median-Luminanz des lokalen Box-Hintergrunds.
- Textur-Exaktanalyse (Kontaktblatt aus den Laufzeit-Texturen): Palette-Treue, binaeres Alpha, Near-White, Farb-Diskjunktion zu `projectile_ember`.
- Screenshots: `shots/m10-shot-clarity-<tag>-{300,500}.png`, JSON `-<tag>.json`. Kein FPS-/Echtzeitlauf → ohne flock.

## Vorher (commit 55a8f74, `shots/m10-shot-clarity-before.json`)

| Metrik | 300er | 500er |
|---|---|---|
| aktive Schuesse | 121 | 167 |
| Schuesse je Typ (spit/bone/shadow/fire) | 80/15/11/15 | 92/14/31/30 |
| **Near-White (A7) der Schuss-Pixel** | **24,90 %** | **19,90 %** |
| worst family im Frame | shadow 31,0 % | shadow 31,0 % |

Texturen (exakt): spit 24,56 % A7-near-white (13 lanternWhite als Lichtkante), shadow 27,78 % (13), fire 6,35 % (22 glow), bone 2,04 %. Spieler-Ember {0,17,18,20,21,13} teilte **13 lanternWhite** mit spit/bone/shadow und **20 amber** mit fire → Verwechslungsgefahr. Grenze 4,16 % (ACCEPTANCE-Kalibrierung) klar verfehlt.

## Fix (commit d910a8d, nur `src/systems/EnemyProjectiles.ts::HD_GRIDS`)

| Familie | Farben | Groesse | Flaeche | Silhouette |
|---|---|---|---|---|
| spit (Tier 0) | Ink 0 + 30 marsh + 31 marshLight | 7x8 | 34 | Tropfen + Tail |
| bone (Tier 1) | Ink 0 + 10 bone + 11 boneLight | 8x7 | 44 | Knochenpaar |
| shadow (Tier 3) | Ink 0 + 8 mist + 9 paleMist | 9x10 | 46 | offener Halo (C) |
| fire (Tier 4) | Ink 0 + 24 blood + 25 crimson + 26 hotRed | 10x13 | 78 | Flamme |

- Monotone Groessenstaffel (hoeherer Tier = mehr Danger = groesser): 34 < 44 < 46 < 78.
- `13 lanternWhite` und `22 glow` entfernt → Textur-Exakt: **0 % Near-White (A7)**, binaeres Alpha, Palette-konform.
- Spieler-Ember (`projectile_ember` = warmgold {0,17,18,20,21,13}) teilt mit keiner Gegnerfamilie mehr als Ink 0 — Gegner-`fire` bewusst nach Glut-Rot verlagert, weg vom warmen Gold.
- Geschlossene 1-px-Inktenkontur bleibt; Update-/Treffer-Pfad unveraendert (Radius/Kollision weiterhin aus `spawn()`-Optionen, alpha-Puls unveraendert).

## Nachher (commit d910a8d, `shots/m10-shot-clarity-after.json`)

| Metrik | 300er | 500er |
|---|---|---|
| aktive Schuesse | 106 | 171 |
| Schuesse je Typ | 71/12/10/13 | 100/16/29/26 |
| **Near-White (A7) der Schuss-Pixel** | **0,30 %** | **0,36 %** |

Worst scene 0,36 % ≤ 4,16 % → **PASS** (Restwert = Klassifikations-Toleranz am Alpha-Puls, keine echten Near-White-Pixel: Texturen exakt 0 %).uniqueColorShare (Anteil familien-eindeuter Farbe): spit 55,9 %, bone 36,4 %, shadow 52,2 %, fire 66,7 %. Kontrast mean 2,3–3,8 (min 1,0 — Einzel-Pixel ueber gleichhelligem Grund, Kontur traegt die Form).

## Tests

`tests/shot-clarity.test.ts` (8 Tests, gruen): Rechteckigkeit + Palette-Konformitaet, binaeres Alpha, 0 % A7-Near-White, paarweise Farb-Diskjunktion (nur Ink 0 geteilt), Silhouetten-XOR ≥ 8 px je Paar, Groessenstaffel, Spieler-Ember-Diskjunktion, Treffer-Pfad-Statistik bitgleich zur deterministischen Baseline (attempted 7 / fired 5 / hits 2 / cancelledShooterDeath 1 / cancelledOffscreen 1 / windupOk 5).
`tests/enemy-shots-fair.test.ts` unangetastet, 14/14 gruen. `npx tsc --noEmit` rc=0.

## Offene Punkte / Hinweise

- `ENEMY_SHOT_VISUALS` in `src/logic/bosses.ts` (rim/core/spark-Metadaten) ist nur Family-Lookup fuer `textureFor` — nicht angefasst (fremde Datei, Disponent).
- fire-Rot liegt farblich nahe an roten Gegnern (spider/horror sind blood/hotRed-farben); im Chaos-Mix der Messung entsprechend vertreten. Kontur + Flamme-Silhouette tragen; art-director-Urteil siehe unten.
- spit-Gruen (30/31) ist der Moor-Terrain-Block; ueber Moor-Grund traegt die Ink-Kontur (meanContrast 2,3,min 1,0). Alternative Farben im 32er-Raum wuerden mit Spieler/anderen Familien kollidieren.

## Urteil art-director (2026-11-28)

**PASS — 4/5.** Belege: Kontaktblatt 3x nearest, Chaos-Szenen 2x, Zentrum-Crops 4x, In-Szene-Cluster-Scan (56x56-Crops um 8 echte Schuss-Cluster, 5x nearest), Messwerte gegengelesen.

- (1) Auseinanderhaltbarkeit Farbe+Form: erfuellt — alle 4 Familien schussgross im 500er-Chaos nachweisbar, keine weissliche Masse mehr.
- (2) Spieler-Ember-Trennung: erfuellt (warmgold vs. Blutrot, nur Ink 0 geteilt).
- (3) Silhouetten/Konturen sauber: geschlossene 1-px-Inktenkontur, binaeres Alpha, Licht oben-links, Palette-konform.
- (4) Lesbarkeit: Restrisiko, kein Verstoss — fire-Rot liegt paeltnah an roten Gegnern, spit-Gruen an Moor-Grund; dort traegt Kontur+Form.

Optionale Nachbesserungen (kein FAIL-Grund, nicht umgesetzt): fire-Basis mehr 14/15 Glutbraun statt 24, oder heller 1-px-Kern; spit-Tail-Ende 1 px in 29 mossDark absetzen.

