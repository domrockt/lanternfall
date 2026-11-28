# Lane m10-pool-trim — Karte #2438 „Pool.trim verdrahten oder Doku korrigieren“

## K1 — Code-Lesebefund (2026-11-28)

**Frage:** Ist `Pool.trim()` im Run-Pfad verdrahtet (Overhang nach Spitzenlast wird
zurückgegeben statt gepoolt zu halten)?

**Befund: Nein — `trim()` existiert, ist korrekt, aber hat 0 Aufrufstellen.**

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Existiert `Pool.trim()` | ja, korrekt (kappt Free-Stack auf `maxFree`, gibt Anzahl zurück) | `src/systems/Pool.ts:65-70` |
| Aufrufstellen im Run-Pfad | **0** — `grep -rn "trim(" src --include="*.ts"` findet nur die Definition (`Pool.ts:65`); alle anderen `.trim()`-Treffer sind `String.trim` (`src/scenes/UI.ts:1245-1249`) | grep, dieser Commit |
| War `trim()` je verdrahtet? | nein — `git log -S "trim(" -- src/systems/DamageNumbers.ts src/scenes/Run.ts src/systems/EnemyPool.ts src/systems/ProjectilePool.ts` → leer | git, dieser Commit |
| Unit-Test zu `trim` | vorhanden (Deckel nach Peak-Welle, Idempotenz, Negativwert) | `tests/pool-reuse.test.ts:66-73` |
| Nutzer des generischen `Pool<T>` | genau einer: `DamageNumbers.entryPool` — mit hartem Cap `MAX_ENTRIES = 48` beim Einfügen | `src/systems/DamageNumbers.ts:162,171-172` |
| Die behauptende Doku | **falsch**: „der Pool kappt Retention per `trim()`“ — im Run-Pfad kapt nichts per `trim()`; `EnemyPool`/`ProjectilePool` führen eigene `free`-Arrays **ohne** Trim | `docs/lanes/m10-heap-tail.md:85` |

Kontext: Die anderen Pools (`EnemyPool.free`, `ProjectilePool.free`) sind eigene
Implementierungen mit denselben Retention-Eigenschaften, gehören aber laut
Abgrenzung zur Folge-Karte **#2439** (EnemyPool/ProjectilePool/CombatSystem) und werden
hier ausdrücklich nicht angefasst. Der generische Pool ist durch das DamageNumbers-Cap
per Konstruktion auf ≤ 48 gepoolte Einträge begrenzt — dort ist der Overhang
vernachlässigbar.

## Entscheidung (K1, belegt)

**Doku korrigieren — keine Verdrahtung in dieser Karte.**

Begründung:
1. Eine echte Verdrahtung im Run-Pfad kann nur in `EnemyPool.ts` / `ProjectilePool.ts`
   / `Run.ts` wirken — genau die in dieser Karte **hart abgegrenzten** fremden Bereiche
   (Karte #2439 bzw. fremde Disponent-Claims). Der einzige mir zugewiesene Codepfad
   (`Pool.ts`) hat mit `DamageNumbers` einen einzigen Nutzer, dessen Overhang durch
   `MAX_ENTRIES = 48` bereits beschränkt ist.
2. Ein Auto-Trim in `Pool.ts` selbst (z. B. Retention-Cap in `release()`) hätte ohne
   Aufrufer/Konfiguration entweder keinen Effekt (toter Code) oder würde das
   Steady-State-Versprechen „kein Objekt neu angelegt“ (`Pool.ts:3-4`) gefährden —
   Verhalten bei 500 Gegnern darf sich nicht ändern.
3. Die falsche Doku-Aussage ist die eigentliche Heap-Falle: sie behauptet ein
   Freigeben, das nicht stattfindet. Korrektur siehe K2.

Korrektur der fremden Datei `docs/lanes/m10-heap-tail.md:85` wird über
`/home/ai/games/.dispatch/requests.md` beim Merge beantragt (fremde Datei, Disponent);
die korrigierte Aussage steht unten (K2) und in `Pool.ts`.

## Vorher-Messung (3-min-Probe, 500-Gegner-Burst, Seed 99)

Skript: `scripts/m10-pool-trim.mjs` (einmalig gebaut; Heap-Snapshot-Analyse über CDP).
**Offener Punkt:** Die per-Pool-Zählung der `free`-Listen ist mit diesem Chrome/CDP-Format
nicht auswertbar — Property-Werte von Klasseninstanzen werden über Shape-Knoten
dedupliziert serialisiert und hängen nicht an den Instanz-Knoten (aufgedeckt mit
Kontroll-Objekt im Snapshot; `crossCheck.freeListHolders` bleibt 0). Brauchbar und
committet sind: aktive Gegner/Kills/Sim-Sekunden und Heap nach erzwungenem GC (T0
direkt nach Burst vs. T+180 s) — Gesamtheap-Ebene, lastunabhängig gemessen (kein flock).

Zahlen: siehe `shots/m10-pool-trim-before.json` (folgt im K2-Commit).
