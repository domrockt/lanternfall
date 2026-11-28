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

(vorbereitet)

## K3 — Guard-Test + Preview-Smoke

(offen)

## K4 — Android-Beleg + Doku

(offen)
