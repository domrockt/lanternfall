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

(d folgt)

## K4 — Doku + Abschluss (#11641)

(d folgt)
