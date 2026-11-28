# Lane m10-mobile-fps-cap — Frame-Cap 60 auf Mobile + Menü-Option „BILDRATE“

Quelle: Dom-Wunsch 28.11. 12:25Z zum Janky-FAIL 13,44 %/13,90 % aus m10-v10-device-acceptance K3.
Das Gerät (Redmi Pad Pro, 120-Hz-Panel, Adreno 710) lief bislang ohne Cap; gleichmäßige 60 FPS
sollen ruhiger wirken als schwankende 100–120 und Akku/Thermik schonen. Diese Lane implementiert
den Hebel UND misst Vorher/Nachher selbst.

**Dateien (Disponent):** src/main.ts, src/scenes/UI.ts, tests/mobile-fps-cap.test.ts,
scripts/m10-fps-cap-device.mjs, docs/lanes/m10-mobile-fps-cap.md, shots/m10-fps-cap-*.
Neu angelegt (reine Logik, keine fremden Claims): src/logic/fps-cap.ts.
Fremd-Dateien minimal angefasst (Bedarfsmeldung in .dispatch/requests.md, 13:5xZ):
src/audio/options.ts, src/audio/settings.ts, tests/m6-menus.test.ts, tests/gamepad-nav.test.ts,
tests/mobile-config.test.ts, tests/m5-jucie.test.ts, tests/meta-persist.test.ts.
**Nicht angerastet wie befohlen:** src/config.ts, src/systems/FxSystem.ts, EnemySystem.ts,
GroundRenderer.ts, quality.ts. Mobile-Erkennung liegt deshalb in src/logic/fps-cap.ts (analog
device-janky-node, zeilengleicher isDeviceNodeRenderer) statt in config.ts — beim Merge mit
m10-device-janky-node kann deren probeDeviceNode delegieren.

---

## K1 — Vorher-Messung am Gerät (Ist-Cap 120) — gemessen 28.11. ~13:31–13:44Z

Skript: `scripts/m10-fps-cap-device.mjs` (Minute-25-Dichte wie m10-v10-device-m25.mjs:
6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up 300 Gegner im 50-ms-Takt, Segmentierung alle
24 Fenster; gfxinfo-Diff je 10-s-Fenster; Akku-/Thermik-Poll je Minute über GET /status).

**Beleg (verbindlicher Lauf):** `~/games/.evidence/m10-mobile-fps-cap/k1-baseline-device.json`
(Log `~/tmp/m10-mobile-fps-cap-k1.log`). 60/60 Fenster, 0 Recoveries, 0 JS-Fehler.

| Metrik | Wert |
|---|---|
| WebGL-Renderer | **Adreno (TM) 710** (kein SwiftShader), DPR 2 |
| Präsentierte FPS (totalFrames-Diff / 10 s) | Median **100,4** (min 93,8 / max 105,4) |
| Chrome-Janky (Counter-Diff / Frames-Diff) | **11,91 %** (7370/61878) |
| Frame-Pacing | siehe Caveat unten |
| Akkutemperatur | **33,0 → 35,0 °C** (+2,0 K in 10 min), Thermal Status 0 |
| rAF-Kadenz am Titel (Vorprobe) | Median 8,3 ms = 120 Hz, P95 8,4 ms |

Damit belegt: **Ist-Cap 120** (kein 60-Cap wirksam), Chrome zählt 11,9 % janky gegen sein
Frame-Deadline — die Ausgangslage des Dom-Wunsches (13,44 %/13,90 % in der Abnahme) reproduziert.

**Caveat Pacing-Perzentilen:** In Lauf 1 waren die Histogramm-Perzentilen verzerrt (Skript-Bug:
Denominator „Total frames rendered“ statt Bucket-Summe; das WebView-Histogramm zählt mehr
Einträge als der Frame-Counter — kumulativ 153 658 vs. 144 723). Fix im Skript committet
(123ebbbe + Folget), der verbindliche Wiederholungslauf (r2) wurde durch eine **fremde
APK-Installation mid-run verworfen** (Parallel-Lane m10-loadscreen-pretext installierte
~13:44Z, App-Neustart pid 17401 → 21227; Log `~/tmp/m10-mobile-fps-cap-k1-r2.log`).
Mess-Budget: 2 Läufe verbraucht → verbindliche Auswertung aus Lauf 1; die korrigierten
Pacing-Perzentilen (Histogramm-Diff) werden in K3 mit derselben Methode sauber erhoben und
laufen dort als Vorher-Nachher-Vergleich mit. Chrome-Janky + präsentierte FPS aus Lauf 1 sind
vom Bug nicht betroffen.

