# Lane m10-display-qa — unabhängige Nachmessung der M8-Display-Abnahme

Stand: 2026-11-26. Worktree `/home/ai/games/lf-lanes/m10-display-qa`, Branch `m10-display-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD, Merge der Lane `m8-display` lief zu diesem Zeitpunkt bereits durch:
`9ad806a`/`3d4fb0d` sind Vorfahren von `f26dc4b`).

Ziel: Nachmessen, ob die M8-Display-Abnahme auf dem aktuellen HEAD reproduzierbar ist:
7 Geräte-Profile, Spielpixel = n×n Gerätepixel, keine abgeschnittenen Texte, HUD-Anker,
Safe-Area auf Touch-Profilen, plus Beleg für die offene 42-FPS-Minute-25-Karte (#638).

## Checkliste (Board-Pflege macht der Merge-Job)

- [x] **C1 / #1101 — Basis:** `npm run build`, `node scripts/verify-display.mjs` einmal komplett (ohne flock),
      Belege nach `shots/m10-display-*` umbenannt.
- [x] **C2 / #1102 — Pixel-genau:** View je Profil gegen Formel aus `src/logic/view.ts` nachrechnen
      (`devicePixelWidth % n == 0`), Screenshots sichten, abgeschnittene Texte listen.
- [x] **C3 / #1103 — Safe-Area/HUD:** iPhone 14 + Pixel 7 gegen Notch/Rundung prüfen (HUD, Pause, Joystick vs.
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

## C3 — Safe-Area/Touch-Profile + FPS Minute 25 (Basis `f26dc4b`)

Messskript: `~/tmp/m10-display-qa/card3-safearea.mjs` (Chromium emuliert die Insel per
`Emulation.setSafeAreaInsetsOverride`; `getComputedStyle(body).padding` spiegelt die Insets,
kein Quellcode geändert). Rohwerte: `shots/m10-display-safearea.json`.
Belege: `shots/m10-display-iphone14-safearea.png`, `shots/m10-display-pixel7-safearea.png`
(Joystick während des Haltens sichtbar).

Angenommene Safe-Area-Rechtecke (CSS px, dokumentierte Gerätewerte):
- **iPhone 14 quer:** links 47, rechts 47, unten 21 (Notch + Home-Indikator).
- **Pixel 7 quer:** rundum 12 (Punch-Hole mittig, keine Seiten-Notch; 12 px Rundungs-Reserve).

| Profil | View | Canvas (CSS) | HUD/HP links | Kills rechts | Pause rechts | Joystick | Urteil |
|---|---|---|---|---|---|---|---|
| iphone14 | 844×360 | x=0, w=844 | x=5 (<47) | 839 (>797) | 834 (>797) | 76–164 (ok) | **FAIL** |
| pixel7 | 860×360 | x=28, w=860 | 33 (>12) | 867 (<903) | 862 (<903) | 104–192 (ok) | **PASS** |

**iPhone 14: FAIL — HUD liegt in der Notch-Zone.** `body` bekommt zwar das Safe-Area-Padding
(`index.html:32-33`, gemessen `padding: 0px 47px 21px`), aber der Canvas ist mit `cssWidth = 844`
breiter als die Content-Box (844 − 94 = 750) und wird bei x=0 full-bleed gerendert. HP-Leiste/Level
(x=5) und Kills/Pause (rechte Kante 834–839) ragen damit in die 47-px-Notch-/Rundungszonen.
Repro: `node ~/tmp/m10-display-qa/card3-safearea.mjs`, Werte im JSON oben.
**Pixel 7: PASS** — Canvas sitzt durch das Padding bei x=28..888, alle HUD-Anker haben ≥20 px
Abstand zu den Rundungen.

Empfehlung für die Engine-/UI-Karte (nicht Teil dieser Lane): Safe-Area-Insets beim Setzen der
Canvas-CSS-Größe abziehen (`src/main.ts:88-106` `applyView`/CSS statt `width*n/dpr`) oder die
HUD-Offsets (`src/scenes/UI.ts:91-102`) und `PAUSE_MARGIN` (`src/input/TouchControls.ts:15`) um
`env(safe-area-inset-*)` verschieben; alternative wäre ein Wrapper mit `padding` + `width:100%`.

### FPS Minute 25 (offene Karte #638)

`flock /home/ai/games/.lf-perf.lock node scripts/perf.mjs --viewport 780x360 --dpr 3 --tag m10-638`
(synchron, ohne Polling; Log `~/tmp/m10-display-qa/card3-perf.log`):

| Phase | FPS (roh) | Frames / Messdauer | gemessene Roll-FPS | Gegner min | Ziel | Urteil |
|---|---|---|---|---|---|---|
| Burst 500 | 59,5 | 596 / 10,013 s | 57,9 | 500 | ≥55 | PASS |
| Minute 25 | **39,5** | **396 / 10,021 s** | 41,0 | 300 | ≥55 (Referenz 57) | **FAIL** |

Beleg: `shots/m10-display-perf-minute-25.json` (umbenannt aus `shots/perf-m3m10-638.json`, Original gelöscht).
Ergebnis bestätigt die M8-Messung (40,2 FPS): Minute 25 bleibt mit **39,5 FPS** klar unter dem
55-FPS-Ziel und unter der 57-FPS-Referenz; `jsErrors: 0`. Ursache ist weiterhin die hohe
Gerätepixel-Fläche (780×360 @ dpr 3 → 2340×1080) — Empfehlung siehe Report (C4).

Kontrolllauf derselben View mit `--dpr 1` (`shots/m10-display-perf-minute-25-dpr1.json`): Burst 60,1 FPS,
Minute 25 **54,5 FPS** (546 Frames / 10,026 s) — also +15 FPS gegenüber dpr 3. Das stützt die Annahme,
dass die Gerätepixel-/CSS-Fläche (2340×1080 statt 780×360) der Haupttreiber ist; selbst bei 480×360 bleibt
Minute 25 knapp unter dem 55-Ziel.

## C4 — Report: PASS/FAIL je Profil (Basis `f26dc4b`)

Bewertet wurden alle 7 Profile (View/Pixel-genau, Text-Cutoff, HUD-Anker) plus die Touch-Safe-Area
für iphone14 und pixel7. Kriterium „PASS“ = keine Abweichung in den gemessenen Punkten.

| Profil | View/Pixel-genau | Text-Cutoff | HUD-Anker | Safe-Area | Urteil |
|---|---|---|---|---|---|
| hd | PASS 640×360, n=3 | PASS | PASS | n/a (Desktop) | **PASS** |
| uhd | PASS 640×360, n=6 | PASS | PASS | n/a (Desktop) | **PASS** |
| wqhd15 | PASS 640×360, n=6 | PASS | PASS | n/a (Desktop) | **PASS** |
| laptop | PASS 683×360, n=2 | PASS | PASS | n/a (Desktop) | **PASS** |
| iphone14 | PASS 844×360, n=3 | PASS | PASS (in View) | **FAIL (Notch-Zone)** | **FAIL** |
| pixel7 | PASS 860×360, n=2 | PASS | PASS | PASS | **PASS** |
| ipadpro | PASS 546×360, n=5 | PASS | PASS | n/a (Desktop) | **PASS** |

**Lane-Urteil: 6/7 Profile PASS, iphone14 FAIL (Safe-Area); #638 (Minute-25-FPS) bleibt FAIL.**
Die 38/38-Checks von `verify-display.mjs` sind reproduziert (0 JS-Fehler), decken aber die
Notch-Überdeckung nicht ab — dort wird nur `textsInView` gegen die Canvas-View geprüft, nicht gegen
die Safe-Area des Geräts.

### FAIL 1 — iphone14: HUD unter der Notch-Zone

- **Symptom:** HP-Leiste/Level-Text beginnen bei x=5 CSS-px, Kills/Pause enden bei x≈834–839 in
  einem 844-px-Viewport. Das iPhone-14-Querformat hat links/rechts je 47 px Safe-Area.
- **Repro:** `node ~/tmp/m10-display-qa/card3-safearea.mjs` → `shots/m10-display-safearea.json`,
  Profil `iphone14`, `fails[0]`; Screenshot `shots/m10-display-iphone14-safearea.png`.
- **Ursache (sichtbar):** `index.html:32-33` setzt `body { padding: env(safe-area-inset-*) }`, aber
  `src/main.ts:101-104` (`applyView`) setzt `canvas.style.width = cssWidth px` (= 844) – der Canvas
  ist breiter als die Content-Box und wird full-bleed bei x=0 gerendert; das Padding greift nicht.
- **Empfehlung (eigene UI-/Engine-Karte):** CSS-Breite auf `min(cssWidth, 100vw - insetL - insetR)`
  begrenzen oder HUD-Offsets (`src/scenes/UI.ts:91-102`) und `PAUSE_MARGIN`
  (`src/input/TouchControls.ts:15`) um die Insets verschieben; `#lf-rotate`/Body-Wrapper mit
  `padding` + `width:100%` wäre die kleinste Änderung. Nicht in dieser Lane behoben (src/ ist
  gesperrt).

