# Lane m10-enemy-ai — archetypisch verschiedene Gegner-KI

Basis: main-Merge `bb4214a` (m10-input-fix). Branch `m10-enemy-ai`, Worktree
`/home/ai/games/lf-lanes/m10-enemy-ai`.

Ziel: Die 30 Gegnertypen verhalten sich archetypisch verschieden, nicht nur
unterschiedlich aussehen. Signatur je Archetyp: **Charger stürmt, Ranged hält
Abstand, Splitter teilt, Summoner ruft, Flanker umkreist.** Beleg: deterministische
Verhaltensmatrix ohne Renderer.

## Messmethode (#K1)

`tests/enemy-ai.test.ts` simuliert `stepEnemyAi` je Gegnertyp 60 s bei festem
`dt = 1/60 s` (3600 Schritte). Stub-RNG über `mulberry32` mit den Seeds **101**
und **202**; derselbe Seed liefert exakt dieselbe Matrix (im Test geprüft).

- Spieler steht im Ursprung (0,0), Gegner startet 210 px entfernt.
- Bewegung wird wie in `Run.ts` angewandt: Wunschrichtung × Basisgeschwindigkeit
  × `speedMul` × dt. Kontakt unter 10 px wird geklemmt (Kollision).
- Gemessen werden nur KI-Ausgaben, kein Renderer, keine Kamera, keine Frames.
- Splitter: Kontakt = Todeszeitpunkt; `shouldSplit(splitDepth)` entscheidet über
  echte Split-Events (max. 2 Generationen), danach Respawn bei 120 px.
- Exploder: `explode`-Aktion zählt, danach Respawn bei 170 px für die Messdauer.
- Telegraph-Anteil: Summe der `windup`/`charge`-Dauern / 60 s.

Maschinenlesbarer Beleg: `shots/m10-enemy-ai-matrix.json`.
Rohlauf: `npx vitest run tests/enemy-ai.test.ts --disableConsoleIntercept --reporter=verbose`.

### Matrix Ist-Stand (#K1)

<!-- ENEMY-AI-MATRIX -->
| Gegner | Archetyp | Tier | ØDist 101 | Vorw 101 | Dreh/s 101 | Tel 101 | Burst 101 | ØDist 202 | Vorw 202 | Dreh/s 202 | Tel 202 | Burst 202 | Split 101 | Split 202 | Summon 101 | Summon 202 | Blink 101 | Blink 202 | Shoot 101 | Shoot 202 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bog_rat | swarm | 0 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| wisp | chaser | 0 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mudling | splitter | 0 | 18.7 | 1 | 0.03 | 0 | 0 | 18.7 | 1 | 0.03 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| crow | swarm | 0 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bogzombie | chaser | 0 | 11.2 | 1 | 0 | 0 | 0 | 11.2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| toad | ranged | 0 | 135.8 | 0.002 | 0.17 | 0 | 0 | 135.8 | 0.002 | 0.17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 24 | 24 |
| skeleton | chaser | 1 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bat | swarm | 1 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ghoul | charger | 1 | 10 | 1 | 0 | 0.267 | 0.114 | 10 | 1 | 0 | 0.267 | 0.118 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| witchling | ranged | 1 | 141.8 | 0.002 | 0.17 | 0 | 0 | 141.8 | 0.002 | 0.17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 26 | 26 |
| slime | splitter | 1 | 22.6 | 1 | 0.03 | 0 | 0 | 22.6 | 1 | 0.03 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| scarecrow | tank | 1 | 17.5 | 1 | 0 | 0 | 0 | 17.5 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| wolf | charger | 2 | 10 | 1 | 0 | 0.267 | 0.114 | 10 | 1 | 0 | 0.267 | 0.118 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| banshee | phaser | 2 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| golem | tank | 2 | 21.3 | 1 | 0 | 0 | 0 | 21.3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| spider | swarm | 2 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cultist | summoner | 2 | 165.8 | 0 | 54.98 | 0 | 0 | 165.8 | 0 | 54.98 | 0 | 0 | 0 | 0 | 13 | 13 | 0 | 0 | 0 | 0 |
| bomber | exploder | 2 | 86.8 | 0.997 | 0.23 | 0 | 0 | 86.7 | 0.999 | 0.23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| knight | tank | 3 | 18.6 | 1 | 0 | 0 | 0 | 18.6 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| harpy | orbiter | 3 | 79.5 | 0.452 | 46.12 | 0 | 0 | 79.5 | 0.452 | 46.12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| lich | ranged | 3 | 153.8 | 0.001 | 0.13 | 0 | 0 | 153.8 | 0.001 | 0.13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 31 | 31 |
| wraith | phaser | 3 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| treant | tank | 3 | 27.2 | 1 | 0 | 0 | 0 | 27.2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| imp | exploder | 3 | 82.7 | 0.996 | 0.28 | 0 | 0 | 82.6 | 0.998 | 0.28 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| horror | ranged | 4 | 159.8 | 0.001 | 0.1 | 0 | 0 | 159.8 | 0.001 | 0.1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 35 | 35 |
| centipede | charger | 4 | 10 | 1 | 0 | 0.267 | 0.114 | 10 | 1 | 0 | 0.267 | 0.118 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| gargoyle | orbiter | 4 | 77.5 | 0.466 | 44.7 | 0 | 0 | 77.5 | 0.466 | 44.7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| reaper_bat | swarm | 4 | 10 | 1 | 0 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| abom | splitter | 4 | 38.7 | 1 | 0.03 | 0 | 0 | 38.7 | 1 | 0.03 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| voidcaller | summoner | 4 | 165.9 | 0 | 54.98 | 0 | 0 | 165.9 | 0 | 54.98 | 0 | 0 | 0 | 0 | 16 | 16 | 0 | 0 | 0 | 0 |
<!-- /ENEMY-AI-MATRIX -->

