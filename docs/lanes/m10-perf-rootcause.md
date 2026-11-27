# M10-perf-rootcause — A/B-Messung der FPS-Regression (nur messen, kein Tuning)

Datum: 2026-11-27. Lane: `m10-perf-rootcause` (Worktree `/home/ai/games/lf-lanes/m10-perf-rootcause`, Branch `m10-perf-rootcause`).
Ausgangslage: fa-01 `blocked`, weil fullrun-`fpsMin` 37,9 / 40,2 (Ziel ≥55) und 640×360-Burst 46,3 FPS
(`docs/qa/final-2026-11-27.md`, `shots/qa-perf-*.json`). Diese Karte misst nur; sie ändert keinen Spielcode,
kein Board, kein GAME.md/ACCEPTANCE.md.

## 1. Baseline reproduzieren

### 1a) perf.mjs, exakt wie fa-01 (640×360, dpr 1)

```
flock /home/ai/games/.lf-perf.lock timeout 180 node scripts/perf.mjs \
  --viewport 640x360 --dpr 1 --out shots/m10-perf-rootcause-baseline.json
```

JSON (`jq -c`): `{"viewport":{"width":640,"height":360},"dpr":1,"view":{"internal":[480,360],"css":[480,360],"dpr":1},"burst":{"fps":60.1,"minEnemies":500,"worstFrameMs":16.8,"measuredFps":60.3},"minute25":{"fps":56.4,"minEnemies":300,"worstFrameMs":33.4,"measuredFps":55.4},"passed":true,"jsErrors":0}`

**Befund:** Der 640×360-Burst-Wert aus fa-01 (46,3) ist auf dem aktuellen HEAD **nicht reproduziert**:
60,1 FPS Burst, 56,4 FPS Minute 25, 0 JS-Fehler. Grund für die Abweichung ist nicht belegt; möglich sind
Last durch parallele Lanes zum fa-01-Zeitpunkt oder inzwischen gemergte Änderungen (HEAD enthält
`m10-heroes-pass`). Das ist kein Fix-Nachweis — die Abnahme misst unter ihren eigenen Bedingungen neu.

### 1b) fullrun.mjs (das Harness mit `fpsMin`, fa-01-Messfenster 29:20, timeScale 30, god)

```
flock /home/ai/games/.lf-perf.lock timeout 300 npm run fullrun -- --tag=-m10rc
```

(Hinweis: `--tag=-m10rc` greift im Skript nicht, weil es `--tag <wert>` erwartet; der Lauf schrieb
`shots/m3-fullrun.json`. Diese Datei wurde nach dem Kopieren nach `shots/m10-perf-rootcause-fullrun.json`
auf den HEAD-Stand zurückgesetzt, um fremde Belege nicht zu überschreiben.)

JSON-Auszug (`shots/m10-perf-rootcause-fullrun.json`, Kopie des Laufs):
`{"simMinutes":30.2,"fpsMin":42.8,"victory":true,"resultReason":"dawn","heap":{"deltaVsMinute1Pct":8.5},"jsErrors":[]}`

**Befund:** `fpsMin` 42,8 (<55) — die **Richtung der Regression ist reproduziert** (Ziel verfehlt),
aber nicht exakt die fa-01-Werte 37,9/40,2. Sieg/Dawn, Heap +8,5 %, 0 JS-Fehler. Der Blocker liegt
damit im Endgame-Fenster (volle Dichte + Endboss), nicht im 500er-Burst.

## 2. A/B-Matrix (je 1 Lauf, 10 s Messfenster, headless, flock, `timeout 120`)

Harness: `scripts/m10-perf-rootcause.mjs` (nutzt `scripts/harness.mjs` und dieselbe rAF-Messung wie
`scripts/perf.mjs`; keine neue Engine). Gemeinsame Last: 500 Gegner (`bog_rat`, werden auf 500 nachgespawnt),
god + autoPlay, timeScale 1, Seed 1. Schalter am Szenenobjekt, kein Spielcode geändert.

Kommandos (Muster; `$T` = Tag, s. Tabelle):

```
flock /home/ai/games/.lf-perf.lock timeout 120 node scripts/m10-perf-rootcause.mjs \
  --tag $T --seconds 10 --viewport <WxH> --dpr <n>
  --enemies 500 --weapons <on|off> [--particles reduced] [--ui off] [--postfx off]
```

| # | Setting | Kommando-Zusatz | FPS avg | FPS min (1-s-Bucket) | worst ms/Frame | Projektile / Partikel / FX | Sprites (sichtbar) | intern | Delta vs (a) |
|---|---|---|---|---|---|---|---|---|---|
| a | 640×360, 500 Gegner, 0 Spieler-Projektile (Waffen aus) | `--viewport 640x360 --dpr 1 --weapons off` | 60,1 | 60,0 | 16,8 | 2 / 4 / 0 | 3077 (1493) | 480×360 | — |
| b | 640×360, 500 Gegner + Projektile (6 Waffen Lv8) | `--viewport 640x360 --dpr 1 --weapons on` | 60,1 | 60,0 | 16,8 | 39 / 133 / 55 | 2975 (1725) | 480×360 | **0,0 %** |
| c | 780 breit (780×360, dpr 3) | `--viewport 780x360 --dpr 3 --weapons on` | 54,5 | 50,0 | 33,4 | 72 / 264 / 130 | 3163 (2158) | 780×360 | **−9,3 %** |
| d | 1080 breit (1080×360, dpr 3; intern 860 = MAX_WIDTH-Klemme) | `--viewport 1080x360 --dpr 3 --weapons on` | 50,7 | 47,2 | 33,5 | 40 / 230 / 79 | 3160 (2037) | 860×360 | **−15,6 %** |
| e | wie (d) + Particle/FX reduziert (`setMaxActive(40)`) | `… --particles reduced` | 50,2 | 47,2 | 33,5 | 39 / 123 / 60 | 3150 (1905) | 860×360 | **−16,5 %** |
| f | wie (d) + UI/PostFX aus (UI-Szene gestoppt, Vignette/Licht/DamageNumbers aus) | `… --ui off --postfx off` | 60,1 | 60,0 | 33,3 | 8 / 275 / 98 | 2624 (1608) | 860×360 | **0,0 %** (gegen d: **+18,5 %**) |

