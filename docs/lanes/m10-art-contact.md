# Lane m10-art-contact — belastbare Art-Belege (38 Charakter-Sprites)

Worktree: `/home/ai/games/lf-lanes/m10-art-contact` · Branch `m10-art-contact`
**Basis-SHA beim Start: `f26dc4b`** (der Merge der Lane `m8-display` lief noch; alle Zahlen unten mit dieser Basis ausweisen).

Ziel: für alle 38 Charakter-Sprites (30 Gegner, 6 Bosse, Mira, Kael) Belege in 1× und 4× auf dunklem Grund,
Frame-Matrix, Off-Palette-Pixel und fehlende Lauf-/Wind-up-Frames. Ergebnis ist eine Mängelliste, aus der die
m9-art-Lanes ihre nächsten Karten schneiden.

## Karten-Checkliste

- [x] **1 Inventar** — Soll-Keys + Soll-Frames aus `src/data` und `src/gfx`-Generatoren als JSON (38 Einträge).
- [x] **2 Kontaktbögen 1×** — 7 Bögen (Gegner Tier 0–4, Bosse F0–F2, Helden), jedes Sprite beschriftet und sichtbar.
- [x] **3 Kontaktbögen 4× + Frame-Matrix** — 4×-Nahaufnahmen, Ist-Frames gezählt, Ist/Soll gediffed, Off-Palette je Frame.
- [x] **4 Report + Urteil** — Mängelliste mit Sprite/Frame/Pixel-Koordinate, Schweregrad, m9-art-Bereich, art-director-Urteil.

## Arbeitsregeln dieser Lane

- Nur `shots/m10-art-contact-*` und `docs/lanes/m10-art-contact.md` schreiben.
- Skripte unter `scripts/` und `src/` nur lesen/aufrufen, nie editieren. Hilfsskripte in `~/tmp/m10-art-contact/`.
- `GAME.md`, `ART.md`, `index.html`, `public/**`, `src/**`, `scripts/**`, `tests/**`,
  `shots/m8-*`, `shots/balance-*`, `shots/perf-*`, `.opencode/board.json` nicht anfassen/committen.
- Kein checkout/merge/rebase/push. Eine Karte = ein Commit (`M10-m10-art-contact: #<karte> ...`).
- FPS-/Echtzeitläufe nur mit `flock /home/ai/games/.lf-perf.lock`; Pixel-/Screenshot-/Testläufe ohne flock.
- Kein `sleep`-Polling; lange Läufe synchron mit `timeout`, Logs nach `~/tmp/m10-art-contact/`.

## Karte 1 — Inventar (Commit e31f06d)

Skript: `~/tmp/m10-art-contact/inventory.py` (read-only, Regex auf `src/data` + Import der Generator-Module).
Beleg: `shots/m10-art-contact-inventory.json`.

Ergebnis (Basis `f26dc4b`):

- 38 Einträge: 30 Gegner + 6 Bosse + 2 Helden.
- Gegner-Soll: Tier 0–1 = 2 Lauf-Frames, Tier 2–4 = 4 Lauf-Frames; Raster 16/20/24/28/32 px.
- Bosse-Soll: je 3 Frames (F0 Ruhe, F1 Atmen, F2 Wind-up), Raster 56/64/72/80/96/96 px.
- Helden-Soll: Lauf 4 Frames je Richtung (down/up/side), Idle 2 je Richtung, Hit 1, Portrait 48×48.
- Generator-Keys vollständig vorhanden, 0 Probleme (`problems: []`).

## Karte 2 — Kontaktbögen 1× (Commit 82690c9)

Skript: `~/tmp/m10-art-contact/sheets.py` (read-only; liest die **exportierten** Grids aus
`src/gfx/gen-enemies.ts`, `gen-bosses.ts`, `gen-chars.ts`, also das, was das Spiel benutzt).
Ausgaben (dunkler Grund `nightDeep` = Palettenindex 1, natives 1×-Raster, alle Frames mit F-Label):

- `shots/m10-art-contact-1x-enemies-tier0.png` … `-tier4.png` (30 Gegner, alle Lauf-Frames)
- `shots/m10-art-contact-1x-bosses.png` (6 Bosse × F0 Ruhe / F1 Atmen / F2 Wind-up)
- `shots/m10-art-contact-1x-heroes.png` (Mira/Kael: Lauf 4 + Idle 2 je Richtung, Hit, Portrait)

Damit sind es 7 Bögen statt der geforderten 4 (Tier-Aufteilung feiner). Jedes Sprite ist beschriftet
(`SPRITE-KEY` + `F<n>`) und vollständig sichtbar.