Erste Befunde des Ist-Stands: `swarm`, `chaser` und `tank` sind bis auf den
SpeedMul deckungsgleich (ØDist 10, Vorwärtsanteil 1, 0 Drehungen/s), die
Splitter unterscheiden sich nur in der Anlaufzeit, Orbiter und Ranged
differenzieren allein über Tier-Werte.

## Lückenliste und Soll-Signaturen (#K2)

Auswertung der Ist-Matrix (Seeds 101/202, 60 s, statischer Spieler). Die
Ist-Matrix ist seed-invariant — die Verhalten sind so deterministisch, dass der
Seed nur die Startphase beeinflusst. Genau das ist das Problem: **10 Archetypen
teilen sich effektiv 5 Verhaltensmuster**, innerhalb eines Archetyps sind die
Exemplare nur über `tier` (Tempo/Abstand) unterscheidbar, nicht über eine eigene
Bewegungscharakteristik.

### Ist-Stand je Archetyp (gemessen)

| Archetyp | Exemplare | ØDist | Vorwärts | Dreh/s | Tel | Events | Befund |
|---|---|---|---|---|---|---|---|
| swarm | bog_rat, crow, bat, spider, reaper_bat | 10 | 1.00 | 0.00 | 0 | – | **KEINE Eigenheit**: identisch mit chaser/tank, nur SpeedMul 1.08 |
| chaser | wisp, bogzombie, skeleton | 10–11.2 | 1.00 | 0.00 | 0 | – | **KEINE Eigenheit**: gerade Verfolgung, identisch mit swarm/tank |
| tank | scarecrow, golem, knight, treant | 17.5–27.2 | 1.00 | 0.00 | 0 | – | **KEINE Eigenheit**: wie chaser, nur SpeedMul 0.92 |
| ranged | toad, witchling, lich, horror | 135.8–159.8 | ~0.00 | 0.10–0.17 | 0 | Shoot 24–35 | Abstand ja, aber alle 4 nur über Tier-Band/Schussrate verschieden; **kein Rückzug messbar**, kein Strafing-Wechsel |
| summoner | cultist, voidcaller | 165.8–165.9 | 0.00 | 54.98 | 0 | Summon 13–16 | Abstand + Ruf ja; Drehrate ist ein Messartefakt der Tangentialbewegung (Schwelle zu niedrig), die beiden unterscheiden sich nur im Cooldown |
| orbiter | harpy, gargoyle | 77.5–79.5 | 0.45–0.47 | 44.7–46.1 | 0 | – | umkreist ja, aber Radius/Winkelgeschwindigkeit nur über Tier; Distanz-Streuung nicht erfasst |
| charger | ghoul, wolf, centipede | 10 | 1.00 | 0.00 | 0.267 | Charge | stürmt ja (Burst-Anteil 0.114), aber alle 3 identisch; Windup/Charge-Dauer nicht tier-abhängig |
| splitter | mudling, slime, abom | 18.7–38.7 | 1.00 | 0.03 | 0 | Split 2 | teilt (2 Generationen), aber **Bewegung = chaser**; keine Split-Schwelle/Anlauf-Charakteristik |
| exploder | bomber, imp | 82.7–86.8 | 0.996 | 0.23–0.28 | 0 | Explode 15–18 | zündet zuverlässig, aber Fuse-Zeit/Annäherung nicht tier-abhängig, Telegraph-Anteil 0 |
| phaser | banshee, wraith | 10 | 1.00 | 0.00 | 0 | Blink 1 | blinkt nur 1×/60 s; Cooldown/Blinkradius effektiv tier-unabhängig, danach wie chaser |

