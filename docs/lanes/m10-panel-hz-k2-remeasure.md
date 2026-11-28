# Lane m10-panel-hz-k2-remeasure

Ziel: Den Dom-Folgepunkt 17:45Z („BILDRATE: max hebt den 60-Hz-Panel-Lock auf“) end-to-end am Gerät belegen — Nachabnahme K2a/K2b der Lane m10-panel-hz-device-check (dort an Spieler-Sperre + leerem CDP abgebrochen). Dies ist DIE Mess-Lane zum Thema Panel-Hz am Gerät; kein zweiter Apparat, disjunkt zu v10-gate-confirm/golden-frame-r4 (Host-Gates/Sim-Hash).

## K1 — APK-Stand prüfen (nur lesend) → FAIL: APK prä-merge

**Urteil: Das latest-build-APK trägt die lfhz-Lesung NICHT. K2a/K2b sind auf diesem Build strukturell nicht bestehbar.**

Belege (vollständig in `~/games/.evidence/m10-panel-hz-k2-remeasure/k1-apk-lesung.json`):

| Prüfpfad | Befund |
|---|---|
| Neuestes APK | `lanternfall-apk/dist/lanternfall-20261128-1714-11f929c.apk` — Build-Commit `11f929c7`, committet 2026-11-28T16:59:28Z |
| merge-m10-panel-hz-pref | `79e01c5d`, committet 2026-11-28T17:55:12Z → **nach** dem APK-Build |
| Ancestry | `git merge-base --is-ancestor 79e01c5d 11f929c7` → rc≠0, pref-Merge **nicht** im APK |
| Telemetrie | Gerät läuft Build-Kennzeichen `11f929c7 2026-11-28T17:14:45.028Z` (Adreno 710, http://10.10.50.185:5180/latest, 19:32–19:36Z) |
| Bundle-Grep | APK entpackt: `lfhz_panel` / `lfhz` / `setPanelHzPref` = **0 Treffer**; Positivkontrolle `BILDRATE` gefunden (`assets/www/assets/gfx-C6xiYHCG.js`) → Grep-Methode valide |

Hinweis: `/home/ai/lf-apk/out` existiert in dieser Sandbox nicht; Build-Ausgabepfade sind `lanternfall-apk/dist/` und `.apkbuild-lane/` (kein Lane-APK für panel-hz-Lanes vorhanden — bekannter Fallback-Bug, requests.md 18:1xZ).

**Folge nach Briefing:** Lane macht Doku-only-Abschluss. K2 wird nicht angehangen, kein sleep-Warten, kein Retry. Der offene APK-Punkt bleibt bei Vera.

## K2 — Geräte-Fenster + 2 Belegläufe: NICHT ANGEHANGEN

K1 ist nicht grün → K2a/K2b bewusst nicht gestartet (Briefing: „Falls das APK noch prä-merge ist: Doku-only … hängt K2 nicht an“). Weder device-bridge /stop+/launch noch CDP-Probe ausgeführt; das Gerät wurde von dieser Lane nicht berührt.

Blockierpunkt (einzelner, nicht behoben in dieser Lane):
1. **APK-Seite (Vera, ops/escalations.md 17:5xZ + requests.md 19:3xZ):** latest-build-APK 11f929c7 (16:59Z) prädatiert den pref-Merge (17:55Z) und enthält keine lfhz-Lesung → K2b „Menü-Pfad hebt 60-Hz-Lock auf“ kann auf diesem Build keine >60-Hz-Refresh-Rate zeigen. Bedarf: APK mit lfhz-Lesung bauen + installieren; danach K2-Nachmessung mit `scripts/m10-panel-hz-device-check.mjs` (lane-committet in main, Merge 18039f33) — Skript unverändert nutzbar.
2. **CDP-leer nach /stop+/launch (Infrastruktur, Vera):** Bedarf 1 aus m10-panel-hz-device-check 19:3xZ (Beleg `~/games/.evidence/m10-panel-hz-device-check/k2-blocked-domspielt.json`). Disponent-Notiz 19:3xZ: device-bridge/Infrastruktur, kein Lane-Job.

## K3 — Urteil je Schritt + Delta gegen die A/B-Zahlen 17:45Z

| Schritt | Urteil |
|---|---|
| K1 APK-Stand | FAIL (prä-merge, belegt oben) — sauberer Blocker nach Abnahme-Kriterium |
| K2a BILDRATE=60/AUTO → locked60, Panel 60 Hz, FPS ~60 | **nicht gemessen** (APK-Blocker; JS-Datenvertrag ist in main durch Tests gedeckt: tests/panel-hz-device-check.test.ts, Suite grün bei Merge 18039f33) |
| K2b BILDRATE=max → lfhz_panel=max, Refresh >60 Hz (Ziel >100) | **nicht messbar auf Build 11f929c7** — keine lfhz-Lesung im Bundle |

Delta gegen die A/B-Zahlen 17:45Z (60 Hz: 60,0 FPS / 16,8 ms / 0 % janky; 120 Hz: 118,5 FPS / 8,4 ms / 11,8 % janky): **kein eigener Messwert vorhanden** — die Lane kann weder bestätigen noch widerlegen. Die 17:45Z-Zahlen stammen aus Doms manuellem Test (kein Evidence-JSON, Beleglücke bereits von Argus 17:58Z notiert; Nachhol-Beleg ist bei m10-v10-final-run K2 vorgesehen — diese Lane schließt diese Lücke NICHT, weil der Build die Funktion nicht enthält).

Hebelliste (Datei / Hebel / erwarteter Gewinn) → Bedarfsmeldung requests.md:

| Datei/Ort | Hebel | erwarteter Gewinn |
|---|---|---|
| APK-Build (Vera/escalations 17:5xZ) | MainActivity liest `lfhz_panel` beim Start (Webview-Storage) + APK-Neubau nach aktuellen main | K2b überhaupt messbar; Ziel: aktive Refresh-Rate >60 Hz (Dom-A/B zeigte 118,5 FPS @ 120 Hz) |
| device-bridge (Vera) | CDP-Page-Auflistung nach /stop+/launch klären | K2a/K2b-Messung läuft ohne leeres CDP-Fenster |
| `.apkbuild-lane/` (Vera, requests 18:1xZ) | Lane-APK-Pfad statt stiller Main-APK-Fallback | Nachmessungen testen wirklich den Lane-HEAD |

**Kein Fix in dieser Lane** — Quellcode unangetastet (Disponent-Bereich respektiert; einzige Dateien: docs/lanes-Doku, Board).

## Koordinationsnotizen

- Verwaiste doing-Karten #14011/#14013 (m10-passive-math-artifact-fix — Merge e234ea25 ist in main) blockieren das Board-Plugin-WIP-Limit 2: Lane konnte K1 nicht nach `doing` ziehen (board_move REFUSED 19:37Z). Karten nicht angetastet (Argus-Regel: verwaiste Karten räumt der Disponent/Hygiene-Job). Disponent: bitte #14011/#14013 zurücksetzen.
- Alle Karten dieser Lane: #14110–#14113 (reservierter Block).

## Lane-Abschluss

Lane endet als **dokumentierter Blocker** (Abnahme-Alternative 2: „ein dokumentierter Blocker … als sauberer Lane-Abschluss“). Nach APK-Update ist K2a/K2b mit dem unveränderten lane-committeten Skript nachzuholen — Briefing/Bedarf dazu stehen in requests.md (Eintrag 19:3xZ, aktualisiert um K1-Befund).
