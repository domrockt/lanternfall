# m10-chaos-qa – Endgame-Chaos QA (Minute 25–29)

Lane `m10-chaos-qa`, nur Messung/Dokumentation, kein Spiel-Code geändert.
Belege: Standbilder `shots/m10-chaos-qa-m25/27/29-640.png` und `-780.png`,
Rohdaten `shots/m10-chaos-qa.json`, Kontrastzahlen `shots/m10-chaos-qa-contrast.json`,
Matrix `shots/m10-chaos-qa-readability.md`, Shot-Metadaten `shots/m10-chaos-qa-shots-meta.json`.

## Aufbau des Laufs

- 30-min-Simulation mit `timeScale 30` bis Minute 25 (Sim 1 506 s erreicht), danach 10 s bei realer
  Zeitlupe `timeScale 1`; Seed 99; 6 Evolutions-Waffen (phoenix, wrath_pendulum, eternal_winter,
  thorn_storm, thunder_seal, soul_beacon) und 6 Passives je Stufe 5.
- Messung von FPS/Frame-Zeit unter `flock /home/ai/games/.lf-perf.lock` (Skript in `~/tmp/m10-chaos-qa/qa-run.mjs`).
- Frame-Samples gesamt **3 349** (davon 588 realtime @1×), 0 JS-Fehler.

## Messwerte (aus `shots/m10-chaos-qa.json`)

| Größe | Wert |
|---|---|
| Frame-Samples gesamt | 3 349 (Sim 2 761 + Realtime 588) |
| Realtime FPS min / median / max | 20 / **59,9** / 60,6 |
| Realtime Frame-Zeit median / p95 / worst | 16,7 / 16,8 / **50,1 ms** |
| Gegner min / median / max (Realtime-Fenster) | 352 / **536** / 552 |
| Gegnerschüsse max | **325** |
| JS-Fehler | **0** |

Der einzelne FPS-Min von 20 fällt mit dem worst Frame von 50,1 ms zusammen; Median 59,9 und p95 16,8 ms
zeigen keinen systematischen Einbruch. `sim`-Phase läuft konstruktionsbedingt bei ~40 FPS, weil `timeScale 30`
pro Frame 30 Substeps rechnet — das ist keine Realtime-Aussage.

## Lesbarkeit (6 Standbilder, 640×360 und 780×360 @dpr3)

Detailmatrix mit allen Regionen-Zahlen: `shots/m10-chaos-qa-readability.md`.

| Bild | Gegner | Schüsse | Spieler-Crop Weiß-Anteil | Schuss-Kontrast min (Top-5) | Spieler | Schüsse | HUD | Truhe |
|---|---|---|---|---|---|---|---|---|
| m25-640 | 528 | 63 | 6,6 % | 131 | FAIL | PASS | PASS | PASS |
| m27-640 | 575 | 108 | 2,6 % | 150 | FAIL | PASS | PASS | PASS |
| m29-640 | 583 | 116 | 3,7 % | 139 | FAIL | PASS | PASS | PASS |
| m25-780 | 574 | 56 | 0 % (max 241) | Top-5-min 80 | FAIL | MARGINAL | PASS | PASS |
| m27-780 | 580 | 72 | 0 % (max 241) | Top-5-min 45 | FAIL | MARGINAL | PASS | PASS |
| m29-780 | 575 | 79 | 0 % (max 241) | Top-5-min 97 | FAIL | MARGINAL | PASS | PASS |

## Befunde

| # | Befund | Severity | Repro-Schritte | Vorgeschlagene Datei (CODEMAP) |
|---|---|---|---|---|
| 1 | **Spieler-Silhouette im Endgame nicht lesbar.** Bei 528–583 Gegnern und 6 Evolutions-Waffen Stufe 8 liegt genau auf der Spielerposition ein near-white additiver AoE-Bloom (Phönix/Thorn-Storm/Thunder-Seal/Soul-Beacon). Im 640-View ist der Bloom near-white (909/270/333 Pixel ≥ 250 im 720×540-Fenster, Schwerpunkt 6–8 logische px vom Spielerzentrum), im 780-View gold-orange (max. Luminanz 241, kein Pixel ≥ 250); Span std 35–52, aber kein erkennbarer Umriss. | **S** | `npm run dev`, `?debug=1`; `__lf.skipTo(1500)`; `__lf.god(true)`; 6 Evolutions-Waffen via `__lf.addWeapon(...)`; 10 s bei `timeScale 1` stehen bleiben; Screenshot. Oder `node ~/tmp/m10-chaos-qa/qa-shots.mjs`. | `src/systems/FxSystem.ts` (additive Nähe-Alpha/Peak dämpfen), `src/gfx/depth.ts` (Spieler über eigenen VFX) |
| 2 | **Gegnerschüsse verlieren im 780-View Kontrast.** Kern-Kontrast der hellsten weißen Kerne fällt von 131–181 (640) auf 45–103 (780); im m27-780 liegt ein Kern nur 45 über dem Ring (< 60). Achtung: ausgegeben ist nur die Top-5-Liste, kein echter Min je Projektil — das ist offen. | **M** | Wie #1, Auflösung 780×360 wählen, Minute 27; weiße Kugeln gegen Blühen prüfen. | `src/systems/EnemyProjectiles.ts` (Kern/Ring-Kontrast, ggf. dunkler Ring), `src/systems/FxSystem.ts` |
| 3 | **Boss-Banner überdeckt die Kampfmitte.** Ab Minute 27/29 liegt das „HEXENZIRKEL BESIEGT / EINE TRUHE ERSCHEINT“-Panel zentriert über dem Spieler/AoE (lesbar, aber verdeckt das Geschehen ~2 s). | **L** | Wie #1, Boss in Minute 27 töten, Screenshot im Banner-Fenster. | `src/scenes/UI.ts` (Banner-Position/Dauer) |
| 4 | **Truhe im Bloom nur als goldener Sprite erkennbar**, kein Randpfeil (Pfeil ist nur für Offscreen-Truhen gedacht). Bei 500+ Gegnern konkurriert das Gold mit den gelben AoE-Funken. | **L** | Wie #1, Truhe droppen lassen, Bild m29-640/780 prüfen. | `src/systems/ChestSystem.ts` (Glanz-/Kontur-Verstärkung), `src/systems/FxSystem.ts` |

HUD (HP, LV, Zeit, KILL, Waffen-/Passiv-Leiste) und Boss-HP-Balken waren in allen 6 Bildern lesbar und
ohne Überdeckung; Gegnerschüsse bleiben bei 640 durchweg kontrastreich (≥ 131). Es gab **0 JS-Fehler**.
Gegnerzahlen 528–583 stammen aus dem Screenshot-Lauf (`shots-meta`), der Messlauf im JSON hat
`summary.enemiesMax = 552` — getrennte Läufe, die Shot-Metadaten beschreiben die Bilder.

## Offene Fragen

- FPS-Min 20 bei nur 50,1 ms worst Frame: vermutlich Sampling-Artefakt am Übergang `timeScale 30 → 1`
  (Fensterbildung aus `dt`), nicht bestätigt; im 1×-Fenster ist median 59,9.
- Ob Befund 1 ein reines Alpha-Problem oder auch ein Depth-Problem ist (`src/gfx/depth.ts`),
  ist ohne Code-Änderung nicht entscheidbar — hier nur als Hypothese + zwei Dateien notiert.
- 780-View: Ist der geringere Schuss-Kontrast Folge der Aspect-Skalierung (`scaleX = scale * aspect`
  in `FxSystem`) oder der Projektilsprite-Farbe? Offen, in einer Fix-Karte zu klären.
