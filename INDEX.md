# Lanternfall — Kurzanleitung fuer Agenten

Die taegliche Schleife (Stand 2026-11-26):

```bash
npm run check                 # inkrementeller tsc + nur betroffene Tests (< 1 s)
npm run build                 # tsc --noEmit + vite build, einmal pro Karte
npm test                      # alle Vitest-Dateien, einmal pro Karte
node scripts/shot.mjs --out shots/x.png --gif 16 --commands '[{"call":"god","args":[true]}]'
```

- `npm run check` prueft den Arbeitsstand gegen `HEAD`: geaenderte `.ts`/`.tsx`
  Dateien werden per `vitest related` nur mit ihren Testdateien ausgefuehrt.
  Einzelne Dateien: `node scripts/check.mjs src/logic/stats.ts`.
- Typecheck ist inkrementell (`tsconfig.json`: `incremental`, `tsBuildInfoFile`
  `.cache/tsc.tsbuildinfo`, gitignored); `npm run build` nutzt denselben Cache.
- Belege: `scripts/shot.mjs` ersetzt eigene `tmp-*.mjs`-Skripte und nutzt
  `scripts/harness.mjs`. Query z. B. `--query "debug=1&seed=21"`, `__lf`-Befehle
  als JSON (`{call,args}`), optional `--gif 16`. Die Debug-API ist nur mit
  `?debug=1` aktiv.
- Kein Polling; lange Messungen mit `flock /home/ai/games/.lf-perf.lock`.
- Messwerte und Details: `docs/lanes/m7-tooling.md`.

## Dateien

- `scripts/harness.mjs`: Build-Check, statischer Server, Playwright, Start-Flow
  (Title -> CharSelect -> Run).
- `scripts/check.mjs`: taegliche Schleife (tsc + vitest related).
- `scripts/shot.mjs`: generischer Screenshot/GIF-Helfer.
- `npm run perf|verify|fullrun|balance`: Abnahme-Skripte (mit flock messen).
