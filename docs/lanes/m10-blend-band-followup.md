# m10-blend-band-followup — Rest-ADD-Quellen nach dem Glow-Band (Blend-Wechsel/Frame)

Datum: 2026-11-28. Lane: `m10-blend-band-followup` (Worktree `/home/ai/games/lf-lanes/m10-blend-band-followup`,
Branch `m10-blend-band-followup`). Karten #13344–#13347. Auftrag: nach dem zusammenhängenden Depth-Band
`FX_GLOW_DEPTH` (m10-tablet-fx-hotspot, 32 → 2 Grenzen) die Rest-ADD-Quellen in den eigenen Dateien
`EnemyProjectiles.ts`, `CombatSystem.ts`, `PickupSystem.ts` ins Band (oder ein verträgliches zweites Band)
ziehen; Guard-Test; Vorher/Nachher-Messung.

**Belege (außerhalb des Repos):** `~/games/.evidence/m10-blend-band-followup/` —
`before.json` (K1 Vorher, 8 Fenster), `after.json` (K4 Nachher, 8 Fenster), `before-islands.json`
(blendFunc-Stacks), `ab-bend.txt` (Blend-Bend-A/B, entscheidende Attribution), `pixel-{after-band,before-fxlow,diff-lantern}.png`
(Pixel-Diff-Probe, gefrorener Frame), Before-Standbilder `before-*.png`. Mess-Probe:
`scripts/m10-blend-band.mjs` (Muster `m10-tablet-fx-rc.mjs`; 640x360, god, je 4 s Fenster, Census nach
Tiefe+Blend, setBlendMode-Wechsel mit Stack). Kennzahl ist der Blend-Wechsel-Zaehler
(blendFunc+blendFuncSeparate/Frame, rendererunabhängig), **kein FPS-Tor** — die Läufe liefen deshalb
ab K4 unter `flock /home/ai/games/.lf-perf.lock` (K1 davor, ohne Lock; fps ist im JSON nur Kontext,
VSync-gekappt 60,3 und nie ein Kriterium).

## K1 — Vorher (Renderer: `Mesa Intel(R) Graphics (RPL-S)`, iGPU/ANGLE, 0 JS-Fehler)

| Fenster | blend/Frame | draws/Frame |
|---|---|---|
| base (keine Evo) | 6,5 | 8,5 |
| stack:+1 … +5 | 5,0 – 7,0 | 7 – 9 |
| stack:+6 (alle Evos) | 6,2 | 8,2 |
| minute25:stack6+300 (Worst) | **6,2** | 8,2 |

Worst-Vorher also **7,0 (stack:+2) bzw. 6,2 (minute25-Worst-Profil)** — NICHT die im Briefing
genannten ~26/Frame. Der Wert ~26/Frame des Geräte-Befunds (09:45Z) ist lokal nicht reproduzierbar;
Attribution unten.

## K2 — Befund je Rest-Quelle (ehrlich)

1. **EnemyProjectiles.ts: KEINE ADD-Quelle.** Verifiziert statisch (kein `BlendModes.ADD` im File) und
   zur Laufzeit (Census `before.json`: Schüsse/Telegraphs/Trails/Hit-Funken alle NORMAL auf
   `enemyShot` 14 / `hazard` 13). Die Briefing-Annahme „Gegnerprojektil-Glows" ist nach dem Stand von
   `m10-tablet-fx-hotspot` nicht zutreffend — es gab hier nichts zu ziehen. Guard-Test pinnt ADD-Freiheit.
2. **PickupSystem.ts: Momente sind KEINE ADD-Quelle.** Icon (`setTintFill`) + 1-px-Grafik rendern in
   NORMAL-Blend; `MOMENT_DEPTH = enemyShot + 1` (15) bleibt **bewusst** über dem Band und über den
   Gegner-Projektilen (GAME.md-Lesbarkeit im Chaos, dokumentiert im Quelltext, gepinnt im Guard-Test).
   Kein Blend-Kostenpunkt.
3. **CombatSystem.ts: eine echte Rest-Insel gefunden und gezogen.** Der **unevolvierte**
   Laternen-Korpus (`orb_lantern`, ADD) lag auf `DEPTH.fxLow` (7) *mitten zwischen* den NORMAL-FX-Formen
   (gleiche Tiefe, Phaser sortiert stabil nach Erzeugung) — je sichtbarer Laterne 2 EXTRA-Grenzen
   (rein/raus), Muster Root-Cause-Bericht. Fix: `lanternOrbDepth(evolved)` → ADD-Korpus ins Band (7.5),
   in dem sein Halo bereits lief; evolviert (`soul_beacon`, NORMAL-Korpus) bleibt auf fxLow. Waffen-
   ADD-Projektile (blendAdd) und Wrath-/Soul-Halos lagen durch den Hotspot-Lane-Fix bereits im Band
   (ProjectilePool/CombatSystem-Stellen via `FX_GLOW_DEPTH`).

