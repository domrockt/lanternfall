# Lane m10-vfx-evo — Belege Evolutionen + Ereignis-Effekte

Basis-SHA beim Start: **f26dc4b** (main-HEAD, Merge der Lane m8-display lief noch).
Alle Zahlen hier beziehen sich auf diesen Basis-SHA. Branch: `m10-vfx-evo`, Worktree
`/home/ai/games/lf-lanes/m10-vfx-evo`.

> Hinweis: Der Team-Supervisor hat vor diesem Lane-Commit einen Snapshot `1238df1`
> angelegt („Supervisor-Snapshot WIP“). Dieser Snapshot enthält neben den ersten
> Belegen auch `.opencode/board.json` (Datei des Merge-Jobs). Das ist **nicht** von
> dieser Lane erzeugt und ohne History-Rewrite nicht rücknehmbar; weitere Board-
> Änderungen wurden hier nicht gemacht.

## Karten-Checkliste

| # | Karte | Status | Beleg |
|---|---|---|---|
| 1 | Aufnahme-Setup + Trigger-Tabelle | erledigt | diese Datei, Abschnitt Trigger |
| 2 | 6 Evolutions-GIFs + 6 Stills | erledigt | `shots/m10-vfx-evo-<waffe>.gif/.png` |
| 3 | 6 Ereignis-GIFs + Readability-Messung | erledigt | `shots/m10-vfx-evo-event-*.gif/.png`, `shots/m10-vfx-evo-readability.json` |
| 4 | Report + Empfehlungen | erledigt | diese Datei, Abschnitt Auswertung |

Kein Skript unter `scripts/` oder `src/` wurde geändert (nur gelesen/aufgerufen).
Aufnahme-Helfer liegt außerhalb des Repos: `/home/ai/tmp/m10-vfx-evo/capture-fxevo.mjs`.

## Trigger-Tabelle (12 Effekte)

Aufnahme: `?debug=1&seed=21/23`, `god(true)`, `autoPlay(true)`, `setSuppressLevelUps(true)`,
vor jedem Effekt 340 Gegner im Ring (`spawnEnemy`), bei Frame-Aufnahme auf ≥300 nachgefüllt.
Je Effekt ein frischer Run (page reload), 16 Frames à 70 ms → GIF mit 12 fps (1 Sekunde Wirkung),
Still = Frame mit dem höchsten Near-White-Anteil (= sichtbarster Moment). Dawn: 10 Frames à 60 ms
(der Run endet ~1,2 s nach Dawn im Ergebnis-Screen).

| Effekt | Trigger-Pfad | Besonderheit |
|---|---|---|
| Phönixschwarm (`phoenix`) | `__lf.addWeapon("phoenix", 8)` | Feuervögel + Explosionen; 900 ms Anlauf |
| Zornpendel (`wrath_pendulum`) | `__lf.addWeapon("wrath_pendulum", 8)` | 360°-Schwung, großer heller Bogen |
| Ewiger Winter (`eternal_winter`) | `__lf.addWeapon("eternal_winter", 8)` | Frost-Aura + Eisspitzen |
| Dornensturm (`thorn_storm`) | `__lf.addWeapon("thorn_storm", 8)` | Dornen-Wirbel in alle Richtungen |
| Gewittersiegel (`thunder_seal`) | `__lf.addWeapon("thunder_seal", 8)` | Blitz-Siegel + Kettenblitz |
| Seelenleuchtfeuer (`soul_beacon`) | `__lf.addWeapon("soul_beacon", 8)` | kreisende Seelen-Ringe |
| Truhe | `__lf.event("chest")` | Welt-Effekt (Strahl/Münzen), Panel nach 900 ms |
| Level-up | `__lf.event("levelup")` | Lichtsäule + aufsteigende Glut |
| Boss-Spawn | `__lf.event("bossIntro")` | Kamera-Puls + Boss-Banner/HP-Leiste |
| Tod (Boss-Tod) | `__lf.event("bossDeath")` | Kern → Ringe → Splitter + Banner „Boss besiegt“ |
| Dawn | `__lf.event("dawn")` | Amber-Bänder über Himmel, gestaffelter Gegner-Zerfall |
| Elite | `run.spawner.spawnEnemy(id, 4, run.posX, run.posY, true)` | Elite-Aura-Ringe um Gegner (kein Debug-Event vorhanden) |

