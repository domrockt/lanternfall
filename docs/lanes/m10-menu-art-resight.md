# Lane m10-menu-art-resight — Re-Sichtung Menü-Qualität nach den 7 Hebel-Fixes

Ziel: Abschluss der offenen art-director-FAIL-Note aus `m10-menu-quality-55`
(Urteil FAIL 3,8/5, Schwelle 4,5) durch **frische Sichtprüfung** auf dem Stand, in
dem alle 7 Blocking-Hebel gedeckt sind. Reine Sichtungs-Lane: **keine** Änderungen
an `src/**` oder `tests/**`; bei FAIL entsteht eine Fix-Empfehlungsliste
(Datei + Hebel + erwarteter Gewinn) als Grundlage für Folge-Jobs.

## Die 7 Blocking-Hebel und ihre Deckung

| # | Hebel (aus m10-menu-quality-55) | Datei | Gedeckt durch | Stand |
|---|---|---|---|---|
| 1 | Title-Hint-Zeilen Kontrast 2.07 | `src/scenes/Title.ts` | m10-menu-contrast-fixes (Merge `6bb2199b`, 10:27) | gemergt |
| 2 | Options-Footer Kontrast 2.72 | `src/ui/options-menu.ts` | m10-menu-contrast-fixes | gemergt |
| 3 | Options-Footer-Overlap 465 px² | `src/ui/options-menu.ts` + Title.ts | m10-menu-contrast-fixes | gemergt |
| 4 | Credits-Zeilen-Kontrast 2.73 | `src/scenes/Credits.ts` | m10-menu-contrast-fixes | gemergt |
| 5 | Pause-Build-Texte 4.15 (Index 8→12) | `src/scenes/UI.ts` | m10-ui-pause-quality (#11079) | lane-done 10:47, Merge folgt |
| 6 | KAEL-Freiraum 7 px (Bestwerte↔Knopfreihe) | `src/scenes/Title.ts` | m10-menu-contrast-fixes K5 (`57d3b56e`) | gemergt |
| 7 | Pause Icon-Spacing + Zeile-6-Puffer | `src/scenes/UI.ts` | m10-ui-pause-quality (#11080) | lane-done 10:47, Merge folgt |

## K1: Frischer Qualitäts-Scan (#11268)

- Skript: `scripts/m10-menu-quality.mjs --tag=after-resight` (unverändert von
  m10-menu-quality-55 übernommen; 5 Screens × 2 Profile `640x360@2`, `960x540@1`).
- **Scan-Stand-Komposition** (Merge `m10-ui-pause-quality` lag beim Scan noch nicht auf
  main): Der Quell-Lane-Branch basiert auf main VOR `m10-menu-contrast-fixes`
  (6bb2199b) — ein Scan dort hätte Hebel 1–4/6 falsch bewertet (Titel-Hints zeigten
  dort wieder 2.07). Die Datei-Mengen beider Fix-Lanes sind disjunkt
  (pause-quality: nur `src/scenes/UI.ts`; contrast-fixes: Title/CharSelect/Credits/
  options-menu), daher zwei Scans mit je gültigem Stand:
  - **main-Stand** (dieser Worktree, enthält contrast-fixes): Title/Options/Credits/
    CharSelect. Beleg: `~/games/.evidence/m10-menu-art-resight/m10-menu-quality-after-resight-main-scan.json`
  - **pause-Stand** (m10-ui-pause-quality @ 91931045, lane-done): Pause-Screen.
    Beleg: `.../m10-menu-quality-after-scan.json` + PNGs aus dem Branch
    (`shots/abnahme/m10-menu-quality-after-*-pause.png`).
- Ergebnisse (beide Profile identisch, Renderer Mesa Intel RPL-S, jsErrors=0):
  - title: scaleCalls=0 subpixel=0 **kontrastFails=0 overlaps=0**
  - options: 0 / 0 / **0 Fails / 0 Overlaps**
  - credits: 0 / 0 / **0 Fails / 0 Overlaps**
  - charselect: 0 / 0 / **0 Fails / 0 Overlaps**
  - pause (aus pause-Stand): scaleCalls=2 (Ambient-Fog, dekorativ) subpixel=151
    (water_ripple-Frames) **kontrastFails=2 overlaps=0** — die 2 Rest-Fails sind die
    Footer-Hints `ESC = WEITER…` (idx 8, 4.15) und `PFEILE + ENTER…` (idx 7, 2.72),
    die m10-ui-pause-quality explizit als Folgebedarf (nicht Teil der 7 Hebel)
    dokumentiert hat.

### Hebel-Abgleich 1–7

| # | Hebel | Scan-Stand | Befund |
|---|---|---|---|
| 1 | Title-Hint-Zeilen Kontrast 2.07 | main | **PASS** — title kontrastFails=0 (beide Profile) |
| 2 | Options-Footer Kontrast 2.72 | main | **PASS** — options kontrastFails=0 |
| 3 | Options-Footer-Overlap 465 px² | main | **PASS** — options overlaps=0 |
| 4 | Credits-Zeilen-Kontrast 2.73 | main | **PASS** — credits kontrastFails=0 |
| 5 | Pause-Build-Texte idx 8→12 | pause | **PASS** — Build-Texte idx 12 (Kerze, 15.28 lt. m10-ui-pause-quality); die 2 gescannten Fails sind Footer-Hints, nicht Build-Texte |
| 6 | KAEL-Freiraum 7 px | main | **PASS** — title overlaps=0 |
| 7 | Pause Icon-Spacing + Zeile-6-Puffer | pause | **PASS** — pause overlaps=0 |

- Abnahme-Shots (git): `shots/abnahme/m10-menu-art-resight-main-<profil>-<screen>.png`
  (10 Stück) + `shots/abnahme/m10-menu-art-resight-pause-<profil>-pause.png` (2).
- Beobachtung für K2: Die Pause-Footer-Hints (4.15 / 2.72) sind der einzige restliche
  Kontrast-Hebel über alle 5 Screens — falls der art-director FAIL urteilt, ist das
  der Hauptkandidat (Datei `src/scenes/UI.ts`, createPauseUI(), 2 Farbkonstanten).

## K2: art-director-Sichtung (#11269)

- (offen)

## K3: Urteil + Abschluss (#11270)

- (offen)
