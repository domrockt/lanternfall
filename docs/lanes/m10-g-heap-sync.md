# Lane m10-g-heap-sync — ACCEPTANCE.md G-Abschnitt: Heap-Tor-Zahlen nachziehen (2026-11-28)

Bedarfsmeldung `m10-heap-gate-recovery` (KORREKTUR 16:05Z): verbindliche Heap-Tor-Zahlen auf dem
aktuellen HEAD in den G-Abschnitt der Gesamtabnahme (`ACCEPTANCE.md`) ergänzen.

## K1 (#13165) — Heap-Tor-Nachtrag im G-Abschnitt — erledigt

Kompakter Nachtrag-Absatz (5 Zeilen) **unterhalb der K3-Tabelle** im G-Abschnitt eingefügt
(AFTER: Tabelle K1–K4, BEFORE: „Abweichungen ≥ 5 % gegen F“):

> Heap-Tor auf HEAD nach `hazard-tex-cap` (heap-gate-recovery, 16:05Z): **2/2 Läufe HARD −25,2 %**
> (endMB 48,5 MB vs. Minute-1 64,8 MB), Renderer RPL-S, Belege
> `~/games/.evidence/m10-heap-gate-recovery/`.

Zahlprüfung gegen die Belege (beide `hardPass=true`, `verdict=PASS`, Renderer
`Mesa Intel(R) Graphics (RPL-S)`, kein SwiftShader):

| Zahl im Nachtrag | Beleg | Wert |
|---|---|---|
| 2/2 Läufe HARD PASS | `~/games/.evidence/m10-heap-gate-recovery/k1-run1.json`, `k1-run2-retry.json` → `gate.hardPass` | true/true |
| HARD −25,2 % | beide → `gate.endDeltaPct` | −25,2 / −25,2 |
| endMB 48,5 MB | beide → `gate.endMB` | 48,5 / 48,5 |
| Minute-1 64,8 MB | beide → `gate.minute1MB` | 64,8 / 64,8 |
| Renderer RPL-S | beide → `renderer.renderer` | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), …)` |

Keine bestehenden Tabellenzeilen umgeschrieben, keine historischen Abschnitte (B–F) angefasst.
Läufe: `k1-run1.json` @ `de677a92`, `k1-run2-retry.json` @ `705a6f97`; Doku:
`docs/lanes/m10-heap-gate-recovery.md`.

## K2 (#13166) — verify-input-Zahl im G-Abschnitt — geprüft, kein Eingriff nötig

Befund: Der G-Abschnitt (ACCEPTANCE.md Zeilen 488–518) führt **keinen verify-input-Wert**
(nur `verify:final 7/7` in der K1-Zeile und keine 28/29-Erwähnung). Die **28/28** stehen im
historischen Abschnitt „Nachtrag — unabhängige QA-Nachabnahme 2026-11-26“ (Zeile 61) und bleiben
dort gemäß Briefing unverändert stehen.

Belegter Ist-Stand: **verify-input 29/29** auf main — Quelle `docs/lanes/m10-postwave-smoke-r2.md`
(K2, Commit `M6-m10-postwave-smoke-r2: #12886 …`), Logs `~/games/.evidence/m10-postwave-smoke-r2/`.
Da der G-Abschnitt keinen Wert führt, gibt es nichts zu korrigieren → **keine ACCEPTANCE-Änderung
in K2** (Bedingung des Briefings nicht erfüllt).

## K3 (#13167) — Selbstprüfung

- `git diff 0ce7164a..HEAD`: ACCEPTANCE.md G-Abschnitt (+6 Zeilen), Lane-Doku, Board — sonst nichts;
  bestätigt: keine Tabellenzeilen umgeschrieben, keine Abschnitte B–F verändert.
- `npx tsc --noEmit` → **rc=0** (Doku-only-Änderung, zur Sicherheit).
- `git status --ignored`: keine Lane-Reste im Worktree.
- Commits: K1 `c55e15d9` (#13165), K2 `d17ddd98` (#13166), K3 dieser Commit (#13167). Kein Tag, kein Push.
