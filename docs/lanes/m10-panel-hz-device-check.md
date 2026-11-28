# Lane m10-panel-hz-device-check — "BILDRATE: max" hebt den 60-Hz-Panel-Lock am Gerät?

Ziel: Dom-Folgepunkt 17:45Z ("Tablet-Tor bestanden", Wünsche von Dom.md) absichern — die Menü-Option
**BILDRATE: max** muss am Gerät den 60-Hz-Panel-Lock der APK (MainActivity `preferredDisplayModeId`,
gesetzt 15:15Z) **tatsächlich** aufheben, "sonst bringt max am Gerät nichts". Die JS-Seite ist gemergt
(m10-panel-hz-pref: `src/logic/panel-hz.ts` + Hook in `src/audio/options.ts`); die APK-/Bridge-Seite
(MainActivity liest `lfhz_panel` beim Start) liegt bei Vera (ops/escalations.md 17:5xZ).

Diese Lane misst und belegt **nur** — keine Änderung an `src/**` (panel-hz.ts/options.ts/main.ts sind
fremd/gemergt). Fix-Bedarfe gehen als Befundzeile raus.

## Karten

### K1 (#14070, review): Datenvertrag JS-Seite — PASS
`tests/panel-hz-device-check.test.ts` (Commit b0ecc395), 11 Tests:
- **BILDRATE: MAX** (`setOption(fps=FPS_MAX)`) schreibt `localStorage["lfhz_panel"]="max"` — exakt der
  Key/Wert-Vertrag für die APK-Lesung (`PANEL_HZ_KEY="lfhz_panel"`, `PANEL_HZ_VALUE_MAX="max"`, bewusst
  als harte Strings eingefroren).
- **BILDRATE: 60** und **AUTO** setzen die Präferenz auf Standard zurück (Key gelöscht → `readPanelHzPref()`
  = "locked60"); Fallback ohne `removeItem` schreibt explizit "locked60" (Kontakt bleibt lesbar).
- Ohne Storage: No-op (Spiel läuft weiter).
- Options-Contract unverändert: Persistenz-Expecteds (genau 7 Felder), alle BILDRATE-Stufen überleben
  `saveOptions/loadOptions`, Default bleibt AUTO, `OPTION_ROWS` 8 Zeilen mit BILDRATE an Index 6,
  Label "MAX"/"60" lügenfrei.
Beleg: `npx vitest run tests/panel-hz-device-check.test.ts` 11/11, Suite 2652/2652, `tsc --noEmit` rc=0,
`npm run build` rc=0. **Reviewer PASS** (Kontrolleur, 19:3xZ): src-Tabu eingehalten, Vertrag echt geprüft;
2 „sollte“-Hinweise zur Build-Beleg-Robustheit im Messskript → behoben (INVALID_BUILD-Abbruch bei fehlender
Telemetrie-Build-ID).

### K2a (#14071, blocked): Gerätemessung Standardstart — ABGEBROCHEN (Spieler-Sperre), nicht gemessen
Messskript `scripts/m10-panel-hz-device-check.mjs` (Muster `m10-janky-remeasure.mjs`; Bridge ohne
dumpsys/shell-Endpoint → aktive Panel-Hz über die etablierte rAF-Probe; Restart-Nachweis per
window-Marker; Pflichtfelder Renderer-String/Build/Panel-Hz im Beleg-JSON).

Ablauf 19:2xZ:
1. Preflight: `dom_playing=false` (user_idle_s 5033) → Messung gestattet.
2. `/stop` + `/launch?q=debug=1` **erfolgreich** (App-Neustart belegt: pid 30919 → 13491).
3. **CDP `/json/list` blieb 120 s leer** (auch `/json/version` leer) → Skript-Abbruch
   "CDP: keine Game-Page nach ~120 s". Ursache offen — janky-remeasure lief 16–17Z noch über denselben
   CDP-Weg; Beobachtung, nicht behoben (max. 2 Mess-Skript-Iterationen, hier 0 Edits am Skript nachgebaut).
4. Manuelle Diagnose: `POST /launch` → **HTTP 409 DOM_SPIELT** (letzte Tablet-Eingabe vor 146 s).
   Abbruch gemäß Regel — **kein Retry, kein Polling**, Doms Spiel hat Vorrang. Die Spieler-Sperre hat
   damit korrekt gegriffen (positiv: sie schützt Doms Session).
5. Lesende Kontrolle: `dom_playing=true`, user_idle_s 192; CDP weiter ohne Ziele.

