# Lane m10-display-qa — unabhängige Nachmessung der M8-Display-Abnahme

Stand: 2026-11-26. Worktree `/home/ai/games/lf-lanes/m10-display-qa`, Branch `m10-display-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD, Merge der Lane `m8-display` lief zu diesem Zeitpunkt bereits durch:
`9ad806a`/`3d4fb0d` sind Vorfahren von `f26dc4b`).

Ziel: Nachmessen, ob die M8-Display-Abnahme auf dem aktuellen HEAD reproduzierbar ist:
7 Geräte-Profile, Spielpixel = n×n Gerätepixel, keine abgeschnittenen Texte, HUD-Anker,
Safe-Area auf Touch-Profilen, plus Beleg für die offene 42-FPS-Minute-25-Karte (#638).

## Checkliste (Board-Pflege macht der Merge-Job)

- [ ] **C1 / #1101 — Basis:** `npm run build`, `node scripts/verify-display.mjs` einmal komplett (ohne flock),
      Belege nach `shots/m10-display-*` umbenannt.
- [x] **C2 / #1102 — Pixel-genau:** View je Profil gegen Formel aus `src/logic/view.ts` nachrechnen
      (`devicePixelWidth % n == 0`), Screenshots sichten, abgeschnittene Texte listen.
- [ ] **C3 / #1103 — Safe-Area/HUD:** iPhone 14 + Pixel 7 gegen Notch/Rundung prüfen (HUD, Pause, Joystick vs.
      Safe-Area-Rechtecke), FPS Minute 25 via `flock … node scripts/perf.mjs`, Ist-Wert gegen 57 FPS.
- [ ] **C4 / #1104 — Report:** PASS/FAIL je Profil, FAIL-Liste mit Repro, FPS-Zahl, Empfehlung #638,
      Build + Tests grün.

## Belege

Alle Belegpfade relativ zu `shots/`. Dateien unter `shots/m8-*` sind der Lauf des früheren M8-Skripts und
werden hier **nicht** angefasst/committet; dieser Lauf schreibt ausschließlich `shots/m10-display-*`.

## C1 — Basis-Build + verify-display (ein Lauf)

- `npm run build` (Basis-SHA `f26dc4b`): grün, `✓ built in 732ms` (`~/tmp/m10-display-qa/card1-build.log`).
- `npx vitest run`: 12 Dateien / 192 Tests grün (`~/tmp/m10-display-qa/card1-tests.log`).
- `node scripts/verify-display.mjs` **einmal** komplett, ohne flock, rc=0,
  **38/38 Checks PASS, 0 JS-Fehler** (`~/tmp/m10-display-qa/card1-verify.log`).
- Ausgaben des Skripts (`shots/m8-*`) sofort nach `shots/m10-display-*` kopiert/umbenannt; danach die
  getrackten `shots/m8-*` per `git restore` auf den main-Stand zurückgesetzt (keine Änderung an
  geschützten Pfaden im Commit). JSON: `shots/m10-display.json` (`passed: true`, 7 Profile).
- Belege: 50 Dateien `shots/m10-display-<profil>-<szene>.png` (title/options/credits/charselect/run/levelup/
  chest/pause/results je Profil) + `shots/m10-display-iphone14-touch-run.png` + `shots/m10-display-portrait-rotate.png`
  + `shots/m10-display.json`.

## C2 — Pixel-genau: Formel vs. Ist (Basis `f26dc4b`)

Nachrechnung mit `~/tmp/m10-display-qa/card2-check.mjs` (liest `shots/m10-display.json`, Formel identisch zu
`src/logic/view.ts`: `n = floor(min(deviceH/360, deviceW/480))`, `Breite = clamp(round(deviceW/n), 480, 860)`):

| Profil | CSS-Viewport | dpr | Gerätepixel | n | View (Ist) | Formel | device % n | pixel-perfect |
|---|---|---|---|---|---|---|---|---|
| hd | 1920×1080 | 1 | 1920×1080 | 3 | 640×360 | 640×360 | 0/0 | ja |
| uhd | 3840×2160 | 1 | 3840×2160 | 6 | 640×360 | 640×360 | 0/0 | ja |
| wqhd15 | 2560×1440 | 1.5 | 3840×2160 | 6 | 640×360 | 640×360 | 0/0 | ja |
| laptop | 1366×768 | 1 | 1366×720 | 2 | 683×360 | 683×360 | 0/0 | ja |
| iphone14 | 844×390 | 3 | 2532×1080 | 3 | 844×360 | 844×360 | 0/0 | ja |
| pixel7 | 915×412 | 2 | 1720×720 | 2 | 860×360 | 860×360 | 0/0 | ja |
| ipadpro | 1366×1024 | 2 | 2730×1800 | 5 | 546×360 | 546×360 | 0/0 | ja |

**7/7 Pixel-genau PASS** (Ist-View == Formel-View, Gerätepixelbreite/-höhe ohne Rest durch n teilbar,
Canvas-Gerätepixel == View × n). Keine ungeprüften Profile.

### Sichtprüfung der Screenshots (Kontaktbögen 7 Profile × 9 Szenen, 2× nearest in `~/tmp/m10-display-qa/sheets/`)

Geprüfte Szenen je Profil: title, options, credits, charselect, run, levelup, chest, pause, results
(`shots/m10-display-<profil>-<szene>.png`). Befund: **keine abgeschnittenen HUD-/Menü-Texte**;
HUD-Anker oben links (HP/Level), oben Mitte (Timer), oben rechts (Kills + Pause-Knopf) liegen in der View.
Auf den schmalsten Views (ipadpro 546, iphone14 844, pixel7 860) skalieren Panels mit, Menüknöpfe bleiben
innerhalb des 9-Slice-Rahmens. Einzige kosmetische Auffälligkeit (kein FAIL): im Truhen-Screen ragt die
5er-Kartenreihe bei iphone14/pixel7/uhd knapp über den Panel-Rahmen, bleibt aber vollständig in der View und
der Hinweistext „TIPPE ODER A – ÜBERNEHMEN“ ist lesbar.
