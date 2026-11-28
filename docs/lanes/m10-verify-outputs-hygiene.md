# Lane m10-verify-outputs-hygiene — Verify-Output-Hygiene (2026-11-28)

Ziel: Befund **E-4** der Nachabnahme E (`docs/lanes/m10-acceptance-refresh-e.md`) fixen —
Verify-/Test-Läufe dürfen keine getrackten `shots/*.json`-Belege überschreiben.
Grenzen: nur genannte Skripte + eigene Test-/Doc-Dateien; kein `src/**`; `verify-input.mjs` unangetastet.

- **PIN:** Worktree `/home/ai/games/lf-lanes/m10-verify-outputs-hygiene`, Branch `m10-verify-outputs-hygiene`, Start @ `a6613639`.
- Karten: #10008 (K1 Repro), #10009 (K2 Output-Pfade), #10010 (K3 Guard-Test + Nachher-Lauf).
- Belege: `~/games/.evidence/m10-verify-outputs-hygiene/` (untracked, außerhalb des Repos).

## K1 — Befund E-4 reproduziert (#10008, 08:05–08:12Z)

Repro-Protokoll: `git status --porcelain shots/` vor Lauf leer; dann
`node scripts/verify-final.mjs` (Log: `k1-verify-final.log`, **7/7 PASS**) und zusätzlich
`npm test` (Log: `k1-npm-test.log`, rc=0) zur Attribution.

Befunde:

1. **verify-final.mjs schreibt 3 Dateien unter `shots/`** — alle ungetrackt/gitignored:
   `shots/final-options-mute.png`, `shots/final-results-victory.png`, `shots/final-verify.json`
   (frische mtimes 08:08). Kein Overwrite getrackter Belege, aber Pfade im getrackten
   Beleg-Baum = Hygiene-Risiko (E-4 wie gemeldet).
2. **verify-robust.mjs schreibt gar keine Dateien** (nur `console.log`) — nichts zu fixen,
   K2 ergänzt dort nur einen optionalen Evidence-Output.
3. **Korrigierte Attribution für den sichtbaren E-4-Schaden:** die getrackten
   `shots/m10-passive-math-matrix.json` / `shots/m10-passive-math-caps.json` werden **nicht**
   von verify-final verändert (sha256 vor/nach identisch: `de517b68…`, `fb810e84…`), sondern
   von **`tests/passive-stack.test.ts`** — top-level `writeFileSync` bei jedem Testlauf
   (`npm test`): Hashes springen (`fb810e84→bc63c35b`, `de517b68→6db983ce`),
   `git status --porcelain shots/` zeigt `M` auf beiden Dateien. Im Worktree restored
   (wie in refresh-e geschehen). Die Datei ist fremd (Disponent) → **Bedarf gemeldet**, hier nicht gefixt.
   Roh-Beleg: `k1-before.json`, `k1-baseline.txt`, `k1-after.txt`, Hash-Listen `k1-shots-hashes-before.txt`.

Urteil K1: Befund E-4 bestätigt (Pfade) + präzisiert (echter Overwrite-Writer ist der passive-stack-Test).

## K2 — Outputs nach `~/games/.evidence/` (#10009)

(folgt)

## K3 — Guard-Test + Nachher-Lauf (#10010)

(folgt)
