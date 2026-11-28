# v1.0-Gerätetore — Abnahme auf dem Redmi Pad Pro (2026-11-28)

Lane: `m10-v10-device-acceptance` (Worktree `/home/ai/games/lf-lanes/m10-v10-device-acceptance`,
Branch `m10-v10-device-acceptance`). Board-Karten #11308–#11312. **Keine Spielcode-Änderungen** —
reine Gerätabnahme/Messung; FAIL-Befunde sind als Hebel-Liste dokumentiert, Fixes schneidet der Lead.

Anlass: Sichtabnahme durch Dom (`coding-brain/Lead/Wünsche von Dom.md`, 2026-11-28 10:00Z, Punkt 2):
„Einziger verbleibender Blocker für v1.0: Android-Tablet-Performance". Methoden-Referenzen:
`docs/lanes/m10-tablet-fx-rootcause.md`, `coding-brain/Wissen/Android-Optimierung-Praxis.md`.

## Gerät und Build

- **Gerät:** Redmi Pad Pro, Android 16, SoC SM7435, GPU **Adreno 710** (WebView-Renderer-String
  `Adreno (TM) 710`, Vendor `Qualcomm` — kein SwiftShader, alle Belege gültig), serial 10.10.40.27:5555,
  Display 2560x1600, WebView-CSS 1280x720, `devicePixelRatio` 2, Spiel logisch 640x360.
- **Build:** APK aus committetem **main-HEAD `5664a7fc29a4e6052812f60d9e9c578ef51cdf08`**
  (2026-11-28 11:00:45Z), installiert via `POST http://172.17.0.1:5181/install` um 11:03Z (`Success`).
  versionName ist vom Agenten nicht abfragbar (Bridge ohne shell-Endpoint); Build-Zuordnung über die
  eingebettete Build-ID `__LF_BUILD__` (Commit-Hash + Zeit, sichtbar in jedem Telemetrie-Sample,
  Empfänger `http://10.10.50.185:5180/latest`). UA: `… Android 16; 2405CRPFDG Build/BP2A.250605.031.A3; wv) … Chrome/157.0.8103.50`.
- **Startzustand:** Thermal Status 0, Akku 36,0 °C (11:02Z).
- Belege (Rohdaten, nicht git-getrackt): `~/games/.evidence/m10-v10-device-acceptance/`.
  Abnahme-Bilder im Repo: `shots/abnahme/m10-v10-device-*.png`.

## Messweg (neu aufgebaut in dieser Lane)

Der Device-Pfad des rootcause-Skripts war vorbereitet, aber nie gelaufen. Zwei belegtefallen:

1. **App-Relaunch killt `connectOverCDP`** (Befund schon in `m10-tablet-fx-device-probe.mjs`).
   → Device-Modus nutzt jetzt **eine** CDP-Verbindung + `page.reload()` je Fenster.
2. **connectOverCDP sieht keine späteren Targets** → erst auf `/json/list`-Sichtbarkeit der
   Game-Page warten, dann verbinden. Zusätzlich Session-Recovery (WebView kann unter Volllast
   sterben — belegt im ersten K4-Versuch, w19).
3. **CDP-`page.screenshot` liefert auf dem WebView identische/leere Frames** (5 identische PNGs,
   md5 gleich) → Screencaps über `POST /screenshot` der Bridge (Geräte-Screencap).

Geänderte/neue Mess-Skripte (Werkzeuge, keine Deliverables): `scripts/m10-tablet-fx-rc.mjs`
(Device-Zweig gefixt, lokal unverändert), `scripts/m10-v10-device-m25.mjs`,
`scripts/m10-v10-device-gfxinfo.mjs`, `scripts/m10-v10-device-10min.mjs`,
`scripts/m10-v10-device-panels.mjs`.

## K1 — 6 Evolutions-Fenster ≥ 60 FPS (Ziel 90) — **PASS**

Beleg: `rc-device.json` (21 Fenster, je 4 s, 200 wisp, god; Log `k1-rc-device.log`).

| Fenster | FPS | draws/Frame | blend/Frame | useProgram | nicht-null FB |
|---|---|---|---|---|---|
| base (nur Glutfunke) | 119,8 | 17 | 3 | 2 | 0 |
| single:thorn_storm | 120,3 | 17 | 2 | 2 | 0 |
| single:phoenix | 120,0 | 17 | 3 | 2 | 0 |
| single:eternal_winter | 120,3 | 18 | 3 | 2 | 0 |
| single:thunder_seal | 119,8 | 17 | 3 | 2 | 0 |
| single:soul_beacon | 120,3 | 18 | 4 | 2 | 0 |
| single:wrath_pendulum | 119,8 | 17 | 2 | 2 | 0 |
| stackA:+6 (alle Evos) | 120,3 | 17 | 3 | 2 | 0 |
| stackB:+6 (reverse) | 119,5 | 17 | 3 | 2 | 0 |

