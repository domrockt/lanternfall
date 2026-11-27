# M10 Acceptance-Sync — ACCEPTANCE.md auf belegten Ist-Stand

Worktree: `/home/ai/games/lf-lanes/m10-acceptance-sync` (Branch `m10-acceptance-sync`)
Basis: `main` @ `4c04404`; Lane-HEAD vor Commit 1: `bb4214a`.
Nur Dokumentation — kein Spielcode, keine neuen Messläufe, keine geänderten Abnahmekriterien.

## Diff-Liste (alte Zahl/Formulierung → neue Zahl/Formulierung + Beleg)

### 1. Testzahl (vier Stellen in ACCEPTANCE.md)

| Stelle | Alt | Neu | Beleg |
|---|---|---|---|
| Z. 19 (A1, „aktuell“) | **147** | **204** (14 Testdateien) | `npm test` 2026-11-26 23:58Z auf `4c04404` → 14 Files / 204 Tests; Lane-Nachlauf auf `bb4214a` vor Commit 1 → `Test Files 14 passed (14)`, `Tests 204 passed (204)` |
| Z. 29 (A2 DoD) | `npm test` → 147 Tests grün | `npm test` → **204/204** in 14 Testdateien grün | derselbe `npm test`-Lauf |
| Z. 68 (A5 Tests) | 147 grün | **204/204** grün in 14 Testdateien | derselbe `npm test`-Lauf |
| Z. 146 (A12) | `npm test` **147 Tests grün** | `npm test` **204/204 Tests grün in 14 Testdateien** | derselbe `npm test`-Lauf |
| Z. 178 (QA-Nachtrag, historisch) | 175 grün statt 147 | 175 grün statt 147 **(Stand `7a522a4`; späterer Stand `4c04404`: 204/204, +38,8 % gegenüber 147)** | `npm test` 2026-11-26 23:58Z auf `4c04404` |

`grep -n "147 Tests" ACCEPTANCE.md` → kein Treffer.

### 2. A5-Balance (Widerspruch bleibt sichtbar, 47 wird nicht glatt ersetzt)

| Stelle | Alt | Neu | Beleg |
|---|---|---|---|
| Z. 66 (A5 „balance Hauptläufe“) | „6 Läufe, 5/6 im Korridor; Team: Kael/101 Level 47; Lead-Nachlauf: Kael/202 Tod 15,6 min, 0 Evos“ | A5-Befund „Kael/Seed 101 Level 47“ ist **widerlegt**: 8 Repro-Läufe → Level 28 bei Kael/101 (Ursache: Gem-Sammelquote **28,4 %** bei M8-Dichte); nach Fix `7629b2f` (Merge `e4d7fba`) und QA-Merge `4c04404`: **6/6 im Korridor Level 25–40**, kein Tod vor Minute 15; **formale Kriteriumsänderung offen (Frage an Dom 23:35)** | `shots/m10-balance-kael-repro.json` (8 Läufe, Kael/101 `endLevel: 28`, Korridor 7/8), `shots/m10-balance-kael-xp-budget.json` (`collectedShareOfPotentialPct: 28.4` für Kael/101), `shots/m10-balance-kael-final.json` (`corridorQuote: "6/6"`, `bossDurationsOk: true`, `deathsBeforeMinute15: 0`, Level 27–30), `shots/m10-balance-main-summary.json`, `docs/lanes/m10-balance-qa.md`, `docs/lanes/m10-balance-kael.md` |
| Z. 67 (A5 „balance Boss-Dauern“) | 23–54 s (Ziel 20–60 s) | **23–51 s** (Ziel 20–60 s) im Nachlauf `6/6`; alter A5-Wert 23–54 s | `shots/m10-balance-kael-final.json` (Boss-Dauern 23–51 s, alle im Korridor) |
| Z. 157 (Offene Punkte) | „Balance: Kael/Seed 101 erreicht Level 47 (Ziel 25–40); AutoPlay streut.“ | Kael/Seed 101 Level 47 ist **widerlegt** (8 Repro-Läufe: Level 28; Ursache Gem-Sammelquote 28,4 % bei M8-Dichte); Ist nach Fix `7629b2f`/QA-Merge `4c04404`: **6/6 im Korridor 25–40** (Level 27–30, Boss 20–60 s, kein Tod vor Minute 15); **formale Kriteriumsänderung offen (Frage an Dom 23:35)** | dieselben Belege wie Z. 66/67 |

### 3. Working-Tree-Zustand (A1)

| Stelle | Alt | Neu | Beleg |
|---|---|---|---|
| Z. 19 („git status sauber“) | `git status` sauber | `git status`: **dirty=1**, ausschließlich `.opencode/board.json` — Live-Sync des Board-Servers, erwartet | `git status --short` auf dem Lane-HEAD → ` M .opencode/board.json`; der Board-Server schreibt die Live-Datei |

## Bewusst nicht geändert

- A1–A12-Urteile und OK/FAIL-Wertungen: unverändert; nur belegte Zahlen/Quellen korrigiert.
- Übrige historische M6-/QA-Zahlen (z. B. perf 59,3/60,7 FPS, fullrun/Heap-Werte, Realtime 30:00): bleiben als datierte Messungen stehen; in dieser Lane **nicht neu gemessen** (keine weiteren Messläufe laut Briefing).
- A5-Kriterium selbst (Level-Korridor 25–40, Boss 20–60 s): **nicht geändert** — formale Kriteriumsänderung ist Doms Entscheidung und bleibt offen.

## Prüfung vor Commit 2

- `git diff main -- ACCEPTANCE.md` zeigt ausschließlich Zahlen-/Belegkorrekturen (8 Zeilen alt → neu).
- `npm test` → 14/14 Testdateien, 204/204 grün (unverändert durch Doku-Commits).
- `grep -n "147 Tests" ACCEPTANCE.md` → kein Treffer.
- Kein Spielcode, keine `src/`-/`tests/`-/`scripts/`-Änderung.
