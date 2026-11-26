# M7-Lane `m7-tooling` — Entwicklertempo

Stand: 2026-11-26, Branch `m7-tooling`, Worktree `/home/ai/games/lf-lanes/m7-tooling`.
Bereich: `tsconfig.json`, `package.json`, `.gitignore`, `scripts/shot.mjs`,
`scripts/check.mjs`, `scripts/tmp-*`, `vitest.config.ts`. Keine Spielaenderungen,
GAME.md unveraendert.

## Ergebnis Vorher/Nachher

Die historischen Werte aus 30 h Team-Historie sind nicht mehr direkt
reproduzierbar, weil der Worktree inzwischen **TypeScript 7.0.2 (natives `tsc`)**
und **Vitest 5.1.1** nutzt. Die lokale Vorher-Messung (ohne Cache) ist deshalb
die ehrliche Vergleichsbasis; die historischen Zahlen stehen daneben.

| Pruefung | Historie (30 h) | lokal vorher | lokal nachher | Ziel |
|---|---:|---:|---:|---|
| `npx tsc --noEmit`, kalt | Ø 76 s (73x) | 350 ms | 358 ms | – |
| `npx tsc --noEmit`, 2. Lauf | Ø 76 s | **366 ms** | **316 ms** | < 10 s |
| `npx tsc --noEmit`, nach kleiner Aenderung | Ø 76 s | 366 ms | **288 ms** | < 10 s |
| `npm run build` (tsc+vite) | Ø 27 s (327x) | 3.446 ms | **3.618 ms** (Cache warm) | gruen |
| `npm test` | Ø 11 s (69x) | 2.887 ms | **1.492 ms** | gruen |
| `npm run check` (neu) | – | – | **605–1055 ms** gezielt, 206 ms ohne Aenderung | < 15 s |

Der Cache bringt auf TS 7 noch ~14 % (366 → 316 ms); der grosse Tempo-Gewinn
ist der native Compiler. `npm run build` nutzt den Cache automatisch, weil
`build` weiter `tsc --noEmit` aufruft.

Cache: `.cache/tsc.tsbuildinfo` (22,7 KB), per `.gitignore` ausgeschlossen.

## 1) Inkrementeller Typecheck (#83, c96e160)

- `tsconfig.json`: `incremental: true`, `tsBuildInfoFile: ".cache/tsc.tsbuildinfo"`.
- `.gitignore`: `.cache/` ergaenzt.
- `npm run build` bleibt `tsc --noEmit && vite build` und liest den Cache.

## 2) `npm run check` (#84, edaa46c)

`scripts/check.mjs`:
1. inkrementeller `tsc --noEmit` (bricht bei Typfehlern ab),
2. sammelt geaenderte `.ts`/`.tsx`-Dateien aus `git diff HEAD` + untracked,
3. laeuft `vitest related … --run --passWithNoTests --reporter=dot --silent=passed-only`,
4. Ausgabe nur Fehler bzw. `Test Files/Tests/Duration` + Gesamtzeit.

Beispiel: `node scripts/check.mjs src/logic/stats.ts` → 605 ms, 2 Testdateien,
54 Tests. Ohne Aenderung: 206 ms, Tests uebersprungen. Gezielte Dateien koennen
als Argumente uebergeben werden; Standard ist der Arbeitsstand gegen `HEAD`.

## 3) `scripts/shot.mjs` (#85, 58b6d7f)

Generischer Beleg-Helfer auf Basis von `scripts/harness.mjs`. Optionen:
`--query`, `--scene run|title|charselect`, `--commands` (JSON als `{call,args}`,
`[call,…]` oder Objekt), `--commands-file`, `--out`, `--gif N`, `--gif-out`,
`--fps`, `--frame-ms`, `--wait`, `--viewport`, `--url`, `--allow-errors`.
Schreibt neben dem PNG ein `.json` mit URL/Befehlen/JS-Fehlern; Exitcode 1 bei
JS-Fehlern. Alte `scripts/tmp-*.mjs` (3 Dateien) sind entfernt.

Beispiel:
```bash
node scripts/shot.mjs --query "debug=1&seed=21" \
  --commands '[{"call":"god","args":[true]},{"call":"autoPlay","args":[true]},{"call":"spawnEnemy","args":["bog_rat",40]}]' \
  --out shots/m7-shot.png --gif 16 --wait 900
```
Ergebnis: `shots/m7-shot.png` + `shots/m7-shot.gif` (16 Frames, 0 JS-Fehler);
gesichtet: HUD, lebende Gegner, XP-Kristalle, lesbar.

## 4) Doku (#86)

- `/home/ai/games/.team/kb/COMMANDS.md` (und die gepflegte Quelle
  `.team/Team/Befehle und Kosten.md`) mit den neuen Werten.
- `INDEX.md` im Repo: Kurzanleitung fuer AGENTS/Personas.
- Diese Lane-Notiz + `.lane-done`.

## Offene Punkte

- `check` betrachtet Aenderungen gegen `HEAD` (plus untracked); ein
  `--since <ref>` fuer laengere Zeitraeume ist nicht eingebaut.
- GIF-Ausgabe braucht `ffmpeg` mit `palettegen/paletteuse` (im Sandbox vorhanden).
- `shot.mjs` skaliert GIFs auf 480x270 (Pixel-Art). Andere Groessen: PNG nutzen.
- Die historischen 76-s-/27-s-Werte gelten fuer die alte Toolchain und wurden
  hier nicht neu erzeugt.

## Pruefungen

- `npm run build` gruen (3,6 s), `npm test` **147/147** gruen (1,5–2,9 s).
- `node scripts/check.mjs src/logic/stats.ts` gruen (605 ms).
- `shot.mjs` Beispiel gruen, PNG/GIF gesichtet, 0 JS-Fehler.
- Eine Karte = ein Commit (#83–#85 Code, Board-Stand separater Nachlauf; #86 Doku).
