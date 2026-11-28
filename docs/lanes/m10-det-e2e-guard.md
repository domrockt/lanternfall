# Lane m10-det-e2e-guard

Datum: 2026-11-28 · Worktree `lf-lanes/m10-det-e2e-guard` (Branch `m10-det-e2e-guard`) · Karten #12793–#12795 (reservierter Block)

## Ziel

Den Determinismus-Gewinn der **worldView-Anker-Kette** dauerhaft sichern. Die drei
Sim-Anker-Teile machen 3 Seeds × 2 Läufe bitgleich inkl. Boss-Dauern:

1. `ProjectilePool.ts`/`EnemyProjectiles.ts` → Lane `m10-worldview-anchor-pools` (Merge 111f3f95 in main)
2. `Spawner.ts` `outsideView` → Lane `m10-spawn-view-anchor` (Merge 4c677cfe in main)
3. Boss-Sim-View, Rezept aus `m10-boss-dur-determinism` K2 (Anker `mid = scroll + width/2` statt `camera.worldView`)

Dieses E2E-Ergebnis (Muster `scripts/m10-boss-dur-det.mjs`, exit 0) ist jetzt als fester
Guard in der Testsuite verankert, damit die Determinismus-Kette nicht still regressiert.

## K1 — Stand prüfen (#12793, Commit 27534d3c)

- Beide after-Merges in main belegt (`git merge-base --is-ancestor`, rc=0):
  `m10-worldview-anchor-pools` (111f3f95) und `m10-spawn-view-anchor` (4c677cfe).
- E2E `scripts/m10-boss-dur-det.mjs` auf Lane-Basis (main tip a911d59c): **exit 0**,
  3 Seeds (101/202/404) × 2 Läufe, je 700 Sim-Marken bitgleich, Boss-Dauern bitgleich:
  | Seed | Boss #0 | Boss #1 |
  |---|---|---|
  | 101 | 31.10 s | 40.10 s |
  | 202 | 25.20 s | 29.50 s |
  | 404 | 29.75 s | 45.45 s |
- Belege: `~/games/.evidence/m10-det-e2e-guard/m10-boss-dur-det-main.json`,
  Log `~/tmp/m10-det-e2e-guard/k1-e2e.log`.

## K2 — Guard-Wiring (#12794, Commit 9644ea50)

**E2E-Teil (Skript, NICHT in der Suite):** `scripts/m10-det-e2e.mjs` — Muster
`m10-boss-dur-det.mjs`, aber stärkere Marken (kills/level/xp/hp/enemies/px/py), kompletter
Event-Strom und Boss-Dauern, Urteil `deterministic` über alle Seeds, JS-Fehler zählen als
Divergenz. Aufruf:

```bash
node scripts/m10-det-e2e.mjs          # 3 Seeds × 2 Läufe, 700 Sim-Sekunden, timeScale 30
node scripts/m10-det-e2e.mjs --seeds=101,202,404 --seconds=700 --tag=custom
```

- Exit 0 = deterministisch, exit 2 = Divergenz. Läuft **ohne flock** (sim-exakte Marken,
  lastunabhängig — kein FPS-Messziel).
- Schreibt `shots/m10-det-e2e-<seed>-r<rep>.json` + `shots/m10-det-e2e-verdict.json`
  (in git, `.gitignore`: `!shots/m10-det-e2e-*.json`, Muster `!shots/m10-run-det-*.json`;
  Beanspruchung in `.dispatch/requests.md` dokumentiert).
- Ist-Stand: exit 0, alle Seeds bitgleich (Urteil in `shots/m10-det-e2e-verdict.json`,
  Kopie in `~/games/.evidence/m10-det-e2e-guard/`).

**Suite-Teil (sim-level-Check):** `tests/run-determinism.test.ts` um den Block
„m10-det-e2e-guard" erweitert: Verdict-Schranken (seeds/reps/limitSeconds/
deterministic:true) + je Seed Marken, Events und Boss-Dauern bitgleich, 0 JS-Fehler.
`npx vitest run tests/run-determinism.test.ts`: **11/11 grün** (139 ms — kein Langlauf).

**Negativ-Check:** 1 px-Divergenz in `shots/m10-det-e2e-202-r1.json` lässt den
seed-202-Test zuverlässig anschlagen; restauriert wieder 11/11 grün. Der Guard ist also
empfindlich, nicht nur grün.

**Workflow nach Sim-Änderungen:** `node scripts/m10-det-e2e.mjs` → neue JSONs committen.
Divergiert der Lauf, schlägt der Suite-Test an und zeigt die erste Divergenz
(`diffs[0].where` + Felder) — kein stilles Regressieren.

## K3 — Grenzen (#12795)

- **E2E läuft nicht in der Suite:** die Suite prüft die committeten JSONs (sim-exakt);
  die 6 Browser-Läufe (~3–4 min) bleiben dokumentiertes Skript. Wer den Sim ändert,
  muss den Skript-Lauf einmalig erneuern — das ist bewusst manuell, damit die Suite
  schnell bleibt.
- **Stochastische Reste außerhalb der 3 Anker:** Der Guard beweist Bitgleichheit nur
  für die 3 Seeds × 2 Läufe und die markierten Sim-Größen (Position, Kills, XP, HP,
  Gegnerzahl, Boss-Events/Dauern). Nicht abgedeckt: andere Seeds, andere Charaktere
  (`kael`), `hitStop`-Feinverteilung unterhalb der Sekundenmarken, Render-/Audio-Seite
  und wall-clock-abhängige Systeme außerhalb des Sim-Loops (bewusst — das ist die
  sim-exakte Schnittstelle, nicht ein Fluch).
- **Belegpfade:** `~/games/.evidence/m10-det-e2e-guard/`
  (`m10-boss-dur-det-main.json` K1, `m10-det-e2e-*.json` K2, `verdict.json`), Logs in
  `~/tmp/m10-det-e2e-guard/`.
- Verwandte Guards: `tests/boss-dur-determinism.test.ts` (Unit-Schranken der
  Boss-Sim-View), `tests/run-determinism.test.ts` (Marken-Run). Diese Lane schließt die
  Kette mit dem **E2E-Beweis inkl. Boss-Dauern**.

## Abnahme

- [x] Guard läuft grün (Suite 11/11; Skript-E2E exit 0)
- [x] 3 Seeds × 2 Läufe bitgleich inkl. Boss-Dauern auf finaler Lane-Basis (main tip)
- [x] Je Karte ein Commit (#12793 → 27534d3c, #12794 → 9644ea50, #12795 → dieser)