### FAIL 2 — #638: Minute 25 bei 780×360 @ dpr 3 = 39,5 FPS

- **Messung:** `flock /home/ai/games/.lf-perf.lock node scripts/perf.mjs --viewport 780x360 --dpr 3
  --tag m10-638` → 39,5 FPS roh (396 Frames / 10,021 s), Roll-FPS 41,0, 300 Gegner, `jsErrors: 0`.
  Beleg `shots/m10-display-perf-minute-25.json`.
- **Vergleich:** Burst 500 Gegner 59,5 FPS PASS; Kontrolllauf `--dpr 1` (480×360) 54,5 FPS – also
  ~+15 FPS ohne dpr-3-CSS-Fläche. Die Gerätepixel-/CSS-Fläche 2340×1080 ist der dominierende Faktor,
  reicht aber als alleinige Erklärung nicht (54,5 < 55).
- **Empfehlung für #638:** Render-/CSS-Fläche deckeln statt jeden Spielpixel n×n zu erzwingen
  (`src/main.ts:101-106`, `applyView`), z. B. `cssWidth* cssHeight` auf ~1,5 Mio. CSS-px begrenzen
  oder dpr für View-Breiten > 700 auf max. 2 kappen; zusätzlich Draw-Call-/Partikel-Last bei
  ≥300 Gegnern prüfen (`src/scenes/Run.ts` Update/Render-Pfad). Akzeptanz: Minute 25 ≥55 FPS bei
  unverändertem Burst-PASS und 0 JS-Fehlern.

### Build/Tests (Abschluss, Basis `f26dc4b`)

- `npm run build`: grün (`✓ built in …`, Log `~/tmp/m10-display-qa/card4-build.log`).
- `npx vitest run`: 12 Dateien / 192 Tests grün (Log `~/tmp/m10-display-qa/card4-tests.log`).

## Lane-Abschluss / .lane-done

Alle vier Karten sind committet (`5250ccd`, `d7eab43`, `6f784cf`, `667a08d`). Das `.lane-done`-Signal
konnte **nicht** committet werden: der Disponent hat `.lane-done` an den Job `merge-m10-vfx-evo` (main)
vergeben (Commit-Gate blockte). Der Inhalt ist als Backup unter `~/tmp/m10-lane-done-m10-display-qa.txt`
(nicht Teil des Repos) abgelegt und eine Freigabe-/Übernahme-Anfrage steht in
`/home/ai/games/.dispatch/requests.md` (Eintrag `m10-display-qa`). Inhalt: 6/7 Profile PASS,
iphone14 Safe-Area FAIL, #638 Minute 25 39,5 FPS FAIL (dpr1-Kontrolllauf 54,5 FPS).
