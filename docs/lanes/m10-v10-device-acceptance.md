# Lane m10-v10-device-acceptance — v1.0-Gerätetore auf Doms Redmi Pad Pro (nur messen, kein Spielcode-Fix)

Datum: 2026-11-28. Auftrag: die 5 v1.0-Gerätetore aus der Sichtabnahme
(`coding-brain/Lead/Wünsche von Dom.md`, 2026-11-28 10:00Z) auf dem Gerät MESSEN und dokumentieren.
**Keine Änderungen an `src/**` oder `tests/**`.** Belege (außerhalb des Repos):
`~/games/.evidence/m10-v10-device-acceptance/`. Board-Karten: #11308–#11312.

## Gerät + Build

- Gerät: Redmi Pad Pro, Android 16, SoC SM7435 (Adreno 710), serial 10.10.40.27:5555.
  GPU-Renderer (WebGL, aus dem Spiel-Page-Context): **`Adreno (TM) 710`**, Vendor `Qualcomm`
  — kein SwiftShader, Beleg gültig. Physik-Auflösung **2560x1600**, WebView-CSS 1280x800,
  `devicePixelRatio` 2, Spiel logisch 640x360 (Skalierung ganzzahlig).
- APK: `POST http://172.17.0.1:5181/install` (baut den committeten main-HEAD), 11:03Z `Success`.
  main-HEAD zum Messzeitpunkt: **`5664a7fc29a4e6052812f60d9e9c578ef51cdf08`** (2026-11-28 11:00:45Z).
  WebView UA: `… (Linux; Android 16; 2405CRPFDG Build/BP2A.250605.031.A3; wv) … Chrome/157.0.8103.50`.
  versionName/versionCode ist vom Agenten nicht abfragbar (Bridge hat kein shell-Endpoint);
  Build-Zuordnung läuft über die im Spiel eingebettete Build-ID (`__LF_BUILD__` = Commit-Hash + Zeit,
  sichtbar in jedem Telemetrie-Sample, Empfänger `http://10.10.50.185:5180/latest`).
- Thermal-Status bei Laufbeginn: `Thermal Status: 0` (keine Drossel), Akku 36,0 °C
  (`GET /status`, 11:02Z, `~/tmp/m10-v10-device-acceptance/`).

## Mess-Skript (Fix des Gerätepfads, fremde Datei begründet)

`scripts/m10-tablet-fx-rc.mjs --mode device` war vorbereitet, aber nie auf dem Gerät gelaufen
(Offener Punkt der rootcause-Lane). Zwei Befunde erforderten eine Anpassung (minimal, kein
Messverhalten geändert — Fensteraufbau/Instrumentierung unverändert):

1. **App-Relaunch killt connectOverCDP** (bereits belegt in `m10-tablet-fx-device-probe.mjs`,
   Kopfzeile: „EINE CDP-Verbindung, kein App-Relaunch“). Statt `/launch` je Fenster macht der
   Device-Modus jetzt `page.reload()` je Fenster (gleiche URL inkl. `?debug=1`, gleiche Reihenfolge:
   Basis + 6 Evo-Einzelstufen + Stapel in zwei Reihenfolgen).
2. **connectOverCDP sieht keine späteren Targets** → der Device-Modus wartet jetzt auf
   `/json/list`-Sichtbarkeit der Game-Page, BEVOR er verbindet.

Beide Änderungen betreffen nur `runMatrixDevice`/Top-Level-Device-Zweig; `--mode local` ist
unberührt. Begründung für den Disponenten: der Gerätepfad dieser fremden Datei ist Voraussetzung
für K1/K2 dieser Lane und war defekt; Fix ist in der Lane-Doku belegt.

## K1 — 6 Evolutions-Fenster ≥ 60 FPS (Ziel 90) — **PASS**

Beleg: `~/games/.evidence/m10-v10-device-acceptance/rc-device.json` (21 Fenster, je 4 s, 200 wisp,
god, Log `~/tmp/m10-v10-device-acceptance/k1-rc-device.log`). GPU `Adreno (TM) 710`, dpr 2.

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

