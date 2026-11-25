# Lanternfall — M5 VFX-Abnahme (Art-Director, Runde 2)

**Datum:** 2026-11-25 · **Runde:** M5-Art-Review **R2** (ersetzt R1) · **Prüfer:** Art-Director
**Gegenstand:** dieselben 18 GIFs aus `shots/` (neu erzeugt 21:02–21:05, 28 Frames, 480×270, Slow-Motion, GIF ohne Dither)
**Latte:** `GAME.md` Grafik-Qualitätslatte + `ART.md` (1-px-Tinte, Licht oben-links, 3 Stufen, Palette, FX-Regeln)

## Prüfmethode R2

- Je GIF sechs Frames (0/5/10/15/20/27) als PNG extrahiert, 4× nearest (crop 280×180 → 1120×720), plus 6–9× Detailcrops für Kristalle, Kette, Siegel, Banner, Tod. Keine Verzerrung.
- Zusätzlich Code-Gegenprüfung der genannten Änderungen (`FxSystem.bolt`, `fx_ice`, `sealFrame`, `killsFx`, `verify-vfx.mjs`, `Run.ts` Event-Pfade), damit „behoben“ nicht nur behauptet ist.
- **Verbesserung der Belege bestätigt:** kein Schachbrett-Dither mehr in den Bögen/Ringen; Slow-Motion lässt kurze Effekte über mehrere Frames stehen. Der Frost-Peak liegt allerdings erst bei f27 (Screenshot-Latenz verschiebt das Peak-Fenster) — die Nova ist in f0 nur noch als auslaufender Ring zu sehen.

## Tabelle Waffen (12)

| Waffe | Note | Begründung |
|---|---|---|
| **ember** | **4** | Komet ist jetzt klar orange (Körper 16/17/18, Kern 13) und hat eine orange Funken-Spur statt der grauen `fog`-Linie (f0/f5/f15). Auf 1× vom XP-Kristall unterscheidbar (runder Kern + Schweif + Tinte). Schwäche: nur 7–9 px; der Glow bleibt dezent, bei dichten Gems ist die Flugbahn in Einzelframes noch suchenswert. |
| **flail** | **4** | Smear-Bogen + zwei Kugeln; Kette ist jetzt eine echte Gliederkette mit Durchhang (8 Glieder, f0/f5), keine 1-px-Linie mehr. Masse und Ausklang stimmen. Schwäche: Bogen bleibt ein flacher BoneLight-Band ohne hellere Vorderkante; Kugel (11 px) geht in Gems/Death-Funken unter. |
| **frost** | **4** | Pflichtpunkt Eiskristalle erfüllt: f27 zeigt 16 große, facettierte, grau-blaue Kristalle im Ring plus 2-px-Eisband. Schwächen: (a) die Kristalle stehen **tangential** (Rotation `a + π/2`), nicht radial — sie lesen als „Eiskrone/Zahnkranz“ statt Nova-Spitzen; (b) der Ring selbst ist bei f27 sehr blass; (c) der Peak liegt nur im letzten Frame (Aufnahme-Timing). |
| **thorn** | **4** | Der Fächer ist jetzt eindeutig sichtbar: warme/orange Dornensterne in Bogenform rechts vom Spieler (f0/f5, 1,6× Skalierung, Tinte). Kontrast auf Gras klar, Masse stimmt, Ausklang über Trefferfunken. Schwäche: bei f10/f15 ist der Spieler von Treffer-/Todeswolken überdeckt; die Dornen-Silhouette ist klein (≈11 px). |
| **storm** | **4** | Pflichtpunkt erfüllt: segmentierte, gezackte Blitze mit Seitenästen (f0/f10), keine geraden Linien mehr; Einschlagfunken (fx_star) am Treffer sichtbar; Helligkeit und Länge passen. Schwäche: die Blitze dominieren das halbe Bild und überlagern sich zu einem „Drahtgeflecht“; Bodensiegel-Marker bleiben klein. |
| **lantern** | **4** | Kreisende warme Lichter mit hellem Kern und Amber-Halo, als Orbit lesbar, Masse gut. Schwäche: Farbnähe zu XP-Kristallen bleibt (beide gelb-weiß); das Laternenmotiv ist nur ein runder Kern. Unverändert abnahmefähig. |
| **phoenix** | **4** | Vögel + Brandflächen + Explosionen; f0 zeigt drei große, helle Feuerringe mit heißem Kern, klar prächtiger als ember. Schwächen: die Brandflächen faden zu **hohlen grauen Ringen** (f5/f15) statt Asche/Glut; die Vögel sind blass-creme (13/21/22) und auf 1× eher „gelbe Pfeile“ als Vögel. |
| **wrath_pendulum** | **4** | 360°-Amber-Bogen + Gliederkette + Kugel (f0/f5), deutlich größer und anders gefärbt als flail — Pflichtpunkt erfüllt. Schwäche: der Bogen ist ein symmetrischer Ring ohne Richtungs-/Taper-Kante; die Heilung pro Treffer wird nicht visualisiert (darf subtil sein). |
| **eternal_winter** | **4** | Permanente Aura + facettierte grau-blaue Kristalle am Ring (f15/f27), Freeze-Tint auf Gegnern (Skelette wirken entsättigt). Schwäche: das Aura-Band ist sehr blass und teilweise lückenhaft (f27), die Kristalle liegen zwischen Gems und Zahlen; die periodischen Eisspitzen sind im GIF nur 1 Frame lang erkennbar. |
| **thorn_storm** | **4** | 360°-Wirbel jetzt unübersehbar: 16 große Amber-Dornenstreaks + Dornensterne am Rand (f0/f5/f10/f15), rotierend, deutlich prächtiger als thorn. Schwäche: der additive Shock-Kern füllt die Mitte als gelbe Scheibe und drückt den Spieler in den Hintergrund; Streaks sind flache Balken ohne Tinte. |
| **thunder_seal** | **4** | Kantiges Achteck-Sigil mit geraden Zacken/Innenrune (f5/f15) und segmentierter Kettenblitz (f0) — Pflichtpunkt erfüllt. Schwäche: die drei Siegel überlappen zu einem Kleeblatt; bei f10 ist das Ganze durch Alpha-Fade sehr flach/grünlich, die Rune verliert Kontrast. |
| **soul_beacon** | **3** | **Nicht abnahmefähig.** Die 5 Orbs sind dunkelgraue Kugeln mit einem weißen Glanzpunkt und blassem Halo (f0/f5/f15/f27) — sie lesen als **Metallkugeln/Steine**, nicht als Seelen; das Seelenblau (6/8) wirkt durch Normal-Blend stumpf, kein Flammen-/Geistermotiv, kein Schweif. Die Evolution ist damit **weniger prächtig** als die warme, leuchtende Laterne (Pflichtpunkt „Evolution prächtiger“ verletzt). Datei: `shots/m5-vfx-soul_beacon.gif`, f0/f15. Fix: Körper 8/9 + Kern 13 (2×2), 2-Frame-Geisterflamme (6/8/9 + 13), 4-px-Schweif, Halo nur 1 px/ADD; dann ist die blaue Identität lesbar. |