Alle 12 Trigger liefen in zwei vollständigen Durchläufen ohne neuen Trigger-Bedarf;
**keine Karte blocked**. 0 JS-Fehler in beiden Läufen (`errors: []`).

## Messung Near-White

Definition (wie A7, kalibriert gegen `shots/final-vfx-m25-after.png`):
Crop **240x220 bei +360+160** im 960x540-Screenshot, Near-White = Pixel mit
`min(R,G,B) >= 200` (Palette: boneLight/candleWhite/lanternWhite und additive Glows).
Gegenprobe: `final-vfx-m25-after.png` = 3,73 % (≤ Ziel), `final-vfx-m25-before.png` = 6,52 % (> Ziel).
Ziel: **≤ 4,16 %**.

Bewertung: **Peak** = hellster Einzelframe während der Wirkung (streng, Worst Case),
**Mean** = Mittel über alle GIF-Frames.

| Effekt | Peak % | Mean % | Gegner (min–max) | GIF-Frames | Peak-Urteil |
|---|---|---|---|---|---|
| phoenix | 6,22 | 3,17 | 333–342 | 16 | FAIL |
| wrath_pendulum | 4,59 | 2,88 | 288–342 | 16 | FAIL |
| eternal_winter | 2,40 | 1,46 | 339–342 | 16 | PASS |
| thorn_storm | 5,31 | 4,05 | 308–341 | 16 | FAIL |
| thunder_seal | 4,94 | 2,42 | 340–341 | 16 | FAIL |
| soul_beacon | 4,66 | 3,22 | 337–341 | 16 | FAIL |
| event-chest | 5,71 | 1,81 | 340–342 | 16 | FAIL |
| event-levelup | 5,44 | 2,35 | 340–342 | 16 | FAIL |
| event-bossIntro | 5,40 | 1,98 | 341–342 | 16 | FAIL |
| event-bossDeath | 5,76 | 2,63 | 340–342 | 16 | FAIL |
| event-dawn | 5,61 | 2,15 | 321–351 | 10 | FAIL |
| event-elite | 6,08 | 4,18 | 348–352 | 16 | FAIL |

Gesamt: **1 von 12** hält das Peak-Ziel (eternal_winter); **11 von 12** halten den
Mean unter 4,16 % (einzige Ausnahme: event-elite mit 4,18 %).
Peak-Ausreißer sind fast immer ein einzelner Weiß-Frame (Explosion/Flash/Blitz).

## Auswertung

Sichtbarkeit bei 300+ Gegnern (subjektiv, Stills + GIFs angesehen):
- Gut lesbar: `eternal_winter` (weißer Frost-Ring hebt sich vom Moor ab), `thorn_storm`
  (Dornen-Wirbel klar), `event-levelup`/`event-chest` (Lichtsäule unmissverständlich),
  `event-bossIntro`/`event-bossDeath` (Banner + HP-Leiste), `event-elite` (weiße Aura-Ringe).
- Grenzwertig: `phoenix` — die Feuervögel gehen im Rot der Gegnerhorde unter; nur der
  zentrale Explosionsblitz ist eindeutig. `wrath_pendulum` — heller Bogen gut, aber
  Silhouette des Pendels kaum vom Glow zu trennen. `thunder_seal` — Blitze hell, aber
  sehr kurz (oft nur 1 Frame im GIF). `soul_beacon` — goldene Ringe schön, aber farblich
  nah an Münzen/Glut der Horde. `event-dawn` — Amber-Overlay ist stimmig, aber nur
  graduell; der Kontrast zum Nachtbild ist gering.

