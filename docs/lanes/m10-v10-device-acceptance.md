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
