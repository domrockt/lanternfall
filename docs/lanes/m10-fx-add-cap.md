# Lane m10-fx-add-cap — ADD-Glows klein halten + LOD-Cap-Drossel (2026-11-27)

Umsetzung der Bedarfsmeldung **m10-android-perf (2026-11-27), Befund A4**:
„559 Objekte mit Alpha<1 oder ADD, überwiegend kleine Glows/Partikel —
ADD-Partikel klein halten und über bestehende LOD-Caps zählen; keine neuen
bildschirmfüllenden ADD-Effekte.“ Kontext: Abnahme-Blocker **Minute 25 /
780x360@3** (Fill-Rate/Render, nicht Sim). Kein Gameplay-/Balance-Eingriff —
nur FX-Budget und Rendergröße.

Fix ausschließlich in `src/systems/FxSystem.ts` (`src/logic/lod.ts` und
`src/gfx/gen-fx.ts` wurden nur **gelesen/importiert**, nicht geändert).

## Karte 1 — Messbasis (`shots/m10-fx-add-cap-baseline.json`)

`scripts/m10-fx-add-cap.mjs` friert den 500-Gegner-Frame ein (Seed 1, autoPlay,
god, 12 Waffen Lv 8, Minute 25, 780x360@3, ohne flock — kein FPS-Langlauf).
Pro Probe (12 Samples) werden **sichtbare** ADD-Sprites je Klasse gezählt:
fx-Pool, Partikel-Pool, Rest der Display-Liste; je Sprite Screengröße in
Device-Pixel und Overdraw = w·h (Device-Pixel).

**Wichtiger Messtechnik-Befund:** Das Android-Audit zählte die Display-Liste
ungefiltert — darunter **520 gepoolte, unsichtbare `elite_aura`-Sprites**
(EnemyPool, `visible=false`, alpha 0). Unsichtbare Sprites kosten keine
Füllrate; die Messung filtert deshalb auf `visible && alpha > 0`. Der echte
ADD-Bestand im Chaos-Frame liegt bei ~60 Sprites, nicht 559.

| ADD-Klasse (sichtbar) | Anzahl | Overdraw Device-Px | % der Bildfläche |
|---|---|---|---|
| fx-Pool | 17,1 | 216.668 | 77,2 % |
| Partikel-Pool | 12,1 | 1.020 | 0,4 % |
| Sonstige (fremde Dateien) | 30,3 | 218.097 | 77,7 % |
| **Summe** | **59,5** | **435.785** | 155,4 % |

Top-Einzelsprites (Diagnose): `fx_halo` **492x492 dev-px bei alpha 0,014**
(~242k px — ausgebrannt, aber voll rasterisiert), `fx_shock` 138 px bei
alpha 0,039. Die **Größe** und das **Ausschleichen toter Glows** sind das
Problem, nicht die Anzahl (m10-fx-overdraw-cap hatte das schon für Partikel
gezeigt). Die „sonstigen“ (Laternen-Lichtfläche `light_radius` in Run.ts,
Lantern-Orbs CombatSystem, Laternen-Glow GroundRenderer) liegen in fremden
Claims und sind hier nur attributioniert.

## Karte 2 — Fix (`src/systems/FxSystem.ts`, Commit 696c712)

1. **Alpha-Boden für ADD-Glows:** `ADD_GLOW_ALPHA_FLOOR = 0,04`. Glows mit
   echtem ADD-Blend werden im `update()` freigegeben, sobald ihr Tween-Alpha
   ≤ 4 % fällt (unsichtbar, aber voller Fill). Slot/Pool werden ordentlich
   zurückgegeben; NORMAL-Sprites und Evolutions-Signaturen (additive:false)
   bleiben unberührt.
2. **Screengrößen-Deckel:** `ADD_GLOW_MAX_SCREEN_AREA = 9216` Device-Pixel
   (96x96 @dpr3) via `glowAreaCapForDpr(dpr)` — aktiv ab dpr > 1,5
   (Mobil-Views 780x360@2/@3), **Desktop (dpr ≤ 1,5) unveraendert**.
   `clampGlowScreenArea` cappt die Device-Pixel-**Fläche** statt der Kante,
   damit dünne Beams (Blitz/Kette) lang bleiben; Seitenverhältnis bleibt
   erhalten, Tween (scaleFrom/scaleTo) wird zusammen geklemmt.
