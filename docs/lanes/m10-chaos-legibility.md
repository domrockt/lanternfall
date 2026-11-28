# Lane m10-chaos-legibility-audit — Strenge Sichtung Minute-25-Chaos (NUR-MESS)

Auftrag: Strenge Sichtung des Minute-25-Chaos auf aktueller main (Worktree-Stand inkl. fx-mixel-fix,
boss-fx-contrast, boss-death-shards, damage-calm), Maßstab Dom 2026-11-28 00:00Z:
**„würde das in einem kommerziellen Pixel-Art-Spiel so ausgeliefert?"** — bewusst strenger als die
bisherigen 4/5-Noten. Diese Lane ändert keinen Code; Deliverables sind nur diese Doku + `shots/m10-chaos-leg-*`.

Board-Karten: #6958 (K1 Belege), #6959 (K2 Sichtung), #6960 (K3 Befundliste).

## 1. Messaufbau (K1, Commit 9541b88 + 98fc186)

- Capture-Skript **außerhalb des Repos** (`~/tmp/m10-chaos-legibility-audit/capture-chaos.mjs`, NUR-MESS-Lane),
  nutzt `scripts/harness.mjs` (ensureBuild/startServer/startRun) aus dem Worktree.
- Szenario wie `profile-minute25.mjs`: seed=1, god, autoPlay, 6 Basis-Waffen Lv8 + **6 Evolutionen Lv8**
  (phoenix, wrath_pendulum, eternal_winter, thorn_storm, thunder_seal, soul_beacon) + 6 Passives St5,
  `skipTo(1490)` → Minute ~25. Gegnerbestand wird alle 150 ms auf Ziel aufgefüllt (Waffen killn schnell —
  einmaliges Top-up zerfiel in 2,5 s auf ~25 Gegner; Korrektur in Iteration 1).
