# Lane m10-title-bestwert-spacing

**Auftrag:** art-director-Abnahme 2026-11-28 (m10-menu-quality-55), FAIL 3,8/5, Posten 6:
Bestwerte-Zeile (KAEL-Zeile) lief an die Ränder der Knopfreihe (START/OPTIONEN/CREDITS).
Ziel: >= 4 interne px Abstand, 0 Overlap, geregelt über Layout-Konstanten in `src/scenes/Title.ts`.

## Ist-Befund (K1, Vorher-Messung)

Skript `scripts/m10-title-spacing.mjs` (Vorlage `scripts/m10-menu-contrast.mjs`) misst bei
640x360@1 und 780x360@3 die internen Rects von KAEL-Zeile (PixelText-Glyphen, 5x7) und dem
obersten ui_frame-NineSlice-Rahmen unterhalb der Zeile (Knopfreihe).

Belege: `/home/ai/games/.evidence/m10-title-bestwert-spacing/m10-title-spacing-before.{json,png}`

| Format | KAEL-Rect (intern) | Rahmen-Top | Gap | Overlap |
|---|---|---|---|---|
| 640x360@1 | y 234–241 | y 248 | **7 px** | 0 |
| 780x360@3 | y 234–241 | y 248 | **7 px** | 0 |

**Einordnung:** Der beobachtete FAIL (Zeile lief in die Knopfreihe) galt dem Stand **vor** dem
Merge von `m10-menu-contrast-fixes` (dessen K5 hatte den Bestwerte-Block 5 px nach oben
geschoben, Gap 2 px → 7 px). Diese Lane macht den Abstand daher **konstant-geregelt und
absicherbar**, statt erneut zu verschieben — Textinhalte/Farben wurden nicht angefasst.

## Fix (K2)

`src/scenes/Title.ts`:
- `TITLE_STATS_BUTTON_GAP_MIN = 4` (Abnahme-Konstante, interne px)
- `TITLE_BUTTON_H = 22` (Knopfhöhe, createMenuButton-Default)
- Neue reine Funktion `titleStatsLayout()` (Muster `titleBgLayout()`): leitet `statsTop/miraY/
  kaelY/buttonsY` (167/179/189/214, unverändert zu main) und den tatsächlichen Puffer
  `statsButtonGap = (buttonsY − TITLE_BUTTON_H/2) − (kaelY + GLYPH_H)` her.
- `create()` liest die Anker aus dem Layout; Buttons bleiben exakt an ihren Ankern,
  Titelbild/Glasloch/Flammen unberührt.
- **Fremd-Datei minimal angepasst (begründet, unvermeidbar):** `tests/menu-contrast-fixes.test.ts`
  (Lane m10-menu-contrast-fixes, gemergt, keine aktive Claim-Eintragung) parste KAEL-/Knopf-y
  per Regex aus den alten handgesetzten PixelText-Aufrufen — nach dem Refactor nicht mehr
  auffindbar (Test rot). Der Test liest die Anker jetzt aus `titleStatsLayout()` (`const kaelY = …`,
  `const buttonsY = …`), gleiche Guard-Bedeutung, Logik unverändert. Nicht in meiner Claim-Liste,
  aber ohne diese Anpassung bleibt die Suite rot.

## Guard + After (K3)

- `tests/title-bestwert-spacing.test.ts` (reine Rect-Geometrie, Muster `title-bg-crisp.test.ts`):
  Gap >= 4 px und 0 Overlap in beiden Abnahme-Formaten, Puffer aus Konstanten hergeleitet,
  Anker-Regressionsschutz (167/179/189/214), Guard-Schärfe (Verschiebung unter den
  Grenzpuffer würde den Test fallen).
- After-Messung: `/home/ai/games/.evidence/m10-title-bestwert-spacing/m10-title-spacing-after.{json,png}`
  — beide Formate Gap 7 px, Overlap 0, `pass4px=true`, 0 JS-Fehler.
- Abnahme-Shots (git): `shots/abnahme/m10-title-spacing-after-640x360.png`,
  `shots/abnahme/m10-title-spacing-after-780x360.png`.

## Abnahme

- [x] 0 Overlap und >= 4 px Puffer in beiden Formaten (JSON-Beleg oben)
- [ ] art-director-Sichtung der After-Shots (Ziel >= 4/5) — ausstehend
- [x] npm test grün, npm run build rc=0

## Offene Punkte

- art-director-Re-Inspection der After-Shots steht aus; Gap ist unverändert 7 px (Bestand),
  der Mangel selbst war über den Contrast-Merge bereits visuell behoben.