Rohbelege: `shots/m10-perf-rootcause-{a,b,c,d,e,f}.json`, Logs `~/tmp/m10-perf-rootcause/<tag>.log`.
Alle 6 Läufe sind mit Zahl belegt, keiner „nicht gemessen“, alle 0 JS-Fehler.
Draw-Calls sind im Harness nicht verfügbar (Phaser/WebGL liefert sie nicht im Log); als Näherung stehen
Sprite-Zahl und sichtbare Sprites in der Tabelle.

## 3. Attribution

- **Projektile sind nicht die Ursache:** (a)→(b) identische 60,1 FPS trotz 39 statt 2 Projektile.
- **Renderbreite kostet:** (a)→(d) −15,6 % (480→860 intern), (a)→(c) −9,3 % (780 intern).
- **Particle-Reduktion hilft nicht:** (d)→(e) 50,7→50,2 FPS (−0,5 %), praktisch neutral.
- **UI/PostFX ist der größte Einzelposten:** (d)→(f) 50,7→60,1 FPS (+18,5 %) — knapp unter der
  20-%-Schwelle für einen „belegten“ Einzelursachen-Satz.

**Urteil:** Keine einzelne Ursache ≥20 % belegt. Verdacht: **Render-/Fill-Kosten** — konkret
intern breite Canvas-Ausgabe plus UI/PostFX-Overlays im Endgame (Vignette, additives Laternenlicht,
DamageNumbers). Die Simulation und Projektile sind nach dieser Matrix nicht treibend. Die fa-01-Zahlen
selbst sind in Isolation nicht reproduziert (Burst 60,1 statt 46,3); der fullrun-`fpsMin` 42,8 bestätigt
aber weiterhin ein Endgame-Performance-Problem.

## 4. Fix-Empfehlung als Folgekarte (kein Code-Fix in dieser Karte)

1. **Renderauflösung im Endgame begrenzen:** interne logische Breite auf ≤640 klemmen und das Canvas
   ganzzahlig hochskalieren (statt 860 breit zu rendern). Danach fullrun neu messen; Ziel `fpsCap ≥55`.
2. **UI/PostFX-Layer drosseln:** Vignette und additives Laternenlicht bei hoher Gegnerdichte ausblenden
   bzw. Alpha senken, DamageNumbers im Endgame bündeln/abschalten. Erwartung nach Matrix ~+18 %.
3. **Nächster Messschritt, falls (1)/(2) nicht reichen:** WebGL-Draw-Call-Zähler (gl.drawElements-Wrap)
   im bestehenden Harness ergänzen, um Fill-Rate von Draw-Call-/Batching-Kosten zu trennen; zusätzlich
   einen fullrun-Lauf mit `--viewport 960x540 --dpr 1` (fa-01-Setup) als Vorher/Nachher-Referenz.

## 5. Scope

Geändert/neu in dieser Lane: `scripts/m10-perf-rootcause.mjs`, `docs/lanes/m10-perf-rootcause.md`,
`shots/m10-perf-rootcause-*.json`. Kein Spielcode, kein Board, kein GAME.md/ACCEPTANCE.md.
Das vorbestehende `M .opencode/board.json` stammt nicht aus dieser Karte und wurde bewusst nicht angefasst.

**Claim:** Der Disponent hat inzwischen `shots/m10-perf-rootcause-*` dieser Lane zugewiesen
(`/home/ai/games/.dispatch/claims.json`); alle Belege sind im Lane-Commit enthalten. Der frühere
Hinweis auf einen Claim-Konflikt mit `m10-perf-recovery` ist damit erledigt.

## 6. Abnahme (Versuch 2, Kontrolle am 2026-11-27)

- Baseline reproduziert: `shots/m10-perf-rootcause-baseline.json` (perf.mjs, 640×360, dpr 1) und
  `shots/m10-perf-rootcause-fullrun.json` (fullrun) — beide mit Zahl belegt.
- A/B-Matrix: alle **6/6** Läufe (a–f) mit FPS avg/min, worstFrameMs und Sprite-Zahl belegt;
  Tabelle oben deckt sich mit den JSON-Rohbelegen (`jq`-Stichprobe: a 60,1/60,0; d 50,7/47,2;
  f 60,1/60,0). Kein Lauf „nicht gemessen“, alle 0 JS-Fehler.
- Urteil: keine Einzelursache ≥20 % belegt; Verdacht Render-/Fill-Kosten (Renderbreite −15,6 %,
  UI/PostFX +18,5 %), nächster Messschritt in Abschnitt 4.
- Scope: nur `scripts/m10-perf-rootcause.mjs`, dieses Dokument und `shots/m10-perf-rootcause-*.json`.
- **Ergebnis: PASS** (Kriterien des Briefings erfüllt).
