# Nachabnahme F — 2026-11-28 (Refresh nach FX-/Menue-/Android-Merge-Welle)

> **Basis (PIN):** main @ `1ebd4cab9d698d2994a7280009f6f28cd85b66b6`
> (2026-11-28T10:07:09Z, „merge-m10-fx-bakes-evo-r2: Lane-Karten #10251-#10254 …“).
> Worktree `/home/ai/games/lf-lanes/m10-acceptance-refresh-f`, Branch
> `m10-acceptance-refresh-f`. Diese Lane hat main **nicht** verändert (kein
> src-/tests-Code; nur Doku in ACCEPTANCE.md/docs).
>
> **Renderer-Pflicht:** Jeder FPS-Beleg nennt den WebGL-Renderer-String. Belege mit
> SwiftShader sind ungültig. Erwartet: „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
> OpenGL ES 3.2)“.
>
> **Belege:** `/home/ai/games/.evidence/m10-acceptance-refresh-f/` (außerhalb git).
> Lange Läufe unter `flock /home/ai/games/.lf-perf.lock` serialisiert.
> Alte Werte in ACCEPTANCE.md werden nicht überschrieben; Abweichungen ≥ 5 % markiert.

## K1 — Basis auf PIN (Build, Tests, Inhalte)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-28T10:08Z | `npm run build` | rc=0, `✓ built in 947ms` (bekannte Chunk-Warnung phaser >500 kB) | **PASS** |
| 2026-11-28T10:08Z | `npm test` (vitest run) | **1957 Tests in 179 Dateien, 0 fail**, 5,80 s | **PASS** |
| 2026-11-28T10:08Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | **PASS** |

**Urteil K1: PASS** — Testzahl gegenüber Nachabnahme C (587/58) stark gestiegen
(1957/179): die FX-/Menue-/Android-Merges brachten viele neue Tests mit.

## K2 — verify:final + verify:terrain/terrain-coverage

(wechselnde Ergebnisse)

## K3 — Burst + Minute-25 auf iGPU (780x360@3, 960x540)

(wechselnde Ergebnisse)

## K4 — fullrun-Guard + ACCEPTANCE.md

(wechselnde Ergebnisse)

## Gesamtergebnis

offen