3. **Anzahl über LOD-Caps:** der bestehende geteilte `GlowBudget`-Deckel
   (`glowCapFor`: full 72 / reduced 40 / minimal 24) bleibt die harte Grenze.
   Neu: `glowCap`/`glowUsed`-Getter (Messung) und `setEnemyLoad(enemies)`,
   das den Deckel an `lodFor(enemies)`/`ambientBudgetFor(enemies)` koppelt
   (nur importiert): ab 250 Gegnern — dort schaltet ambientBudgetFor die
   Ambient-Glows ganz ab (glow 0) — greift für FX-Glows der Minimal-Deckel
   24. `setEnemyLoad` drosselt nur, hebt nie wieder an. Der Produktionspfad
   läuft unverändert über `Run.applyLod → CombatSystem.setLod → setMaxActive`
   auf denselben Deckel.

## Karte 3 — Tests (`tests/fx-add-cap.test.ts`, Commit 6e5d206)

23 Tests: Deckel-Treppe je dpr, Fläche≤Cap + erhaltene Seitenverhältnisse,
Beam-Schonung, Guards (NaN/0/∞), Spawn-Cap in FxSystem/ParticleSystem (dpr 3
via `window`-Stub, dpr 1 unverändert), Alpha-Boden gibt Slot+Liste frei,
Cap-Invariante inkl. geteiltem Budget, `setEnemyLoad`-Kopplung, Determinismus.
`npm test`: **544/544 grün** (52 Dateien), inkl. Regression
`tests/fx-overdraw.test.ts` (Cap-Verhalten unverändert).

## Karte 4 — Nachher-Messung (`shots/m10-fx-add-cap-after.json`)

Gleicher 500-Gegner-Frame, identisches Skript:

| Messgröße | Vorher | Nachher | Delta |
|---|---|---|---|
| fx-Pool ADD-Anzahl | 17,1 | 23,8 | ≤ Glow-Cap 40 ✓ (`glowUsed` 34 ≤ 40 im JSON) |
| **fx-Pool Overdraw dev-px** | **216.668** | **22.941** | **−89,4 %** |
| Partikel Overdraw dev-px | 1.020 | 426 | −58 % |
| fx+Partikel (A4-ADD-Klasse) | 217.688 | 23.367 | **−89,3 %** (Ziel −30 %) |
| Sonstige (fremd, unverändert) | 218.097 | 222.779 | ±2 % (Erwartung: keine Änderung) |
| **Summe ADD-Overdraw** | **435.785** | **246.146** | **−43,5 %** |
| max. ADD-Sprite (fx, dev-px) | 492 | 95 | ≤ 96er-Deckel ✓ |

Abnahme-Kriterien:
- **ADD-Partikelzahl ≤ LOD-Cap:** `glowBudget: {cap: 40, used: 34}` im
  after-JSON — gehalten. ✓
- **Overdraw der ADD-Klasse messbar gesenkt (Ziel −30 %):** fx-Klasse −89 %,
  gesamt −43,5 %. ✓
- Sichtbeleg: `shots/m10-fx-add-cap-m25-780.png` — eingefrorener 500er-Chaos-Frame
  (atomar gespawnt + pausiert, Muster `final-vfx-readability.mjs`) im
  780x360@3-View: Glow-Look bleibt lesbar (Spielerlicht, Funken, Boss-Banner),
  0 JS-Fehler.
- `npm run build` grün, `npm test` 544/544.

## Offene Punkte (ehrlich)

- Die „sonstige“ ADD-Klasse (~218k dev-px: Laternen-Lichtfläche Run.ts,
  Lantern-Orbs CombatSystem.ts, Laternen-Glow GroundRenderer.ts, Gegner-
  Projektile ProjectilePool) liegt außerhalb dieses Claims. Für den
  Full-Budget-Ansatz (A4) wäre ein Folgelane sinnvoll, die dortigen ADD-Sprites
  an denselben Flächen-Deckel zu hängen (Helfer sind in FxSystem.ts exportiert
  und wiederverwendbar: `glowAreaCapForDpr`/`clampGlowScreenArea`).
- Der Alpha-Boden cullt einen Glow bis zu ~5 % seiner Lebensdauer früher
  (visuell nicht unterscheidbar, alpha ≤ 4 %).
- `scene.lod.level` zeigte im Chaos-Frame „reduced“ trotz 500 Gegnern
  (Boost/bossFight-Pfad in Run.applyLod); der Glow-Deckel (40) folgt diesem
  Level. `setEnemyLoad` wäre der striktere Pfad (24), ist aber aktuell nicht
  verdrahtet — produktiv greift der Deckel über setLod.
- Mess-Streuung: fx-ADD-Anzahl schwankt frame-abhängig (17–48); die
  Overdraw-Einsparung bleibt über alle Samples stabil (perSample im JSON).
