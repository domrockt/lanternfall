# Lane m10-art-contact — belastbare Art-Belege (38 Charakter-Sprites)

Worktree: `/home/ai/lf-lanes/m10-art-contact` · Branch `m10-art-contact`
**Basis-SHA beim Start: `f26dc4b`** (der Merge der Lane `m8-display` lief noch; alle Zahlen unten mit dieser Basis ausweisen).

Ziel: für alle 38 Charakter-Sprites (30 Gegner, 6 Bosse, Mira, Kael) Belege in 1× und 4× auf dunklem Grund,
Frame-Matrix, Off-Palette-Pixel und fehlende Lauf-/Wind-up-Frames. Ergebnis ist eine Mängelliste, aus der die
m9-art-Lanes ihre nächsten Karten schneiden.

## Karten-Checkliste

- [x] **1 Inventar** — Soll-Keys + Soll-Frames aus `src/data` und `src/gfx`-Generatoren als JSON (38 Einträge).
- [ ] **2 Kontaktbögen 1×** — 4 Bögen (Gegner Tier 1–4, Bosse F0–F2, Helden), jedes Sprite beschriftet und sichtbar.
- [ ] **3 Kontaktbögen 4× + Frame-Matrix** — 4×-Nahaufnahmen, Ist-Frames zählen, Ist/Soll diffen, Off-Palette je Frame.
- [ ] **4 Report + Urteil** — Mängelliste mit Sprite/Frame/Pixel-Koordinate, Schweregrad, m9-art-Bereich, art-director PASS/FAIL.

## Arbeitsregeln dieser Lane

- Nur `shots/m10-art-contact-*` und `docs/lanes/m10-art-contact.md` schreiben.
- Skripte unter `scripts/` und `src/` nur lesen/aufrufen, nie editieren. Hilfsskripte in `~/tmp/m10-art-contact/`.
- `GAME.md`, `ART.md`, `index.html`, `public/**`, `src/**`, `scripts/**`, `tests/**`,
  `shots/m8-*`, `shots/balance-*`, `shots/perf-*`, `.opencode/board.json` nicht anfassen/committen.
- Kein checkout/merge/rebase/push. Eine Karte = ein Commit (`M10-m10-art-contact: #<karte> ...`).
- FPS-/Echtzeitläufe nur mit `flock /home/ai/games/.lf-perf.lock`; Pixel-/Screenshot-/Testläufe ohne flock.
- Kein `sleep`-Polling; lange Läufe synchron mit `timeout`, Logs nach `~/tmp/m10-art-contact/`.

## Karte 1 — Inventar (Stand: erledigt)

Skript: `~/tmp/m10-art-contact/inventory.py` (read-only, nur Regex auf `src/data` + Import der Generator-Module).
Beleg: `shots/m10-art-contact-inventory.json`.

Ergebnis (Basis `f26dc4b`):

- 38 Einträge: 30 Gegner + 6 Bosse + 2 Helden.
- Gegner-Soll: Tier 0–1 = 2 Lauf-Frames, Tier 2–4 = 4 Lauf-Frames; Raster 16/20/24/28/32 px.
- Bosse-Soll: je 3 Frames (F0 Ruhe, F1 Atmen, F2 Wind-up), Raster 56/64/72/80/96/96 px.
- Helden-Soll: Lauf 4 Frames je Richtung (down/up/side), Idle 2 je Richtung, Hit 1, Portrait 48×48.
- Generator-Keys vollständig vorhanden, 0 Probleme (`problems: []`).