**Waffen-Zwischenstand:** 11/12 ≥ 4; soul_beacon = 3.

## Tabelle Ereignisse (6)

| Ereignis | Note | Begründung |
|---|---|---|
| **levelup** | **4** | Goldene Lichtsäule + Halo + Funken klar am Spieler (f0), Ausklang weich. Schwäche: die Säule ist ein hochskalierter 26-px-Streifen mit Zackenkanten; ab f5 dominieren die Storm-Blitze der Testwaffen das Bild (Beleg-Rauschen, kein Event-Fehler). |
| **evolution** | **4** | Banner jetzt korrekt: „EVOLUTION / PHÖNIXSCHWARM" (f5/f10), keine Doppelzeile mehr; Säule/Funken im Feld. Schwäche: der FX-Peak (f0) fällt mit dem halbtransparenten Banner zusammen, das volle Banner (f5) zeigt keinen Peak mehr — Beleg zeigt Banner und Effekt nicht gleichzeitig; Untertitel in Bone-Grau ist kontrastarm. |
| **chest** | **4** | Strahl, Münzen, Panel, Titel und Itemname lesbar (f5/f10/f15), Auswahlrahmen in Amber. Schwäche: Itemname bricht **mitten im Wort** („MAGNETA / MULETT", f10) — Layout-Fehler; Untertitel „BELOHNUNGEN ROLLEN …" bleibt kontrastarm; kein Slot-Rollen sichtbar (nur ein Slot). |
| **boss-intro** | **4** | Banner „MOORKÖNIGIN / EIN BOSS ERWACHT" + Boss-HP-Leiste mit Segmenten (f0–f10) — Inszenierung jetzt vorhanden, Boss ab f15 sichtbar. Schwäche: der Boss spawnt **unter dem Banner** (`Run.ts` Debug-Pfad y−20), dadurch in f0–f10 unsichtbar; der Shock-Ring ist weiterhin ein flacher brauner Ring statt Kern-Glut. |
| **boss-death** | **3** | **Nicht abnahmefähig als Tod-Beleg.** Banner „MOORKÖNIGIN BESIEGT / EINE TRUHE ERSCHEINT" ist lesbar, aber Boss und Explosion liegen am oberen Bildrand **hinter HP-Leiste und Banner** (f0/f2/f4: nur brauner/weißer Klumpen, von UI überdeckt); man sieht weder den Boss sterben noch die Explosion, die Truhe ist nicht klar als Truhe lesbar (f15/f20). Der Event erzählt nur Text. Datei: `shots/m5-event-boss-death.gif`, f0–f6. Fix: Boss im Debug-Event bei `player.y+50` spawnen (unter dem Banner) und Kamera nicht zoomen; Banner erst nach dem Explosions-Peak einblenden. |
| **dawn** | **4** | Flash jetzt 150 ms, Amber-Overlay 0,18 → Feld und Banner bleiben lesbar (f5/f10); Ausklang zum Results-Screen sauber. Schwäche: die Lichtstrahlen sind kaum sichtbar (nur Farbwash), ein Sonnen-/Horizontmotiv fehlt; in f5–f15 stehen noch Skelette aufrecht, obwohl „gestaffelter Zerfall" behauptet ist — die Zerfalls-Dramaturgie ist nur an kleineren Gegnern zu sehen. |

**Ereignis-Zwischenstand:** 5/6 ≥ 4; boss-death = 3.

## Verbindliche Punkte

| Pflichtpunkt | Status | Beleg |
|---|---|---|
| Sturmrune gezackt/verzweigt + Einschlagfunken, keine geraden Linien | **PASS** | `m5-vfx-storm.gif` f0/f10: segmentierte Zickzack-Blitze, Seitenäste, Funken am Einschlag. |
| Frostnova Eiskristalle/Splitter | **PASS** | `m5-vfx-frost.gif` f27: 16 facettierte Kristalle + Eisband. (Orientierung tangential — kosmetische Nachbesserung.) |
| Kettenflegel Smear-Bogen | **PASS** | `m5-vfx-flail.gif` f0/f5-Bogen, echte Kettenglieder. |
| Evolutionen prächtiger als Basis | **FAIL (1 von 6 Paaren)** | soul_beacon (3) ist dunkler/stumpfer als lantern; die übrigen 5 Paare sind klar größer/eigenfarbig. |
| 4 unterscheidbare Tod-Klassen in den Waffen-GIFs | **TEILWEISE / nicht sicher belegbar** | Spawns sind jetzt vollständig (`verify-vfx.mjs` 142–146: bog_rat, wisp, skeleton, banshee, toad). Im GIF sind Knochen- (crumble) und Geist-Zerfall (dissolve) als helle Fragmente erkennbar; Burst-Blob (bog_rat) und Sputter-Asche (toad) sind in den geprüften Frames nicht sicher zuzuordnen (9-px-Shards, 1–2 Frames, zwischen Gems/Funken). Für die Abnahme fehlt ein Standbild je Klasse (z. B. `shots/m5-death-classes.png`). |
| Ereignisse klar inszeniert | **FAIL (1 von 6)** | boss-death zeigt den Tod nicht (UI verdeckt ihn); boss-intro zeigt den Boss erst nach dem Banner. |
| Palette/ART.md | **PASS (Quelle)** | Alle VFX nutzen Palettenindizes; ADD nur für Glow; GIF jetzt ohne Dither. Keine Off-Palette in `src/gfx/*`. |

## Verbleibende Schwächen + Fixes (präzise)

1. **soul_beacon, f0/f5/f15/f27** — Orbs als graue Metallkugeln. Fix: Körper 8/9, Kern 2×2 in 13, 2-Frame-Geisterflamme (6/8/9 + 13), 4-px-Schweif; Halo 1 px ADD/Alpha 0,25; Orb 11 px beibehalten, aber Kontur 0 nur außen.
2. **boss-death, f0–f6** — Boss/Explosion hinter HP-Leiste/Banner. Fix: im Debug-Pfad Boss bei `player.y+50` spawnen (Banner liegt bei y≈92); Explosion 3 Ringe gestaffelt darunter; Banner 250 ms nach dem Peak einblenden; Truhe in denselben Bereich mit Lichtstrahl.
3. **Tod-Klassen** — Shards behalten Materialrampe (gut), aber 9 px sind zu klein und die Kappung/Aufnahmedichte verhindert ein sicheres Klassenbild. Fix: dedizierte PNG-Aufnahme je Klasse (mudling/burst, skeleton/crumble, banshee/dissolve, toad/sputter) bei 0,05×-Slow-Mo und 4× Zoom; Shards auf 12×12, 0,6 s.
4. **frost** — Kristallrotation radial (`a` statt `a+π/2`), Ringband 1 px heller (9), Zacken separat zeichnen; Aufnahme-Peak pausieren, damit der Ring nicht nur in f27 liegt.
5. **phoenix** — Brandflächen-Interieur mit 14/15-Asche (2×2-Cluster) füllen, Rim 17/18; Vogelkörper 17/18 mit 21-Kern, 16×12, damit „Vogel“ statt „gelber Pfeil“.
6. **chest** — Namensumbruch „MAGNETA / MULETT" beheben (Silbentrennung „MAGNETA-/MULETT" oder kleinere Schrift/eine Zeile); Untertitel 9 statt 5.
7. **boss-intro** — Boss-Spawn unter dem Banner hervorholen (`player.y+50`), Ring in 18/20 statt emberDark, Kern-Glut 2×.
8. **dawn** — Sonnen-/Horizontscheibe aus `light_radius` sichtbarer (Alpha 0,5, oberes Drittel) und 5 dünne Strahlen; gestaffelten Zerfall auf 1,2 s verlängern, damit er im 28-Frame-GIF über mehrere Frames sichtbar bleibt.
9. **storm** — Überlagerung reduzieren: max. 2 gleichzeitige Blitzketten pro Ziel (restliche 150 ms versetzt), Bodensiegel 1,2× größer.
10. **Belege** — Peak-Fenster pausieren (Scene-Pause nach Treffer auf FX-Key, dann 8–12 PNG-Frames) statt auf Screenshot-Latenz zu hoffen; je Waffe zusätzlich ein 2×-PNG-Standbild für die Kunstabnahme.