**Geräte-Kontention (offener Punkt an Disponent/Lead):** Das Gerät ist eine geteilte Ressource;
die Lane m10-loadscreen-pretext hat während des r2-Laufs ihre APK installiert. Seitdem läuft
auf dem Gerät ein Build mit `fps.limit 60` aktiv (Probe `scripts/m10-fps-cap-probe.mjs`:
`cappedAt60: true`, Renderer Adreno 710). Die Ist-Cap-120-Baseline kann daher nicht wiederholt
werden, ohne selbst einen ungedrosselten Build zu committen. K3 misst deshalb gegen MEINE
Lane-APK (`POST /install?lane=m10-mobile-fps-cap`).

## K2 — Fix: Frame-Cap nur Geräteknoten + BILDRATE-Option — 28.11. (Commit 700c815e)

Umsetzung (Commit siehe git log, Karte #12248):

- **`src/logic/fps-cap.ts` (neu, rein):** `FPS_AUTO(-1)/FPS_60(60)/FPS_MAX(0)`,
  `clampFpsSetting`, `resolveFpsLimit` (AUTO → 60 am Geräteknoten, MAX auf Desktop),
  `fpsSettingLabel` (AUTO zeigt aufgelösten Wert „60“/„MAX“), `stepFpsSetting`
  (Zyklus AUTO→60→MAX), `isDeviceNodeRenderer` (Adreno (TM) 710 + DPR ≥ 2), gelatchte
  `probeDeviceNode()` (Node-passiv, Latch beider Ausgänge — Befund m10-device-janky-node K4),
  `applyFpsLimit()` (Laufzeitwechsel: Phaser 3.90 dispatched in TimeStep.tick() dynamisch
  über hasFpsLimit — kein Neustart nötig).
- **`src/main.ts`:** Boot-Config `fps: { target: 60, limit: resolveFpsLimit(getSettings().fps,
  probeDeviceNode()) ?? 0 }` — Cap 60 nur am Geräteknoten; Desktop ohne Limit (auf den
  60-Hz-vsync-Messprofilen perf/fullrun/iGPU verhaltensgleich 60 → Messwerte unverändert).
  `onSettingsChanged` wendet BILDRATE sofort an (`applyFpsLimit`).
- **Menü-Option „BILDRATE“** (OPTION_ROWS Position 6 vor ZURÜCK) mit Persistenz wie
  bestehende Settings (`fps`-Feld in Options/DEFAULT/load/save/setOption + normalize in
  settings.ts). Standard: AUTO → 60 am Gerät, MAX auf Desktop. Optionsmenü rendert die Zeile
  datengetrieben (Titel + Pause), UI.ts needed keine Änderung.
- **Guard-Tests `tests/mobile-fps-cap.test.ts` (13):** pinnt Desktop-Werte (AUTO→null/MAX),
  Geräteknoten (AUTO→60), explizite Overrides beidseitig, Clamp, Menü-Zyklus, Labels,
  Node-Passivität der Probe, Persistenz-Roundtrip, applyFpsLimit-Laufzeitwechsel.
- **Suite:** 2334 Tests grün (210 Dateien), `npx tsc --noEmit` rc=0, `npm run build` rc=0.

**Reviewer-Runde 1 (FAIL → gefixt, Commit a04b6615):** kritischer Befund — die RAF-Schleife des
Phaser-TimeStep bindet die Step-Funktion einmalig in `start()`/`wake()` (TimeStep.js:546/807);
`applyFpsLimit` setzte nur Felder → Wechsel uncapped→capped ohne Wirkung („BILDRATE gilt sofort“
beim Pfad MAX→60 ohne Reload gebrochen). Fix: `sleep()/wake()`-Rebind (Guard auf laufenden Loop,
optionale Methoden für Test-Fakes), Latch-Test mit gestubtem `document`, `DEVICE_RENDERER` als
benannte Konstante, main.ts-Handler nutzt den `installLifecycle`-Parameter. K3-Messung bleibt
gültig: sie misst nur Boot-Zeit-Bindung (Konfigurationspfad), nicht den Laufzeitwechsel.

**Desktop-Vorher/Nachher (unverändert, K3-Tor-Anteil):** Titel-Shots 960x540 headless,
HEAD-Stand vs. K2-Stand — Pixel-Diff (Schwelle >8/255) **0 Pixel** außerhalb der animierten
Mond-Glow-Region (Puls-Animation, Diff ≤8). Belege: `shots/abnahme/m10-fps-cap-desktop-vorher.png`,
`shots/abnahme/m10-fps-cap-desktop-nachher.png` (Bytegrößen 53 297/53 157; Run-Shots mit RNG
in `.evidence/desktop-vorher/nachher.png` verworfen, Titel ist der deterministische Vergleich).

## K3 — Nachher-Messung am Gerät (Cap 60 + max-Referenz) — 28.11. — **HANDOFF an Versuch 2**

**Stand (Original-Session, übergibt hier an die Fortsetzung ses_ddd97f876 / „Versuch 2“):**

- **Lane-APK installiert** (`POST /install?lane=m10-mobile-fps-cap`, gebaut aus 700c815e): Probe bestätigt
  `fps: {target 60, limit 60, cappedAt60: true}`, `options.fps: -1 (AUTO)` → Standard 60 am Gerät wirkt.
  Hinweis: a04b6615 (Reviewer-Fix, Laufzeitwechsel) ist NICHT im installierten APK — für die Messung
  irrelevant (K3 misst nur Boot-Zeit-Bindung; der Skript-Pfad setzt BILDRATE per localStorage + reload,
  also ebenfalls Boot-Pfad). Optional nach eigenem Commit neu installieren.
- **Methodik:** `scripts/m10-fps-cap-device.mjs --fps 60|max --gate` (10-min, Minute-25-Dichte,
  Segmentierung alle 24 Fenster, Recovery bei Seiten-Tod; K3-Tor = janky(>16,7 ms) < 10 % UND 0 JS-Fehler).
  `--fps` schreibt die BILDRATE-Option in localStorage + reload → misst den echten Persistenz-Pfad.
  **Immer unter `flock /home/ai/games/.lf-perf.lock` starten** (Versuch-2-Läufe bisher ohne — bitte beachten).
- **„Glatte 60“-Beleg:** `totalFrames`-FPS (presentedFps) zählt bei aktivem Cap auch Chromium-Duplikat-
  Frames (~100/s statt 60) — nicht als Render-Rate verwenden! Stattdessen `scripts/m10-fps-cap-drawprobe.mjs
  60|max` (echte WebGL-Draw-Aufrufe/s im Minute-25-Setup; bei wirksamem Cap halbiert sich die Rate ~60/110,
  je Mode ~1 min). Chrome-Janky-Counter + Akkutemperatur sind die K3-Ergebnismetriken.
- **Geräte-Kontention (4 App-Restarts 13:44–14:00Z durch m10-loadscreen-pretext Kaltstart-Serie):**
  gfxinfo resettet bei App-Restart (neue pid) → Aggregate verfälscht; Fenster mit `presentedFps < 30` oder
  `aborted` in der Auswertung AUSKLAMMERN (pro-Fenster-Daten sind im JSON). Lauf erst starten, wenn
  `/json/list`-Port über ~2 min stabil ist. **Nur EIN Messer gleichzeitig** (flock + Board-Notiz auf #12249).
- **Frozen-Loop-Falle (diagnostiziert 14:03Z):** nach verpasstem visibilitychange hängt der Game-Loop im
  Schlaf (`stats().time` advancing 0, rAF lebt, Szene „run“) → Messfenster laufen ins Leere (presented=0,
  enemies konstant). Heilung: `page.reload()` (Neustart des Skripts tut das ohnehin). Kein Skript-Bug.
- **Teil-Daten aus abgebrochenen Läufen (Cap 60 aktiv, Minute-25, je ~5 saubere Fenster):** Chrome-Janky
  17,7–20,9 %, janky16.7 24–33 % — NICHT als Endergebnis verwenden (trampled/zu wenig Fenster), aber als
  Vorsignal: der Cap-60-Lauf MUSS sauber gemessen werden, ehe das K3-Tor bewertet wird.
- **Desktop-Tor-Anteil ist bereits erledigt:** Vorher/Nachher-Titel-Shots pixelgleich (0 Pixel >8 außerhalb
  Mond-Animation) — `shots/abnahme/m10-fps-cap-desktop-{vorher,nachher}.png`, Raw-Diffs in `.evidence`.

**K4 (Vorbereitung):** Empfehlung 60 vs. max anhand Chrome-Janky + Histogramm-Pacing (p95/p99, korrigierte
Denominator-Version) + Akkutemperatur (33→35 °C in 10 min Baseline) treffen — NICHT nur FPS-Median.
Lagebericht zusätzlich als Eintrag in `/home/ai/games/.dispatch/requests.md` (Dom-Lagebild).
Danach: `.lane-done` (Regeln siehe Briefing), Board #12250.

## K4 — Empfehlung 60 vs. max — 28.11.

*(wird nach K3 ergänzt)*