- **iGPU-Pflicht erfüllt:** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`, `swiftShader=false`
  (in `shots/m10-chaos-leg-evidence.json`; SwiftShader-Belege wären ungültig).
- Matrix: 640x360@1 und 780x360@3 × M25 (300 Gegner gehalten) und 500er-Stress; 3 Frames je M25-/2 je
  Stress-Konfiguration, Freeze-Frames aus dem Live-Lauf (t≈1496–1500 s), Gegnerzahlen/FPS/Position im JSON.
- Zooms: 2x/4x **nearest** (ImageMagick `-filter point`), bildzentriert (Kamera folgt Spieler).
  Korrektur: erste Zoom-Runde war um die **Welt**- statt Bildkoordinate zentriert (leeres Terrain) — gelöscht
  und in Commit 98fc186 neu erzeugt.
- FPS nebenbei: 59,2–60,3 (iGPU, kein Engpass im Szenario) — keine flock-Messung, nur Kontext.

Belege: 10 Native-Frames + 8 Zooms + `m10-chaos-leg-evidence.json` in `shots/`.

## 2. Sichtbefunde (K2, eigene Vision + art-director)

Vorab positiv (nach den gemergten Fixes sichtbar besser):
- **Boss-Banner, Boss-HP-Leiste, HUD (XP/HP/Icons/Timer/Kills)**: klar, dunkles Panel, gute Kontraste
  (`m10-chaos-leg-780-360-3-m25-2.png`, `640-360-1-stress500-1.png`).
- **Spieler-Silhouette** (rote Robe + Hut) auch im Burst-Zentrum erkennbar (4x-Zooms).
- **Damage-Calm wirkt**: 640er-Stress-Frame zeigt nur 2–4 Labels gleichzeitig statt Label-Teppich.
- **Klassischer Dither/Schachbrett-Rester: nicht gefunden** — Flächen sind glatt; einzelpixeliges GrünFunken
  auf Terrain ist Deko-Noise, kein Raster.

Befunde mit Severity (Beleg jeweils angegeben):

### B1 — Major: Mixel-Rester an großen Radial-/Ring-FX
Goldener Strahlenkranz um den Spieler und gelbe Starburst-Cluster zeigen Blöcke von ~2 Spielpixeln gegen
1-px-Sprite-Details (deutlich in `m10-chaos-leg-640-360-1-m25-2-4x.png`, auch `780-360-3-m25-2-4x.png`).
Das ist der dokumentierte Rest des fx-mixel-fix: **direkte makeImage-Pfade umgehen den Bake-Draw-Pfad**
(s. docs/lanes/m10-fx-mixel-fix.md: CombatSystem-Halos ~364/~817, fx_pillar/fx_shock-Tweens in Run.ts,
Canvas-Texturen in src/gfx/textures.ts wie ring_frost 96 px, die >1 skaliert werden).
- Hebel: `src/gfx/textures.ts` (Canvas-Ringe in Sprite-Pixelgröße backen oder Draw-Scale ≤ 1 erzwingen),
  `src/gfx/gen-fx.ts` (`MIXEL_BAKE_DEFS` um die betroffenen Texturen erweitern), `src/systems/CombatSystem.ts`
  (direkte Halo-spawnAnim-Calls auf mixelLevel-Pfad ziehen).
- Erwarteter Gewinn: einheitliches Pixel-Raster; die auffälligste „shipped nicht"-Kategorie fällt weg.

### B2 — Major: Near-White-Kerne in ADD-Glows
Zentrale Glow-Kerne (Phoenix-Burst, Stress500 oben Mitte) und weiße Funken-/Kettenstriche brennen zu
nahezu Weiß aus und schlucken darunterliegende Sprites (`m10-chaos-leg-780-360-3-m25-2-4x.png`:
große near-white Fläche über dem Spieler; `640-360-1-m25-2-4x.png`: pure-weiße Funken + vertikaler
weißer Strich = gestrecktes Partikel).
- Hebel: `src/gfx/gen-fx.ts` (Glow-Rampen enden auf Amber/Lantern statt Weiß; Kern-Kontur wie bei
  boss-fx-contrast), `src/systems/FxSystem.ts` (ADD-Alpha-Boden/-Deckel, einheitliche Partikel-Scale,
  kein nicht-uniformes Strecken).
- Erwarteter Gewinn: Sprites bleiben unter Effekten lesbar; weniger „Weißblende" im Chaos.

### B3 — Major: Milchige Weich-Gradient-Discs (Stilbruch + Verdeckung)
500er-Stress: gestapelte translucente weiße/orange Scheiben und weiche Airbrush-Partikel bilden milchige
Felder, die Terrain und kleine Gegner verdecken (`m10-chaos-leg-640-360-1-stress500-1.png` und `-4x.png`,
`780-360-3-stress500-1-4x.png`). Sie stehen in keiner Pixelgröße zum Rest und sind nicht als
Gefahr/Fläche lesbar — im kommerziellen Vergleich das auffälligste Stilbruch-Element.
- Hebel: `src/systems/Hazards.ts` (telegraph_disc: gerasterte Ringe/Kontur statt Weich-Gradient),
  `src/gfx/textures.ts` (Disc-Texturen mit 1-2-px-Band backen), `src/systems/FxSystem.ts`
  (blob-Partikel quantisieren oder Alpha senken).
- Erwarteter Gewinn: Warnflächen werden lesbar (Gefahr ja/nein), Terrain bleibt sichtbar.

### B4 — Minor: Schadenszahlen-Überlappung + 6-stellige Dominanz
`m10-chaos-leg-780-360-3-m25-2.png`: `184526!` überlappt `4577`; 6-stellige Werte dominieren optisch
den Bildraum. Damage-calm-Cap greift (wenige Labels), aber es gibt keine Überlappungsvermeidung.
- Hebel: `src/systems/DamageNumbers.ts` (Grid-Offset bei Kollision, Kürzung ≥ 100k auf z. B. `184,5k`,
  Anker unterhalb des Gegners).
- Erwarteter Gewinn: Zahlen lesbar ohne Sprite-Verdeckung.

### B5 — Minor: Einzel-Weißpartikel-Artefakte
Vertikaler pure-weißer Balken (gestrecktes Partikel) nahe dem Spieler (`640-360-1-m25-2-4x.png`);
dünne weiße Kettenlinien wirken hart. 
- Hebel: `src/systems/FxSystem.ts` ParticleSystem (uniform Scale-Cap, smear-Textur statt Streckung).
- Erwarteter Gewinn: keine „Kratzer" im Bild.

## 3. Empfehlungen für Fix-Jobs (Dora schneidet daraus)

1. **Fix mixel-rest-paths** (B1): alle direkten makeImage/spawnAnim-Pfade mit Scale > 1 auf den
   Bake-Draw-Pfad ziehen oder Texturen in Ziel-Pixelgröße backen. Beleg-Maßstab: 4x-Zoom muss
   1-px-Raster zeigen. (Highest Impact)
2. **Fix near-white-caps** (B2+B5): Glow-Rampen + Partikel-Weiß deckeln (Ramp-Ende Amber, Scale-Cap),
   Near-White-Anteil je Chaos-Frame als Zielmetrik.
3. **Fix telegraph-disc-style** (B3): Discs/Ringe gerastert (2-px-Band + Kontur), Alpha-Boden, Dither
   im PICO-8-Stil statt Weich-Gradient.
4. **Fix dmg-number-overlap** (B4): Grid-Offset + 100k-Kürzung.

Abnahme-Kriterium der Lane: ≥3 belegte Punkte ✓ (B1–B3 Major, B4–B5 Minor, je Repro-Shot + Hebel).
Blocker: **keine** — Kern-Lesbarkeit (Spieler/Boss/HUD) ist gegeben; die Majors sind Stilbruch-/Verdeckungs-Fälle.

## 4. art-director-Kontrolle (strenge Abnahme, 2026-11-28 00:30Z)

Gesamt-Note **3/5 (streng)** — „nicht kommerziell auslieferbar" in der aktuellen Chaos-Szene:
- **FAIL/Major (1) Mixel:** die große braun-orange Masse + bronzen Brocken = Blöcke grob 2–6 Spielpixel mit
  weicher Außenkante (`780-360-3-m25-2-4x.png`, `780-360-3-stress500-1-4x.png` unten); die goldenen
  Spieler-Strahlen sind **stufenlose Gradient-Keile, nicht auf das Raster quantisiert**
  (`640-360-1-m25-2-4x.png`). Kleine Starbursts dagegen ok.
- **FAIL/Major (2) Near-White:** Bereich über dem Spieler brennt zu blassgelb/crème aus, Bodendetails und
  Gegner geschluckt (`780-360-3-m25-2-4x.png` oben Mitte; `780-360-3-stress500-1-4x.png` oben links reine
  weiße Fläche). Spieler bleibt lesbar → Major, nicht Blocker.
- **FAIL/Major (3) Stilbruch:** milchig-orange Ringe, rosa/beige Discs/Balken, Gradient-Strahlen —
  „harte 1-px-Sprites unten, Luftbrause oben" bildet eigene Objektkanten, keine zulässige Licht-Überblendung.
- **PASS (4) Lesbarkeit:** Spieler in allen 4x-Crops sofort identifizierbar; Boss/HUD/Schwarm klar;
  Minor: Spieler im Strahlen-/Glow-Stack von `780-m25-2` fast zugedeckt.
- **PASS (5) Dither:** keine Schachbretter in Effektflächen/Tiles/Glows.
- Auslieferbar (4–4,5): Gegner-/Spieler-Sprites, Starbursts, Tiles, HUD, Damage-Numbers.

**Konsolidierte Fix-Priorität (mit art-director-Hebeln, zeilengenau):**
1. Strahlen-/Aura-/Massen-Effekte aufs Pixelraster baken (Gradient-Keile → 1–2-px-Stufen):
   `src/gfx/gen-fx.ts` (Signaturen, soul_beacon ~762, „tongues" ~461, DEATH_GRID) +
   `src/gfx/textures.ts` (radiale Canvas-Gradients ~740–780). Deckt B1 + Teile von B3.
2. ADD-Glow-Intensität deckeln (kein Near-White über Sprites): `src/gfx/textures.ts` (~740),
   `src/scenes/Boot.ts` (~53–76 Glow-Setup), Alpha/Blend in `src/scenes/Run.ts`. Deckt B2 + B5.
3. Weiche Discs/Ringe härten (1–2-px-Band, Sprite-Pixelgröße): `src/gfx/textures.ts`
   (ring/puddle/beam-Canvases ~560–610), `src/gfx/bakeAtlas.ts`, `src/systems/Hazards.ts`
   (telegraph_disc). Deckt B3.
4. Schadenszahlen: Grid-Offset + 100k-Kürzung in `src/systems/DamageNumbers.ts` (B4, Minor).

Urteil übernommen: kein Blocker, **3 Major** — die Befundliste oben (B1–B5) und diese Priorität sind die
Basis für Doras Fix-Jobs (Messen → sofort Fixen).

## 5. Verlauf

- 2026-11-28: K1 Belege (9541b88, Korrektur 98fc186), K2 Sichtung, K3 Befundliste (#6958–#6960),
  art-director 3/5 (3 FAIL Major, 2 PASS) nachgezogen.