## Gesamturteil

**FAIL (noch nicht bestanden).** 16 von 18 Assets erreichen ≥ 4. Die Kern-Fixes aus R1 sind sichtbar umgesetzt und glaubwürdig: Storm-Blitzgeometrie, Thorn-Kontrast, Frost-Kristalle, Kettenglieder, Achteck-Sigil, Evolutionsname, Boss-Leiste, Dawn-Flash. Es bleiben drei harte Punkte:

- **soul_beacon (3)** — graue Kugeln statt Seelen; nicht prächtiger als lantern.
- **boss-death (3)** — der Tod ist hinter HP-Leiste/Banner versteckt, der Beleg zeigt nur den Banner-Text.
- **Tod-Klassen** — Spawns vollständig, aber die vier Klassen sind im 28-Frame-GIF nicht sicher unterscheidbar; ein Standbild je Klasse fehlt.

Die übrigen Punkte sind Nachbesserungen ohne Abnahmeblocker (Frost-Orientierung, Phoenix-Asche, Chest-Umbruch, Boss-Intro-Position, Dawn-Strahlen, Storm-Dichte).

## Restrisiken

- Aufnahme bleibt ~7–10 Samples/s; Slow-Motion verlängert Effekte, aber der Peak kann durch Screenshot-Latenz ans Ende rutschen (Frost f27). Für finale Belege Scene-Pause + manuelles Frame-Stepping.
- GIF-Palette kann Glow weiterhin leicht verschieben; für die Kunstabnahme verlustfreie PNGs verwenden.
- In `m5-event-dawn.gif` bleiben Skelette bis f15 stehen; der gestaffelte Zerfall ist damit nur teilweise belegt (kein Art-Blocker, aber im Abnahmeprotokoll zu vermerken).
- Die Tod-Klassen sind in der Quelle materialgetrennt (Bone/Blob/Void/Dust); die visuelle Unterscheidung bei 1× hängt an Größe (9 px) und Dichte — mit 12-px-Shards und einem Klassen-Sheet nachweisen.

