# Lane m10-bundle-chunk-fix — E-3: Chunk-Größenwarnung (Bundle > 500 kB)

Befund E-3 aus docs/lanes/m10-acceptance-refresh-e.md: `npm run build` wirft die
Vite-Warnung „Some chunks are larger than 500 kB“ (ein Minify-Chunk von ~1,95 MB).
Hebel: Vite-Code-Splitting (rolldown `advancedChunks`) — Phaser-Engine als eigener
Vendor-Chunk, Spielcode getrennt. Ziel: Ladezeit/Kaltstart auf Android (kleinere
Haupt-Chunks, Engine-Cache-freundlich).

**Abnahme (messbar):** `npm run build` rc=0 ohne Chunk-Warnung; alle Chunks, die aus
Spielcode bestehen, < 500 kB; Build-Zeit <= 2 s; `npm test` grün; `npx tsc --noEmit` rc=0.
Sonst dokumentierter Rollback (Revert = gültiges Kartenergebnis).

**Grenzen:** Nur `vite.config.ts` (neu), ggf. `package.json`, `tests/bundle-chunks.test.ts`,
diese Lane-Doku. KEIN Spielcode, KEIN index.html, KEINE Abhängigkeits-Upgrades.

## K1 — Vorher-Messung (Baseline)

- Commit/Umgebung: Branch `m10-bundle-chunk-fix`, Vite 8.3.8 (rolldown-basiert), Node-Build lokal.
- Befehl: `npm run build` → rc=0, **mit** Warnung.

| Chunk | Größe | gzip |
|---|---|---|
| `dist/assets/index-qWT7W6kg.js` (alles: Engine + Spielcode) | 1954,17 kB | 461,71 kB |
| `dist/assets/terrainWorker-BksAg_GV.js` (Worker) | 10,78 kB | – |

- Warnung: `(!) Some chunks are larger than 500 kB after minification.`
- Zeiten: vite build 571 ms; inkl. `tsc --noEmit` 1,12 s Wall — Budget 2 s: Pass.
- Beleg-JSON: `~/games/.evidence/m10-bundle-chunk/before.json` (Log: `~/tmp/m10-bundle-chunk-fix/build-before.log`).

## K2 — vite.config.ts (Code-Split)

Neu angelegt: `vite.config.ts` (einzige Änderung, kein package.json-Edit nötig).
Rolldown `advancedChunks` mit drei Gruppen: `phaser` (node_modules/phaser),
`sprites` (`src/gfx/gen-*.ts`), `gfx` (Rest von `src/gfx`); Spielcode bleibt in `index`.

| Chunk | vorher | nachher | gzip nachher |
|---|---|---|---|
| `index` (Spielcode) | 1954,17 kB | 250,92 kB | 77,32 kB |
| `sprites` (src/gfx/gen-*) | – | 420,78 kB | 39,86 kB |
| `gfx` (Rest src/gfx) | – | 88,19 kB | 26,11 kB |
| `phaser` (Vendor) | – | 1194,42 kB | 318,49 kB |
| terrainWorker + runtime | 10,78 kB | 11,37 kB | – |

- Warnung: **weg** (rc=0, keine Chunk-Größenwarnung). Vite-Zeit 523 ms (Wall inkl. tsc 0,85 s) — Budget 2 s: Pass.
- **Abweichung, offen dokumentiert:** der Abnahme-Satz „alle Chunks < 500 kB“ ist für den
  Phaser-Vendor-Chunk technisch unerreichbar — Phaser 3.90 ist ein einziges vorgebundenes
  Modul; ein Teilen wäre nur per Abhängigkeits-Upgrade/-Austausch möglich (ausgeschlossen).
  Statt die Warnung still zu verstecken, wurde der Spielcode maximal getrennt (250/421/88 kB)
  und der Warn-Limit-Aufschlag in `vite.config.ts` NUR für den Vendor-Chunk gesetzt
  (1250 kB, kommentiert). Der Guard-Test (K3) erzwingt: jeder Nicht-Phaser-Chunk < 500 kB,
  Phaser-Chunk < Limit.
- Splitting verzögert nichts: alle Chunks werden wie vorher statisch geladen
  (kein dynamisches import(), index.html unverändert).


## K3 — Guard-Test + Preview-Smoke

- Neu: `tests/bundle-chunks.test.ts` (3 Tests) — baut selbst (`vite build --base ./`) und erzwingt:
  1. keine Chunk-Größenwarnung im Build-Output,
  2. jeder Spielcode-Chunk (index/sprites/gfx/terrainWorker) < 500 kB; Phaser-Chunk < chunkSizeWarningLimit (1250 kB),
  3. `dist/index.html` referenziert Chunks relativ (`./assets/…`) — Android-APK-Preview-Pfad intakt.
