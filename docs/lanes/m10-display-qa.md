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
- [ ] **C2 / #1102 — Pixel-genau:** View je Profil gegen Formel aus `src/logic/view.ts` nachrechnen
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