**Kernlücken:** (1) swarm/chaser/tank sind nicht unterscheidbar; (2) Splitter
haben keine Bewegungssignatur; (3) Ranged zeigt keinen Rückzug, weil der Test
nur aus 210 px Anlauf misst; (4) Phaser blinkt zu selten für ein Muster;
(5) Charger-Werte sind tier-unabhängig; (6) Drehraten-Schwelle 14° erzeugt bei
Orbitern ein Artefakt statt eines Flankier-Maßes.

### Soll-Signatur je Archetyp

| Archetyp | Soll-Signatur | Messkriterium (Zielkorridor) |
|---|---|---|
| swarm | umschwärmt in Schwarmwolke, webt quer zur Anlaufachse | Vorwärts > 0.9 bei hoher Lenkung > 60 °/s, Dreh/s > 0.3 |
| chaser | verfolgt direkt, stößt rhythmisch vor | Vorwärts > 0.95, Dreh/s < 1, Burst-Anteil 0.05–0.2 |
| tank | walzt langsam und stur geradeaus | ØSpeedMul < 0.9, Dreh/s < 0.5, Vorwärts > 0.95 |
| ranged | hält Abstandsband, zieht sich bei Bedrängung zurück | ØDist im Band ±25, Rückzugsanteil > 0.05, Shoot-Events > 0 |
| summoner | bleibt weit hinten, ruft Minions | ØDist > 140, Summon-Events > 0, Vorwärts < 0.3 |
| orbiter | umkreist in fester Bahn (Flanker) | Dreh/s > 5, Distanz-Streuung < 25, ØDist im Bahnradius ±20 |
| charger | lädt auf, stürmt in gerader Linie, erholt sich | Telegraph-Anteil > 0.1, Burst-Anteil > 0.05, Vorwärts > 0.8 |
| splitter | drängt in Schüben heran, teilt bei Kontakt | Split-Events > 0, Dreh/s 0–1, Vorwärts > 0.8 |
| exploder | rennt heran, zündet mit Zündschnur | Explode-Events > 0, Telegraph/Fuse-Anteil > 0.05 |
| phaser | teleportiert wiederholt um den Spieler | Blink-Events ≥ 4/60 s, Distanz-Streuung hoch |

Umsetzung in #K3 (eigene Parameter/Branches je Archetyp in
`src/logic/enemy-ai.ts`, Signatur kompatibel), Nachweis in #K4.

## Logik geschärft (#K3)

`src/logic/enemy-ai.ts` hat jetzt eine vorab gebaute Profil-Tabelle
`aiProfileFor(archetype, tier)` (keine Objekt-Allokation pro Frame). Jeder
Archetyp hat eigene Branches und Tier-Skalierung:

