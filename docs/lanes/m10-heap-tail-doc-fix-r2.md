# Lane m10-heap-tail-doc-fix-r2 — Doku-Fix trim()-Aussage (Nachzieher zu m10-pool-trim)

Stand: 2026-11-28. Worktree `/home/ai/games/lf-lanes/m10-heap-tail-doc-fix-r2`,
Branch `m10-heap-tail-doc-fix-r2`.

Ausgangslage: Der belegte Doku-Fehler aus der Bedarfsmeldung m10-pool-trim
(Befund-Commit c7893e9, Karte #2438) blieb unkorrigiert — der fast-path-Merge
(06:37) hat die Karte „Doku korrigieren" nicht ausgeführt.
`docs/lanes/m10-heap-tail.md:85` behauptete weiterhin „… und der Pool kappt
Retention per `trim()`", obwohl `trim()` 0 Aufrufstellen im Run-Pfad hat
(Befund: `docs/lanes/m10-pool-trim.md`, K1/K2).

## K1 — trim()-Aussage korrigiert (COMMIT f533c582, #9943)

- `docs/lanes/m10-heap-tail.md` (Ursachen-Abschnitt, Zeile 85): die falsche
  Aussage ersetzt durch die korrigierte Formulierung aus
  `docs/lanes/m10-pool-trim.md` K2 (wörtlich): Retention wird im Run-Pfad
  **nicht** per `Pool.trim()` gekappt — `trim()` hat 0 Aufrufstellen
  (Befund m10-pool-trim, #2438, Verweis auf `docs/lanes/m10-pool-trim.md`);
  generischer Pool über `MAX_ENTRIES = 48` begrenzt, Peak-Overhang der
  `free`-Arrays in `EnemyPool`/`ProjectilePool` → Karte #2439.
- **Sonst 0 Änderungen an der Datei** (git diff-Stat: genau 1 Absatz, +5/−1).
- Board-Notiz: doing-Move war durch WIP-Limit blockiert (fremde Karten
  #9725/#9922 in doing); Karte ohne doing-Zwischenschritt nach review gezogen.

## K2 — Gegenprobe (COMMIT folgt, #9944)

Gegenprobe des Befunds im eigenen Worktree (Stand nach fast-path-Merge):

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| `grep -rn "trim(" src --include="*.ts"` | Definition `Pool.ts:69` + „NICHT verdrahtet: 0 Aufrufstellen"-Header (`Pool.ts:5-7`, von m10-pool-trim gesetzt) + `String.trim` in `UI.ts:1269-1273` — **kein Aufruf von `Pool.trim` im Run-Pfad** | `~/games/.evidence/m10-heap-tail-doc-fix-r2/trim-callers-grep.txt` |
| `git show f533c582` | exakter Diff der K1-Korrektur (nur m10-heap-tail.md) | `~/games/.evidence/m10-heap-tail-doc-fix-r2/k1-diff-f533c582.patch` |

Hinweis zur Ablage: Briefing nannte `shots/` für den Beleg; `shots/*` ist im
Worktree gitignore-gebunden (nur Whitelist-Einträge werden getrackt), Belege
liegen daher nach Lane-Regel unter `~/games/.evidence/m10-heap-tail-doc-fix-r2/`
und sind hier referenziert.

## Abnahme

| Kriterium | Ergebnis |
|---|---|
| trim()-Aussage in m10-heap-tail.md stimmt mit Befund m10-pool-trim.md überein und verweist darauf | **erfüllt** (K1, f533c582) |
| sonst 0 Änderungen an der Datei | erfüllt (diff-Beleg) |
| Gegenprobe-Beleg liegt vor | erfüllt (grep + diff, Pfade siehe K2) |
| Build | `npx tsc --noEmit` rc=0, `npm run build` OK (rein Doku-Änderung) |
| Tests | nicht erneut gefahren — 0 Code-Zeilen geändert; Basis c7893e9: 1503/1503 grün |

## Offene Punkte

- keine aus dieser Lane; Sache der Verdrahtung bleibt bei Karte #2439.
