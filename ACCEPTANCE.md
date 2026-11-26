# Lanternfall — M6-Gesamtabnahme

Stand: 2026-11-26. Alle Messungen headless Chromium auf dem gemergten `main`.
Lange Läufe serialisiert über `flock /home/ai/games/.lf-perf.lock`
(nicht parallel). Commit-Basis: siehe `git log` am Ende.

## A1 — Drei Merges in main (--no-ff)

| Lane | Merge-Commit | Inhalt |
|---|---|---|
| m6-balance | `a078921` | Balance-Kurven, Boss-Dauern, Charaktere, Harness |
| m6-robust | `bf1560e` | Perf-Pass, Terrain-Worker, Atlas, Robustheit, realtime-run |
| m6-menus | `adefa57` | Titel, Credits, CharSelect, Pause, Results, Optionen, Meta |

Reihenfolge linear im Log. Konflikte in `package.json`, `src/scenes/Run.ts`
und `src/main.ts` wurden mit beiden Absichten aufgelöst (beide Scripts, robuste
Bot-Scratch-Arrays + Balance-Threat, Worker-Skalierung + Skalierungsoption).
Nach jedem Merge: `npm run build` grün und Tests grün (135 nach balance+robust,
144 nach menus; aktuell 147). Kein Konflikt-Rest (`git status` sauber, `tsc` grün).
`.opencode/board.json` blieb die main-Version; Lane-Karten #56–#72 nachgetragen.

## A2 — GAME.md "Definition of Done"

| DoD-Zeile | Beleg | Status |
|---|---|---|
| Alle Listen vollständig umgesetzt | `node scripts/acceptance-count.mjs` → 30/6/6/6/6/2 (siehe A3) | OK |
| 30-min-Run per autoPlay + setTimeScale(30) ohne Crash/JS-Fehler; alle 6 Bosse, Truhen, ≥1 Evolution | `shots/m3-fullrun.json` (30,1 min, 6 Bosse 300–1800 s, 6 Truhen, Sieg, 0 JS-Fehler); voller Echtzeit-Lauf siehe A4 | OK |
| Performance-Ziel ≥ 55 FPS mit 500 Gegnern + Projektilen | `shots/perf-m3.json` → Burst 60,1 FPS | OK |
| Tests grün | `npm test` → 147 Tests grün | OK |
| Screenshots aller Gegner/Bosse/Waffen geprüft | `shots/m4-enemy-*.png` (30), `shots/m4-boss-*.png` (6), `shots/m5-vfx-*.gif` (18 Waffen/Events), per Vision geprüft; Kontaktbögen in `shots/` | OK |

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
- Heap Minute 1 → 29: 27,9 → 32,3 MB **+15,8 %** (Ziel 15 %, 0,8 pp darüber;
  nur dieser Gate macht `passed=false`; CDP-Diagnose 11,3 → 16,2 MB).
- Belege: `shots/realtime-30min.json`, `shots/realtime-results.png`,
  Minuten-Shots `shots/realtime-minute-5/10/15/20/25/30.png`.
- GIF-Ausschnitt: `shots/final-trailer.gif` (Morgendämmerungs-Station A6).

## A5 — Messungen auf dem gemergten Stand

| Messung | Wert | Beleg |
|---|---|---|
| perf Burst (500 Gegner) | **60,1 FPS**, worst 16,8 ms | `shots/perf-m3.json` |
| perf Minute 25 (300 + 6 Evolutionen) | **57,5 FPS**, worst 33,4 ms | `shots/perf-m3.json` |
| fullrun FPS-Minimum (29:20–Sieg, 1×) | **55,8** (Ziel ≥ 55) | `shots/m3-fullrun.json` |
| fullrun Gesamt | 30,1 min, 6 Bosse, 6 Truhen, Sieg, 0 JS-Fehler | `shots/m3-fullrun.json` |
| balance Hauptläufe | 6 Läufe, 5/6 im Korridor; Kael/101 Level 47 (Restmangel) | `shots/balance-main.json` |
| balance Boss-Dauern | 23–54 s (Ziel 20–60 s) | `shots/balance-main.json` |
| Tests | 147 grün | `npm test` |

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
  Pixel-Diff AE 206.684; Near-White im AoE-Crop **10,15 % → 4,16 % (−59 %)**,
  vfx-check unabhängig **−55…−66 % → PASS (4/5)**. Rohdaten
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
`git worktree remove` entfernt; `git worktree list` zeigt nur noch das
Hauptrepo (plus fremdes `.apkbuild`). Branches `m6-balance`, `m6-robust`,
`m6-menus` bleiben erhalten.

## A12 — Build/Tests/Board/GAME.md

`npm run build` grün, `npm test` **147 Tests grün** auf dem finalen Stand.
Board: Lane-Karten #56–#72 done, Nacharbeiten #73–#77/#81/#82 review,
#79 blocked (Trailer-Segment-Timeout, durch #82 ersetzt), #80 folgt mit dem
Abschluss-Commit. GAME.md auf M6-Stand (Lanes, Messwerte, Balance-Tabelle,
Nachträge, Restmängel).

## Offene Punkte / Restmängel

- Balance: Kael/Seed 101 erreicht Level 47 (Ziel 25–40); AutoPlay streut.
- Boss-Inszenierung: Knochenfürst spawnt am oberen Rand hinter der HP-Leiste
  (art-director-Restpunkt; keine Abnahme-Blockade).
- fullrun-Heap in diesem Lauf +22,2 % (25,7 → 31,4 MB) über dem 15-%-Ziel;
  CDP-Diagnose 12,5 → 13,4 MB, kein JS-Objekt-Leak, Host-Last/GC-Streuung.
- VFX-Minimal-LOD ist bewusst stark gedämpft (Alpha 0,5/NORMAL); Glows flacher.
- Realtime-Heap +15,8 % und fullrun-Heap +22,2 % über dem 15-%-Ziel
  (nur Heap-Gate; Spiel, FPS und JS-Fehler sind grün).
- Trailer-Segment 7 (Endboss) lief erst im 2. Versuch (141,6 s, Timeout 180 s);
  #79 ist deshalb blocked, die Belege kamen über #82.
- Menüs ohne Gamepad, Meta ohne Gold/Shop.
