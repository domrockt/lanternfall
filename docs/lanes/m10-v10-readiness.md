# Lane m10-v10-readiness (2026-11-28)

Zweck: v1.0-Markierung vorbereiten (Dom 10:00Z: nach grünen Geräte-Toren Endabnahme,
dann Tag + README + latest-build-APK). Diese Lane baut **Lesbarkeit/Vorbereitung** —
kein Tag, kein Push, kein APK-Build (Vera), keine Secrets in den Texten.

Karten: #11409 (K1 Checkliste), #11410 (K2 README), #11411 (K3 GAME.md v1.0-Status).
Files (Disponent): README.md, GAME.md, docs/qa/v10-readiness-2026-11-28.md,
docs/lanes/m10-v10-readiness.md, .lane-done.

## K1 — Checkliste `docs/qa/v10-readiness-2026-11-28.md` (Commit `afcaef4b`)

Abhakbare Liste mit Belegspalten (Tor | Ziel | Beleg | Datum | Ergebnis):

- **A1–A5 Geräte-Tore** (Android-Tablet, echte Telemetrie): 6 Evos ≥ 60 FPS (Ziel 90),
  Minute-25-Dichte ≥ 60, janky (gfxinfo) < 10 %, 10-min ohne Thermik-Einbruch, Text
  lesbar. Quelle: Dom-Tore + `docs/DEVICE-TELEMETRY.md` +
  `Wissen/Android-Optimierung-Praxis.md` (Regel 7/9: 10-min-Regel, Proxy = Zusatzbeleg,
  kein Tor).
- **B1–B7 Endabnahme-Suite** (headless auf gemergtem main, Reihenfolge wie
  `ACCEPTANCE.md`): `npx tsc --noEmit`, `npm run build`, `npm test`
  (Vergleichsbasis Nachabnahme F: 1957/1957 in 179 Dateien), `verify:final` 7/7,
  `verify:input` 28/28, `acceptance-count` 30/6/6/6/6/2, fullrun-Guard
  (`scripts/m10-fullrun-guard.mjs`, Tore im Skript; aktueller Blocker Heap-Tor
  +18,2 %/+20,8 % > +15 %). FPS-Läufe unter `flock /home/ai/games/.lf-perf.lock`,
  Renderer-String-Pflicht (SwiftShader = ungültig).
- **C1–C3 Restpunkte:** Heap-Tor-Diagnose (Dora), APK latest-build mit Telemetrie +
  HEAD-nah, backlog-Mängel mit art-director-FAIL abgewogen (Dom-Entscheid).

Jede Zeile erst abhaken mit Beleg + Datum + Ergebnis; ein rotes Tor = kein v1.0-Tag.

## K2 — `README.md` (Commit `0954bc4e`)

Neu, öffentlich: Spielprofil (Pixel-Survivor im Moor, 30-min-Run, 30 Gegner, 6 Waffen/
6 Powerups/6 Evolutionen, 2 Helden, Bosse alle 5 min + Truhe), Build-/Test-Befehle
(`npm install/dev/build/test/verify`), Assets-/Lizenz-Hinweis (alles eigenständig,
Lizenz bei v1.0-Freigabe ergänzt — Datei `LICENSE` existiert noch nicht). Geprüft:
keine kopierten Marken (kein Vergleich mit fremden Spielen), keine internen Pfade
(`/home/…`, Rig-IPs), keine Secrets (grep-Scan leer). Verweis auf `package.json`
statt Aufzählung interner Mess-Skripte.

## K3 — `GAME.md` v1.0-Status (Commit `8b394c12`)

Abschnitt „v1.0-Status (2026-11-28)" **angehängt** (git diff zeigt nur +18 Zeilen am
Ende, kein Bestehendes geändert/umgeschrieben): Datum, Blocker Android-Geräte-Tore
(aufgezählt), Verweise auf Checkliste, DEVICE-TELEMETRY, ACCEPTANCE.md und
Nachabnahme F. Hinweis: Die allgemeine Lane-Regel „GAME.md NICHT ändern" wurde vom
Disponenten für diese Lane explizit aufgehoben (GAME.md ist eine zugewiesene Datei);
Änderung auf das Briefing-Kriterium beschränkt (nur Anhang).

## Abnahme

- **Reviewer (2026-11-28, ses_dde277047ffeD38zsJ15DAqFnt): PASS.** Scope nur erlaubte
  Dateien (kein src-/tests-Code), alle Zahlen gegen `ACCEPTANCE.md`/Lehr-Skripte
  verifiziert (1957/1957-F-Basis, verify:final 7/7, verify-input 28/28, count
  30/6/6/6/6/2, Heap-Tor +18,2 %/+20,8 %, Guard-Gates), Secrets-/Marken-Scan leer,
  GAME.md-Diff reiner Anhang, 3 Karten = 3 Commits. `npm test` lokal 2110/2110 grün.
- 2 „sollte"-Befunde behoben: **B7-Tor-Attribution** präzisiert (Inhalt/Heap-Tore im
  Guard-Skript, fps-Tor ≥ 55 in `fullrun.mjs`); **Board-Stand** — Karten waren bereits
  auf `review` gezogen, Stand mit diesem Commit festgeschrieben.
- Lane ändert keinen src-/tests-Code; Commit je Karte mit Präfix
  `M10-m10-v10-readiness:` und `#<Karte>`.

## Lane-Ergebnis

Drei Karten erledigt und je einmal committet (afcaef4b / 0954bc4e / 8b394c12);
Reviewer-PASS, beide Restbefunde behoben. Die Geräte-Tore selbst sind **nicht** belegt
— das ist der dokumentierte Blocker für die Endabnahme; Messung und Abhaken erfolgen
im Endabnahme-Job (Vera/Dom).