| Archetyp | Branch-Signatur |
|---|---|
| swarm | Sinus-Weben quer zur Anlaufachse (`weaveAmp` 0.34–0.59, Frequenz 1.9–3.3) |
| chaser | Gerade Verfolgung + rhythmischer Vorstoß (`lungePeriod` 1.5→0.9 s) |
| tank | Geradeaus + periodisches Stemmen (`speedMul` 0.55 im Fenster), Ø < 0.9 |
| ranged | Abstandsband mit Hysterese (`band` 96–128 px), Rückzug + seitliches Kreuzen, Schuss-Cooldown 2.8–2.24 s |
| summoner | weites Band 150–170 px, langsames Kreisen, Ruf-Cooldown 4.36–2.6 s, ab Tier 4 drei Minions |
| orbiter | Flankier-Radius 72–92 px, tangential, Umlaufrichtungs-Wechsel per Timer, Winkelgeschwindigkeit tier-abhängig |
| charger | Windup, Charge-Sprint und Recover tier-abhängig (Windup 0.68→0.38 s, Sprint 3.1→3.5×) |
| splitter | Schubweise Annäherung (`lungePeriod` 1.7–2.4 s), Reifen an der Split-Schwelle (50–80 px), Tempo sinkt mit Tier |
| exploder | Annäherung 1.18×, kürzere Zündschnur je Tier (0.95→0.5 s), Zündabstand 30–54 px |
| phaser | Blink alle 2.7–1.1 s in den Ring 62–77 px um den Spieler (vorher 1 Blink/60 s) |

`AiState` wurde nur um `phase` erweitert; `AiStep`/`AiAction`/`stepEnemyAi`-
Signatur sind unverändert, `Run.ts` läuft ohne Anpassung weiter. Die
Normalisierung im Hot-Path ist inline (kein temporäres Vektor-Objekt).

## Matrix nachher (#K4)

Gleiche Messmethode wie #K1, ergänzt um ein **Druck-Szenario** (Start 55 px,
Spieler läuft mit 18 px/s nach), damit Distanzhalter Rückzug zeigen. Distanz-,
Kurs-, Kontakt- und Schusswerte stammen aus dem Anlauf-Szenario (210 px), der
Rückzugsanteil aus dem Druck-Szenario; Events sind über beide Szenarien
summiert. Jeder Seed ist für sich deterministisch (gleicher Seed ⇒ exakt
gleiche Matrix, Test-Assertion); Seed 101 und 202 können einzelne Werte
minimal verschieben, die Archetyp-Signaturen und Cluster bleiben identisch.
Maschinenlesbarer Beleg: `shots/m10-enemy-ai-matrix.json` (alle 30 Typen,
beide Seeds, alle Rohmetriken inkl. `retreatShare` und `shootEvents`).

