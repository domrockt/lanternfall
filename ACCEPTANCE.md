# Lanternfall — M6-Gesamtabnahme

Stand: 2026-11-26. Alle Messungen headless Chromium auf dem gemergten `main`.
Lange Läufe serialisiert über `flock /home/ai/games/.lf-perf.lock`
(nicht parallel). Commit-Basis: siehe `git log` am Ende.

## Gesamtabnahme 2026-11-27 (unabhängig, main @ `2204ddc`)

Belege, Befehle und Zeitstempel: `docs/qa/final-2026-11-27.md`.
Gemessen auf `main` @ **`2204ddc`** (2026-11-27 06:18:52 UTC), headless Chromium,
lange Läufe unter `flock /home/ai/games/.lf-perf.lock`.

| Punkt | Gemessen | Urteil |
|---|---|---|
| Build | `npm run build` rc=0 (876 ms, 06:27:05Z) | OK |
| Tests | **301/301** in 26 Dateien, 0 fail (06:27:06Z) | OK (+47,5 % gegen 204; neue Lanes) |
| Inhalte | `acceptance-count` **30/6/6/6/6/2** | OK |
| verify:final | **7/7 PASS**, 0 JS-Fehler (06:29:48Z) | OK |
| 30-min-autoPlay (fullrun) | 6/6 Bosse 300–1800 s, 6 Truhen, Sieg `dawn`, 0 JS-Fehler; **FPS-Min 37,9** (Lauf 1) / **40,2** (Lauf 2) | Sieg OK, **FPS FAIL (Ziel 55)** |
| Burst 640×360 (3 Läufe, Min zählt) | **46,3 / 46,6 / 49,3 FPS** (500 Gegner min.) | **FAIL** |
| Burst 780×360@3 (3 Läufe, Min zählt) | **55,9 / 56,1 / 57,8 FPS** | PASS |
| Minute 25 640×360 | 37,8–41,4 FPS | **FAIL** (Ziel >=50) |
| Minute 25 780×360@3 | 43,1–47,3 FPS | **FAIL** (Ziel >=50) |
| Minute 25 960×540 (Referenz) | 50,7 FPS; Burst 60,1 FPS | knapp PASS / PASS |
| Branch-Integrität (fa-00) | m8-display, m9-art-world, m9-art-enemies, m9-perf-heap, m9-art-heroes-bosses, m9-art-fx-ui: alle `--is-ancestor main` rc=0 | OK |

**Abweichungen >= 5 % gegen die M6-Werte oben** (markiert, nicht überschrieben):
Tests +47,5 % (204→301); Burst 640×60,7/59,3 → 46,3 (**−22…−24 %**); fullrun-FPS-Min
55,8 → 37,9/40,2 (**−28…−32 %**); Minute-25 56,4/59,3 → 50,7 (−10…−14 %).

**Ergebnis: nicht abgenommen.** Offener Blocker ist die Endgame-/640×360-Performance
(2/2 fullrun und 3/3 640er Burst unter 55 FPS). Alle übrigen Abnahmepunkte sind grün.

### Versuch 2 — Nachlauf auf `main` @ `217316d` (2026-11-27T08:44:29Z)

| Punkt | Gemessen (Versuch 2) | Urteil |
|---|---|---|
| Build | `npm run build` rc=0, `✓ built in 1.01 s` (08:49Z) | OK |
| Tests | **305/305** in 27 Dateien, 0 fail (08:49:41Z) | OK (+49,5 % gegen 204; Palette-Guard +4) |
| Inhalte | `acceptance-count` **30/6/6/6/6/2** | OK |
| Sicht-Belege | Display 38/38 PASS; 30 Gegner + 6 Bosse + 12 VFX-GIFs @640×360 gesichtet | PASS (Restpunkt Halo-Überstrahlung) |
| Branch-Integrität | m8-display, m9-art-world, m9-art-enemies, m9-perf-heap, m9-art-heroes-bosses, m9-art-fx-ui: alle in main | OK |
| Board-Hygiene | #13/#14/#16/#79/#82 done; keine abgenommene Karte in backlog/blocked | PASS |
| APK/Release | `latest-build` = Build `0c525c8` (08:00:04Z), 44 min / 4 Commits hinter HEAD | dokumentiert |
| FPS | unverändert rot: 640er Burst 46,3 / fullrun-Min 37,9–40,2 / M25-780 43,1 | **FAIL** |