Beleg: `~/games/.evidence/m10-panel-hz-device-check/k2-blocked-domspielt.json` (+ Log
`~/tmp/m10-panel-hz-device-check-k2.log`). **Aktive Panel-Hz wurden NICHT gemessen** — die 60-Hz-Erwartung
bleibt eine Behauptung aus dem APK-Lock (15:15Z) und dem janky-remeasure-Beleg 16:49Z (Panel-Probe 60 Hz),
nicht aus diesem Lauf.

### K2b (#14072, blocked): Gerätemessung BILDRATE:max — GEBLOCKT, zwei unabhängige Ursachen
1. **APK-Lesung fehlt (strukturell):** das latest-build-APK ist `11f929c7` (Telemetrie, 2026-11-28T17:14:45Z)
   und **prädatiert** den m10-panel-hz-pref-Merge (~18–19Z). Die lfhz-Lesung in MainActivity ist laut
   Lead-Lagebericht 19:0xZ weiter offen bei Vera (ops/escalations.md 17:5xZ). Auf diesem Build kann der
   Menü-Pfad (localStorage `lfhz_panel=max` → APK liest beim Start) **strukturell** nicht 120 Hz zeigen —
   eine Messung wäre kein Beleg, sondern nur der bekannte 60-Hz-Lock.
2. **Spieler-Sperre (operativ):** siehe K2a — 409 DOM_SPIELT, kein Retry.

### K2c (Fähigkeits-Beleg, Teil des K2-Skripts): `/launch?...&hz=max`
Als dritter Datenpunkt vorgesehen (Brücken-Override wie in der A/B-Tabelle 17:45Z, ausdrücklich NICHT der
Menü-Pfad) — ebenfalls durch K2a-Abbruch nicht gemessen.

### K3 (#14073, done): Ursache dokumentiert + Bedarf gemeldet
Befundzeile in `/home/ai/games/.dispatch/requests.md` (19:3xZ, Verweis ops/escalations.md 17:5xZ):
- **Bedarf 1:** freies Geräte-Fenster für K2a/K2b-Nachmessung (Skript liegt lane-committet bereit,
  Aufruf `node scripts/m10-panel-hz-device-check.mjs --out <json> --secs 120`) + Klärung, warum CDP nach
  `/stop`+`/launch` keine Page listet.
- **Bedarf 2:** MainActivity-lfhz-Lesung (Vera, escalations 17:5xZ) — erst dann ist K2b überhaupt
  belegbar; nach APK-Update Nachmessung anstoßen.

### K4 (#14074, done): Lane-Doku + .lane-done
Diese Datei + `.lane-done`. Belege (außerhalb des Repos, Belegregel 28.11Z):
`~/games/.evidence/m10-panel-hz-device-check/k2-blocked-domspielt.json`.

## Ergebnis (ehrlich)

| Teil | Ergebnis |
|---|---|
| K1 Datenvertrag JS-Seite | **PASS** — BILDRATE:max setzt `lfhz_panel=max`, 60/AUTO setzen zurück; Contract eingefroren |
| K2a Standardstart am Gerät | **nicht gemessen** — Spieler-Sperre (409) + CDP ohne Ziele, sauber abgebrochen |
| K2b BILDRATE:max am Gerät | **nicht belegbar auf Build 11f929c7** — APK liest `lfhz_panel` noch nicht (Vera/escalations 17:5xZ) |
| K2c Brücke `/launch?hz=max` | **nicht gemessen** (K2a-Abbruch) |

**Kein 120-Hz-Beleg in dieser Lane.** Der Folgepunkt 17:45Z bleibt am Gerät offen: JS-Seite vertraglich
geprüft (K1), Geräte-Kette (APK liest `lfhz_panel` beim Start) fehlt noch und ist bei Vera eskaliert.
Kein sleep-Warten, kein Retry gegen die Spieler-Sperre — Nachmessung als Bedarf gemeldet.

## Offene Punkte
1. CDP-Leere nach `/stop`+`/launch` klären (Infrastruktur/Vera) — ohne CDP keine rAF-Probe, keine
   Renderer-/FPS-Messung am Gerät.
2. APK-Update mit lfhz-Lesung (Vera) → dann K2a/K2b/K2c-Nachmessung mit dem bereitliegenden Skript.
3. Spieler-Sperre hat funktioniert — Verhalten als Referenz für künftige Geräte-Lanes dokumentiert.
