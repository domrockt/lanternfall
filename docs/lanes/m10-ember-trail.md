# Lane m10-ember-trail — Ember-Schweif vermessen und gedämpft

**Restpunkt aus `docs/lanes/m10-ember-readability.md`:** der additiv gezeichnete
Schweif (`fx_fire`-Trail am Ember-Projektil, dort als „alphaFrom 0,75“ notiert)
wurde nie separat als Glow-Footprint gemessen. Ziel: Near-White im Trail ≤ 2 %,
Glow-Footprint ≤ 60 px, Kern/Kontur-Kontrast und Ember-Lesbarkeit aus dem
Vorgänger-Job unangetastet.

## Korrektur des Befunds (wichtig fürs Nachlesen)

Der Schweif war zum Messzeitpunkt **nicht additiv** und lief nicht mit
alphaFrom 0,75: seit M5 (`137fb183`) rendert `CombatSystem.updateProjectiles`
den Ember-Trail mit **NORMAL-Blend + `emberOrange`-Tint (0xa84a21) und
alphaFrom 0,45** (`fx_fire`, 6 Frames, life 0,22 s, trailInterval 0,05 s,
Skala 0,8 → 0,15). Additiv sind nur Phoenix-Trail und die (frühere) Mündungsglut.
Konsequenz: Near-White ist im gerenderten Schweif schon vor dem Fix 0 % — das
reale Problem ist der **Footprint** (fx_fire ist 14×14, fast voll gedeckt).

## Messwerkzeug

`scripts/m10-ember-trail.mjs` nimmt die echten Phaser-Texturen aus dem
`dist`-Build und rendert den Schweif nach (NORMAL-Blend, Tint-Multiplikation,
Alpha-Interpolation alphaFrom→alphaTo über life, Nearest-Neighbor-Skalierung):

- **fresh Puff** (Alter 0, Skala 0,8) je Animationsframe,
- **Worst-Case-Stack** (5 Puffs voll überlappend, aeltester zuerst, jeder mit
  seinem Alter — trailInterval 0,05 s / life 0,22 s),
- Kontext `projectile_ember` (unverändert?).

Messaufruf (kein FPS-/Echtzeitlauf → keine flock-Sperre):

```
node scripts/m10-ember-trail.mjs shots/m10-ember-trail-before.json shots/m10-ember-trail-before
node scripts/m10-ember-trail.mjs shots/m10-ember-trail-after.json  shots/m10-ember-trail-after  --chaos
```

## Vorher (fx_fire-Trail, Commit `3f5982d`, Messung 21:07Z)

| Metrik | fresh Puff (max 6 Frames) | 5-Puff-Stack | Ziel |
|---|---|---|---|
| Near-White A7 (gerendert) | 0 % | 0 % | ≤ 2 % ✅ |
| Near-White minRGB200 | 0 % | 0 % | ≤ 2 % ✅ |
| **Glow-Footprint** | **73–75 px** | 73 px | ≤ 60 px ❌ |
| Off-Palette (Quelltextur) | 0 | — | 0 ✅ |

Belege: `shots/m10-ember-trail-before.json`, `-before-1x.png`, `-before-4x.png`
(Kontaktblatt: fx_fire-Quellframes mit Near-White-Kern, gerendert aber dunkel —
der Tint drückt alles unter die Near-White-Schwelle; FAIL nur beim Footprint).
**VERDICT: FAIL** (Footprint 75 > 60). Hinweis (Review): der 5-Puff-Stack im
Before-Lauf (73 px) wurde noch mit einer Stack-Routine gemessen, die transparente
Puff-Ränder als deckend behandelte (skriptseitiger Bug, im After-Lauf gefixt);
der FAIL stützt sich auf die Fresh-Puff-Werte (73–75 px), die davon unberührt sind.

## Fix (Karte #5538)

Nur `src/gfx/textures.ts` (neue Textur) und `src/systems/CombatSystem.ts`
(Trail-Belegung + Alpha) geändert. Keine Gameplay-Werte, kein FPS-Tuning.