**Ergebnis Versuch 2: nicht abgenommen**, einziger Blocker bleibt die FPS-Latte.

### Versuch 3 — Nachabnahme nach Performance-Fix, laufend (2026-11-27T13:15Z–)

Belege: `docs/qa/reacceptance-2026-11-27.md` (Karten #3418–#3423).
Basis: `main` @ `78cca7e` (2026-11-27 12:28:03Z), headless Chromium, Lange Läufe unter
`flock /home/ai/games/.lf-perf.lock`.

| Punkt | Gemessen | Urteil |
|---|---|---|
| Build | `npm run build` rc=0, 862 ms (13:15Z) | OK |
| Tests | **355/355** in 33 Dateien, 0 fail (13:15Z) | OK |
| Inhalte | `acceptance-count` **30/6/6/6/6/2** | OK |
| verify:final | **7/7 PASS**, 0 JS-Fehler (13:15Z) | OK |
| verify-input (Touch/Gamepad/Tastatur) | **28/28 PASS**, 0 JS-Fehler (13:43Z) | OK |
| Burst 640×360 | min **59,9–60,1 FPS** (6 Läufe) → ≥55 | PASS |
| Minute 25 640×360 | min **50,9–55,4 FPS** → ≥50 | PASS (knapp) |
| Burst 780×360@3 | min **54,7–56,4 FPS** → ≥55 | PASS (grenzwertig) |
| Minute 25 780×360@3 | **41,3–46,4 FPS**, Bestätigungslauf 44,9 → ≥50 | **FAIL** |
| fullrun 30 min (640×360) | 6/6 Bosse + 6 Truhen, Sieg dawn, 0 JS-Fehler; fpsMin **35,7**; Heap +8,7 % | Inhalt PASS, **FPS FAIL**, Heap PASS |
| fullrun 30 min (780×360@3) | 6/6 Bosse + 6 Truhen, Sieg dawn, 0 JS-Fehler; fpsMin **34,8**; Heap +15,2 % | Inhalt PASS, **FPS FAIL**, Heap knapp FAIL |
| 30-min-Echtzeitlauf | abgebrochen (Chromium Target closed nach ~7 min), WIP-Beleg gesichert | **offen/blocked** |

**Zwischenstand Versuch 3: nicht abgenommen.** Der 640×360-Pfad ist durch den Fix grün
geworden (Burst 46,3 → 60,1). Offen bleibt der **780×360-dpr3-Endgame-Pfad** (Minute 25
und fullrun-fpsMin < Ziel) sowie der noch nicht vollständig gelaufene Echtzeit-Test.
Weitere Belege und das Endurteil folgen in `docs/qa/reacceptance-2026-11-27.md`.
Die Fix-Lanes `m10-endgame-fps` (Baseline 3× Burst 60,1; M25 56,7/55,1/53,8),
`m10-separation-crowd`, `m10-ground-cost` sind **noch nicht in main**; nach Merge neu messen.
Historisch benannte Punkte (Stand Versuch 2): Heap +12,2 % (kein Leak, #1008;
nach `796fbaa` erledigt — siehe A5), Art-Restpunkte
(Halo-Überstrahlung, #320–#322), nicht geprüft: echte Geräte. Details/Befehle:
`docs/qa/final-2026-11-27.md`.

## A1 — Drei Merges in main (--no-ff)

| Lane | Merge-Commit | Inhalt |
|---|---|---|
| m6-balance | `a078921` | Balance-Kurven, Boss-Dauern, Charaktere, Harness |
| m6-robust | `bf1560e` | Perf-Pass, Terrain-Worker, Atlas, Robustheit, realtime-run |
| m6-menus | `adefa57` | Titel, Credits, CharSelect, Pause, Results, Optionen, Meta |

Reihenfolge linear im Log. Konflikte in `package.json`, `src/scenes/Run.ts`
und `src/main.ts` wurden mit beiden Absichten aufgelöst (beide Scripts, robuste
Bot-Scratch-Arrays + Balance-Threat, Worker-Skalierung + Skalierungsoption).
Nach jedem Merge: `npm run build` (`tsc`) grün und Tests grün — Lead-Nachmessung:
**126** nach m6-balance, **135** nach m6-robust, **144** nach m6-menus; aktuell **204** (14 Testdateien; Beleg: `npm test`-Lauf 2026-11-26 23:58Z auf `4c04404`; Lane-Nachlauf auf `bb4214a`: 14/14 Dateien, 204/204 grün). Kein Konflikt-Rest (`git status`: dirty=1, ausschließlich `.opencode/board.json` — Live-Sync des Board-Servers, erwartet; `tsc` grün).
`.opencode/board.json` blieb die main-Version; Lane-Karten #56–#72 nachgetragen.

## A2 — GAME.md "Definition of Done"

| DoD-Zeile | Beleg | Status |
|---|---|---|
| Alle Listen vollständig umgesetzt | `node scripts/acceptance-count.mjs` → 30/6/6/6/6/2 (siehe A3) | OK |
| 30-min-Run per autoPlay + setTimeScale(30) ohne Crash/JS-Fehler; alle 6 Bosse, Truhen, ≥1 Evolution | `shots/m3-fullrun.json` (30,1 min, 6 Bosse 300–1800 s, 6 Truhen, Sieg, 0 JS-Fehler); voller Echtzeit-Lauf siehe A4 | OK |
| Performance-Ziel ≥ 55 FPS mit 500 Gegnern + Projektilen | `shots/perf-m3.json` → Burst **59,3 FPS** (Lead-Nachmessung; Team-Finallauf 60,7) | OK |
| Tests grün | `npm test` → **204/204** in 14 Testdateien grün (Beleg: `npm test`-Lauf 2026-11-26 23:58Z auf `4c04404`; Lane-Nachlauf `bb4214a`: 14/14 Dateien, 204/204) | OK |
| Screenshots aller Gegner/Bosse/Waffen geprüft | `shots/m4-enemy-*.png` (30), `shots/m4-boss-*.png` (6), `shots/m5-vfx-*.gif` (12 Waffen-/Evolutions-GIFs, alle 12 Waffen), per Vision geprüft; Kontaktbögen in `shots/` | OK |

## A3 — Inhaltszählung automatisch aus `src/data`

`node scripts/acceptance-count.mjs` lädt die TS-Daten über den Vite-SSR-Loader
und vergleicht mit den Sollwerten:

```json
{ "ok": true,
  "counts": { "enemies": 30, "weapons": 6, "powerups": 6,
              "evolutions": 6, "bosses": 6, "characters": 2 } }
```

## A4 — Realtime-Run 30:00

`flock /home/ai/games/.lf-perf.lock node scripts/realtime-run.mjs` lief
**einmal voll**: timeScale 1, autoPlay, god nur gegen den Tod, **30,4 Sim-Minuten
in 1869 s Echtzeit** (31,2 min inkl. Dawn/Results), nicht abgeschnitten.
- Alle 6 Bosse exakt zu 300/600/900/1200/1500/1800 s (alle `ok`), 6 Truhen,
  9.938 Kills, Level 49, 4 Evolutionen; **Sieg: `victory=true`, `resultReason=dawn`**
  (Morgendämmerung echt ausgelöst, kein Debug-Sprung).
- FPS min **57,2** / Median 60,3 (7181 Samples); **0 JS-Fehler**.
- Heap Minute 1 → 29 (historisch, Lauf vor `796fbaa`): 27,9 → 32,3 MB **+15,8 %**
  (Ziel 15 %, 0,8 pp darüber; nur dieser Gate machte `passed=false`; CDP-Diagnose 11,3 → 16,2 MB).
- Nach `796fbaa`: 2×30 min **+6,8 %/+4,9 %** (≤15 %), Burst 60,1 FPS, 0 JS-Fehler,
  Beleg `shots/m10-heap-tail-after.json` (Burst: `shots/m10-heap-tail-perf.json`).
- Belege: `shots/realtime-30min.json`, `shots/realtime-results.png`,
  Minuten-Shots `shots/realtime-minute-5/10/15/20/25/30.png`.
- GIF-Ausschnitt: `shots/final-trailer.gif` (Morgendämmerungs-Station A6).

## A5 — Messungen auf dem gemergten Stand

| Messung | Wert | Beleg |
|---|---|---|
| perf Burst (500 Gegner) | **60,7 FPS** (Team-Finallauf), Lead-Nachmessung **59,3 FPS** | `shots/perf-m3.json` |
| perf Minute 25 (300 + 6 Evolutionen) | **57,9 FPS** (Team), Lead-Nachmessung **56,4 FPS** | `shots/perf-m3.json` |
| fullrun FPS-Minimum (29:20–Sieg, 1×) | **55,8** (Ziel ≥ 55) in beiden Läufen | `shots/m3-fullrun.json` |
| fullrun Gesamt | 30,1 min, 6 Bosse, 6 Truhen, Sieg, 0 JS-Fehler | `shots/m3-fullrun.json` |
| balance Hauptläufe | A5-Befund „Kael/Seed 101 Level 47“ ist **widerlegt**: 8 Repro-Läufe → Level 28 bei Kael/101 (Ursache: Gem-Sammelquote 28,4 % bei M8-Dichte); nach Fix `7629b2f` (Merge `e4d7fba`) und QA-Merge `4c04404`: **6/6 im Korridor Level 25–40**, kein Tod vor Minute 15; **formale Kriteriumsänderung offen (Frage an Dom 23:35)** | `shots/m10-balance-kael-repro.json`, `shots/m10-balance-kael-xp-budget.json`, `shots/m10-balance-kael-final.json` |
| balance Boss-Dauern | 23–51 s (Ziel 20–60 s) im Nachlauf `6/6`; alter A5-Wert 23–54 s | `shots/m10-balance-kael-final.json`, `shots/balance-main.json` |
| Tests | **204/204** grün in 14 Testdateien (Beleg: `npm test`-Lauf 2026-11-26 23:58Z auf `4c04404`; Lane-Nachlauf `bb4214a`) | `npm test` |

**Heap (kein A5-Kriterium): erledigt durch `796fbaa`/`f176f10`.** Historisch: Team-Finallauf
+22,2 % (25,7 → 31,4 MB), Lead-Nachlauf +18,7 % (25,7 → 30,5 MB), beide über dem 15-%-Ziel;
CDP-Diagnose flach, kein JS-Objekt-Leak (Host-Last/GC-Streuung). Auf dem gemergten Stand:
2×30 min **+6,8 %/+4,9 %** (≤15 %), Burst 60,1 FPS, 0 JS-Fehler, Beleg
`shots/m10-heap-tail-after.json`. Das Gate bleibt grob, weil die Baseline über 3 Läufe
`[10,7, −22, 4,6] %` streute (Spread 1464 %).

## A6 — Abschluss-Material

`shots/final-trailer.gif`: **8 Segmente, 35,6 s, 285 Frames, 480×270, 8 fps**
(Titel+Charakterwahl, frühe Minute, Boss, Truhe, Evolution, Chaos Minute 25,
Endboss, Morgendämmerung). Segmente einzeln mit Timeout gerendert (Segment 7
Endboss brauchte im 2. Versuch 141,6 s; #79 deshalb blocked, Nachzügler #82).
6 Übersichts-Shots `shots/overview-1-intro.png` … `-6-dawn.png`, per Vision geprüft
(Titel, Knochenfürst-Intro, Truhen-Panel, Chaos-Horde, Dawn-Banner).

## A7 — Nachträge VFX / Damage-Numbers / Master-Mute

- **VFX-Lesbarkeit:** `shots/final-vfx-m25-before.png` (fxAlpha 1) /
  `-after.png` (Minimal-LOD: additive Glows NORMAL, Alpha 0,5, Laternenlicht
  0,85·0,5, Damage-Numbers 0,55) und `shots/final-vfx-m25.gif`. Beide Stills
  sind derselbe eingefrorene Frame (time 1405,6 s, kills 3200, 429 Gegner);
  Pixel-Diff AE 206.684; Near-White im AoE-Crop (240×220+360+160, Definition
  r,g,b ≥ 150 und r ≥ 235) **10,15 % → 4,16 % (−59 %)**; unabhängig über das
  ganze Spielfeld **0,92 % → 0,22 % (−75,8 %)**; vfx-check **−55…−66 % →
  PASS (4/5)**. Rohdaten
  `shots/final-vfx-readability.json` (63 fx/202 Partikel im Frame, GIF-Frames
  mit Zeit/Kills/fxAlpha dokumentiert; HUD-KILL rundet auf 3196).
- **Damage-Aggregation ab ~120 Gegnern:** Runtime-Beleg
  `shots/final-verify.json` → 110 Gegner: `damageAggregate=false`;
  129 Gegner: `true`; Unit-Test `shouldAggregateDamage`.
- **Master-Mute:** Option "MASTER MUTE" (`OPTION_ROWS[4]`, Wert STUMM),
  blockt SFX/Musik (`sfxPlayed 7 → 7`, `voices 0`, `musicTrack none`),
  persistiert (`muted=true` nach Reload). Belege
  `shots/final-options-mute.png`, `shots/final-verify.json` (7/7 Checks PASS).

## A8 — Art-Politur

art-director-Nachprüfung: **PASS, Gesamtnote 4/5** (alle drei Kriterien erfüllt).

| Punkt | Beleg | Urteil |
|---|---|---|
| Wasser bei 1× lebendiger/animiert | `shots/final-water-1x-a/b.png`, `-a-zoom.png`, `final-water-1x.gif` | PASS (4/5) |
| Grabspinne mit 8 Beinen | `shots/final-spider-1x.png`, `final-spider-1x-zoom.png` (4× Kamera) | PASS (4/5) |
| Hohler König mit sichtbarem Schwertarm | `shots/final-hollow-king-1x.png`, `final-hollow-king-1x-zoom.png` | PASS (4/5) |

## A9 — Ergebnis-Screen zweispaltig

`shots/final-results-victory.png`: links Charakter-Portrait/Zeit/Kills/Level,
rechts sortierte Schadensbalken mit Icons und vollständigen Waffennamen
(Kettenflegel, Sturmrune, Glutfunke, Frostnova, Dornensalve, Geisterlaterne),
Titel zentriert, Bestwert-Banner, keine Überlappung mit der Trennlinie.
ux-check: PASS (siehe Commit-Notiz #76).

## A10 — Art-Director-Endnote

**A10 Endnote: 4/5 — Ziel ≥4 erreicht (JA).** art-director nach Vision von
Trailer-Storyboard (285 Frames), 6 Overviews und 4 finalen Belegen:
- Palette/Silhouetten **4/5** (einheitliche Nacht-/Gold-Palette; Wasser, Spinne,
  Hollow-König jetzt stimmig; im Chaos verschwimmen einzelne Typen rechts).
- Lesbarkeit im Chaos **4/5** (Spieler/HUD klar, Horde überlagert sich stark).
- Boss-/Truhen-Inszenierung **4/5** (Truhe stark; Boss spawnt am oberen Rand
  hinter seiner HP-Leiste, Banner überdeckt die Mitte — Restpunkt).
- Menü-/HUD-Qualität **4/5** (crisp, konsistent; der doppelte FROSTNOVA-Eintrag
  im Stress-Screenshot kam von einem künstlichen Testschlüssel und ist nach
  Korrektur der Stress-Injektion weg).
Restpunkte: Boss-Spawn-Komposition tiefer/HP-Leiste später, Chaos-Rim-Light für
Elites, Menü ohne Gamepad.

## A11 — Worktrees entfernt

Erledigt: `/home/ai/games/lf-lanes/{balance,robust,menus}` mit
`git worktree remove` entfernt; `git worktree list` zeigt das Hauptrepo,
das fremde `.apkbuild` und die **neue, nicht angetastete Lane
`lf-lanes/input` (Branch `m8-input`)**. Kein `worktree prune` ausgeführt.
Branches `m6-balance`, `m6-robust`, `m6-menus` sowie `m8-input` bleiben erhalten.

## A12 — Build/Tests/Board/GAME.md

`npm run build` grün, `npm test` **204/204 Tests grün in 14 Testdateien** auf dem finalen Stand (`4c04404`; Lane-Nachlauf `bb4214a`).
Board: Lane-Karten #56–#72 done, Nacharbeiten #73–#78/#80–#82 done; #15 wird mit diesem Commit abgeschlossen.
Ausnahme: #79 bleibt `blocked` (Trailer-Segment 7 zweimal 120-s-Timeout);
die Deliverables wurden über #82 erledigt, deshalb ist A6/A12 inhaltlich grün.
Abschluss-Commits: `f76880d` (A10/Result-Fix), `6896f1b` (Board/ACCEPTANCE),
Epic #15: Nachlauf-Audit (acceptance-auditor) mit diesem Commit abgeschlossen;
Korrektur der A5-Zahlen auf die tatsächlichen JSON-Werte. Kein Push. GAME.md auf M6-Stand (Lanes, Messwerte, Balance-Tabelle,
Nachträge, Restmängel).

## Offene Punkte / Restmängel

- Balance: Kael/Seed 101 Level 47 ist **widerlegt** (8 Repro-Läufe: Level 28; Ursache Gem-Sammelquote 28,4 % bei M8-Dichte, `shots/m10-balance-kael-repro.json`/`-xp-budget.json`); Ist nach Fix `7629b2f` (Merge `e4d7fba`) und QA-Merge `4c04404`: **6/6 im Korridor 25–40** (Level 27–30, Boss 20–60 s, kein Tod vor Minute 15, `shots/m10-balance-kael-final.json`); formale Kriteriumsänderung offen (Frage an Dom 23:35).
- Boss-Inszenierung: Knochenfürst spawnt am oberen Rand hinter der HP-Leiste
  (art-director-Restpunkt; keine Abnahme-Blockade).
- Heap: historisch fullrun +18,7 % (25,7 → 30,5 MB) und Realtime +15,8 % über dem
  15-%-Ziel (CDP-Diagnose 12,5 → 13,4 MB, kein JS-Objekt-Leak, Host-Last/GC-Streuung);
  **erledigt** durch `796fbaa`/`f176f10` — gemergter Stand 2×30 min **+6,8 %/+4,9 %**,
  0 JS-Fehler (`shots/m10-heap-tail-after.json`).
- VFX-Minimal-LOD ist bewusst stark gedämpft (Alpha 0,5/NORMAL); Glows flacher.
- Trailer-Segment 7 (Endboss) lief erst im 2. Versuch (141,6 s, Timeout 180 s);
  #79 ist deshalb blocked, die Belege kamen über #82.
- Menüs ohne Gamepad, Meta ohne Gold/Shop.
- `verify:menus`-Skript hatte nach der MASTER-MUTE-Zeile (7 statt 6 Optionszeilen) noch die alte
  SKALIERUNG-Klickposition — Test korrigiert (`de22ecb`), danach 15/15 PASS. Kein Spielbug.
- `verify-weapons`-Check `chest-roll-names` ist timing-flaky (1× FAIL bei hoher Last, Wiederholung
  12/12 PASS); Beleg `shots/m2-chest.gif`.

## Nachtrag — unabhängige QA-Nachabnahme 2026-11-26 (nach M7-Tooling und M8-input)

Belege und Befehle: `docs/qa/2026-11-26.md`. Zwei belegte Zahlenabweichungen
gegenüber den M6-Werten oben (>= 5 %):

- **Tests:** `npm test` → **175** grün statt 147 (**+19,0 %**; Stand `7a522a4`; späterer Stand `4c04404`: 204/204, +38,8 % gegenüber 147). Ursache: die M8-input-Lane
  (#83–#87) hat reine Eingabelogik-Tests ergänzt; keine roten Tests.
- **perf Minute 25:** **59,3 FPS** (gemessen, roh 58,9) statt 56,4 (**+5,1 %**, positiv,
  Host-Streuung). Burst unverändert **59,3 FPS** (roh 59,9). `verify:final` **7/7 PASS**,
  `acceptance-count` **30/6/6/6/6/2**, 0 JS-Fehler.

Der übrige M6-Stand (A1–A12) bleibt unverändert gültig; die Board-Hygiene (#13/#14/#16/#79
auf done) ist in `docs/qa/2026-11-26.md` belegt.

## A13 — APK-/Release-Stand (fa-04)

- GitHub-Release `latest-build`, Asset `lanternfall.apk`: `createdAt` **2026-11-27T08:00:17Z**,
  2.481.018 B, `sha256:f1631169ac60503d53ab9bc3c350edd57ffbbd317519202256ba21f269f95cc9`.
- Lokales Build `~/lanternfall-apk/dist/lanternfall-20261127-0800-0c525c8.apk`, mtime
  **2026-11-27** → 2026-11-27T08:00:04Z, gleiche Größe und identische SHA256; gebaut aus
  Commit **`0c525c8`** (2026-11-27T07:17:36Z).
- main-HEAD beim Prüfen: **`217316d`** → `217316d` (08:44:29Z). APK ist **44 min älter** und
  **4 Commits hinter** HEAD. Erwartet, da der stündliche Timer baut/publiziert; kein eigener
  Build/Publish durch den Prüfer.
- Der im Briefing genannte Pfad `~/lf-apk/out/lanternfall.apk` existiert nicht (veraltet).

## Sicht-Belege 640×360 (fa-02 / #2499)

Neu aufgenommen bei 640×360 (vorher nur 480×270), per Vision geprüft (2–4× nearest,
ganzzahlige Spielpixel, keine abgeschnittenen UI-Teile):

| Beleg | Pfad | Zahl | Urteil |
|---|---|---|---|
| Display 7 Profile | `shots/m8-*.png`, `shots/m8-display.json` | **38/38 PASS**, 0 JS-Fehler | PASS |
| 30 Gegner | `shots/qa-enemy-contact-640.png` (+`@2x`,`@4x`) | 30/30 Typen, 6×5-Raster, Labels lesbar | PASS |
| 6 Bosse | `shots/qa-boss-contact-640.png` (+`@2x`,`@4x`) | 6/6 klar unterscheidbare Silhouetten | PASS |
| 12 Waffen-/Evolutions-GIFs | `shots/qa-vfx-<id>.gif`, `shots/qa-vfx-640.json` | **12/12 OK**, je 28 Frames, 10–30 lebende Gegner, 640×360 | PASS |
| Montage Wirk-Peaks | `shots/qa-vfx-640-contact.png` | 3×4-Raster der zwölf Effekte | PASS |

Restpunkt: Ember-Projektil im Halo teils überstrahlt (bekannter VFX-Restpunkt, kein Blocker).
Erzeuger: `scripts/qa-640-vfx.mjs`, `scripts/qa-640-sheets.py`; Karte #2499, Commit folgt.

Karten-Abschluss #2499: Belege oben sind auf `main` @ `217316d`/`17c9f25` erzeugt und
per Vision geprüft; keine fehlenden Belege. Karte → done.