Alle 6 Einzelstufen ≈ 120 FPS (120-Hz-Panel, VSync-Cap) — Ziel 90 klar erreicht. Auch der volle
Evo-Stapel bleibt bei 120 FPS: Die Blend-/Draw-Explosion aus dem Device-Report 09:45Z
(42 FPS, blend 26/Frame) ist in main `5664a7fc` behoben (blend 3, draws 17, **0 nicht-null
Framebuffer-Wechsel** in allen 21 Fenstern). 0 JS-Fehler.

## K2 — Minute-25-Dichte ≥ 60 FPS — **PASS**

Beleg: `m25-device.json` (`m10-v10-device-m25.mjs`, Methode = Phase 2 von `perf.mjs`).

- Setup: 6 Evolutionen Lv8, 6 Passives Lv5, `skipTo(1490)` → Laufzeit **Minute 25:06**,
  Level 43, 25 698 Kills; 10-s-Fenster mit Top-up auf 300 Gegner (min 300, avg 300).
- **109,4 FPS** (HUD 110,9), worst frame 33,4 ms, 0 JS-Fehler → Tor ≥ 60 FPS klar PASS.
- Kein Auflösungs-Teiler: Canvas intern 640x360, CSS 1280x720, dpr 2, quality „high“.
- Notiz: im K2-JSON ist das Renderer-Feld `null` (Kontext-Bug im Metadaten-Block, Skript danach
  gefixt). Renderer für denselben APK-Stand ist in `rc-device.json` belegt; die Messung wurde
  nicht wiederholt (verbindliches PASS, Neurollen ändert nichts).

## K3 — gfxinfo janky < 10 % über das Messfenster — **FAIL (13,44 % / 13,90 %)**

Belege: `gfxinfo-device.json`, `gfxinfo-device-r2.json` (`m10-v10-device-gfxinfo.mjs`;
Minute-25-Dichte wie K2, `GET /gfxinfo` der Bridge vor/nach dem 10-s-Fenster, Differenz).

| Lauf | FPS | Frames | Janky | janky % | p50/p90/p95/p99 (ms) | worst (ms) |
|---|---|---|---|---|---|---|
| 1 | 111,8 | 1064 | 143 | **13,44 %** | 12/18/21/31 | 33,4 |
| 2 | 106,4 | 1050 | 146 | **13,90 %** | — | — |

Tor < 10 %: **FAIL**, 2 voneinander unabhängige Messungen → verbindlich (Mess-Budget 2 Iterationen).
Einordnung: kein Durchsatzproblem (K1/K2 mit 106–112 FPS weit grün), sondern ein
**Frame-Zeit-Schwanz**: ~13 % der Frames liegen über ~16,6 ms, Durchschnitt ~9 ms. gfxinfo zählt
gegen die Chrome-Frame-Deadline (Histogramm-Kante ~16–17 ms), das 120-Hz-Panel ändert daran nichts.

### Befundliste für den Fix-Job (Lead schneidet; keine Fixes in dieser Lane)

1. **Hebel A — Qualitätstier-Schwellen:** p95 21 ms / p99 31 ms im Minute-25-Fenster bei
   `quality = "high"`. Der Regler (m10-android-scale-floor-r2) schaltet nur bei echtem
   Budget-Mangel; am Gerät bleibt es dauerhaft „high“ (109–112 FPS), obwohl der janky-Tor nur mit
   „medium“-Budgets plausibel erreichbar ist. Dateien: `src/config.ts` (`installRenderBudget`),
   `src/systems/FxSystem.ts` (GlowBudget-Caps bei 226/323/667/754), `src/logic/quality.ts`.
   Erwarteter Gewinn: ADD-Fläche/Partikel sinken → p95 Richtung ≤ 16 ms → janky < 10 %.
2. **Hebel B — Allokationen/Uploads im Frame:** worstFrame 33–34 ms wiederkehrend (≈ alle ~11 s),
   Muster passt zu GC-/Textur-Upload-Spikes (Android-Praxis-Regel 5). Verdacht: Spawn-Top-up des
   Harness (300 bog_rat im 50-ms-Takt, identisch zu perf.mjs — teils Messartefakt) und
   Chunk-Generierung im Lauf (GroundRenderer). Dateien: `src/systems/EnemySystem.ts` (Spawn-
   Batching), `src/gfx/GroundRenderer.ts`. Erwarteter Gewinn: p99 31 → < 20 ms; janky −1 bis −3 Punkte.
3. **Methodik-Follow-up (kein Hebel):** janky-Messfenster ohne Spawn-Top-up (nur natürliche
   Director-Dichte) wäre der fairere Vergleich zum echten Spiel; in dieser Lane nicht mehr gefahren
   (Mess-Budget), für den Fix-Job als Vorher/Nachher-Methode vorgeschlagen.

## K4 — 10-min-Lauf ohne Thermik-Einbruch — **PASS**