Zeichenreihenfolge (GAME.md) unverändert: Band 7.5 < Gegner 9 < boss 10 < enemyDeath 11 < player 12 <
hazard 13 < enemyShot 14 < Moment 15 < light 20. Kein ADD-Sprite wurde über Gegner/Gegner-Projektile
gezogen; das dokumentierte „bewusst über den Gegnern" der enemyDeath-Bursts (11) und Hazard-Rims (14,
fremd) bleibt unverändert bestehen.

## K3 — Guard-Test (`tests/blend-band-followup.test.ts`, 9 Tests)

- Laterne: `lanternOrbDepth` Quelle + Aufrufstelle geprüft (Quelltext-Assert, weil CombatSystem in Node
  ohne echtes Phaser nicht importierbar — Muster `tests/m25-density-mode.test.ts`).
- **Jede** ADD-Blend-Zuweisung im CombatSystem muss im Create-Block eine Band-Tiefe nennen
  (`FX_GLOW_DEPTH|lanternOrbDepth`, Regex über alle Vorkommen, >= 5 Anker-Stellen).
- Walk-Modell: Population mit Band = 2 Grenzen; Gegenmodell (alte Laterne zwischen NORMAL-FX) = 4
  (Regressions-Anker, Muster `tests/tablet-fx-budget.test.ts`).
- PickupSystem/EnemyProjectiles: ADD-Freiheit gepinnt; Ordnungs-Assertions (Band < Gegner < Projektil
  < Moment < Licht).

## K4 — Nachher + Attribution (Renderer wie K1, 0 JS-Fehler, unter flock)

| Fenster | blend vor → nach | draws vor → nach |
|---|---|---|
| base | 6,5 → 6,5 | 8,5 → 8,5 |
| stack:+6 | 6,2 → 7,4 | 8,2 → 9,4 |
| minute25:stack6+300 (Worst) | **6,2 → 6,8** | 8,2 → 8,8 |

Nachher ≈ Vorher (Schwankung ±1,2 zwischen Läufen, z. B. stack:+6 6,2 ↔ 7,4; die Profile nutzen alle
die **evolvierte** Laterne `soul_beacon` mit NORMAL-Korpus — der Fix wirkt nur auf unevolviert und ist
in diesen Profilen neutral). **Abnahme „Worst <= 4" ist lokal NICHT erreicht** — und zwar aus einem
gründlichen Grund:

**Attribution (entscheidend, `ab-bend.txt`):** Alle sichtbaren ADD-Objekte zur Laufzeit auf NORMAL
gebogen (setBlendMode-Bend an Image+Sprite-Prototypen, Muster Root-Cause-Lane):

| Variante | blend/Frame |
|---|---|
| A baseline (ADD wie gebaut) | 6,2 |
| B alle ADD → NORMAL | 6,0 |
| C nur Lichtkreis (d20) → NORMAL | 6,1 |

**Die verbleibenden ~6 Blend-Wechsel/Frame sind ADD-unabhängig.** Sie stammen aus dem strukturellen
Batch-Rauschen des Walks (blend−1/SKIP_CHECK-Grafiken, Ground-Chunks, HUD/Vignette — A/B
runtime-hide: hide blend−1-Grafiken → 4,0; hide Ground-Chunks → 4,0; jeweils draws −2/−3). Die
ADD-Inseln (Band 7.5, Lichtkreis 20) kosten lokal ~0 Grenzen — das Hotspot-Band arbeitet wie gebaut.
Ein früherer Hide-A/B-Lauf (Band/Licht unsichtbar setzen) war **invalide** (Update-Loops setzen
`visible` pro Frame zurück) und wurde verworfen; die Bend-Messung ist die verbindliche.

**Konsequenz:** Innerhalb der geclaimten Dateien ist der Hebel ausgeschöpft (Laterne war die letzte
eigene ADD-Insel); das „Worst <= 4"-Kriterium ist lokal nur erreichbar, wenn fremde Systeme ihren
Blend-/Batch-Anteil senken (siehe Hebelliste). Kein Würfelns: Vorher/Nachher je 1 Messlauf, verbindlich.

