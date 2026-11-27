# Lane m10-palette-guard — harter Regressionsschutz für Pixelqualität

Basis: Worktree `/home/ai/games/lf-lanes/m10-palette-guard`, Branch `m10-palette-guard`,
Basis-SHA `3a89f67`. Ziel: Ein Test, der bei jedem `npm test` beweist, dass alle
Sprite-/Effekt-Grids ausschließlich Palettenfarben aus `src/palette.ts` (32 Farben)
mit binärem Alpha enthalten. Damit kann keine spätere Lane versehentlich
Anti-Aliasing oder Off-Palette-Töne einschleusen. Keine Grafik wurde neu gestaltet,
keine Fremddatei (`src/gfx/gen-*.ts`, `textures.ts`, `enemySprites.ts`) geändert.

## Ergebnis in einer Zeile

**320 statische Grids/Frames + 138 numerische Gegner-/Boss-Frames = 458 geprüfte
Assets, 432.418 Pixel im Baseline-Lauf, davon 0 Off-Palette und 0 Alpha-Verstöße.**

## Komponenten

| Datei | Zweck |
|---|---|
| `scripts/art/palette-check.mjs` | Messskript: lädt alle Grids über den Vite-SSR-Loader (wie `scripts/acceptance-count.mjs`), zählt je Grid Pixel gesamt, Off-Palette, Alpha ∉ {0,255} (sofern Alpha-Felder vorhanden), Farbanzahl und Transparenz-Anteil. Schreibt `shots/m10-palette-guard-baseline.json` und druckt die Top-10-Verstöße mit Datei/Grid. Die Analysefunktionen sind exportiert, damit der Test exakt dieselbe Logik nutzt. |
| `tests/palette-compliance.test.ts` | Vitest-Guard: prüft alle Zeichen-Grids (`SPRITE_GRIDS`, `GEN_*`), die numerischen Pixel-Grids aus `enemySprites.ts` und die vom Canvas erzeugten FX-Farben. Klare Fehlermeldung mit Datei, Grid, Pixelindex, Koordinate und Zeichen/Farbe. Enthält Negativprobe und Laufzeit-Assert (< 2 s). |
| `scripts/art/palette-check.d.mts` | Typdeklaration für den Import des `.mjs`-Messskripts im Test (tsc bleibt grün). |

## Invariante und Messverfahren

- Gültig ist ein Pixel nur, wenn es transparent (`.`) oder ein Zeichen `0-9`/`a-v`
  ist, das auf Palettenindex 0–31 abbildet. Andere Zeichen (`w`–`z`, Leerzeichen,
  Sonderzeichen) sind Off-Palette.
- Die Zeichen-Grids kennen kein Alpha-Feld — nur `.` oder einen Index. Halbtransparenz
  ist damit per Konstruktion ausgeschlossen; das JSON weist `hasAlphaField: false` aus.
- FX-Texturen werden über einen Fake-Canvas eingefangen (`fillStyle`-Hexwerte) und
  gegen die echten `PAL`-Farbwerte geprüft; gesetzte `globalAlpha`-Werte außerhalb
  {0,1} würden als Alpha-Verstoß zählen.
- Numerische Grids (`(number|null)[][]`) müssen ganzzahlige Indizes 0–31 oder `null`
  enthalten; `32`, negative Werte, Floats und `NaN` sind Off-Palette.

## Baseline (Ist-Stand, `shots/m10-palette-guard-baseline.json`)

| Quelle | Assets/Frames | davon off-palette | Alpha-Verstöße |
|---|---:|---:|---:|
| `src/gfx/textures.ts` (`SPRITE_GRIDS`) | 23 | 0 | 0 |
| `src/gfx/gen-enemies.ts` | 120 | 0 | 0 |
| `src/gfx/gen-bosses.ts` | 18 | 0 | 0 |
| `src/gfx/gen-chars.ts` | 42 | 0 | 0 |
| `src/gfx/gen-icons.ts` | 18 | 0 | 0 |
| `src/gfx/gen-props.ts` | 15 | 0 | 0 |
| `src/gfx/gen-title.ts` | 1 | 0 | 0 |
| `src/gfx/gen-ui.ts` | 2 | 0 | 0 |
| `src/gfx/gen-fx.ts` (FX-Texturen) | 81 | 0 | 0 |
| **Summe statisch** | **320** | **0** | **0** |