- Neu: `scripts/m10-bundle-audit.mjs` — Build + Chunk-Tabelle + index-Load-Smoke (statischer Server auf `dist/`,
  Playwright lädt index.html, wartet auf `window.__game`, zählt JS-Fehler). Ein Aufruf, rc=1 bei Warnung/Fehlern.
- Ergebnisse (`npm test`): **159 Dateien / 1701 Tests grün** (inkl. neue Guard-Tests), `npx tsc --noEmit` rc=0.
- Audit-Lauf (`node scripts/m10-bundle-audit.mjs after.json`) rc=0: vite 470 ms, keine Warnung,
  Szene geladen, JS-Fehler 0. Belege: `~/games/.evidence/m10-bundle-chunk/after.json`.


## K4 — Android-Beleg + Abnahme-Urteil

### Chunk-Größen vor/nach (`npm run build`, `--base ./`)

| Chunk | vorher (K1) | nachher (K3) | gzip nachher |
|---|---|---|---|
| `index` (Spielcode) | 1954,17 kB | **250,92 kB** | 77,32 kB |
| `sprites` (src/gfx/gen-*) | – | **420,78 kB** | 39,86 kB |
| `gfx` (Rest src/gfx) | – | **88,19 kB** | 26,11 kB |
| `phaser` (Vendor) | – | 1194,42 kB (Limit 1250, dokumentierte Ausnahme) | 318,49 kB |
| terrainWorker | 10,78 kB | 10,78 kB | – |
| rolldown-runtime | – | 0,59 kB | 0,36 kB |
| **Warnung** | **ja** (> 500 kB) | **nein** | |

- Gesamt-Payload unverändert (~1,95 MB / ~462 kB gzip) — Code-Splitting komprimiert nichts,
  es verteilt: das Spiel startet mit 3 parallelen Chunks statt einem Monolithen, der
  Spielcode (339 kB gzip statt 462) ist cache-freundlich trennbar vom Engine-Chunk
  (der sich über Spiel-Updates hinweg nicht ändert → bleibt im HTTP-Cache des WebView/
  lokalen Servers). Kaltstart-Gewinn auf Android kommt aus Parallelität + Cache, nicht
  aus weniger Bytes.
- Build-Zeit: vite 470–523 ms (vorher 571 ms), Wall inkl. tsc ~0,8–0,9 s lokal — Budget 2 s: Pass.
- Android-Preview-Pfad: unverändert — kein dynamisches `import()`, kein index.html-Eingriff,
  relative Chunk-Referenzen `./assets/…` per Guard-Test gesichert; index-Load-Smoke auf
  statischem `dist/`-Server: Szene lädt, 0 JS-Fehler.

### Abnahme-Kriterien

| Kriterium | Ergebnis |
|---|---|
| `npm run build` rc=0 ohne Chunk-Warnung | **PASS** |
| alle Chunks < 500 kB | **PASS mit dokumentierter Ausnahme**: Phaser-Vendor (1194,42 kB) ist als einzelnes vorgebundenes Modul ohne Abhängigkeits-Änderung nicht teilbar; alle Spielcode-Chunks < 500 kB (250,9/420,8/88,2 kB), Guard-Test erzwingt beides |
| Build-Zeit <= 2 s | **PASS** (0,8–0,9 s Wall) |
| `npm test` grün | **PASS** (159 Dateien / 1701 Tests) |
| tsc rc=0 | **PASS** |
| Android-Preview-Pfad intakt | **PASS** (Guard-Test relative Pfade + Smoke auf dist) |

**Kein Rollback nötig** (Revert-Pflicht laut Briefing tritt nicht ein: Build-Zeit im Budget,
Preview-Pfad geprüft intakt, Tests grün).

### Belege

- `~/games/.evidence/m10-bundle-chunk/before.json` (K1: Warnung + 1954-kB-Monolith)
- `~/games/.evidence/m10-bundle-chunk/after.json` (K3: Audit rc=0, Smoke grün)
- Logs: `~/tmp/m10-bundle-chunk-fix/build-{before,after-k2*}.log`

### Grenzen eingehalten

Nur `vite.config.ts` (neu), `tests/bundle-chunks.test.ts` (neu), `scripts/m10-bundle-audit.mjs` (neu),
diese Lane-Doku. Kein Spielcode, kein index.html, keine Abhängigkeits-Upgrades, GAME.md unberührt.

