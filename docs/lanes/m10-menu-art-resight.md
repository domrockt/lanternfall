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

## K1: Frischer Qualitäts-Scan auf main (#11268)

- Skript: `scripts/m10-menu-quality.mjs --tag=after-resight` (unverändert von
  m10-menu-quality-55 übernommen; 5 Screens × 2 Profile `640x360@2`, `960x540@1`).
- Scan-Stand: main inkl. Merge von m10-ui-pause-quality — Wird nach Merge-Abschluss
  befüllt (siehe unten).
- Ergebnisse: (K1 läuft noch / befüllt nach Scan)

## K2: art-director-Sichtung (#11269)

- (offen)

## K3: Urteil + Abschluss (#11270)

- (offen)