- **Alle 6 Evo-Einzelstufen ≈ 120 FPS** (120-Hz-Panel = VSync-Cap), Ziel 90 klar erreicht.
- Auch der volle Evo-Stapel bleibt bei 120 FPS — die Blend-/Draw-Explosion aus dem
  Device-Report 09:45Z (42 FPS, blend 26/Frame) ist in main `5664a7fc` weg: blend 3/Frame,
  draws 17/Frame, **0 nicht-null Framebuffer-Wechsel** in allen 21 Fenstern.
- Kein JS-Fehler während des Laufs (`jsErrors` leer im JSON).

Status: K1 gemessen 2026-11-28, Beleg `rc-device.json`. Board #11308.

## K2 — Minute-25-Dichte ≥ 60 FPS — **PASS**

Beleg: `~/games/.evidence/m10-v10-device-acceptance/m25-device.json`
(Skript `scripts/m10-v10-device-m25.mjs` = Phase 2 von `perf.mjs` auf dem Gerät; Log `~/tmp/m10-v10-device-acceptance/`).

- Setup identisch zum Harness-Worst-Case: 6 Evolutionen Lv8, 6 Passives Lv5, `skipTo(1490)`
  → Laufzeit **Minute 25:06**, Level 43, 25 698 Kills; 10-s-Fenster mit Top-up auf 300 Gegner
  (min 300, avg 300 Gegner im Fenster).
- **109,4 FPS** (Gemessen-HUD 110,9 FPS), worst frame 33,4 ms, 0 JS-Fehler → Tor ≥ 60 FPS klar PASS.
- GPU: `Adreno (TM) 710` (aus demselben APK im selben Gerätelauf belegt, `rc-device.json`;
  im K2-JSON ist das Renderer-Feld wegen eines Kontext-Bugs `null` — Skript gefixt, Messung nicht
  wiederholt, da das Gate bereits verbindlich entschieden ist und ein Neurollen eines PASS
  nichts ändert).
- Kein Auflösungs-Teiler aktiv: Canvas intern 640x360, CSS 1280x720, dpr 2, `state().quality = "high"`.

Status: K2 gemessen 2026-11-28. Board #11309.

## K3 — gfxinfo janky < 10 % über das Messfenster — **FAIL (13,4 % / 13,9 %)**

Belege: `~/games/.evidence/m10-v10-device-acceptance/gfxinfo-device.json` und `gfxinfo-device-r2.json`
(Skript `scripts/m10-v10-device-gfxinfo.mjs`: Minute-25-Dichte wie K2, `GET /gfxinfo` der device-bridge
vor/nach dem 10-s-Fenster, Differenz = Fenster-Statistik; Log `~/tmp/m10-v10-device-acceptance/`).

| Lauf | FPS (Fenster) | Frames | Janky | janky % | p50/p90/p95/p99 (ms) | worst (ms) |
|---|---|---|---|---|---|---|
| 1 | 111,8 | 1064 | 143 | **13,44 %** | 12/18/21/31 | 33,4 |
| 2 | 106,4 | 1050 | 146 | **13,90 %** | — | — |

Tor < 10 %: **FAIL**, zwei voneinander unabhängige Messungen bestätigen 13–14 % → verbindlich
ausgewertet (Mess-Budget 2 Iterationen). Kontext:

- Das Fenster ist der Minute-25-Worst-Case (300 Gegner Top-up, 6 Evos Lv8, Qualität „high“).
  Die FPS-Tore K1/K2 sind mit 106–112 FPS weit weg von jedem Einbruch — der FAIL ist ein
  **Frame-Zeit-Schwanzproblem**, kein Durchsatzproblem: ~13 % der Frames liegen über ~16,6 ms
  (p90 18 ms, p95 21 ms, p99 31 ms), der Durchschnitt liegt bei ~9 ms.
- Das 120-Hz-Panel ändert an der Zahl nichts: gfxinfo zählt gegen das Chrome-Frame-Deadline
  (Histogramm-Kante bei ~16–17 ms), nicht gegen 8,33 ms.

### Befundliste (für den Lead — keine Fixes in dieser Lane)

