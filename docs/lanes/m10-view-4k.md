# Lane m10-view-4k — 4K/Ultrawide-Beleg (Versuch 2)

Ziel: Doms Auflösungsentscheidung („bis 4K“) für die offenen Profile 3840x2160
(dpr 1/2/3), 2560x1080 und 3440x1440 belegen. Methodik: Pixel-Scan wie
`scripts/m10-view-fill-refit.mjs` (Balken = komplett seitenhintergrundfarbene
Randspalten/‑zeilen #06070c, DOM-Canvas-Rect, Renderer-String je Messung).

**Belegpfade (nicht in git, Dom 27.11.):** `/home/ai/games/.evidence/m10-view-4k/`
- `m10-view-4k-before.json` / `m10-view-4k-before-<fmt>.png` (Vorher, 2026-11-28)
- `m10-view-4k-after.json` / `m10-view-4k-after-<fmt>.png` (Nachher)
- Renderer je Messung: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader.

## K1 Vorher-Messung (Commit: Skript + diese Doku)

| Profil | intern | Scale | ganzzahlig | Balken (L/R/O/U, Gerätepx) | Crop/Overflow | pass |
|---|---|---|---|---|---|---|
| 3840x2160@1 | 640x360 | 6 | ja | 0/0/0/0 | nein | ✅ |
| 3840x2160@2 | 640x360 | 12 | ja | 0/0/0/0 | nein | ✅ |
| 3840x2160@3 | 640x360 | 18 | ja | 0/0/0/0 | nein | ✅ |
| 2560x1080@1 | 853x360 | 3 | ja | **1**/0/0/0 | nein | ❌ |
| 3440x1440@1 | 860x360 | 4 | ja | 0/0/0/0 | nein | ✅ |

4K ist in allen drei dpr-Stufen exakt (n = 6/12/18, Spielfeld deckt 100 %).
3440x1440 trifft exakt das Breiten-Maximum: 860 x 4 = 3440 Gerätepx, 0 Balken.
JS-Fehler: 0 in allen 5 Läufen.

## K2 Befund zum einzigen Mangel (2560x1080@1)

Beobachtung: interne Breite 853 x Scale 3 = 2559 Canvas-Gerätepx bei 2560
Gerätepx Breite → 1 Gerätepx Restspalte (links, da das zentrierte Canvas bei
CSS-x = 0.5 liegt und die Randspalte dort zu Seitenhintergrund verblurrt).

Analyse (in `src/logic/view.ts` nachprüfbar, `computeView`):
- Ganzzahliger Scale ist Abnahmekriterium → n = deviceHeight/360 = 3 (1080/360),
  Alternativen n=2 (Breite 1280 > MAX_WIDTH 860 → riesige Balken) scheiden aus.
- Bei festem n = 3 gilt: Canvas deckt exakt `width * 3` Gerätepx. 2560 ist nicht
  durch 3 teilbar → `width * 3` ist entweder 2559 (Restspalte/Balken) oder
  2562 (Overflow/Crop). **„0 Balken“ und „0 Crop“ sind bei ganzzahligem Scale
  mathematisch nicht gleichzeitig erreichbar.**
- `computeView` wählt bereits die richtige Seite des Trade-offs:
  `width = min(MAX_WIDTH, max(MIN_WIDTH, round(deviceWidth/n)), floor(deviceWidth/n))`
  — für 2560x1080 greifen die Klemmen nicht (480 < 853 < 860), es fällt die
  floor-Wahl heraus: 853 → Defizit statt Crop (Crop würde Spielfeld-Inhalt
  abschneiden, die Restspalte zeigt nur Seitenhintergrund).
- Der Bruchteil-Offset (Canvas bei x = 0.5 CSS = 0.5 Gerätepx) entsteht durch
  die Zentrierung im Seiten-Layout, nicht durch die View-Rechnung: eine
  Korrektur (Gerätepixel-Snap des Canvas-Rect) läge in `src/main.ts` /
  `index.html` und ist außerhalb des Lane-Bereichs.

**Ergebnis K2: kein Code-Fix in `src/logic/view.ts` gerechtfertigt.** Der
einzige belegte Mangel ist (a) mathematisch unvermeidbar bei ganzzahligem Scale
und (b) in seiner Darstellung (Snap der Restspalte nach rechts statt Verblurren
links) nur außerhalb des Bereichs fixbar → Bedarfsmeldung in
`/home/ai/games/.dispatch/requests.md`. 2560x1080@1 ist damit ein
**dokumentiert eingeschränktes Profil**: ganzzahliger Scale, 0 Crop, 0
Overflow, Defizit exactly 1 Gerätepx (0,04 % der Breite).

**Commit #10985 (K2).** Bedarfsmeldung (2026-11-28T~10:40Z) in `/home/ai/games/.dispatch/requests.md`
eingetragen: Canvas-Gerätepixel-Snap in `src/main.ts`/`index.html` (Restspalte
nach rechts snappen statt links zu verblurren). `src/logic/view.ts` bleibt
nicht geändert — Begründung siehe oben (Trade-off bereits optimal, Restspalte
mathematisch unvermeidbar).

## K3 Regressionsschutz

`tests/view-4k.test.ts`: Guard über computeView (reine Funktion, gleiche
Invarianten wie der Pixel-Scan):
- alle 5 neuen Profile: ganzzahliger Scale, kein Overflow (`width*n <= deviceWidth`),
  kein Crop, Defizit `deviceWidth - width*n == 0` bzw. == 1 Gerätepx für 2560x1080@1
  (dokumentierte Schranke: Defizit < n),
- die 7 Bestandsprofile aus view-fill-refit (640x360@1 … 780x360@3) bleiben
  unverändert (gleiche intern/Scale-Werte wie im refit-Beleg).

## K4 Nachher-Messung

`m10-view-4k-after.json` (gleicher Lauf-Generator, Renderer Mesa RPL-S, 0
JS-Fehler): identisch zum Vorher-Stand — erwartbar, da K2 kein Code-Fix in
`src/logic/view.ts` gerechtfertigt hat und der Verhaltenstragende Code
unverändert blieb.

| Profil | intern | Scale | ganzzahlig | Balken | pass |
|---|---|---|---|---|---|
| 3840x2160@1 | 640x360 | 6 | ja | 0 | ✅ |
| 3840x2160@2 | 640x360 | 12 | ja | 0 | ✅ |
| 3840x2160@3 | 640x360 | 18 | ja | 0 | ✅ |
| 2560x1080@1 | 853x360 | 3 | ja | 1 (Restspalte, dokumentiert) | ⚠️ eingeschränkt |
| 3440x1440@1 | 860x360 | 4 | ja | 0 | ✅ |

## Abnahme-Fazit

- **4K (3840x2160, dpr 1/2/3): voll abgenommen** — ganzzahlige Stufen 6/12/18,
  0 Balken, 0 Crop, 0 JS-Fehler. Doms „bis 4K“ ist für 16:9 belegt.
- **3440x1440 (21:9-1440p): voll abgenommen** — 860x360 @ 4x füllt exakt.
- **2560x1080@1: eingeschränkt abgenommen mit Begründung** — ganzzahliger
  Scale (3), 0 Crop, 0 Overflow; 1 Gerätepx Restspalte (0,04 % der Breite) ist
  bei ganzzahligem Scale mathematisch unvermeidbar (2560 % 3 ≠ 0, Beweis im
  Guard-Test `tests/view-4k.test.ts`). Verbesserung des Kantensnaps als
  Bedarf in `/home/ai/games/.dispatch/requests.md` gemeldet (main.ts/index.html,
  außerhalb des Lane-Bereichs).
- Regressionsschutz: `tests/view-4k.test.ts` (23 Tests) grün; bestehende
  view-Tests (view.test.ts, view-fill.test.ts, view-width.test.ts,
  view-menu-scale.test.ts, 40 Tests) unverändert grün.
- Abweichung vom Briefing-Ziel „5/5 Profile 0 Balken“: 1 Profil
  (2560x1080@1) erfüllt 0 Balken bei ganzzahligem Scale physikalisch nicht;
  laut K4-Vorgabe („eingeschränkte Profile + Begründung“) dokumentiert statt
  den Guard-Test zu verbiegen.