Die 3 schlechtesten Effekte (Peak-Near-White):
1. **phoenix — 6,22 %** (Ziel 4,16 %, +2,06 pp): zentraler Explosionsblitz brennt aus.
2. **event-elite — 6,08 %** (+1,92 pp): Aura-Ringe über 8 Gegnern überlagern sich additiv.
3. **event-bossDeath — 5,76 %** (+1,60 pp): Kamera-Flash + Kern + 3 Schock-Ringe gleichzeitig.

## Empfehlungen für die nächste FX-Lane

| Effekt | Alpha / Glow / Partikel |
|---|---|
| phoenix | Explosions-Alpha 1,0 → 0,85; Glow-Frame nur 1 Frame statt 3; Partikelzahl 20 → 14 |
| wrath_pendulum | Bogen-Alpha 0,95 → 0,8, Tint auf `amber` statt `lanternWhite`; Glow-Ring entfernen |
| eternal_winter | halten (PASS), nur Eisspitzen-Partikel 8 → 10 für Lesbarkeit |
| thorn_storm | Alpha 1,0 → 0,9; Partikel 26 → 18; Dornen-Tint `marshLight` statt Weiß |
| thunder_seal | Blitz-Lebensdauer 1 Frame → 2–3 Frames (80–120 ms), Alpha 1,0 → 0,9 |
| soul_beacon | Ring-Tint `lantern` statt `lanternWhite`; Alpha 0,9 → 0,8 |
| event-chest | Strahl-Alpha 0,85 → 0,75, Münzen 14 → 10 |
| event-levelup | Alpha 0,95 → 0,85; Säule schmaler (scaleX 1,4 → 1,2) |
| event-bossIntro | halten; Kern-Alpha 1,0 → 0,9 |
| event-bossDeath | Kamera-Flash 90 ms → 60 ms; Schock-Ringe 3 → 2; Kern-Alpha 1,0 → 0,85 |
| event-dawn | Amber-Band-Alpha 0,18 → 0,24 für mehr Kontrast; keine Weiß-Reduktion nötig |
| event-elite | Aura-Alpha 0,42 → 0,30; Ring-Scale 0,9 → 0,8 |

Ziel der nächsten Lane: alle 12 Effekte ≤ 4,16 % Peak-Near-White, ohne Sichtbarkeit
bei 300+ Gegnern zu verlieren (Stills/GIFs erneut belegen).

## Belege (committet)

- 6 × `shots/m10-vfx-evo-<waffe>.gif` + `.png` (phoenix, wrath_pendulum, eternal_winter,
  thorn_storm, thunder_seal, soul_beacon)
- 6 × `shots/m10-vfx-evo-event-<name>.gif` + `.png` (chest, levelup, bossIntro, bossDeath, dawn, elite)
- `shots/m10-vfx-evo-readability.json` (Peak/Mean/Min/Max je Effekt, Frame-Tabelle, 0 JS-Fehler)

Hinweis: `.gitignore` ignoriert `shots/*.gif`; die 12 GIFs wurden mit `git add -f`
in den Karten-Commit gezwungen (keine Änderung an `.gitignore`).

## Abnahme

- 12/12 Effekte mit Trigger-Pfad, GIF (480x270) und Still belegt; Frame-Zahlen:
  16 Frames für 11 Effekte, 10 Frames für `event-dawn` (Run endet ~1,2 s nach Dawn).
- Zwei vollständige Capture-Läufe, **0 JS-Fehler** (`errors: []` in
  `shots/m10-vfx-evo-readability.json`).
- Sichtprüfung: Kontaktbögen `~/tmp/m10-vfx-evo/view/evos2.png` und `events2.png`
  sowie Frame-Strips `phoenix`, `event-dawn`, `event-elite` angesehen; Effekte sind
  während der Wirkung mit lebenden Gegnern sichtbar (kein Post-Kampf-Bild).
- Near-White-Peak-Ziel 4,16 %: 1/12 PASS (eternal_winter), 11/12 FAIL (Peak);
  Mean-Ziel: 11/12 PASS, nur event-elite 4,18 % knapp darüber.
- Kein Skript unter `scripts/`/`src/` geändert; Board nicht angefasst
  (Supervisor-Snapshot s. o.).

