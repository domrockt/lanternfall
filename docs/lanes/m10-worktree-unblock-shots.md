# Lane m10-worktree-unblock-shots (2026-11-28)

Ziel: Geteilten Worktree auf main wieder sauber machen, damit das `board_move`-Plugin
Karten-Züge wieder zulässt. Blocker laut Briefing (git status 17:56Z + requests.md 17:55Z):
2× `M shots/m10-passive-math-*.json` (Lane m10-passive-math nicht laufend) + ungetrackte
`shots/merge-merge-m10-*-check-*.png.json` von beendeten Merges. Karten #13283 und
#13766–#13769 hingen dadurch in `review`.

Karte: **#13830** (reservierter Block #13830–#13849).

## Befund Ist-Stand (nach Briefing, vor eigenen Änderungen)

`git status --short --untracked-files=all` ergab **nur** ` M .opencode/board.json`
(Board-Plugin-Noise: Unicode-Re-Encoding äquivalenter Zeichen, 1651 Zeilen diff, inhaltlich
identisch). **Keine** shots-Einträge, **keine** ungetrackten Dateien.

Ursache: Zwischen Briefing (17:56Z) und Lane-Start hat eine Fremd-Aufräumaktion die Blocker
bereits beseitigt:

- Commit `64d8fbb0` (17:58:53Z) „merge-merge-m10-acceptance-tor-sync: Kontroll-Screenshots
  (fast-path)“ — Merge-Pipeline trackt ihre Kontroll-Shots selbst.
- Stash-Einträge belegen Zurückstellen fremder Timestamp-Noise durch andere Lanes, u. a.
  `stash@{1}` „On m10-tablet-fx-hotspot: passive-math generatedAt (Test-Seiteneffekt,
  Fremd-Dateien)“, `stash@{2}` (dito), `stash@{7}` „On main: merge-m10-palette-guard-evo:
  shots timestamps“.

## K1 — shots/m10-passive-math-*.json: Befund = bereits sauber, nichts committet, nichts zurückgestellt

- `shots/m10-passive-math-caps.json` und `shots/m10-passive-math-matrix.json` sind getrackt
  und **unverändert gegenüber HEAD** (`git diff --stat` leer, nicht in `git status`).
- Beide Dateien sind intakte JSON-Belege (Validierung: Caps/Checks/Combo/Deviations-Keys
  vorhanden, parse OK) der beendeten Lane `m10-passive-math` (`docs/lanes/m10-passive-math.md`
  existiert; die Dateien sind in mehreren Lane-Dokus als Beleg referenziert).
- Die 17:56Z gemeldeten `M`-Diffs waren der bekannte `npm test`-Seiteneffekt (Timestamp-only,
  siehe `docs/lanes/m10-data-ssot-guard.md:66` und Stash-Nachrichten) und wurden fremdseitig
  zurückgestellt. HEAD-Versionen sind die gültigen Belege.
- **Entscheidung:** Kein Commit nötig (bereits in git als Beleg), kein `git checkout --`
  nötig (kein Diff vorhanden). Keine eigene Commit-Aktion → eine Karte = ein Commit bleibt
  gewahrt (der Doku-Commit K4).

## K2 — merge-merge-m10-*-check-* der 5 gemergten Lanes: Befund = bereits committet

PNG-Kontroll-Shots (960/1280) aller fünf gemergten Lanes sind getrackt, jeweils durch die
eigene „Kontroll-Screenshots (fast-path)“-Commits der Merge-Pipeline:

| Lane | Einführender Commit |
|---|---|
| blend-band-followup | `2200f528` |
| evo-element-guard | `24f73e1f` |
| fps-pacing-timestep | `9d153fc8` |
| golden-frame-rebaseline-r3 | `32c0ec32` |
| renderer-guard-k4 | `dfee53ae` |

Die `png.json`-Sidecars existieren **nicht mehr auf Disk** (durch die Fremd-Aufräumaktion
entfernt) — es gibt also keine ungetrackten Sidecars mehr, die committet werden müssten.
Zeitpunkt der Räumung korrespondiert mit `64d8fbb0` (17:58:53Z).

## K3 — Nicht angerufen (Einhaltung)

- `shots/merge-m10-panel-hz-pref-*`: nicht angefasst (Merge-Lauf kann aktiv sein).
- `.opencode/board.json` (git-Dirt): nicht committet, nicht zurückgesetzt — Plugin-Noise,
  außerhalb meines Datei-Bereichs. `board_add`/`board_move` wurden als Plugin-Werkzeuge
  regulär benutzt (Karte #13830 → doing), das ist Board-Buchung, kein Datei-Eingriff.
- Spielcode, Tests, Daten: keine einzige Zeile geändert.
- Bewusst **kein `npm test`/`npm run build`** ausgeführt: Der Testlauf würde die
  passive-math-Shot-Timestamps neu schreiben (dokumentierter Seiteneffekt) und damit genau
  die Noise wieder erzeugen, die diese Lane beseitigt. Diese Karte ändert ausschließlich
  diese Doku-Datei — kein betroffener Code, daher kein Build/Test nötig.

## K4 — Abnahme-Nachweis

Nach Abschluss (vor dem Commit, Stand siehe unten):

- `git status --short --untracked-files=all | grep -v board.json` → **leer**: keine
  `merge-merge-m10-*`- und keine `passive-math`-Einträge mehr im Worktree.
- `board_move` #13830 → `doing` (und später → review) wurde vom Plugin **akzeptiert** —
  der ursprüngliche Blocker ist behoben; Karten #13283 und #13766–#13769 sind durch die
  Merge-Pipeline-Commits (`64d8fbb0` u. a.) bereits nach `done` geführt worden
  (Commit `f427115c` „Lane-Karten #13766-#13769 done“).
- Verbleibender Dirt: nur ` M .opencode/board.json` (Plugin-Noise, bewusst nicht angerufen, K3).

## Ergebnis

- Kein shots-Commit aus dieser Lane nötig: beide Blocker-Klassen waren zum Lane-Start bereits
  behoben (Fremd-Aufräumaktion 17:58Z). Ehrlich berichtet statt Aktionismus.
- `board_move`/`board_add` wieder funktionsfähig (live verifiziert mit Karte #13830).
- Lane-Doku ist der einzige Commit dieser Karte (expliziter Pfad, kein `add -A`/`add .`).