Gesamtpixel: **432.418**, opaque **256.689**, transparent **40,64 %**.
Die Test-Suite prüft zusätzlich 138 numerische Frames aus `enemySprites.ts`
(30 Gegner- und 6 Boss-Motive mit mehreren Frames) → **458 Assets** im Test.

## Ausnahmeliste

**Leer.** Es gibt auf dem Basisstand keine echten Off-Palette- oder Alpha-Verstöße.
Es musste nichts ausgenommen werden; der Guard läuft über alle Assets scharf.

## Befund (gemeldet, nicht gefixt — Fremddateien)

Drei FX-Texturen sind **vollständig transparent** (0 opaque Pixel) und damit im
Spiel unsichtbar. Sie sind keine Palette-Verstöße, aber ein VFX-Fund für die
zuständige Lane (`src/gfx/gen-fx.ts` bleibt hier unangetastet):

| Datei | Textur | Raster | opaque |
|---|---|---|---:|
| `src/gfx/gen-fx.ts` | `fx_smear` (Frame 0) | 44×16 | 0 |
| `src/gfx/gen-fx.ts` | `fx_smear_2` (Frame 1) | 44×16 | 0 |
| `src/gfx/gen-fx.ts` | `fx_death_blob` (Frame 0) | 9×9 | 0 |

Ursache (belegt): `smearFrame(0/1)` hat einen zu schmalen Winkelbogen, der den
Radius-Band nicht schneidet; `deathFrame("blob", 0)` schaltet den einzigen
Zentralpixel per Modulo-Bedingung aus. Empfehlung: eigene VFX-Karte, nicht Teil
dieses Guards.

## Befehle und Belege

```bash
# Messung + Baseline
node scripts/art/palette-check.mjs      # -> shots/m10-palette-guard-baseline.json
# Gezielter Guard
npx vitest run tests/palette-compliance.test.ts
# Volle Suite
npm test
# Build
npm run build
```

Gemessene Werte (Basis `3a89f67`):

- `node scripts/palette-check.mjs`: rc=0, 320 Assets, 432.418 Pixel, **0 off-palette**, **0 alpha**.
- `npx vitest run tests/palette-compliance.test.ts`: **4/4 Tests grün**, Guard-Laufzeit
  **25,0 ms** (Assert < 2 s), gesamte Datei 273 ms.
- `npm test`: **291/291 Tests grün** in 26 Dateien, 1,79 s (vor der Lane: **287** Tests
  → +4 durch den Guard).
- `npm run build`: rc=0, `✓ built in 828ms`.

## Negativprobe (Regressionsschutz)

1. Im Testfile: `analyzeGrid("negativ-probe", …, ["0z0"], …)` liefert `offPalette: 1`
   mit Koordinate (1,0), Index 1, Zeichen `z`; der echte Guard-Assert
   (`expectPaletteClean`) wirft dann `/off-palette|Palette/`. Ebenso wird ein
   numerischer Index `32`/`PAL.length` als Verstoß erkannt.
2. Zusätzlicher Lauf `node ~/tmp/m10-palette-guard/negativprobe.mjs` lädt die echten
   Grids, setzt `player_mira[0][0]` auf `z` und beendet mit **rc=1**:
   `{"offPalette":1,"violations":[{"x":0,"y":0,"index":0,"char":"z","reason":"off-palette"}]}`.

Damit ist belegt: Der Guard ist nicht leer — ein einziger falscher Farbwert macht
ihn rot.

## Abnahme

- [x] `npm test` enthält den neuen Guard und ist grün (291/291, +4).
- [x] Guard-Laufzeit < 2 s (25,0 ms gemessen, Assert im Test).
- [x] Baseline-JSON mit Off-Palette-Zahl im Commit (0, belegt).
- [x] Negativprobe macht den Guard rot (Testfall + externer rc=1-Beleg).
- [x] `npm run build` grün.
- [x] Keine Änderung an `src/gfx/gen-*.ts`, `textures.ts` oder `enemySprites.ts`.
