# Lane m10-passive-math-artifact-fix (M10, 2026-11-28)

## Befund (Argus 19:00Z, hier reproduziert)

`tests/passive-stack.test.ts` schrieb bei **jedem** Suite-Lauf
`shots/m10-passive-math-{caps,matrix}.json` neu; einzige Änderung war
`generatedAt: new Date().toISOString()` (Zeilen ~166/~337). Beide Dateien sind
in git getrackt → Worktree dauerhaft dirty, board_move fremder Lanes blockiert
(requests.md 17:55Z + 18:58Z).

## Variante a: generatedAt entfernt (gewählt)

Beide Summary-Objekte schreiben kein `generatedAt` mehr. **Begründung:**

1. **Kein Leser existiert (K2-Beleg, 19:08Z):**
   `grep -rn "m10-passive-math-caps\|m10-passive-math-matrix" tests src scripts src/data`
   → rc=1, nur Erwähnungen in Lane-Dokus und der schreibende Test selbst.
   Der Zeitstempel war reine Dekoration, keine Belegkette.
2. Die Dateien sind als **stabile Snapshots** getrackt — ihr Zweck ist der
   byte-stabile Abgleich, nicht Lauf-Metadaten. Ein Zeitstempel widerspricht
   genau diesem Zweck.
3. Gegen Variante b (Schreibpfad nach `~/games/.evidence/`): Die getrackten
   shots-Dateien wären dann tote Artefakte, die der Test nie mehr berührt —
   Snapshot-Zweck und Test-Pfad gehen auseinander. Variante a ist kleiner
   (2 Zeilen + Snapshot-Regenerierung) und behält die Dateien lebendig.

Änderung: `generatedAt: new Date().toISOString()` in beiden Summaries gelöscht,
Kommentar im Test verweist auf diese Doku. Getrackte Snapshots auf den neuen
Stand (ohne Feld) aktualisiert und committet — danach schreiben Suite-Läufe
**identische Bytes**.

## Belege

### K2: keine abhängigen Leser
- `grep -rn "m10-passive-math-caps\|m10-passive-math-matrix" tests src scripts src/data`
  → **rc=1** (keine Treffer außer dem schreibenden Test, der ausdrücklich
  ausgenommen war; Lane-Dokus erwähnen die Dateien nur).
- `generatedAt` in `src/logic`/`src/data`: keine Treffer. `src/debug.ts` nutzt
  ein eigenes, anderes `generatedAt` (Debug-Report, ungetrackt) — nicht betroffen.
- Voll-Suite: **244 Dateien / 2641 Tests PASS** (2x, s. K3).

### K3: Stabilität — 2 Suite-Läufe, je leerer git-Status

Log-Kopie (auch `~/tmp/m10-passive-math-artifact-fix-k3.log`):

```
=== K3 Lauf 1: 19:08:10Z
 Test Files  244 passed (244)
      Tests  2641 passed (2641)
git status nach Lauf 1 (leer = PASS):
Zeilen: 0

=== K3 Lauf 2: 19:08:17Z
 Test Files  244 passed (244)
      Tests  2641 passed (2641)
git status nach Lauf 2 (leer = PASS):
Zeilen: 0
```

Befehl je Lauf: `npm test`, danach
`git status --porcelain -- shots/m10-passive-math-caps.json shots/m10-passive-math-matrix.json`
→ **0 Zeilen** in beiden Läufen. Ursache behoben, nicht Symptom geräumt.

### K1: Commit
- `54357a48` — `M10-m10-passive-math-artifact-fix: #14010 generatedAt aus
  Snapshot-JSON entfernt (Variante a) …` (tests/passive-stack.test.ts +
  beide shots-JSONs, tsc rc=0, npm run build grün).

## Offene Punkte
Keine. Keine Änderungen an `src/**`, keine sonstigen Berührungen von `shots/`.