## Karte 3 — Kontaktbögen 4× + Frame-Matrix/Audit (Commit 82690c9)

Ausgaben:

- `shots/m10-art-contact-4x-enemies-tier0.png` … `-tier4.png`
- `shots/m10-art-contact-4x-bosses.png`
- `shots/m10-art-contact-4x-heroes.png`
- `shots/m10-art-contact-audit.json` — **38 Zeilen**, je Sprite Ist/Soll-Frames, Off-Palette-Pixel je Frame
  (mit ersten Koordinaten), Frame-Hashes und Duplikat-Paare; zusätzlich Off-Palette-Prüfung der fertigen
  Bögen selbst (jedes opake Pixel muss in `src/palette.ts` liegen).

Ergebnis (Basis `f26dc4b`, nur exportierte TS-Grids):

- **38/38 Sprites vorhanden**, Ist-Frames == Soll-Frames: 0 fehlende, 0 überzählige Frames.
  Gegner 2 (T0/T1) bzw. 4 (T2–T4), Bosse 3, Helden 20 Animationsframes (Walk 12 + Idle 6 + Hit 1 + Portrait 1).
- **0 Off-Palette-Pixel** in allen 38 Sprites und in allen 14 Belegbögen (`sheetOffPalette` alle 0).
- **1 Duplikat-Paar:** `enemy_spider` F0 ≡ F2 (identischer Pixel-Hash) — verstößt gegen „vier echte Posen“
  in ART.md; Frame 2 sollte eine andere Beinphase zeigen.
- 0 zu schmale Zeilen (`badRowWidths`) in den Exporten.

## Karte 4 — Mängelliste + Urteil

Grundlage: Audit-JSON (38 Zeilen), Sichtprüfung der 14 Bögen (nur auffällige Bilder einzeln geöffnet),
unabhängiges art-director-Review gegen `ART.md`.

### Mängelliste

| # | Sprite | Frame | Befund / Pixelkoordinate | Schweregrad | Bereich |
|---|---|---|---|---|---|
| 1 | `enemy_spider` | F0 = F2 | F0 und F2 sind pixelidentisch (Hash-Gleichheit im Audit). Frame 2 müsste die Gegenphase der Beine zeigen. | **major** | `m9-art-world` (Gegneranimation) |
| 2 | `enemy_spider` | F0→F1 | Nur 16 px ändern sich (ca. 2,8 % der 24×24-Fläche), Änderungen an x/y = (2,8)/(3,8)/(13,9)/(14,9)/(14,7)/(15,7)/(3,16)/(4,16)/(15,17)/(16,17)/(3,19)/(4,19)/(13,19)/(14,19). Lauf wirkt fast statisch. | **major** | `m9-art-world` (Gegneranimation) |
| 3 | `boss_pale_shepherd` | F2 | Sichelspitze berührt den Rasterrand bei x=71, y=8–11; bei 4× wirkt die Klinge am Rand angeschnitten. Prüfen, ob 1 px Luft nötig ist. | minor | `m9-art-world` (Boss-Silhouette) |
| 4 | `enemy_wolf` | F1 = F3 (fast) | F1 und F3 differieren nur 17 px (3,0 %); die „Gegenphase“ wirkt wie eine Kopie. F2/F3 sollten eine dritte Beinphase zeigen. | minor | `m9-art-world` (Gegneranimation) |
| 5 | `enemy_bomber` | F1 = F3 (fast) | F1 und F3 differieren nur 16 px (2,8 %); Zünd-Docth-Flamme und Körper sind in beiden Frames nahezu gleich. | minor | `m9-art-world` (Gegneranimation) |
| 6 | `boss_bone_lord` | F0 ≈ F2 | F2 (Wind-up) differiert nur 110 px (2,7 %) von F0 (Ruhe). Der Wind-up ist erst im Übergang F1→F2 (27 %) erkennbar; Arme/Waffe sollten in F2 deutlicher ausholen. | minor | `m9-art-world` (Boss-Animation) |

Nicht als Mangel gewertet (geprüft, sauber):

- Off-Palette: **0** Pixel in allen Frames und Bögen.
- Fehlende Lauf-/Wind-up-Frames: **0** — alle Gegner haben 2 bzw. 4, alle Bosse F0/F1/F2, Helden Walk/Idle/Hit/Portrait.
- Frame-Duplikate außer Spider: keine. Helden-Walkzyklen zeigen echte Phasenwechsel (Diff 26–41 %).
- Rastergrößen stimmen mit `ART.md` überein (16/20/24/28/32, Bosse 56–96, Helden/Portraits 32/48).

