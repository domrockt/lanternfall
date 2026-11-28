# Lane m10-balance-spawn-damp — Fix des belegten Balance-Band-FAILs auf main (B1: Spawn-Dämpfung Minute 18–24)

**Auftrag:** Die Verifikations-Lane `m10-balance-band-verify` hat auf main FAIL gemessen
(K2 5/6 Endzeit im Fenster [25,40], Streuung 9,32 min; K3 29/33 Boss-Dauern im Korridor).
Befund B1: der `XP_ENDGAME`-Aufschlag (ab Level 28, erreicht ~Minute 18–20) senkt die
Kill-Rate im Fenster Minute 18–24, während die Ankunftsrate dort um +25 % wächst
(1,484 → 1,852/s); der Late-Deckel (300 @ 960x540) begrenzt nur die Gleichzeitigkeit.

**Fix (K1):** `src/data/waves.ts` — `SPAWN_DAMP_18_24` dämpft den **Zuwachs** der
Basis-Spawnrate seit Minute 18 im Fenster Minute 18–24 (Rampe analog HP-Relief:
Start Minute 18 mit Grad 0, 240 s bis voll, d. h. Minute 22–24 voll gedämpft;
Minute 0–17 bitgleich; Minute 25+ unverändert `lateGameSpawnRate`, Endboss-Korridor
unangetastet; `src/logic/xp.ts` und `src/logic/scaling.ts` nicht angefasst).
Wert per Suchskript `scripts/m10-balance-search-1824.mjs` mit festem Iterationslimit
(max. 3 Suchläufe, Frühabbruch bei PASS): **Kandidat 0,6 PASS im ersten Suchlauf**
→ Beleg `shots/m10-balance-search-1824.json`.

Gedämpfte Raten (D = 0,6): Minute 17: 1,416 · 18: 1,484 (Start, ungedämpft) · 19: 1,542 ·
20: 1,551 · 21: 1,574 · 22: 1,577 · 23: 1,604 · 24: 1,631 → 25: 1,860 (`lateGameSpawnRate`).
Das Fenster wächst nun noch +9,9 % statt +24,8 %; die Monotonie-Kriterien der
Datentabellen-Tests (strikt steigende `spawnRate`) bleiben erfüllt (Grenze D ≤ 0,62).

**Setup (identisch zur Verifikations-Lane):** AutoPlay, kein god, timeScale 30,
Seeds 101/7/42 × Kael/Mira, Viewport 960x540 @dpr 1,
`node scripts/m10-balance-endgame.mjs after` → `shots/m10-balance-band-damp-after.json`.
Vorher-Baseline: `shots/m10-balance-band-after.json` auf main (5/6) — kein erneutes
Vorher-Messen (Briefing; Board-Karte #8606 entsprechend blocked gesetzt).

**Renderer-String (Pflicht, Dom 19:20Z):** vor jedem Lauf `WEBGL_debug_renderer_info` /
`UNMASKED_RENDERER_WEBGL` belegt:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader,
alle 6 Läufe identisch, `rendererOk: true`. Kein ungültiger Beleg verwendet.

**Nachher-Messung (1 Lauf der 6 Läufe, verbindlich, `generatedAt` 2026-11-28T05:53Z,
keine Wiederholung — deterministisch bei festen Substeps):**

| Char | Seed | Ergebnis | Endzeit (min) | Endlevel | Kills |
|---|---|---|---|---|---|
| Mira | 101 | Sieg (Dawn) | 30,47 | 34 | 4.052 |
| Mira | 7 | Sieg (Dawn) | 30,46 | 35 | 4.653 |
| Mira | 42 | Sieg (Dawn) | 30,57 | 35 | 5.895 |
| Kael | 101 | Sieg (Dawn) | 30,74 | 34 | 5.462 |
| Kael | 7 | Sieg (Dawn) | 30,51 | 33 | 4.617 |
| Kael | 42 | Sieg (Dawn) | 30,34 | 35 | 6.870 |

## K2 — Endzeit-Fenster: **PASS**

- **Fenster [25,40] Sim-Minuten: 6/6** (Ziel 6/6) — alle 6 Läufe Sieg (Dawn) bei
  30,34–30,74 min. Gegenüber Baseline (5/6, mira/7 Tod @ 21,21 min): **mira/7 gewinnt
  jetzt bei 30,46 min (Level 35)** — exakt der B1-Todesfall ist behoben.
- **Streuung (max−min): 0,40 min** (Ziel ≤ 4) — statt 9,32 min auf main.
- 0 JS-Fehler; Renderer ok (oben). Beleg: `shots/m10-balance-band-damp-after.json`
  (`allInWindow: true`, `spreadOk: true`, `accepted: true`).