1. **Frame-Zeit-Schwanz (Hebel A — Qualitätsschwellen):** p95 21 ms / p99 31 ms im Minute-25-Fenster
   bei `quality = "high"`. Die Qualitätstiers aus m10-android-scale-floor-r2 schalten nur bei
   echtem Budget-Mangel; am Gerät bleibt es dauerhaft auf „high“ (109–112 FPS), obwohl der
   Janky-Tor nur mit „medium“-Budgets plausibel erreichbar ist. Datei: `src/config.ts`
   (`installRenderBudget`) + `src/systems/FxSystem.ts` (GlowBudget-Caps 226/323/667/754).
   Erwarteter Gewinn: ADD-Fläche/Partikel pro Treffer sinken → p95 Richtung ≤ 16 ms → janky < 10 %.
2. **Spike 33 ms (Hebel B — Allokationen/Uploads im Frame):** worstFrame 33–34 ms ≈ alle ~11 s
   einmal; Muster passt zu GC-/Texturupload-Spikes (Android-Praxis-Regel 5 „keine Allokationen im
   Frame“). Verdacht: Spawn-Top-up im Harness selbst (300 bog_rat in 50-ms-Takt =measurement-Artefakt,
   identisch zu perf.mjs) und Chunk-Generierung während des Laufs (GroundRenderer).
   Datei: `src/systems/EnemySystem.ts` (Spawn-Batching) / `src/gfx/GroundRenderer.ts`.
   Erwarteter Gewinn: p99 31 → < 20 ms; Einfluss auf janky ~1–3 Punkte.
3. **Messmethodik-Hinweis (kein Hebel):** der 50-ms-Top-up erzeugt Spawn-Bursts, die im echten
   Director-Spawn verteilt ankommen. Ein janky-Messfenster ohne Top-up (nur natürliche Director-
   Dichte) wäre der fairere Vergleich zum echten Spiel — für diese Lane nicht mehr gefahren
   (Budget), als Follow-up für den Fix-Job vorgeschlagen.

Status: K3 gemessen 2026-11-28, FAIL dokumentiert. Board #11310.

## K4 — 10-min-Lauf ohne Thermik-Einbruch — **PASS**

Beleg: `~/games/.evidence/m10-v10-device-acceptance/10min-device.json`
(Skript `scripts/m10-v10-device-10min.mjs`, Log `~/tmp/m10-v10-device-acceptance/k4-10min-r3.log`).

- Methode: Minute-25-Worst-Case dauerhaft (300 Gegner Top-up, 6 Evos Lv8, autoPlay, god),
  60 Messfenster je 10 s; Thermik-/Batterie-Poll jede Minute über `GET /status`.
  Weil der Run bei Minute 30 in die Morgendämmerung endet (kein Debug-Schalter), läuft die
  Messung **segmentiert**: alle 24 Fenster Neustart per `page.reload()` + `skipTo(1490)`
  (killt die CDP-Verbindung nicht); FPS-Fenster sind unabhängig, Thermik läuft durch.
  Erkenntnisse aus zwei abgebrochenen Läufen sind im JSON/Log dokumentiert: (a) Run-Ende bei
  Minute 30 lässt ein rAF-Fenster nie terminieren → Szene-Guard + Segmentierung; (b) der
  WebView kann unter Volllast sterben (Renderer/Seite weg) → Session-Recovery mit frischer
  CDP-Verbindung. Im PASS-Lauf: 0 Recoveries, 0 JS-Fehler.
- **FPS-Kurve:** Mittelwert erste 5 min **110,5**, letzte 5 min **108,8** → Abfall **1,5 %**
  (Tor: < 20 %). Minimum 95,2 FPS (einzelnes Fenster mit 75-ms-Spike), Maximum 117,2.
  Laufende Run-Zeit Ende: Minute 26:45 (Segment), Level 66, 291 276 Kills.
- **Thermik:** Thermal Status durchgehend **0** (alle 10 Polls); Akku 34,0 → 35,0 °C (Ende 35,0),
  kein Throttling-Anzeichen; FPS-Kurve flach.
- GPU: `Adreno (TM) 710` (rc-device.json), Gerät dauerhaft am Netzteil? unbekannt — Batterie-
  Temperaturverlauf 33–35 °C spricht für normales Laden/Entladen ohne thermische Drossel.

Status: K4 gemessen 2026-11-28. Board #11311.
