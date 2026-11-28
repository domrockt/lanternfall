# Lane m10-mobile-fps-cap: Frame-Cap 60 am Gerät (Karte #12247-#12250)

Quelle: Dom-Wunsch 28.11. 12:25Z — Janky-FAIL 13,44 %/13,90 % aus m10-v10-device-acceptance K3.
Gerät (Redmi Pad Pro, Adreno 710, 120-Hz-Panel) rendert ohne Cap 100–120 FPS; gfxinfo zählt
jeden Frame, der die 8,3-ms-Deadline verpasst, als janky, obwohl das Bild flüssig wirkt.
Gleichmäßige 60 FPS wirken ruhiger als schwankende 100–120 und sparen Akku/Thermik.

Methode: `scripts/m10-fps-cap-device.mjs` — 10-min-Fenster in Minute-25-Dichte (6 Evos Lv8,
6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner), segmentiert je 10-s-Fenster;
gfxinfo-Histogramm-Diff je Fenster (p50/p90/p95/p99 als Bucket-Oberkanten, Anteile >8,3 ms
bzw. >16,7 ms), präsentierte FPS = diffFrames/Fenster, Akkutemperatur via device-bridge
(`172.17.0.1:5181`), Renderer-String via WebGL-Probe.

## K1 Vorher — Ist-Zustand, Cap AUTO (gemessen 28.11. 13:30-13:41Z)

Beleg: `~/games/.evidence/m10-mobile-fps-cap/k1-baseline-device.json`
(label `k1-baseline-ist-cap120`, 60 Fenster à 10 s, 0 JS-Fehler, 0 Recoveries).

| Metrik | Wert |
|---|---|
| WebGL-Renderer | **Adreno (TM) 710** (dpr 2, kein SwiftShader) |
| Präsentierte FPS (Median über Fenster) | **100,4** (Min 93,8 / Max 105,4) |
| rAF-Kadenz | 95–118 FPS, schwankend |
| gfxinfo janky (Chrome, kumulativ) | **11,91 %** |
| Frames > 8,3 ms (120-Hz-Deadline) | **16,55 %** (61 878 Frames, 7 370 janky im Diff) |
| Frames > 16,7 ms (60-Hz-Deadline) | **16,54 %** |
| Pacing p50 / p90 / p95 / p99 | 4 / 5 / 5 / 5 ms (Bucket-Oberkanten) |
| Akkutemperatur vor → nach | **33,0 → 35,0 °C (+2 K)**, Thermal Status 0 |
| Ø Gegner je Fenster | ~160 (Ausreißer-Fenster mit 196-233 beim Top-up) |

Befund: Bei 100-105 FPS präsentiert liegt der janky-Anteil (>8,3-ms-Deadline) bei 16,6 % —
die Deadline wird vom schwankenden Frame-Tail (p99 maxBucket 101-109 ms in Dichtefenstern)
regelmäßig verpasst, obwohl p50-p99 im Histogramm bei 4-5 ms liegen. Das Deckt die
Dom-Beobachtung (13,44 %/13,90 % im Akzeptanzlauf): das 120-Hz-Panel straft jede
Pacing-Streuung ab.

Interpretation der Werte: Die ">"-Anteile werden aus Histogramm-Buckets gemessen (1-ms-
Raster, Oberkante), die p-Werte entsprechend gerundet — für Vor/Nach-Vergleiche bei
konstanter Methode ausreichend scharf.

## K2 Fix — Frame-Cap 60 am Geräteknoten + Menü-Option BILDRATE

- Neues reines Modul `src/logic/fps-cap.ts`: `resolveFpsLimit` (AUTO → 60 am Geräteknoten,
  MAX/kein Limit auf Desktop), `fpsSettingLabel`, `stepFpsSetting` (Zyklus AUTO→60→MAX),
  `isDeviceNodeRenderer` (Adreno-710-String + dpr>=2, MISSTRAUEN ohne String),
  `probeDeviceNode` (gelatchte WebGL-Probe, in Node passiv), `applyFpsLimit`
  (Laufzeitwechsel über Phaser-TimeStep `fpsLimit/hasFpsLimit/_limitRate`, delta-Rest
  wird beim Aufheben verworfen).
- `src/main.ts`: Boot-Config `fps.limit = resolveFpsLimit(...) ?? 0` — **nur der
  Geräteknoten capped auf 60**; Desktop/iGPU-Profile (60-Hz-vsync) bleiben verhaltensgleich;
  `onSettingsChanged` setzt den Cap live.
- `src/audio/options.ts`: Option `fps` (-1 AUTO / 60 / 0 MAX), Zeile „BILDRATE" vor ZURÜCK,
  Label zeigt den aufgelösten Wert; Persistenz wie bestehende Settings
  (`src/audio/settings.ts` normalisiert mit).
- Bewusst NICHT angefasst: `src/config.ts`, `src/systems/FxSystem.ts`, `EnemySystem.ts`,
  `GroundRenderer.ts`, `quality.ts`.

Guard: `tests/mobile-fps-cap.test.ts` pinnt Desktop-AUTO→MAX (bitgleich zu vsync),
Geräteknoten-AUTO→60, Clamp, Menü-Zyklus/Label, Persistenz, applyFpsLimit.
Fremde Testdateien minimal angepasst (Zeilenanzahl/Indizes durch die neue Zeile):
`tests/gamepad-nav.test.ts`, `tests/m5-jucie.test.ts`, `tests/meta-persist.test.ts`,
`tests/mobile-config.test.ts` — Bedarfsmeldung in `~/.dispatch/requests.md`.

Desktop-Vorher/Nachher (Titel, 960x540): optisch bitgleich
(`~/games/.evidence/m10-mobile-fps-cap/desktop-{vorher,nachher}.png`,
Kopien in `shots/abnahme/m10-fps-cap-desktop-*.png`).

## K3 Nachher — Gerät (Cap 60 + max-Referenz)

(offen)

## K4 Empfehlung

(offen)
