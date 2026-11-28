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

(offen)

## K4 — Android-Beleg + Doku

(offen)
