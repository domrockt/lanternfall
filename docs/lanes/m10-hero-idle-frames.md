# Lane m10-hero-idle-frames — Helden Idle-/Bob-Animation (M6, 28.11.2026)

**Ziel lt. Briefing:** 2-Frame-Idle-/Bob-Animation für Kael + Mira ergänzen, 4 Lauf-Frames auf
Rhythmik prüfen. **Abweichender Ist-Befund:** Beides existiert bereits seit `e778827` (M4-02)
auf main und ist in `src/scenes/Run.ts` verdrahtet (`idlePhase`, 2 fps, `frames.idle[walkDir]`).
Die Lane wurde daher ehrlich als **Verifikation + Absicherung** gefahren (Belege, Messung,
Regressionstest), nicht als Doppelaufbau. Kein Code-Pfad musste geändert werden.

## Karte #1 — Ist-Belege + Befundliste

Belege: `shots/m10-hero-idle-mira-sheets-{1x,4x}.png`, `shots/m10-hero-idle-kael-sheets-{1x,4x}.png`
(nearest skaliert; Reihen: Idle F0|F1, Walk down F0–F3, Walk up F0–F3, Walk side F0–F3),
`shots/m10-hero-idle-ist.json` (Maschinen-Befund).

### Befundliste

| Befund | Ist | Bewertung |
|---|---|---|
| Idle-Satz je Held/Richtung | 2 Frames (`player_<held>_<dir>_idle_0/1`), 6 Sätze je Held | ✅ vorhanden |
| Idle-Versatz-Pose (F0 vs F1) | 313–433 px Diff je Satz (Atem-Bob: Oberkörper 1 px runter, Laterne/Arme wandern mit) | ✅ echte Versatz-Pose, keine Dublette |
| Lauf-Dubletten | 0 in allen 6 Sätzen (2 Helden × 3 Richtungen × 4 Frames) | ✅ |
| Lauf-Rhythmik | down/up: Fußversatz −1/0/+1 px + Beinlift 2 px auf Schritt 1/3; side: 4 klare Phasen (Kontakt A/Durchschwung vor/Kontakt B/Durchschwung hinten, 2 px Vor/Zurück + 2 px Lift) | ✅ saubere Fußwechsel |
| Off-Palette-Pixel | 0 (nur Indizes 0–31, binäres Alpha) | ✅ |
| Idle F0 == Walk F0 (down/up) | Ruhepose = Kontaktpose — gängiger Pixel-Standard, kein Fehler | ℹ️ Design-Entscheidung |
| Laternen-Schwingen im Idle | Laterne hängt am Körper (`body_y + 8`), wandert mit dem Atem-Bob 1 px mit; seitliches Pendeln nur im Lauf (`swing`, side) | ✅ sparsam, kein Extra-Frame nötig |
| „Im Stand Standbild“ (Briefing-Prämisse) | veraltet: Idle läuft seit M4-02 im Spiel | ℹ️ siehe oben |

**„Wirkt steif“-Befund:** nichts — der Idle-Zyklus hat sichtbare Rhythmik (Bob-Frames
unterscheiden sich in ~10–40 % der Sprite-Pixel), der Lauf hat 4 distinkte Phasen.

Generator-Pfad bestätigt: `scripts/art/gen_chars.py` → `emit_ts("gen-chars.ts", …)`;
Idle-Zweig `fn(d, i, idle=True) for i in range(2)` (`gen_chars.py` build(), Zeile ~683).
`src/gfx/chars.ts` war **nicht** zu ändern — `PlayerFrameSet.idle` existiert bereits.

## Karte #2 — Generator-Verifikation

`python3 scripts/art/gen_chars.py` neu laufen lassen → `src/gfx/gen-chars.ts` **byte-identisch**
(`git diff --stat` leer, 18 Keys), auch die regenerierten `shots/m4-ref-*.png` unverändert
(deterministische Pipeline). Kein Fix-Bedarf aus der Befundliste:
- Idle-Pose-Satz je Held vorhanden (2 Frames: Ruhepose + Atem-Versatz), kein Generator-Edit nötig.
- Lauf-Rhythmik: keine Dubletten, side hat 4 distinkte Phasen → keine Fixes nötig.
- Palette/binäres Alpha exakt unverändert (0 Off-Palette-Pixel, Indexbereich 0–31).

Ergebnis: Karte 2 endet in Verifikation ohne Code-Änderung — bewusst kein pseudo-Ästhetischer
Tuning-Loop (Argus-Regel: kein Tuning ohne Zielmetrik; Zielmetrik bereits erfüllt).

## Karte #3 — Runtime-Verifikation (In-Game)

`scripts/m10-hero-idle.mjs` (Playwright, headless, seed=13, god mode) probiert je Held den
aktiven Texture-Key über Zeit:

| Held | Idle-Keys (stehend, 2,5 s) | Walk-Keys (ArrowRight, 1,6 s) |
|---|---|---|
| Kael | `player_kael_down_idle_0/1` (Alternanz ✅) | `player_kael_side_0..3` (Zyklus ✅) |
| Mira | `player_mira_down_idle_0/1` (Alternanz ✅) | `player_mira_side_0..3` (Zyklus ✅) |

- `shots/m10-hero-idle-ingame.json` — Key-Probierung, `UMSCHALTUNG-PROOF: true`, 0 JS-Fehler.
- `shots/m10-hero-idle-ingame-{kael,mira}-idle.gif` — Idle-Bob sichtbar (4x nearest Crop).
- `shots/m10-hero-idle-ingame-{kael,mira}-walk.gif` — 4-Frame-Laufzyklus sichtbar.
- `shots/m10-hero-idle-ingame-kael-idle-4x.png`, `...-mira-walk-4x.png` — Standbilder 4x nearest.

Kein Draw-Pfad geändert, `src/scenes/Run.ts` nur gelesen (`idlePhase`, 2 fps; `walkPhase`, 9 fps).
Anmerkung: CharSelect-Index 0 = Mira, Index 1 = Kael (Taste „2“) — im Skript dokumentiert.

## Karte #4 — Regressionstest + After-Belege

- `tests/hero-idle-frames.test.ts` (4 Tests, grün): Idle-Sätze vorhanden (2 Frames je
  Held/Richtung + PLAYER_FRAMES-Verdrahtung), Idle-Versatz ≥ 100 px (gemessen 313–433),
  0 Dubletten im 4-Richtungs-Lauf **und** Idle-vs-Walk (Idle F1 darf kein Lauf-Frame sein;
  Idle F0 == Walk F0 ist als Ruhepose = Kontaktpose erlaubt — Design-Entscheidung M4-02),
  0 Off-Palette-Pixel (nur Indizes 0–31).
- `shots/m10-hero-idle-after.json` — Zusammenfassung: 0 Lauf-Dubletten, Idle-Versatz
  313–433 px, 0 Off-Palette, Runtime-Umschaltung Kael/Mira = true, 0 JS-Fehler.
- `npm run build` grün; `npm test` grün (128 Files / 1365 Tests).
- **Fremd-Berührung (nur lesen/revertieren):** `tests/passive-stack.test.ts` schreibt bei jedem
  Lauf Timestamps in `shots/m10-passive-math-{caps,matrix}.json` (fremde Dateien). Nach dem
  Testlauf revertiert — kein Content-Diff, nur `generatedAt`.
- art-director-Urteil: siehe unten.

## art-director-Urteil (2026-11-28)

**PASS — beide Helden, je 4/5 (Abnahme ≥ 4/5 erfüllt).**
- **Idle-Paar 4,5/5:** Versatz (dx=0, dy=+1) — nach reiner 1px-Translation bleiben nur 11 px
  Restdifferenz (Mira) / 13 px (Kael) = echter Atem-Bob mit Bodenkontakt der Füße; dazu
  Glut-Wechsel der Laterne (228,87,77 → 255,215,122). Timing 2 Hz auf realDt, sauberer
  Key-Wechsel im Runtime-Sample, kein Ruckeln.
- **Lauf-Frames 4/5:** alle 12 Satz-Paare paarweise distinkt (Silhouetten-Diff 4–16 px,
  Farbdiffs 313–487 px); side zeigt 4 echte Phasen (Kontakt A → Durchschwung vorn →
  Kontakt B → Durchschwung hinten), down/up wechselseitiger Boot-Lift (Mira 2 px, Kael 1 px
  „stampfend“ — passt zur schweren Figur). Walk-Takt 9 fps rhythmisch korrekt.
- **Silhouette/Palette 4,5/5:** 0 Off-Palette-Pixel (15 Farben Mira, 23 Kael, alle aus
  palette.ts), 1-px-Ink-Kontur (nicht reines Schwarz), Licht oben-links mit ≥3 Stufen pro
  Material, Walk-up echte Rückenansicht.
- **In-Game 4/5:** beide Helden im Terrain klar lesbar, Laternen-Akzent mit Lichtkreis sichtbar.
- Nicht-blockierende Nachbesserungsidee für späteres Polierbudget: down/up F1 vs F3
  (gespiegelte Passing-Phasen) unterscheiden sich silhouettenseits nur um 6 px (Mira);
  optional Boot-Lift 2→3 px oder 1 px Fußspreizung.

## Abschluss

Alle 4 Karten committet (`#8378`–`#8381`), Abnahme erfüllt. `.lane-done` folgt als eigener Commit.