## Runde 3 (finale fokussierte Prüfung)

Geprüft wurden ausschließlich `shots/m5-vfx-soul_beacon.gif` und `shots/m5-event-boss-death.gif`, je 3 Frames (0/8/20), 4× nearest extrahiert. **Erbte R2-Noten ≥4 für die übrigen 16 Assets** (nicht erneut gesichtet).

| Asset | Note | Begründung |
|---|---|---|
| `m5-vfx-soul_beacon` | **3** | Deutlich besser als die graue Metallkugel aus R2: Die Geisterflamme ist als heller, aufrechter Schemen auf dunklem Grund lesbar, hat nominal 3 Stufen (6/8/9), einen hellen Kern (13) und einen ausgefransten Schweif. Aber: Die Silhouette ist oben **flach** (5 px breite Stirnfläche, gerade Seiten) und liest sich dadurch als Kerze/Grabstein, nicht als Flamme. Der „2×2-Kern" ist tatsächlich ein **3×7-Balken** (Generator: `dx<=1`, `y=5..11`) und wirkt wie ein erleuchtetes Fenster. Der Schweif besteht aus **isolierten 1-px-Punkten** (`%5`-Regel) = Einzelpixel-Rauschen ohne Kontur. Der Körper ist zwischen Frame 0/1 **identisch** (nur der Schweif wechselt), also keine echte Flammen-Animation. Auf hellem Moor-Grund (f20) verschwindet der Körper, weil 6/8/9 und `marsh` fast gleiche Helligkeit haben. Der warme Halo-Ring (20/18/17) unter einer kalten Seele wirkt schmutzig-oliv. |
| `m5-event-boss-death` | **4** | Der Kern-Fix aus R2 greift: Boss bei `player.y+62`, Tod/Explosion, Ringe, Splitter und Truhe liegen komplett **unter** Banner und HP-Leiste (f0 Boss sichtbar, f8 Kern+Ringe+Truhe unter „EINE TRUHE ERSCHEINT", f20 Truhe allein). Lesbarkeit und Inszenierung sind gegeben, Palette bleibt im Warm-/Knochenbereich. Abzug nur für Feinschliff: Die 3 `fx_shock`-Ringe (90/185/280 ms, ähnliche Tints) verschmelzen im Peak zu **einem breiten, grob gerasterten Band**; die Ringkanten haben 1-px-Streuung (teils GIF-Dither, teils Alpharing). Knochen-Shards (26 Stück ab 260 ms, `scaleFrom 1.35`) sind im Frame nur als graue Klumpen erkennbar. Der helle Truhen-Lichtstrahl wird vom Banner bei y≈112 hart abgeschnitten und hat eine rechteckige Kante. |

### Konkrete Pixel-Fixes für soul_beacon (Note < 4)

1. **Kopfform** — `orbSoulFrame` Zeilen 0–4: `halfW` nicht konstant 2, sondern 1/2/2/3/3 mit 1-px-Zacke am Scheitel (Tip bei `cx±1`), Schultern ab y=6 auf 4–5 px; die flache Oberkante entfernen. Ziel: Tropfen-/Flammen-Silhouette statt Rechteck.
2. **Kern** — `d`-Bereich von `dx<=1 && y=5..11` auf exakt **2×2** bei `(cx, cy)` reduzieren; darum 1 px Rand in 9. Kein 7 px hoher Balken.
3. **Schweif** — die `(y+stage*2)%5===0`-Einzelpixel durch einen **zusammenhängenden 2-px-Zickzack** ersetzen (±1 px Versatz, nur an der Spitze auf 1 px verjüngen), mit Ink-Kontur auch im Schweif.
4. **Kontur** — 1 px `0` (ink) um die **gesamte** Außenkante inkl. Schweif; aktuell fehlt sie am Schweif und an der flachen Stirn.
5. **Kontrast auf hellem Grund** — Außenrand des Körpers auf Index 6 (dunkler) legen, Kern 13, dazwischen 8/9; damit bleibt die Flamme auch auf `marshLight` lesbar.
6. **Animation** — zwischen Frame A/B zusätzlich `halfW` in 2–3 Zeilen um ±1 ändern und den Kern 1 px vertikal versetzen, damit der Körper flackert (nicht nur der Schweif).
7. **Halo** — warmen `fx_halo`-Tint (20/18/17) unter der kalten Seele durch 9/8/6 ersetzen oder weglassen; der olivbraune Bodenring passt nicht zur Figur.

### Gesamturteil

**FAIL (finale fokussierte Runde).** 17 von 18 Assets erreichen ≥ 4 (16 aus R2 geerbt, boss-death jetzt 4). `soul_beacon` bleibt bei **3**: Form (flache Kerzen-Silhouette), Kern (3×7 statt 2×2), Schweif (1-px-Rauschen) und fehlende Körper-Animation verfehlen die Qualitätslatte; auf hellem Grund ist der Körper kaum lesbar. Der boss-death-Fix ist dagegen sichtbar umgesetzt und wird mit 4 abgenommen; Ring-Streuung, Shard-Lesbarkeit und der vom Banner gekappte Lichtstrahl sind Nachbesserungen ohne Abnahmeblocker.

## Runde 4 (Soul-Beacon final)

Geprüft wurde ausschließlich `shots/m5-vfx-soul_beacon.gif` (Frames 0/8/20, 4× nearest extrahiert, zusätzlich 16×/14×-Crops der Orbit-Seelen). Die übrigen 17 Assets bleiben aus R2/R3 geerbt (≥4), nicht erneut gesichtet.

Einordnung vorab: Der Generator ist gegenüber R3 sichtbar besser (echte Spitze, zusammenhängender Schweif, unterscheidbare Körper-Frames, kalter Halo statt Oliv-Ring). Die Note bleibt trotzdem bei **3**, weil genau das, was im GIF zu sehen ist, die Form wieder zerstört: 2,4×-Skalierung, additiver Halo und Alpha-Wobble. Bewertet wird das gerenderte Ergebnis, nicht die Absicht im Code.

| Teilkriterium | Note | Befund |
|---|---|---|
| Form / Silhouette | **2** | Im Asset-Raster ist die Kontur stimmig (1-px-Spitze, Körper bis 11 px, Schweif), im GIF liest sie sich aber als **helle Säule mit breitem grauem „Rock"** – Lichtstrahl/Qualle, nicht Geisterflamme. Die Spitze sind zwei Zeilen **reine Tinte** (`y0`/`y1` = einzelnes `0`), also ein 2–3 px dunkler Dorn ohne Füllung, kein Flammen-Tip. |
| Masse / Proportion | **2** | 15×22 @ 2,4 = **36×52,8 px**, höher als Mira (32 px). Die vier Seelen dominieren die Bildmitte und überdecken Gegner/Grabsteine; bei Orbit-Radius 34 px (Basis) steht die halbe Seele über dem Spieler. |
| Farbe / Schattierung | **2** | Soll: Körper 6/5, Kanten 8, Kern 13, Kontur 0 (5 Stufen). Im Frame messbar **keine stabilen 6/5-Pixel**: Körper und „Rock" liegen bei geblendeten 8/9/10, Kappe/Kern bei 12/13. Ursache: `fx_halo_cold` = `ring(24,24,[8,6,5], inner≈0,3)`, skaliert 1,4×, α 0,32–0,6, **additiv** – hebt fogBlue 6 (58,74,92) auf ≈(101,124,146) = mist/paleMist. Dazu `fx_orb`-Trail in fogBlue-**ADD** (α 0,4→0) pro Frame = grau-blauer Rauch um die Seele. |
| Kontur / Pixel | **2** | Die 0-Kontur existiert im Asset, rendert aber bei `sprite.alpha` 0,4–0,9 über `marshLight` zu dunklem Moosgrün (bei α 0,4 komponiert der 6-Körper zu ≈(93,122,90) gegen marsh (61,90,56) → fast unsichtbar). **2,4× ist nicht ganzzahlig**: dieselbe 1-px-Kontur wird je nach Subpixel 2 oder 3 px breit – unregelmäßige Stufen/Jaggies auch im Schweif. |
| Licht oben-links | **2** | `gen-fx.ts:379` `dx <= halfW-3` erzeugt einen **symmetrischen senkrechten 8-Streifen** (Zeilen 8–15) = Pillow-Shading; keine Hochlicht-Kante oben-links. |
| Ausklang / Animation | **3** | Frames 0/1 unterscheiden sich echt (Zeile 11: 11→15 px breit, Kern springt 1 px) – Animation ist da. Der Ausklang ist aber nur Alpha-Puls (0,65±0,25) ohne Fade; der additive Trail hinterlässt eine **breite graue Säule, die wie Rauch stehen bleibt** statt zu verglühen. Die oberen zwei Zeilen sind in beiden Frames identisch → die Spitze flackert nicht. |
| Distinktheit zur Laterne | **3** | Kalt vs. amber, groß vs. klein: mit der Geisterlaterne nicht verwechselbar. Die Säulenform ähnelt aber `fx_pillar`/Wisp-Leuchten stärker als einer Seele; als „Seele" nicht eindeutig. |
| **Gesamt** | **3** | Lesbar und deutlich besser als die Metallkugel, aber Form, sichtbare Schattierung, Konturschärfe und Masse verfehlen die Latte. **FAIL** (≥4 nicht erreicht). |

### Präzise Pixel-Fixes (falls nachgebessert wird)

1. **Skalierung** – `CombatSystem.ts:746` `setScale(2.4)` auf **2** (30×44) ändern (oder 3, dann Orbit-Radius ≥ 55). Ganzzahlig, sonst bleiben 2/3-px-Konturstufen. Orbit-Radius so weit erhöhen, dass die Seele den Spieler nicht überdeckt.
2. **Alpha** – `CombatSystem.ts:787` `setAlpha(0.65 ± 0.25)` durch **konstant 1,0** ersetzen; flackern über Silhouette (Breite/Höhe), nicht über Transparenz. Nur so bleibt fogBlue 6 als dunkler Körper stehen.
3. **Halo** – `CombatSystem.ts:751/786` α auf **≤ 0,12** senken und `gen-fx.ts:426` `fx_halo_cold` mit `inner ≈ 0,82` (schmaler Ring) statt 0,3 erzeugen; der breite additive Ring ist die Hauptursache des Weiß-Waschs.
4. **Kern** – `gen-fx.ts:377–378`: Kern von `y9–10` (schmaler Hals, dort 2 bzw. 3 px breit) auf exakt **2×2 in den breitesten Körperzeilen `y12–13`** legen, umrandet von 9. Aktuell ist es 2×3 und sitzt sichtbar über der hellsten 8-Zone.
5. **Schweif** – `gen-fx.ts:370`: `halfW = y<20 ? 2 : 1` macht den Schweif **5 px breit** (`0 5 8 5 0`), nicht die behaupteten 2 px. Auf `halfW = 1` für `y16–21` (3 px) reduzieren, jede Zeile mit 0-Kontur, ±1-Zickzack beibehalten.
6. **Spitze** – `y0`/`y1` sind reine Tinte. Stattdessen `y0 = 0 8 0`, `y1 = 0 6 0` mit Tinte außen, damit der Tip eine helle Flammenspitze mit Kontur ist und nicht ein abgesetzter Dorn.
7. **Shading-Richtung** – `gen-fx.ts:379`: 8-Kante nur **oben-links** (`(x-cx+shift) < 0 && y < 12`), unten-rechts 6, Rand 5; den symmetrischen Mittelstreifen entfernen.
8. **Trail** – `CombatSystem.ts:789`: fogBlue-`fx_orb` in ADD durch einen **2-px-Sprite-Schweif** oder α ≤ 0,2 ersetzen; die additiven Puffs erzeugen den grauen Rauchmantel.
9. **Kontrast auf hellem Moor** – Körper-Außenrand auf 5, Körper 6, Kern 13 bei α 1,0; damit bleibt die Seele auch auf `marshLight` als dunkler Umriss mit hellem Kern lesbar.

### Gesamturteil

**FAIL.** `soul_beacon` erreicht **3** (nicht 4): Der Asset-Generator ist jetzt formal richtig, aber im GIF wird der Körper durch 2,4×-Skalierung + additiven Halo + Alpha-Wobble zu einer weißen Säule mit grauem Rock gewaschen – keine sichtbaren 3 Schattierungsstufen, keine lesbare 1-px-Kontur, Pillow-Shading und eine zu große Masse. Damit bleibt es das einzige Asset unter der Latte; die 17 übrigen Assets stehen unverändert bei ≥4.

## Runde 5 (Soul-Beacon)

Geprüft wurde ausschließlich `shots/m5-vfx-soul_beacon.gif`: Frames 0/8/20 mit ffmpeg extrahiert, 4× nearest vergrößert; zusätzlich 8×/10×-Crops einzelner Orbit-Seelen (Spieler-Nähe, f0/f8/f20). Keine anderen Bilder geladen. Die übrigen 17 Assets bleiben geerbt (≥4), nicht erneut gesichtet. Bewertet wird das **gerenderte** Ergebnis im GIF; wo die R4-Fixliste im Code nicht dem behaupteten Renderzustand entspricht, wird das als Befund notiert (Code-Verifikation von `orbSoulFrame`, `ring`, `addFrame`, `updateOrbs`).

Ergebnis der R4-Fixliste, am GIF bzw. Code nachgeprüft: **umgesetzt** sind Sprite-Scale exakt 2,0, konstantes Sprite-Alpha 1,0, Orbit +14 px, der dünnere Halo-Ring (`inner 0.82`) und der entfernte fogBlue-ADD-Trail (`fx_orb` wird für `soul_beacon` nicht mehr gespawnt). **Nicht so gerendert wie behauptet**: (1) der Kern ist **3×2**, nicht 2×2 (`Math.abs(x - cx) <= 1` = 3 Spalten); (2) der Körper hat **keinen 5-Ton** und keinen flächigen 6/5-Verlauf – jede Innenzelle ist `6`, der 8-Highlight existiert nur als **1 px breite Spalte in 2 Zeilen**; (3) `addFrame` überspringt das Zeichen `0` (`if (ch === "0") continue`), die „0-Kontur" ist also **transparent** – die Seele hat *gar keine* Kontur; (4) die Halo-Alpha 0,10 aus `fireLantern` wird in `updateOrbs` jeden Frame durch `0.4 + sin(...)·0.2` (0,2–0,6) **überschrieben**; (5) der Ring-Band-Innenrand ist in `ring()` hart `c` = Index **12 (candleWhite)**, der „kalte" Halo ist damit **warm-creme** und nicht blau.

| Teilkriterium | Note | Befund (f0/f8/f20) |
|---|---|---|
| Form / Silhouette | **2** | Der Körper ist eine **symmetrische, oben spitz zulaufende Säule** (2 px breiter Nadel-Tip über 8 px, dann 6/10 px breite Blöcke) mit einem **rechteckigen weißen „Fenster"** in der Mitte. Das liest sich als **Obelisk/Grabstein/Laternenpfahl**, nicht als Seele/Geistflamme. Keine Wisp-Zacke, keine Asymmetrie, kein Flammenbauch. Die R4-Kritik „Kerzen-/Grabstein-Silhouette" ist damit **nicht behoben**, nur schärfer gerendert. |
| Masse / Proportion | **3** | Sichtbare Körpermasse jetzt 14×28 px (Textur 15×22 @2 = 30×44), Orbit 64–78 px: der Spieler wird nicht mehr überdeckt, die Masse ist vertretbar. Aber die Seele ist **höher als Mira** (~24 px) und der 24-px-Halo-Ring sitzt nur um das „Fenster", nicht um den 44-px-Körper – das Proportionen-Verhältnis Ring:Körper ist falsch (Ring zu klein, Schweif zu lang). |
| Farbe / Schattierung | **2** | Nur **zwei Körperwerte** sichtbar: flächig `6` (fogBlue) plus ein 1-px-Saum `8` links in y8–9; darunter `13` als Kern. Damit sind die geforderten **3 Schattierungsstufen auf dem Körper nicht vorhanden**; der Slab wirkt flach und tot. Der `5`-Ton fehlt komplett. Der Halo bringt zusätzlich **Off-Ramp-Warmweiß (12)** als creme Ring ins kalte Asset. |
| Kontur / Pixel | **1** | **Keine Kontur**: alle `0`-Zeichen werden beim Texturieren transparent geschrieben – Außenkante, Tip und Schweif haben keinen 1-px-Rand. Auf dunklem Moos grenzt sich der Körper nur über die Helligkeit ab (fogBlue ≈ Moos-Helligkeit), auf `marshLight` (f20) „schwebt" der Slab ohne Rand; der Schweif ist eine Kette **isolierter 2×2-Punkte mit 2-px-Lücken** = sichtbares Einzelpixel-Rauschen (f0/f8/f20). |
| Licht oben-links | **2** | Die 8-Kante ist formal nur oben-links, aber effektiv **eine einzige Spalte in 2 Zeilen** (y8–9, x=cx−1); nach 2×-Scale und GIF-Quantisierung ist sie kaum als Lichtkante lesbar. Der Kern sitzt **zentriert/symmetrisch**, kein Hochlicht oben-links, keine Abdunklung unten-rechts → kein gerichtetes Licht. |
| Animation | **2** | Frame A/B unterscheiden sich nur durch **+1 px Breite auf der rechten Seite in y4–8** und den ±1-px-Schweif; in f0/f8/f20 wirkt das als **Kanten-Zittern/Rauschen**, nicht als Flammenflackern. Tip und Kern sind in beiden Frames starr; 8 Hz auf 2 Frames ist zu hektisch für eine ruhige Seele. |
| Distinktheit zur Laterne | **2** | Farblich (kalt vs. amber) unterscheidbar, aber die **Formsprache ist identisch**: „Gefäß mit hellem Kern + Ring" – genau die Grammatik der Laterne und der Karte (`prop_post`, Laternenpfähle, Grabmale). Im GIF habe ich die fünf Seelen beim ersten Blick als **Karten-Obelisken** gelesen; die „Seele" ist als solche nicht eindeutig. |
| **Gesamt** | **2** | Die technischen R4-Punkte (Scale/Alpha/Trail) sind real umgesetzt, aber das Asset selbst bleibt ein **konturloser, flächiger Obelisk mit Fensterkern**; Halo-Alpha und Ringfarbe sind weiterhin falsch verdrahtet. Lesbarkeit als „Seele" und die 3-Stufen-/Kontur-Latte werden klar verfehlt. **FAIL** (≥4 nicht erreicht). |

### Präzise Pixel-Fixes (falls nachgebessert wird)

1. **Echte Kontur** – `gen-fx.ts:addFrame` behandelt `0` als transparent. Für `orb_soul` einen eigenen Ink-Char (z. B. `#` → Index 0) einführen und **jede** Außenkante inkl. Tip und Schweif mit 1 px belegen; keine transparente „Glow-Kante". Ziel: 1-px `06070c`, nicht reines Schwarz, durchgehend geschlossen.
2. **Kern exakt 2×2** – `gen-fx.ts:376` `Math.abs(x - cx) <= 1` (3 Spalten) auf 2 Spalten ändern (`x === cx || x === cx - 1`), y10–11, plus 1 px Rand in Index **9**. Der Kern darf nicht die volle Innenbreite des 7-px-Körpers füllen, sonst bleibt es ein „Fenster".
3. **Körper-Schattierung** – flächiges `6` durch drei Zonen ersetzen: oben-links `8` (breitere Kante, alle Zeilen y2–9, 2 px), Mitte `6`, unten-rechts `5` (y10–13). Damit entstehen sichtbare 3 Stufen und gerichtetes Licht; `5` fehlt aktuell völlig.
4. **Silhouette entschärfen** – Tip von 4 Zeilen Nadel auf 2 Zeilen (`halfW 1→2`), Körper auf max. 5 px Halbbreite, Taille y12–13 auf 2, plus eine **asymmetrische Wisp-Zacke** (1–2 px Offset rechts in y6–9) und eine leichte Bauchwölbung. Ziel: Tropfen/Geistflamme, nicht Obelisk.
5. **Schweif** – die 8 Zeilen `T6T` mit ±1-Sprung durch einen **zusammenhängenden** 1-px-Zickzack über 3–4 Zeilen (=6–8 Render-px) mit Ink-Kontur ersetzen; keine isolierten Punkte/Lücken (Ursache des Rauschens in f0/f8/f20).
6. **Halo-Verdrahtung** – `CombatSystem.ts:786` Puls-Alpha `0.4 ± 0.2` entfernen und auf **konstant ≤ 0,10** setzen (die 0,10 aus Z. 751 wird sonst jede Frame überschrieben); zusätzlich `ring()` (Z. 98) den Innenrand nicht auf `c` (12/candleWhite) legen, sondern auf **9 (paleMist)** – sonst bleibt der Ring warm-creme.
7. **Halo-Größe** – `fx_halo_cold` 24×24 @scale 1,0 um einen 44 px hohen Körper ist zu klein; entweder Ring entfernen (die Seele trägt ihren Schweif) oder auf **scale 1,6–1,8** mit dünnem Band (inner 0.86) bringen, sodass er den Körper umschließt statt nur das Fenster.
8. **Animation** – 2 Frames bei 8 Hz reichen nicht: 3 Frames, Tip ±1 px seitlich, Kern 1 px vertikal, Breite in 2 Zeilen beidseitig variieren, Frequenz ~5 Hz. Das aktuelle +1-px-Rechtszittern ist als Flackern nicht lesbar.

### Gesamturteil

**FAIL.** `soul_beacon` erreicht in R5 **2/5** (nicht 4): Die Orbit-Mechanik ist sauber (Scale 2, Alpha 1, kein ADD-Trail), aber das Sprite ist ein **konturloser (0 = transparent), einfarbiger Obelisk mit 3×2-Fensterkern**, der Halo läuft weiter mit α 0,2–0,6 und warmem `candleWhite`-Band, der Schweif ist Punktrauschen. Form, Kontur, Schattierung und Distinktheit verfehlen die harte Latte; **kein PASS**.

- **muss neu:** `soul_beacon` (Sprite-Silhouette + echte 1-px-Kontur + 3-Ton-Körper + 2×2-Kern; Halo-Runtime-Alpha/Ringfarbe).
- **nachbessern:** —
- **ok:** — (nur dieses Asset geprüft)
