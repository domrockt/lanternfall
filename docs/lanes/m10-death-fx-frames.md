# M10-death-fx-frames — Neue Todes-VFX-Frames (gfx-Nachzug)

Lane: `m10-death-fx-frames` (Worktree `/home/ai/games/lf-lanes/m10-death-fx-frames`, Branch `m10-death-fx-frames`).
Auftrag: Behebung des belegten **art-director FAIL 2,5/5** (Runde 2) an den Todes-VFX
(Bedarfsmeldung der Lane `m10-death-fx` in `/home/ai/games/.dispatch/requests.md`).
Befund: alle 4 Todesklassen wirkten im Bild nur als Farbe/Grösse desselben
„expandierenden Rings". Fix ausschliesslich in `src/gfx/gen-fx.ts` (Frames) +
Frame-Keys in `src/logic/death.ts`. **Keine Gameplay-/Balance-Werte geändert**,
`src/systems/CombatSystem.ts` und `src/systems/FxSystem.ts` unberührt.

## Karten

| Karte | Commit | Inhalt |
|---|---|---|
| #4418 K1 | `8a25bf8` | `deathFrameSets()` als Single Source of Truth exportiert; Vorher-Belege |
| #4419 K2 | `d12d99d` | 5 neue Silhouetten-Generatoren + `fx_death_fire` neu + `fx_boss_core` 32x32 |
| #4420 K3 | `5524b7b` | `tests/death-frames.test.ts` (5 Guards) + Sheet-BG-Fix |
| #4421 K4 | (dieser Commit) | Nachher-Belege, Chaos-Shot, Doku, art-director-Urteil |

## Frame-Spezifikation (umgesetzt in `src/gfx/gen-fx.ts`)

Alle Frames deterministisch (kein `Math.random`), nur Palettenfarben,
`.` = transparent (binaeres Alpha). Quelle: `deathFrameSets()` — dieselben
Zeilen-Zeilen, die `createFxTextures` als Texturen registriert (Tests und
Beleg-Skript lesen exakt dieselben Frames).