Beleg: `10min-device.json` (`m10-v10-device-10min.mjs`, Log `k4-10min-r3.log`).

- Methode: Minute-25-Worst-Case dauerhaft (300 Gegner Top-up, 6 Evos Lv8, autoPlay, god),
  60 Messfenster je 10 s; Thermik-/Batterie-Poll jede Minute (`GET /status`).
  Der Run endet bei Minute 30 in der Morgendämmerung (kein Debug-Schalter) → Messung **segmentiert**:
  alle 24 Fenster Neustart per `page.reload()` + `skipTo(1490)` (killt die CDP-Verbindung nicht);
  FPS-Fenster sind unabhängig, Thermik läuft durch. Zwei abgebrochene Vorläufe sind im Log
  dokumentiert (Run-Ende ließ ein rAF-Fenster nie terminieren → Szene-Guard; WebView-Tod unter
  Volllast → Session-Recovery). Im PASS-Lauf: **0 Recoveries, 0 JS-Fehler**.
- **FPS-Kurve:** erste 5 min Ø **110,5**, letzte 5 min Ø **108,8** → Abfall **1,5 %** (Tor < 20 %).
  Minimum 95,2 FPS (Fenster mit 75-ms-Spike), Maximum 117,2. Level 66, 291 276 Kills am Ende.
- **Thermik:** Thermal Status durchgehend **0** (10/10 Polls); Akku 34,0 → 35,0 °C; kein
  Drossel-Anzeichen, FPS-Kurve flach.

## K5 — Text in allen Panels lesbar, RENDER_SCALE == 1 — **PASS**

Belege: `panels/` (5 Gerät-Screencaps 2560x1600 + `panels.json`, `m10-v10-device-panels.mjs`);
Repo: `shots/abnahme/m10-v10-device-{title,charselect,levelup,chest,results}.png`.

- Sichtprüfung (je 2x nearest vergrößert): **Titel** (Logo, Bestwerte, Menü), **Charakterwahl**
  (Mira/Kael, alle Werte), **Level-Up** (3 Karten, Text scharf), **Truhe** („TRUHE GEÖFFNET —
  SANDUHR STUFE 1"), **Ergebnis** („MORGENDÄMMERUNG", Statistik, Buttons) — alles gestochen
  scharf, keine Streifen-/Zerfall-Artefakte. 0 JS-Fehler.
- **Kein Auflösungs-Teiler:** Canvas-Backing-Store **640x360** = volle logische Auflösung
  (`RENDER_SCALE == 1`; ein aktiver Teiler würde 320x180/213x120 zeigen), CSS 1280x720, dpr 2,
  quality „high“ während aller Messungen. Scale-Floor aus m10-android-scale-floor-r2 greift.
- Abweichung vom Briefing-Pfad: Abnahme-Bilder liegen in `shots/abnahme/` statt `shots/m10-v10-device-*`,
  weil `shots/*` in .gitignore ignoriert ist (stiller Drop); `shots/abnahme/` ist die laut
  Lane-Regeln getrackte Destination.

## Ergebnis

| Tor | Urteil |
|---|---|
| K1 6 Evo-Fenster ≥ 60 FPS (Ziel 90) | **PASS** (alle ~120 FPS) |
| K2 Minute-25 ≥ 60 FPS | **PASS** (109,4 FPS) |
| K3 gfxinfo janky < 10 % | **FAIL** (13,44 % / 13,90 %) |
| K4 10-min ohne Thermik-Einbruch | **PASS** (−1,5 %, Thermal 0) |
| K5 Panels lesbar, RENDER_SCALE == 1 | **PASS** |

**4/5 Tore grün; K3 ist der letzte Blocker für die v1.0-Gerätemessung** — mit klarem Befund
(Frame-Zeit-Schwanz p95 21 ms / p99 31 ms bei quality „high“) und zwei dokumentierten Hebeln.
Der Endabnahme-Lauf und die v1.0-Markierung (Tag/README/Release) bleiben wie von Dom vorgegeben
bei Ops/nach Lead-Dom-OK — nicht Teil dieser Lane.

## Offene Punkte (ehrlich)

1. K3 FAIL: Fix-Job nötig (Hebel A/B oben). Bis dahin bleibt der Android-Blocker formal bestehen,
   auch wenn die FPS-Tore K1/K2 mit riesigem Puffer grün sind.
2. versionName/versionCode des APK sind im Beleg nur indirekt belegt (main-Commit + Build-ID über
   Telemetrie); die Bridge könnte ein `versionName`-Feld in `/install`-Antwort und `/status`
   ergänzen (Bedarf eingetragen, keine eigene Karte).
3. janky-Methodik ohne Spawn-Top-up als fairer Vergleichswert für den Fix-Job (siehe K3, Punkt 3).
4. K2-Renderer-Feld `null` im JSON (Skript-Bug gefixt, Messung verbindlich ausgewertet statt wiederholt).