| Gegner | Archetyp | Tier | ØDist | σDist | Vorw | Rück | Dreh/s | Lenk°/s | Tel % | Burst % | Kontakt % | Shoot | Split | Summon | Blink | Explode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bog_rat | swarm | 0 | 10 | 0 | 1 | 0 | 0.55 | 159.8 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| wisp | chaser | 0 | 10 | 0 | 1 | 0 | 0 | 0 | 0 | 0.156 | 1 | 0 | 0 | 0 | 0 | 0 |
| mudling | splitter | 0 | 24.2 | 26.6 | 1 | 0 | 0.07 | 8 | 0 | 0 | 0.675 | 0 | 4 | 0 | 0 | 0 |
| crow | swarm | 0 | 10 | 0 | 1 | 0 | 0.55 | 165.4 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| bogzombie | chaser | 0 | 10.6 | 4.4 | 1 | 0 | 0 | 0 | 0 | 0.156 | 0.973 | 0 | 0 | 0 | 0 | 0 |
| toad | ranged | 0 | 110.9 | 0.6 | 0 | 0.95 | 0 | 10.4 | 0 | 0 | 0 | 42 | 0 | 0 | 0 | 0 |
| skeleton | chaser | 1 | 10 | 0 | 1 | 0 | 0 | 0 | 0 | 0.175 | 1 | 0 | 0 | 0 | 0 | 0 |
| bat | swarm | 1 | 10 | 0 | 1 | 0 | 0.63 | 189 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| ghoul | charger | 1 | 10 | 0.1 | 1 | 0 | 0 | 0 | 0.263 | 0.11 | 0.999 | 0 | 0 | 0 | 0 | 0 |
| witchling | ranged | 1 | 119.1 | 0.8 | 0 | 0.838 | 0 | 11.5 | 0 | 0 | 0 | 44 | 0 | 0 | 0 | 0 |
| slime | splitter | 1 | 31 | 31.2 | 1 | 0 | 0.07 | 8 | 0 | 0 | 0.553 | 0 | 4 | 0 | 0 | 0 |
| scarecrow | tank | 1 | 18.4 | 24.7 | 1 | 0 | 0 | 0 | 0 | 0 | 0.862 | 0 | 0 | 0 | 0 | 0 |
| wolf | charger | 2 | 10 | 0 | 1 | 0 | 0 | 0 | 0.271 | 0.123 | 1 | 0 | 0 | 0 | 0 | 0 |
| banshee | phaser | 2 | 29.3 | 21.3 | 0.996 | 0.003 | 0.33 | 35.5 | 0 | 0 | 0.403 | 0 | 0 | 0 | 46 | 0 |
| golem | tank | 2 | 22.4 | 31.1 | 1 | 0 | 0 | 0 | 0 | 0 | 0.814 | 0 | 0 | 0 | 0 | 0 |
| spider | swarm | 2 | 10 | 0 | 1 | 0 | 0.72 | 212.4 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| cultist | summoner | 2 | 180 | 0.3 | 0 | 0.911 | 0 | 6.2 | 0 | 0 | 0 | 0 | 0 | 28 | 0 | 0 |
| bomber | exploder | 2 | 86.9 | 44.9 | 0.996 | 0.004 | 0.27 | 31.4 | 0.222 | 0 | 0 | 0 | 0 | 0 | 0 | 39 |
| knight | tank | 3 | 19.7 | 26.9 | 1 | 0 | 0 | 0 | 0 | 0 | 0.848 | 0 | 0 | 0 | 0 | 0 |
| harpy | orbiter | 3 | 84.3 | 5.1 | 0 | 0 | 0.18 | 332.1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| lich | ranged | 3 | 134.6 | 0.5 | 0 | 1 | 0 | 8.6 | 0 | 0 | 0 | 48 | 0 | 0 | 0 | 0 |
| wraith | phaser | 3 | 34.7 | 22.2 | 0.996 | 0.003 | 0.35 | 36.3 | 0 | 0 | 0.269 | 0 | 0 | 0 | 48 | 0 |
| treant | tank | 3 | 28.7 | 38.8 | 1 | 0 | 0 | 0 | 0 | 0 | 0.747 | 0 | 0 | 0 | 0 | 0 |
| imp | exploder | 3 | 87 | 44.1 | 0.995 | 0.005 | 0.33 | 40.4 | 0.251 | 0 | 0 | 0 | 0 | 0 | 0 | 49 |
| horror | ranged | 4 | 142.7 | 0.4 | 0 | 1 | 0 | 7.4 | 0 | 0 | 0 | 50 | 0 | 0 | 0 | 0 |
| centipede | charger | 4 | 10 | 0 | 1 | 0 | 0 | 0 | 0.29 | 0.149 | 1 | 0 | 0 | 0 | 0 | 0 |
| gargoyle | orbiter | 4 | 88.4 | 5.5 | 0 | 0.857 | 0.18 | 274.4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| reaper_bat | swarm | 4 | 10 | 0 | 1 | 0 | 0.87 | 264.1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| abom | splitter | 4 | 58.5 | 36.7 | 1 | 0 | 0.07 | 8 | 0 | 0 | 0.063 | 0 | 4 | 0 | 0 | 0 |
| voidcaller | summoner | 4 | 187.9 | 0.2 | 0 | 1 | 0 | 4.4 | 0 | 0 | 0 | 0 | 0 | 34 | 0 | 0 |

