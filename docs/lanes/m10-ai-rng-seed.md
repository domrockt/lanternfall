# Lane m10-ai-rng-seed — Gegner-KI-RNG deterministisch (Teil 3 Determinismus-Schnitt)

Bedarfsmeldung m10-pause-freeze (#7505-Folge): `src/systems/EnemyPool.ts` nutzte
`DEFAULT_AI_RNG = { next: () => Math.random() }`; Recycle erbte zudem die
AiState-Stagger-Felder des Vorgängers (Bedarfsmeldung m10-ai-budget).

## Was gemacht wurde

- **K1 (#7798, Commit 8e01e16):** Vorher-Probe `scripts/m10-ai-rng.mjs` (reine Logik,
  `stepEnemyAi`/`newAiState`, feste Substeps, kein flock). Zwei Kontrollläufe mit gleichem
  Seed über den alten Math.random-Fallback: Marken divergieren
  (`6fbb1086` vs `75571c0b`, `identical=false`) → `shots/m10-ai-rng-before.json`.
  Akzeptanz vor der Messung im JSON festgelegt.
- **K2 (#7799, Commit c011202):** Fix in `src/systems/EnemyPool.ts`:
  - `DEFAULT_AI_RNG` (Math.random) ersetzt durch **pool-eigenen `SeededRng(aiSeed)`**
    (Muster Run-SeededRng aus `src/logic/rng.ts`). Ein Stream pro Pool (nicht pro Spawn),
    damit recycelte Gegner ihr RNG-Objekt behalten (Vertrag aus tests/enemy-pool-reuse.test.ts).
  - `createRuntime` zieht Initial-KI-Zustände aus fest gesätem `INIT_AI_RNG` (SeededRng(0))
    statt Math.random — der Zustand wird beim Spawn via `ensureAiState` ohnehin neu gesetzt,
    damit ist Math.random im EnemyPool vollständig verboten.
  - **Verdrahtung Run.ts (1 Zeile, minimal):** `new EnemyPool(this, this.seed)` — Run.ts war
    zum Arbeitszeitpunkt in `/home/ai/games/.dispatch/claims.json` NICHT belegt. Damit speist
    sich der Fallback aus dem Run-Seed (`?seed=`).
  - **Feld-Resets NICHT doppelt gebaut:** `resetAiState()` in `src/logic/ai-state.ts`
    (gemergt aus m10-ai-budget) setzt `aiStepIn/aiMoveX/aiMoveY/aiSpeedMul` bereits auf
    `undefined`; das 5. Feld `aiSkip` bleibt als wiederverwendetes Objekt bewusst bestehen —
    sein Inhalt wird im Skip-Pfad von `stepEnemyAi` vor jeder Nutzung neu überschrieben.
    Per Test abgesichert.
  - `tests/enemy-ai-rng.test.ts` neu (4 Tests): bitgleiche Marken zweier Pools mit
    Math.random-Spy (wirft bei Aufruf), Seed-Sensitivität, Recycle-Identität + Feld-Resets,
    explizite Run-RNG hat weiterhin Vorrang.
- **K3 (#7800):** Nachher-Probe: gleicher Seed → **bitgleiche Marken** (`fa543c71` ==
  `fa543c71`, `identical=true`) → `shots/m10-ai-rng-after.json`.

## Messwerte (before/after)

| Probe | Fallback | Seed | Marken | identisch |
|---|---|---|---|---|
| before (8e01e16) | Math.random | 20261127 | `6fbb1086` / `75571c0b` | **false** |
| after (c011202) | SeededRng(seed) | 20261127 | `fa543c71` / `fa543c71` | **true** |

Hebel: `EnemyPool`-Konstruktor (zweiter Parameter `aiSeed`, Default 0) — der Fallback ist
ein pool-eigener `SeededRng`; Spawner/BossSystem übergeben weiterhin die Run-SeededRng,
die bei Spawn ohne `rng` greift. Laufzeitverhalten im Spiel ist unverändert, weil alle
runtime-Caller (`Spawner.spawnAt`, `BossSystem`) die Run-RNG übergeben — der Fix schließt
die Nichtdeterminismus-Falle für Tests/Pfade ohne `rng`.

## Balance-Korridor-Sanity (A/B, gegen shots/m10-balance-kael-final.json)

`node scripts/balance.mjs` (ohne flock, feste Substeps, 3 Seeds × 2 Charaktere):

- **mit Fix** (c011202): `allRunsPass=false` — Drift bei `bossDurationsInCorridor` (4/6)
  und kael `levelInCorridor` (2 Runs über Korridor 25–40) → `shots/m10-ai-rng-balance-afterfix.json`
- **ohne Fix** (Kontrolle, Worktree bei 8e01e16, sonst identisch): ebenfalls
  `allRunsPass=false`, gleiche Drift-Art (3/6 passed) → `shots/m10-ai-rng-balance-prefix.json`

**Befund:** Die Korridor-Drift ist **vorbestehend auf dem Lane-Base** (neuere gemergte
Balance-Änderungen seit 252fd98/7629b2f plus Realtime-Rauschen des timeScale-30-Harness),
nicht durch diese Lane. Der Fix ist auf dem Laufzeitpfd beweislich neutral: Fallback wird
im Spiel nie benutzt, und der Initial-KI-State wird bei jedem Spawn via `ensureAiState`
resettet. Empfehlung: Korridor-Drift gehört in die Lane m10-balance-endgame
(waves.ts/scaling.ts) — dort ist waves.ts gerade in Arbeit.

## Offene Punkte / Hinweise

- **Fremdberührungen (begründet):** 1 Zeile in `src/scenes/Run.ts` (Seed-Verdrahtung,
  s. o., Datei war unclaimed). Der erste Balance-Lauf lief mit Default-`--doc` und hat
  `docs/lanes/balance.md` + `shots/balance-main*.png/json` aktualisiert (vom Supervisor-
  Snapshot 0efac34 mitcommittet) — beim Merge als fremd behandeln, Inhalt ist ein
  Standard-Nachlauf, keine Absicht dieser Lane.
- KI-Entscheidungen hängen weiterhin von der Frame-Kadenz ab (gemeinsamer Run-RNG-Stream +
  AI-Stagger zieht zeichenzahlabhängig). Voller Kadenz-Unabhängigkeit (pro Gegner
  eigene, vom Seed+UID abgeleitete Stream-Adressierung) wäre Teil 4 des Schnitts —
  Bedarfsmeldung an m10-pause-freeze.
- Verifikation: `npx tsc --noEmit` grün, `npm test` grün (119 Dateien), `npm run build` grün,
  neue Tests 4/4, bestehende Pool/AI-Tests 33/33.
