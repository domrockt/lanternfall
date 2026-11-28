# Lane m10-fx-mixel-pin-rebase (2026-11-28)

Hinweis Dora 2026-11-28T09:47Z: Zwei Lanes haben beide `tests/fx-mixel.test.ts` beruehrt —
`m10-fx-mixel-test-speed` (flaky 5-s-Timeout, Umbau auf weniger Stufen/Pixel je Assertion) und
`m10-fx-bakes-evo-r2` (K3: Alt-Pins derselben Datei auf neues Bake-Verhalten). Es war ungeprueft,
ob die K3-Bake-Pins auf main mit dem Beschleunigungs-Umbau zusammenpassen.

Hinweis: `~/lf-runs/lanes/common.md` existiert nicht (nicht auffindbar); es gelten die Regeln aus
dem Lane-Briefing (Belege nach `~/games/.evidence/`, eine Karte = ein Commit, `.lane-done` am Ende).

## K1: fx-mixel-Test auf main pruefen — PASS

- **Git-Beleg (beide Aenderungen zusammen auf main):** lokales `main` = `3155164e` == Worktree-HEAD.
  Historie der Datei auf main (`git log main --oneline -- tests/fx-mixel.test.ts`):
  - `d5bd7b25` M10-m10-fx-bakes-evo-r2: #10254 K4 (BAKES-Hoisting, boss_core maxLevel 5)
  - `eb7be798` M10-m10-fx-bakes-evo-r2: #10253 K3 fx_boss_core Mixel-Bake bis Level 4 (Alt-Pins umgestellt)
  - `0192e537` M10-m10-fx-mixel-test-speed: #10585 Palette-Test < 1 s statt Expect-pro-Zeichen
  Die Datei traegt den kombinierten Stand (Kommentar im Test: „Set.has-Schleife + Positionsinfo
  (main, #10585) ueber BAKES-Hoist + 10-s-Timeout (Lane, K4) — beide Timeout-Fixes“).
- **Kein Konflikt/widerspruechliche Pins:** K2 entfaellt (K1 gruen). Die boss_core-Pins
  (`mixelLevelFor("fx_boss_core", 3.6) == 4`, `mixelFrameKey("fx_boss_core_2", 3) == "fx_boss_core@3_2"`,
  `mixelBaseFor("fx_boss_core") == "fx_boss_core"`) und der schnelle Palette-Test (Set.has,
  keine Expect-pro-Zeichen, kein 10-s/15-s-Timeout mehr noetig) vertragen sich — der Lauf beweist es.
- **Testlauf (gezielt, Worktree == main-Stand 3155164e):**
  `npx vitest run tests/fx-mixel.test.ts` → **17/17 passed**, Duration **568 ms** (Erstlauf 10:43:43Z),
  Zweitlauf 414 ms (Beleg: `~/games/.evidence/m10-fx-mixel-pin-rebase/K1-vitest-fx-mixel.log`,
  Wall 0,82–0,95 s) — weit unter dem 5-s-Timeout.
- **`origin/main` ist aelter als lokales main** (Pull-Abstand, Lead pusht nur zwischen Meilensteinen):
  dort fehlen die bakes-evo-r2-Commits noch; massgeblich fuer die Merge-Pruefung ist das lokale main,
  auf dem der Merge-Job arbeitet.

## K2: Pins zusammenfuehren — entfaellt

K1 gruen (17/17, < 1 s), keine Konfliktreste, keine doppelten/widerspruechlichen Pins gefunden.
Kein Code-/Pin-Eingriff noetig: Der kombinierte Stand auf main (`3155164e`) ist bereits die
Schnittmenge aus Bake-Pins (bakes-evo-r2 K3/K4) und schnellen Assertions (test-speed #10585).

## K3: Suite + Build, Doku, .lane-done — PASS

- **`npm test` (voll):** **186/186 Testdateien, 2032/2032 Tests, 0 fail**, Wall **5,6 s**
  (Beleg: `~/games/.evidence/m10-fx-mixel-pin-rebase/K3-npm-test.log`, rc=0).
- **`npm run build`:** rc=0, built in 439 ms
  (Beleg: `~/games/.evidence/m10-fx-mixel-pin-rebase/K3-build.log`).
- **Testdauer fx-mixel weiter unter dem 5-s-Timeout:** gezielter Lauf 414–568 ms (K1-Beleg);
  im Suite-Parallellauf keine Timeout-Flakes (0 fail).
- Kein Eingriff in `src/**` (nur Doku, `.lane-done`, Board).

## Fazit

Die Sorge von Dora ist entkraeftet: Auf lokalem main (`3155164e`) liegen test-speed-Umbau (#10585)
und bakes-evo-r2-K3/K4-Bake-Pins bereits **kombiniert und konsistent** vor — der Merge-Job braucht
keinen Konflikt-Resolve fuer diese Datei. Suite voll gruen.