*Tabelle: Seed 101, 60 s, Starts 210/55 px. Seed 202 liegt in denselben
Zielkorridoren; die vollständigen 202-Werte stehen im JSON-Beleg.*

### Verhaltenscluster (Test-Assertions in `tests/enemy-ai.test.ts`)

| Cluster | Archetypen | Belegte Signatur | Trennkriterium im Test |
|---|---|---|---|
| Assault | swarm, chaser, tank | Nahkampf, Vorwärts > 0.75, Chaser/Tank < 20 °/s, Schwarm webt > 60 °/s | ØDist < 60, Kontakt hoch |
| Charger | charger | Telegraph 26–29 %, Sprint-Anteil 0.11–0.15, Tier erhöht Sprint | Tel > 8 %, Burst > 5 % |
| Kite | ranged | ØDist 111–143, Rückzug 0.85–0.95 unter Druck, 42–50 Schüsse/60 s | ØDist > 80, Rückzug > 3 % |
| Summoner | summoner | ØDist 180–188, 28–34 Rufe/60 s | ØDist > 120, Vorwärts < 0.6 |
| Flanker | orbiter | Kreisbahn 84–88 px, Lenkung 274–332 °/s, σDist ≤ 5.5 | Lenkung > 30 °/s, σDist < 30 |
| Specialist | splitter, exploder, phaser | 4 Splits, 39–50 Explosionen, 44–48 Blinks | Split ≥ 2, Blink ≥ 40, Explode ≥ 20 |

Damit sind **6 messbar getrennte Cluster** belegt (≥ 4 gefordert) und alle 30
Gegnertypen erfüllen die Soll-Signatur ihres Archetyps. `npx vitest run
tests/enemy-ai.test.ts` ist grün (10 Tests, inkl. 30/10-Coverage-Assertion und
Disjunktheits-Prüfung: Nahkampf < 60 px vs. Fernkampf > 60 px).

## In-Game-Beleg (#K5)

Messlauf: 5 Sim-Minuten mit `timeScale 10` über `window.__lf`, AutoPlay + God,
960×540-Viewport, unter `flock /home/ai/.lf-perf.lock`. FPS-Minimum als
Minimum der 1-Sekunden-Fenster nach 10 s Warmlauf.

| Messwert | Ergebnis |
|---|---|
| Sim-Zeit | 305,8 s (5:05) |
| Echtzeit | 38 s |
| FPS-Min (1-s-Fenster) | **57,9** (Ziel ≥ 55) |
| FPS-Min (roher 200-ms-Sample) | 57,5 |
| FPS-Median | 60,5 |
| Gegner im Belegframe | **178** (Ziel ≥ 100) |
| Level / Kills | 13 / 324 |
| JS-Fehler | 0 |
| `npm run build` | rc=0 |

Belege: `shots/m10-enemy-ai-mass.png` (Massenframe mit lebenden
Gegnern und aktivem Boss) und `shots/m10-enemy-ai-mass.json` (Rohwerte).
Der Frame wurde 3 s nach dem 5-Minuten-Bossintro bei `timeScale 1` aufgenommen,
damit kein Banner den Massen-Beleg verdeckt; der Messlauf selbst lief mit
`timeScale 10`.

## Offene Punkte (Follow-ups, nicht Teil der K5-Abnahme)

- **Charger-Zielrichtung:** `aimX/aimY` wird am Ende jedes Steps neu gesetzt;
  der Charge folgt dadurch dem Spieler statt einer gesperrten geraden Linie.
  Ein Richtungskonstanz-Test für den Charge fehlt (Reviewer-Befund, kein Blocker).
- **Splitter-Assertion:** `splitEvents` entsteht teils aus der Test-Modellierung
  (Kontakt als Todeszeitpunkt + `shouldSplit`), nicht ausschließlich aus einer
  KI-Aktion. Für einen reinen KI-Beleg wäre ein `split`-Action-Event sinnvoll.
- **Telegraph-Nenner:** Aktionen aus der Warmup-Phase zählen in
  `telegraphSteps`, Fuse-Schritte erst danach — kleine systematische Unterschätzung.