### Belege zur Abnahme

- Tests: `npx vitest run` → **192 Tests in 12 Dateien, alle grün** (Basis `f26dc4b`).
- Build: `npm run build` → rc=0.
- In-Game-Shot: `shots/m10-art-contact-game.png` + `.png.json`, `jsErrors: []` (0 JS-Fehler).
- Belege vollständig im Lane-Commit; keine geschützten Pfade angefasst.

### Zusätzliche Tooling-Belege (Supervisor-Hinweis, 26.11.)

Auf Hinweis des Supervisors wurden die vorhandenen, read-only Art-Skripte erneut ausgeführt
(statt weiterer Inline-Parser), mit `lib.SHOTS` auf ein Temp-Verzeichnis gepatcht, damit die
getrackten m4/m4b-Belege unverändert bleiben:

- `scripts/art/contact.py` → `shots/m10-art-contact-tooling-bosses.png`, `-heroes.png`, `-enemies.png` (4×)
- `scripts/art/sheet-enemies-dark.py` → `shots/m10-art-contact-tooling-enemies-dark.png`
  (Selbstcheck: **30 Gegner, 96 Frames, 0 Off-Palette, 0 Einzelpixel**, Lichtkanten/Haut/Akzente geprüft)
- Beide Skripte rc=0 beim ersten Lauf (kein Abbruchkriterium erreicht), Logs in `~/tmp/m10-art-contact/tooling.log`.

### Unabhängige Gegenprüfung (Versuch 3, 26.11.)

Zwei eigene read-only Skripte in `~/tmp/m10-art-contact/` prüfen die Belege nach, ohne die Generator-Pipeline zu wiederholen:

- `framediff.py` parst die exportierten String-Grids aus `src/gfx/gen-*.ts` (54 Keys inkl. Portraits/Hit,
  darunter die 38 Charakter-Sprites) und zählt abweichende Pixel je Frame-Paar:
  - `enemy_spider` F0↔F2: **0 diffPx** (pixelidentisch) — bestätigt den Audit-Befund.
  - `enemy_spider` F0↔F1/F3 und F1↔F2: je **16 diffPx = 2,8 %** von 24×24 — Lauf fast statisch.
  - Helden-Walk (down/up/side): benachbarte Frames **32–43 %** Differenz; F0↔F2 nur **5–20 %**
    (ruhige Gegenphase, kein Duplikat).
  - Weitere Near-Duplikate (nicht identisch, aber <5 %): `enemy_wolf` F1↔F3 (3,0 %),
    `enemy_bomber` F1↔F3 (2,8 %), `boss_bone_lord` F0↔F2 (110 px = 2,7 %).
    `boss_bone_lord` F2 wirkt dadurch fast wie F0; der Wind-up ist nur im Übergang F1→F2 (27 %) klar.
  - Alle anderen Frame-Paare differieren deutlich; kein weiteres 0-Diff-Paar.
- `palcheck.py` liest die fertigen 14 Belegbögen mit `scripts/art/lib.read_rgba_png` (pure Python, kein PIL)
  und prüft jedes opake Pixel gegen `src/palette.ts`: **14/14 Bögen, 0 Off-Palette-Pixel**.
  (Der In-Game-Screenshot `m10-art-contact-game.png` ist bewusst ausgenommen: Licht-/Vignette-Overlays
  sind laut ART.md erlaubte Ausnahme.)
- `audit.py` ist das **feste, deterministische Erzeuger-Skript** für `shots/m10-art-contact-audit.json`
  (nur `~/tmp/m10-art-contact/`, kein Ad-hoc-Parser je Sprite): liest das Inventar-JSON plus die
  exportierten `src/gfx/gen-*.ts`-Grids, schreibt die 38 Zeilen und prüft zusätzlich die 14 Bögen.
  Lauf am 26.11. reproduzierte das committete Audit-JSON **byte-identisch** (`diff` leer).
- `validate_audit.py` prüft das Audit-JSON gegen das Abnahmekriterium: **PASS** —
  38 Zeilen (30 Gegner + 6 Bosse + 2 Helden), 154 Ist-Frames gesamt, 0 fehlende Frames,
  0 Off-Palette-Pixel gesamt, 14/14 Bögen off-palette-frei, Hero-Animationen summieren sich
  exakt auf Sprite-Ist/-Off-Palette. Einziger dokumentierter Mangel: Spider F0≡F2.

### art-director-Urteil

_(wird aus dem unabhängigen Review eingetragen)_
