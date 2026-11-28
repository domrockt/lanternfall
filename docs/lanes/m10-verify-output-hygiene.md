# Lane m10-verify-output-hygiene (M10-Nachabnahme E, Befund E-4)

Befund E-4 (docs/lanes/m10-acceptance-refresh-e.md, Severity low): verify-Skripte schreiben
Neben-Outputs in getrackte `shots/*.json`, Abnahme-Läufe hinterlassen dirty Worktrees.
Fix: Neben-Outputs nach `~/games/.evidence/verify-hygiene/`, konfigurierbar (`--out`-Flag,
`LF_VERIFY_OUTPUT_DIR`); getrackte Fixtures bleiben unangetastet.

## K1 — Inventur (#11638)

Beleg: `~/games/.evidence/verify-hygiene/m10-verify-hygiene-before.json`
(Kopie `shots/m10-verify-hygiene-before.json`; `shots/*` ist git-ignored, deshalb geht nur die
Evidence-Kopie als Dauer-Beleg, der Worktree bleibt dirty-frei). Methode: Quelltext-Lese +
`git ls-files --error-unmatch` + `git check-ignore`.

| Skript | Output | Klassifikation |
|---|---|---|
| verify-final.mjs | `final-verify.json`, `final-options-mute.png`, `final-results-victory.png` | (b) — **bereits gefixt** durch gemergte Lane `m10-verify-outputs-hygiene` (Commit 10c220cd): timestamped nach `~/games/.evidence/verify-final/`, Override `LF_VERIFY_OUTPUT_DIR`. Hier fehlt nur noch das `--out`-Flag (K2, Vereinheitlichung). |
| verify-menus.mjs | `shots/m10-verify-menus-<name>.png` (13 Snapshots), `shots/m10-verify-menus.json` | (b) — fest `shots/`, alles git-ignored; kein Code-Konsument der JSON im Repo |
| verify-terrain.mjs | `shots/m3-water-grass.png`, `shots/m3-water.png`, `shots/m10-terrain-guard-{960,1280,1920}-end.png`, `shots/m3-terrain.json`, `shots/m10-terrain-guard.json` | (b) — alles git-ignored |

**Ergebnis der Klassifikation:** Alle aktuell von den drei Skripten geschriebenen Outputs sind
git-ignored und nicht getrackt → durchweg Kategorie (b). Getrackte Fixtures (Kategorie a),
die die drei Skripte schreiben würden: **keine**.

Bewusst getrackte Verwandte, die unangetastet bleiben (kein Skript-Output):

- `shots/abnahme/m10-terrain-guard-{960,1280,1920}-end.png` — manuell platzierte Abnahme-Kopien
  (explizit getrackt, Skript schreibt dorthin nicht).
- `shots/m10-passive-math-{caps,matrix}.json` — Owner m10-passive-math, fremde Datei
  (im E-4-Befund historisch als Kollateral genannt, gehört nicht zu den drei Skripten).
- `shots/final-*.gif` — Trailer-/VFX-GIFs, keine verify-Skript-Outputs.

## K2 — Fix (#11639)

- `verify-menus.mjs` und `verify-terrain.mjs` schreiben alle Outputs nach
  `OUT_DIR = --out <dir> ?? LF_VERIFY_OUTPUT_DIR ?? ~/games/.evidence/verify-hygiene/`
  (timestamped-Präfix gegen Überschreiben, gleiche Konvention wie verify-final/verify-robust).
- `verify-final.mjs`: gleiches `--out`-Flag ergänzt, Default vereinheitlicht auf
  `~/games/.evidence/verify-hygiene/` (vorher `.evidence/verify-final/`), `LF_VERIFY_OUTPUT_DIR`
  bleibt als Override.
- Kategorie (a)-Outputs unverändert (siehe K1: keine).
- Fremde Skripte (`verify-input.mjs` und alle anderen `verify-*`) unangetastet.

## K3 — Gegenprobe (#11640)

Alle drei Skripte je 1x gelaufen (ohne flock, Verify-Skripte), Logs in `~/tmp/m10-verify-output-hygiene-k3-*.log`:

| Skript | rc | Ergebnis |
|---|---|---|
| verify-menus.mjs | 0 | PASS 15/15 Checks, 0 JS-Fehler |
| verify-terrain.mjs | 0 | OK — Gras 60 px/s, Wasser 37,6 px/s, Ratio 0,63, 3 Spritzer, Gegner 6,4/15 px/s, Schwarz-Pixel-Guard 3 Formate ok, 0 JS-Fehler; Renderer-String im JSON: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU, kein SwiftShader), `rendererValid: true` |
| verify-final.mjs | 0 | Alle 7 Checks PASS, 0 JS-Fehler |

Belege in `~/games/.evidence/verify-hygiene/` (23 Dateien, timestamped; u. a.
`2026-11-28T11-39-13-712Z-m10-terrain-guard.json` mit Renderer-String,
`2026-11-28T11-39-56-829Z-final-verify.json`, `2026-11-28T11-38-42-803Z-m10-verify-menus.json`).

**Hygiene-Nachweis:** `git status --short` nach allen drei Läufen zeigt **keine** shots-/skript-bedingten
Änderungen — nur die lane-eigene Board-Buchung (`.opencode/board.json`). `shots/` unverändert
(alle neuen Outputs liegen im Evidence-Dir außerhalb des Repos).

## K4 — Doku + Abschluss (#11641)

- Lane-Doku finalisiert (dieses Dokument); die Klassifikation der getrackten Fixtures steht in K1:
  die drei Skripte schreiben **keine** getrackten Fixtures; bewusst getrackt und unangetastet
  bleiben `shots/abnahme/m10-terrain-guard-{960,1280,1920}-end.png` (manuell platzierte
  Abnahme-Kopien), `shots/m10-passive-math-{caps,matrix}.json` (fremder Owner) und
  `shots/final-*.gif` (keine Skript-Outputs). Diese bleiben getrackt, weil sie Abnahme-Belege
  in git sind — sie werden von den Skripten nicht berührt.
- `.lane-done` im Worktree-Wurzelverzeichnis mit Zusammenfassung.

## Ergebnis (Abnahmekriterien)

- 3 Skript-Läufe rc=0, 0 JS-Fehler ✓
- `git status --short` danach leer (außer lane-eigene Board-Buchung) ✓
- Outputs in `~/games/.evidence/verify-hygiene/`, nichts mehr nach `shots/` ✓
- Renderer-String-Pflicht erfüllt (RPL-S iGPU, kein SwiftShader) ✓
- Fremde Skripte (`verify-input.mjs` etc.) und getrackte Fixtures unangetastet ✓

Commits: #11638 ea367f54, #11639 241555b1, #11640 977e305b, #11641 a572df6a (Abschluss).

## Bedarf gemeldet (1 Zeile, fremde Datei)

`tests/passive-stack.test.ts` schreibt bei Modul-Load in die **getrackten** `shots/m10-passive-math-{caps,matrix}.json`
(nur `generatedAt`-Churn) — jedes `npm test` macht den Worktree dirty. Gleiches E-4-Muster wie hier gefixt,
aber Test-Datei eines fremden Owners (nicht Teil dieser Lane); Dateien im Worktree restored.