- Neue `fx_ember_trail` (7×7, statisch): Ink-Rim, Körper `emberBrown`,
  Ring `flame`, genau 1 px `amber`-Kern — Rampe endet bei amber (0xffb84d,
  minRGB = 77), **kein** `lanternWhite`/`glow` → 0 % Near-White auch im Stack.
  Footprint 37 px (Quelle) / 24 px (gerendert auf Skala 0,8).
- `fireEmber`: `trail: "fx_ember_trail"`, `trailFrames: []` (statisch statt
  6er-Frame-Animation).
- `updateProjectiles`: Ember-Trail `alphaFrom 0,4` statt 0,45 (Waffen-Special-Case,
  Phoenix/Thorn/Ice unberührt); NORMAL-Blend + Orange-Tint bleiben.

## Nachher (fx_ember_trail, Messung 21:13Z)

| Metrik | fresh Puff | 5-Puff-Stack | Ziel |
|---|---|---|---|
| Near-White A7 (gerendert) | 0 % | 0 % | ≤ 2 % ✅ |
| Near-White minRGB200 | 0 % | 0 % | ≤ 2 % ✅ |
| **Glow-Footprint** | **24 px** | 24 px | ≤ 60 px ✅ |
| Off-Palette (Quelltextur) | 0 | — | 0 ✅ |

`projectile_ember` unverändert (Kontext in beiden Messläufen): 31 opake Pixel,
Near-White 3,23 % (1/31, wie im Vorgänger-Job), 0 Off-Palette, binäres Alpha.
**VERDICT: PASS.** Belege: `shots/m10-ember-trail-after.json`, `-after-1x.png`,
`-after-4x.png`.

## Chaos-Beleg

`shots/m10-ember-trail-after-chaos-640.png` — In-Game-Screenshot, **640×360**
(per `identify` geprüft), **700 lebende Gegner**, **4 Ember-Projektile im Flug**
(`dist 56 px`, `trailTexture: fx_ember_trail` je Projektil), 12 aktive
Trail-Puffs, 0 JS-Fehler. Messwerte: `shots/m10-ember-trail-after-chaos.json` —
die Screenkoordinaten sind **exakt synchron** zum PNG (Restpunkt aus dem
Vorgänger-Job hiermit erledigt): der Lauf friert die Szene beim Ablichten
(`timeScale 0`) und liest die Koordinaten mit Canvas-Offset; Kontrolle per
Pixel-Crop (Kern bei 364,215 sichtbar). Hinweis zur Auflösung: bei einem
640×360-Viewport rendert das Spiel nativ 480×360 (Fit-View, `MIN_WIDTH`
in `src/logic/view.ts`), zentriert im PNG (je 80 px Letterbox) — das PNG ist
trotzdem 640×360. Hinweis zum Trail: das Endgame-LOD schaltet Trails bei
≥ 500 Gegnern ab (`lodFor` → `trails: false`); für den Sichtbeleg ist
`fx.trailsEnabled` im Messlauf auf true gepinnt (nur Skript, kein Spielpfad) —
im Spiel gilt der Schweif-Messwert damit für alle LOD-Stufen mit Trails.

## Tests

`tests/ember-trail.test.ts` (7 Tests, gleiche Render-Regeln wie das Messskript):
(a) alle Pixel Palette oder transparent, Alpha nur 0/255, 0 Off-Palette,
(b) Near-White ≤ 2 % (beide Definitionen),
(c) Footprint ≤ 60 px (Quelle und skaliert),
(d) gerendert über nightDeep: 0 % Near-White auch im 5-Puff-Worst-Case-Stack,
(e) Kern/Kontur-Kontrast ≥ 5:1, geschlossener Ink-Rim,
(f) `projectile_ember` nicht verschlechtert (1/31 Near-White, 0 Off-Palette).

Ergebnis: `npx vitest run tests/ember-trail.test.ts` → 7/7; `npm test` →
**635/635 grün** (62 Dateien), `npx tsc --noEmit` grün, `npm run build` grün.

## Offene Restpunkte

- Keine aus diesem Job. Hinweis fürs Gameplay-Gefühl: der Schweif ist mit
  24 px Footprint deutlich dezenter als vorher (75 px) — falls das zu unauffällig
  wirkt, ist das eine neue Grafik-Karte, kein Rücksetzen dieses Fixes.
