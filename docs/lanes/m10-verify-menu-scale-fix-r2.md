# Lane m10-verify-menu-scale-fix-r2

Bedarfsmeldung (requests.md, 06:25Z, Lane m10-gamepad-menu-nav): verify-menus-Check
„Skalierung 2X gestellt, Fit-View zentriert" schlägt bereits an Branch-Basis fehl —
ohne Lane-Änderungen. Diagnose UND Fix in dieser Lane.

## K1 — Repro an Branch-Basis

Lauf: `node scripts/verify-menus.mjs` (Viewport 960x540, Standard), Branch
`m10-verify-menu-scale-fix-r2` = main 45896785, ohne Lane-Änderungen.

Ergebnis: **FAIL 14/15**, 0 JS-Fehler.

```
FAIL Skalierung 2X gestellt, Fit-View zentriert (center 480/270, 960x540 (erwartet 720x540))
OK   Optionen: Skalierung 2X (2)
```

Belege (außerhalb des Repos): `~/games/.evidence/m10-verify-menu-scale-fix-r2/k1-before.json`,
`k1-before-options-changed.png`, `k1-before.log`.

Zahlen aus dem Lauf: logicalView 640x360, Viewport 960x540, Canvas-Box 960x540,
Zentrum 480/270 (= Viewport-Mitte, Zentrierung also korrekt), Option `scale` = 2.

## K2 — Root Cause: Harness-Bug (veraltete Erwartung), NICHT Produkt-Bug

Die Erwartung in `scripts/verify-menus.mjs` rechnet noch die **alte 4:3-Letterbox-Regel**:
`expectW = round(min(960/480, 540/360) * 480) = 720`, `expectH = 540`.

Das Produkt (`computeView` in `src/logic/view.ts`) verhält sich seit **M10-view-fill**
(#6039/#6040, Nachzug m10-view-fill-refit #6759) dokumentiert anders — Fill-Rückfall:

- `maxFitN = floor(min(540/360, 960/480)) = 1` → fenster kann ganzzahlig max. 1x
- `setting = 2` → `n = min(2, 1) = 1 < 2` → `fillView`
- `fillView`: `scale = 540/360 = 1.5`, `width = floor(960/1.5) = 640` → logisch 640x360,
  Canvas-CSS `640 * 1.5 = 960` x `360 * 1.5 = 540` → **960x540, füllt das Fenster exakt**.

Gemessen 960x540 == Produkt-Verhalten. Diese Geometrie ist im Test
`tests/view-fill.test.ts` Zeile 13 als Produktspezifikation verankert
(`{ w: 960, h: 540, scale: 1.5, integer: false }`).

Git-Beleg zur Drift: der Check „Skalierung 2X gestellt" kam mit 87b14c78
(m10-levelup-offers, verify-menus 15/15 dort gültig) **vor** M10-view-fill; die
Fill-Änderung (46a59221, dann 8b71015f) aktualisierte view.ts + view-Tests, aber
nicht die hier duplizierte Formel im Harness → Formel-Drift, keine Produkt-Regression.

**Urteil: Harness-Bug.** Fix in `scripts/verify-menus.mjs` (K3): Erwartung auf die
verbindliche computeView-Regel umstellen (inkl. Fill-Pfad) + Gegenprobe gegen die
logische View des Spiels, damit erneute Drift auffällt. Produktcode (view.ts/scale.ts)
bleibt unverändert.

## K3 — Fix (Harness-Erwartung)

- Erwartungsformel in `scripts/verify-menus.mjs` auf computeView-Regel umgestellt
  (maxFitN → n = min(requested=2, maxFitN) → n<2: Fill `scale=H/360`, sonst ganzzahlig n).
- Zusätzliche Gegenprobe: logische View (`__game.scale.width`) muss zur selben
  Erwartung passen (Fill: 640) — driftet die Harness-Formel wieder, fällt der Check auf.

## K4 — Regression + Abnahme

- `tests/view-menu-scale.test.ts`: setting=2 → erwartete View-Geometrie
  (960x540 → Fill 640x360@1.5, CSS 960x540; 1280x720 → 640x360@2, CSS 1280x720;
  1920x1080 → 860x360@2 an MAX_WIDTH).
- verify-menus 15/15 PASS in 2 aufeinanderfolgenden Läufen: siehe Log-Ausschnitt unten.
- verify-input: unberührt (keine Änderung an Eingabepfaden).

### Abnahme-Läufe (nach Fix)

(tbd)

## Offene Punkte

- `scripts/verify-display.mjs` dupliciert die View-Formel ebenfalls und kennt den
  Fill-Pfad bislang nicht (eigene `expectedView` mit 480x360-Fit bei maxN<2). Fremde
  Datei, nicht Teil dieses Briefings — hier nur als Bedarf notiert.