**Optik (Pixel-Diff, gefrorener Frame, exakte A/B):** Szene pausiert (Laternen-Szenario), derselbe
Zustand mit orb@7.5 (nachher) und orb@7 (vorher) gerendert:
`compare -metric AE` = **0** Pixel, RMSE = 0 — der Draw-Order-Wechsel ist bitidentisch
(additiv kommutativ, Halo/Nachbarn ebenfalls ADD). Belege
`pixel-after-band.png` / `pixel-before-fxlow.png` / `diff-lantern.png` (evidence), Kontrollbild
`shots/abnahme/m10-blend-band-lantern-side.png` (links nachher, rechts vorher, 3x nearest).

## Hebelliste für die Rest-Quellen (Bedarf außerhalb der eigenen Claims)

1. **Geräte-Befund „26 Blend-Wechsel/Frame" neu attributieren:** lokal nicht reproduzierbar (6,2).
   Vermutung: das 09:45Z-Gerätefenster enthält Elites (Aura, `EnemyPool.ts:308-311`, ADD d8, fremd),
   Hazard-Rims (ADD d14, `Hazards.ts:141/179`, fremd — GAME.md: Warnflächen über Silhouetten), Momente/
   Truhen-FX und Damage-Grafiken, die lokal in den Wisps-Profilen nicht aktiv sind. Empfehlung:
   denselben Bend-Probe (alle ADD → NORMAL) einmal **auf dem Gerät** laufen lassen — fällt die Zahl
   dann auf ~6, sind es die ADD-Inseln (Elite-Aura/Hazard-Rim); bleibt sie, ist es strukturelles
   Rauschen (dann Flush-Kosten am Adreno prüfen, nicht Blend-Moden).
2. **blend−1/SKIP_CHECK-Grafiken** (lokal −2,2 beim Hide): Damage-Nummern/HUD-Grafik —
   `DamageNumbers.ts`/`Run.ts` (fremd geclaimed). Hebel: Grafik-Redraws bündeln oder auf Textur-Pfad.
3. **Ground-Chunks** (lokal −2,2 beim Hide, draws −3): `GroundRenderer.ts` (fremd) — Hebel: Chunk-Batches
   prüfen (warum 2 Blend-Wechsel ohne ADD?).
4. **Lichtkreis** (ADD, d20, `Run.ts:351` + GroundRenderer, fremd): am Gerät grenzwertig — im Band wäre
   +2 Grenzen (Band < enemy) nicht zulässig (Licht über Spieler lt. GAME.md); separat entscheiden.
5. `m10-janky-remeasure.mjs` (fremd): Zähler „Blend-Wechsel" dort gegen den Bend-Probe abgleichen,
   damit Gerät vs. lokal dieselbe Metrik verwenden.

## Ehrliche Punkte / offene Reste

- **Kontrolleure:** Reviewer PASS (2026-11-28, Beleg: tsc leer, 9/9 Guards, Full-Suite 233 Dateien /
  2524 Tests). Sollte-Befund umgesetzt: der Band-Anchor-Test prüft jetzt bis zur nächsten `.setDepth(`
  zurück statt breitem Rückwärtsfenster (falsch-grün durch Kommentar-Erwähnungen ausgeschlossen).
  Nit-Funde (No-op `setScale(evolved ? 1 : 1)`, `globalThis.__port` im Probe) bewusst nicht angefasst
  (fremde Karte/kein Mehrwert in dieser Lane).

- Abnahme-Zahl „Worst <= 4" nicht erreicht (6,2 → 6,8 im Worst-Profil, Rauschen ±1,2). Grund belegt
  (Bend-A/B): die Wechsel sind ADD-unabhängig, die eigenen Dateien tragen lokal ~0 Grenzen. Der
  K2-Fix selbst ist korrekt, getestet und optisch bitidentisch — er hilft jedem Spieler mit
  unevolvierter Laterne (häufiger Zustand, Level 1–5).
- K1-Lauf lief ohne flock (Briefing-K1 verlangte es; erst in K4 umgesetzt). Die fps-Werte im JSON sind
  VSync-gekappt und nie Kriterium — die Kennzahl Blend/Frame ist laut Mess-Sperren-Regel kein FPS-Tor.
- Geräte-Wert 26/Frame weiterhin ungeklärt (s. Hebelliste 1) — Gerät war für diese Lane nicht verfügbar.
- `tests/passive-stack.test.ts` schreibt bei jedem Lauf Fremd-JSONs nach shots/ (bekannter Punkt der
  Hotspot-Lane, hier nicht berührt).