| Key | Klasse | Silhouette | Frames |
|---|---|---|---|
| `fx_death_blob` | burst | dunkler moorgrüner Körper (mossDark + marshLight-Speckles), harter 1-px-nightDeep-Rim, grosser lanternWhite-Kern mit candleWhite-Übergang, 4 grosse Tropfen (Kopf+Flanke+Schweif+Rim) die mit der Stufe nach aussen fliegen | 4 (9x9) |
| `fx_death_bone` | crumble | 2-3 handgesetzte Knochenformen (Schaft bone, Endknubbel boneLight), Zerfall nach unten: intakt → auseinander → gebrochen (Schaft-Lücke) → Trümmer/Staub | 4 (9x9) |
| `fx_death_dust` | sputter-Staub | Ascheflakes: zwei schräg aufstiebende Wind-Streifen + einzeln verwehende Flocken (paleMist/mist) + Glimmreste (emberDark) | 4 (9x9) |
| `fx_death_fire` | sputter-Shard | 3 Flammenzungen (flameBright-Basis → flame → amber-Spitze) mit Schwung, ab Stufe 2 lösen sich Spitzen als Funken; sparsame dunkle Glimmreste | 4 (9x9) |
| `fx_death_void` | dissolve | ein geschwungener aufsteigender Schwaden (unten breit, oben schmal, fogBlue/paleMist) + Nebenwisp + abgelöste Punkte (Runde-2-Befund „Ring statt Schwaden") | 4 (9x9) |
| `fx_boss_core` | Boss-Tod | 32x32: 3-Stufen-Kern (lanternWhite → glow → amber, kollabiert), 2 expandierende Zackenringe (flame/glut), 8 radiale Splitter, harte ink-Kontur + Lichtkante via `outlineAndRim` | 6 (32x32) |

Zuordnung in `src/logic/death.ts` (nur Frame-Keys, Werte unverändert):
`sputter.shard: fx_death_fire`, `sputter.dust: fx_death_dust`, `sputter.rim: fx_death_fire`
(davor zeigte sputter auf `fx_death_dust`/`fx_fire`). `FX_FRAME_COUNTS.fx_death_fire = 4` neu.

## Vorher/Nachher

Vorher (Runde-2-Stand, Commit `8a25bf8`): `shots/m10-death-frames-before-{blob,dust,void,bone,boss}.png`
(4x-Zoom) — erkennbar: alle Klassen als derselbe hohlere „Ring" aus Einzelpixeln.
`fx_death_fire` hat keinen Vorher-Beleg (Key existierte vor K2 nicht).
Nachher: `shots/m10-death-frames-{blob,dust,fire,bone,void,boss}.png` (4x-Zoom, alle Frames je Key).

In-Game (Playwright, `?debug=1`, god + 4 Waffen Lv8, Spawns über alle 10 Archetypen):
- `shots/m10-death-frames-chaos.png` + `.gif` + `chaos.png.json`: **356 Gegner lebend,
  508 Kills**, **0 JS-Fehler** — alle 4 Todesklassen sterben gleichzeitig.
- `shots/m10-death-frames-ingame-{burst,crumble,dissolve,sputter}-frames.png`:
  2x2-Mosaik je Klasse (Frames 3/5/7/9 des Klassen-GIFs) mit sichtbaren Toden.
- `shots/m10-death-frames-ingame-{burst,crumble,dissolve,sputter}.gif`: je 12 Frames.

Messwerkzeug: `scripts/m10-death-frames.mjs` (rolldown-Bundle der echten
`deathFrameSets()` → 4x-nearest Kontaktbögen als PNG ohne externe Renderer,
`--chaos` für den In-Game-Lauf). Keine FPS-/Echtzeit-Messung → ohne flock.

## Tests (`tests/death-frames.test.ts`, 5/5 grün)

1. Alle 5 geforderten Frame-Keys existieren in `deathFrameSets()` und `FX_FRAME_COUNTS`.
2. Keine Duplikat-Frames: weder innerhalb eines Sets noch zwischen den Klassen-Shards.
3. Binaeres Alpha: jedes Zeichen ist `.` oder gültiger Paletten-Index → nur Alpha 0/255.
4. 0 Off-Palette-Pixel: jeder gesetzte Pixel liegt in `PAL` (0..31).
5. Boss-Stufe messbar ≠ Blob: ink-Kontur 189–289 px je Boss-Frame vs. 0 im Blob;
   ≥ 9 Palettenstufen (inkl. ≥ 5 Glutfarben 15–22) vs. 4–5 im Blob; Masken-Diff
   (Blob 9x9 nearest auf 32x32) über alle 24 Stufenpaare: Minimum **0,146** (Schwelle > 0,12).

Gesamt: `npx tsc --noEmit` grün, `npm run build` grün, `npm test` 491/491 grün (Stand K2).

## Art-Director-Urteil

**Runde 3 (nach den neuen Frames) — PASS, 4,0/5** (Ziel ≥ 4 erreicht).
Prüfmodus: Sheets 4x nearest auf nightMid komponiert, Paletten-Check per
Pixel-Extraktion, In-Game-Mosaiken gesichtet.

Silhouetten-Trennung (Kernfrage des Runde-2-FAIL): ✅ erfüllt — „fünf verschiedene
Silhouetten, nicht mehr Farbe/Größe desselben Rings". Paletten-Check: 0 Off-Palette-Pixel.

| Asset | Note | Begründung (gekürzt) |
|---|---|---|
| fx_death_blob | 3,5 | Frames 1-2 stark; 3-4 dunkle Splitter fast unsichtbar auf nightMid; burst rendert additiv → dunkle Rim-Pixel tragen im Spiel wenig bei |
| fx_death_dust | 4,0 | klare Wind-Streifen-Silhouette, wirkt etwas sparsam |
| fx_death_fire | 4,5 | beste Frames: echte Zungen, organisch, logische Progression |
| fx_death_bone | 4,0 | Knochenlesen gelingt (Gelenkknubbel); Frame 4 nur verstreute Mini-Stücke, Schattierung flach |
| fx_death_void | 3,5 | Schwaden-Silhouette richtig, im Spiel lesbar; auf dem Sheet dunkelblau-auf-dunkelblau knapp |
| fx_boss_core | 4,5 | Kontur, Debris, Splitter, 3 Kern-Stufen erkennbar; klar über den Klassen-Shards |

**Gesamt 4,0/5 — PASS.** „Die Runde-2-FAIL-Gründe … sind mit Beleg behoben. Die
drei Nachbesserungen sind Polish, keine Silhouetten-Fehler mehr — für die Karte
M10 abnahmefähig."

Chaos-Lesbarkeit: crumble/dissolve eindeutig, **keine Verwechslung mit Gegnern/
Ground/XP-Gems**; Rest-Risiko ehrlich notiert: sputter-Tode lesen sich in-game
(ember Lv8 überlagert) als gepunktete orange Streukreise, nicht als Zungenformation.

### Nachbesserungen (nicht blockierend, als Nachtrag umgesetzt)

1. `blobDeathFrame` Frames 2-3: dunkle Splitter mit heller Kante/Kern-Rest aufwerten
   (blend-seitige Fix-Option — Rim-Sprites non-additiv — wäre eine Wertänderung in
   `death.ts` und ist damit ausserhalb dieses Auftrags; als Folge-Karte notiert).
2. `voidDeathFrame`: Schwadenfläche um eine Stufe aufhellen (hellere Fläche + grösserer Kern).
3. `boneDeathFrame` Frame 3: statt Einzelpixeln 1 kleiner Knochen + 2 Stücke + Lichtkante oben-links.

## Offene Punkte

- **Blend-Option:** burst/dissolve/sputter sind `additive: true` — dunkle Rim-/Körper-Pixel
  verlieren im Spiel an Wirkung. Prüfen, ob Rim-Sprites non-additiv gezeichnet werden
  können (Wertänderung in `src/logic/death.ts`/FxSystem → ausserhalb dieses Auftrags,
  Vorschlag für eine Folge-Karte).
- Sputter-Lesbarkeit im Chaos bei starker Waffen-Überlagerung (siehe Runde-3-Notiz).
