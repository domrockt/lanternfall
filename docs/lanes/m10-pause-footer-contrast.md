# Lane m10-pause-footer-contrast (2026-11-28)

Abschluss des art-director-FAIL-Tracks aus `m10-menu-art-resight` (Urteil dort:
FAIL 4,4/5, Schwelle 4,5; einziger messbarer Rest: die 2 Pause-Footer-Hints in
`src/scenes/UI.ts` `createPauseUI()`). Kleinstmögliche Änderung: **nur die 2
Farbkonstanten**, kein Layout-/Texteingriff (Optik-Freeze Dom 2026-11-28 10:00Z).

## Karten

| Karte | Inhalt | Status |
|---|---|---|
| #11602 | Farbfix + Scan (K1) + Guard (K2) | done, Commit `dda564a7` |
| #11603 | Abnahme-Shots + art-director-Sichtung (K3) | siehe unten |
| #11604 | Lane-Doku + `.lane-done` (K4) | siehe unten |

## Änderung (K1)

`src/scenes/UI.ts`, `createPauseUI()` — nur 2 Farbargumente:

| Zeile | Text | Vorher | Nachher |
|---|---|---|---|
| 1 | `ESC = WEITER - O = OPTIONEN - Q = AUFGABE` | `C.mist` (idx 8, #6B7C86) — WCAG **4,15** | `C.paleMist` (idx 9, #8FA0A6) — **≈ 6,6** |
| 2 | `PFEILE + ENTER ODER MAUS` | `C.fog` (idx 7, #4E5F6E) — WCAG **2,72** | `C.bone` (idx 10, #B8C4C2) — **≈ 10,0** |

- Gegen Panel #101724 (Panel unverändert). Vorher-Werte sind die gemessenen
  Medians des resight-Scans (beide Profile identisch, Median = Worst-Case);
  das Briefing nannte 4,22 für Zeile 1 — der Scan (`m10-menu-quality-after-resight-scan.json`,
  beide Profile) misst 4,15, der Test-Guard rechnet mit dem gemessenen Wert.
- Hebung exakt im Muster der akzeptierten Menü-Footer-Fixes
  (`m10-menu-contrast-fixes`): Dunst-Zeilen → `paleMist`, Nebel-Zeilen → `bone`.
  Zeile 2 ist damit heller als Zeile 1 — gleiche Hierarchie-Umkehr wie bei den
  bereits abgenommenen Title/Options/Credits-Footern.

## K1: Scan-Beleg

`node scripts/m10-menu-quality.mjs --tag=after-pause-footer` im **Lane-Stand**
(Worktree `m10-pause-footer-contrast`, Fix enthalten — der Fix war zum
Messzeitpunkt noch nicht auf main, daher Worktree statt Haupt-Repo; Skript und
Profilidentisch zu resight):

- **pause: kontrastFails=0** in BEIDEN Profilen (640x360@2 und 960x540@1);
  title/options/credits/charselect ebenfalls 0 Fails (keine Regression).
- Overlaps weiterhin 0, **jsErrors=0** (beide Profile).
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` —
  **kein SwiftShader** (Dom-Wunsch 2026-11-28 19:20Z, SwiftShader-Messungen ungültig).
- Belege (außerhalb des Repos):
  - `~/games/.evidence/m10-pause-footer-contrast/m10-pause-footer-contrast-after-scan.json`
  - `~/games/.evidence/m10-pause-footer-contrast/m10-menu-quality-after-{640x3602,960x5401}-pause.png` (Roh-Shots)

## K2: Test-Guard

`tests/menu-contrast-fixes.test.ts`: beide Pause-Footer-Zeilen in `LINES`
aufgenommen (Muster der bestehenden 13 Menü-Kontrast-Guards: Vorher-Median
zurückgerechnet auf Backdrop-Luminanz, Neuer Index ≥ 4,5, Quell-Check auf
`C.paleMist`/`C.bone`). `npm test`: **2157 Tests grün** (inkl.
`npx tsc --noEmit` und `npm run build` rc=0, Log
`~/tmp/m10-pause-footer-contrast/k1-build.log`).

**Fremd-Datei (Anfrage gestellt):** `tests/ui-pause-quality.test.ts` pinnte die
Hinweiszeilen aus dem Scope der Quell-Lane `m10-ui-pause-quality` auf
`C.mist`/`C.fog`. Genau dieser Folge-Fix ist diese Lane — der Guard wurde auf
`C.paleMist`/`C.bone` aktualisiert (Verdrahtungs-Check bleibt). Anfrage:
`/home/ai/games/.dispatch/requests.md` (Eintrag 2026-11-28T11:34Z).

## K3: Abnahme-Shots + art-director

- `shots/abnahme/m10-pause-footer-contrast-640-pause.png` (2560x1440, 2x-nearest)
- `shots/abnahme/m10-pause-footer-contrast-960-pause.png` (1920x1080, 2x-nearest)

art-director-Sichtung NUR des Pause-Screens, Ziel ≥ 4,5 (Abschluss des
FAIL-Tracks m10-menu-quality-55): siehe Urteil unten.

### art-director-Urteil (#11603)

> **PASS 4,7/5** (Schwelle 4,5) — 2026-11-28, Sichtung beider Abnahme-Shots
> (bereits 2x-nearest) gegen den Vorher-Shot des resight-Scans:
> - **Footer-Lesbarkeit (Hauptkriterium):** beide Zeilen in beiden Profilen klar
>   und mühelos lesbar; Zeile 2 war vorher kaum vom Panel abgehoben (2,72),
>   jetzt „der größte Sprung". Kein Clipping, keine Überlappung.
> - **Hierarchie/Farbton:** `paleMist`/`bone` bleiben kühlgraue Panel-Töne aus
>   derselben Familie wie Item-Text — kein Golden-Overreach; Rangfolge
>   Titel (Gold) → Header (Gold) → Item-Text → Buttons → Footer bleibt intakt.
>   Nicht-blockierende Anmerkung: Zeile 2 ist jetzt marginal heller als Zeile 1
>   (semantisch umgekehrt logischer) — wie bei den bereits abgenommenen
>   Menü-Footern, kein Nachbesserungs-Zwang.
> - **Gesamteindruck:** Panel sauber, Nineslice tadellos, keine Mixel/Subpixel-
>   Artefakte im UI (151 Subpixel = Wasser-Ripples im Run-Layer). Out-of-scope-
>   Punkte („SEELENLEU/CHTFEUER", „PHOENIXSCHWARM" ohne Ö) nur leicht gewichtet.
> - **muss neu: nichts. nachbessern: nichts in diesem Scope.**
>
> **Damit ist der art-director-FAIL-Track aus m10-menu-quality-55 abgeschlossen.**

## K4: Fazit

- Beide Pause-Footer-Hints ≥ 4,5 WCAG (6,6 / 10,0), Scan 0 Fails in beiden
  Profilen, Renderer-Beleg Mesa Intel RPL-S.
- Optik-Freeze eingehalten: 2 Farbkonstanten in `UI.ts` + 2 Test-Guards,
  sonst nichts.
- Nicht in dieser Lane (bewusst): kosmetische Options-960-Nineslice-Kante
  (~2–3 px helles Rechteck, dokumentiert in der resight-Lane-Doku); Font-Ö
  und Wortumbruch der Build-Spalten (Folge-Bedarf, siehe oben).
