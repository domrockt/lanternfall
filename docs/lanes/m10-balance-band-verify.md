# Lane m10-balance-band-verify — Verifikation Endgame-Balancing auf main (nach Merge)

**Auftrag:** Die Lane `m10-balance-endgame` hat 6/6 Läufe im Endzeit-Fenster auf ihrem Branch
belegt (`docs/lanes/m10-balance-endgame.md`, K4). Auf main treffen sich ihre Scaling-/Waves-Änderungen
(maxActiveEnemies-Late-Deckel, LATE_GAME_MIX, enemyHpScale-Relief) **erstmals** mit der XP-Kurven-Änderung
aus `m10-level-target-balance` (`635ad50`, nicht auf der Branch-Basis `5f0a6d7` enthalten) und den
übrigen Merges. Diese Lane misst nur; kein Spielcode geändert.

- **Setup (identisch zur Balance-Lane):** AutoPlay, **kein god**, timeScale 30, Seeds 101/7/42 ×
  Kael/Mira, Viewport 960x540 @dpr 1, Skript `scripts/m10-balance-endgame.mjs`
  (K1-Erweiterung: Renderer-String + Boss-Aufzeichnung, nur Ausgabe-JSON, keine Spielparameter geändert).
- **Renderer-String (K1, Dom 19:20Z):** vor **jedem** Lauf `WEBGL_debug_renderer_info` /
  `UNMASKED_RENDERER_WEBGL` belegt:
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader, Beleg gültig.
- **Beleg:** `shots/m10-balance-band-after.json` (6 Läufe, `generatedAt` 2026-11-28).

## K2 — Endzeit-Fenster auf main: **FAIL**

| Char | Seed | Ergebnis | Endzeit (min) | Endlevel | Kills | im Fenster [25,40] | Level in [25,40] |
|---|---|---|---|---|---|---|---|
| Mira | 101 | Sieg (Dawn) | 30,53 | 35 | 4.597 | ✅ | ✅ |
| Mira | 7 | **Tod** | **21,21** | 30 | 2.132 | ❌ | ✅ |
| Mira | 42 | Sieg (Dawn) | 30,33 | 34 | 3.968 | ✅ | ✅ |
| Kael | 101 | Tod | 28,65 | 34 | 5.311 | ✅ | ✅ |
| Kael | 7 | Sieg (Dawn) | 30,47 | 34 | 5.674 | ✅ | ✅ |
| Kael | 42 | Sieg (Dawn) | 30,32 | 33 | 4.482 | ✅ | ✅ |

- **Fenster [25,40]: 5/6** (Ziel 6/6) — **FAIL.** Mira/Seed 7 stirbt bei 21,21 min (Level 30).
- **Streuung: 9,32 min** (Ziel ≤ 4) — **FAIL.**
- **Endlevel je Lauf in [25,40]: 6/6** (30–35) — ok (Level-Korridor A5 erfüllt).
- 0 JS-Fehler; Renderer ok (oben).

**Vergleich zur Branch-Belegung der Balance-Lane** (`shots/m10-balance-endgame-after.json`, ohne
XP-Änderung): dort 6/6 Sieg, 30,32–30,60 min, Level 36–40, Streuung 0,28 min. Derselbe Lauf
mira/7: Branch Sieg @ 30,46 min (Level 38, 5.647 Kills) → main **Tod @ 21,21 min** (Level 30,
2.132 Kills). Der Todeszeitpunkt 21,21 min liegt genau im Golem-Fenster Minute 18–24 — dieselbe
Todeszone, die vor dem Fix der Balance-Lane auftrat (dort 20,74/21,50/23,81 min).

**Wiederholung:** keine. Die Simulation ist bei festen Substeps je Seed deterministisch; eine
Wiederholung würde dasselbe Ergebnis liefern. Ergebnis ist verbindlich (K4 greift).

## K3 — Boss-Dauern (erster Auftritt je Boss, Korridor 20–60 s): **FAIL**

Aus denselben 6 Läufen (Spawn `run.bossesSpawned`, exakte Todeszeiten via `bossDefeated`-Event,
Sichtungsende via HUD-Poll). 33 Bosse erschienen und besiegt, 29/33 im Korridor
(Spannweite 8,4–47,4 s, Median 28,9 s). Korridor-Verstöße — **alle in Seed-42-Läufen**:

| Char | Seed | Boss | Dauer | Spawn (s) |
|---|---|---|---|---|
| Mira | 42 | Moorkönigin | **8,4 s** | 300 |
| Mira | 42 | Hexenzirkel | **19,2 s** | 1500 |
| Mira | 42 | Der Hohle König | **16,9 s** | 1800 (Endboss) |
| Kael | 42 | Der Hohle König | **15,8 s** | 1800 (Endboss) |

- **Korridor [20,60] s: 29/33** (Ziel: alle) — **FAIL.**
- Einordnung (dünne Basis: Boss-Dauern wurden hier erstmals erhoben — die r3-Läufe der
  Balance-Lane zeichneten keine auf): Seed-42-Läufe kämpfen mit deutlich höherer Spieler-DPS
  gegenüber Boss-HP; die Endboss-Werte fallen zudem in die Dawn-Phase (Sieg bei 30,3 min ≈ 20 s
  nach Endboss-Spawn). Boss-HP/Tempo liegen in `src/data/bosses` und wurden von keiner Lane
  angefasst — siehe Befundliste B2.

## K4 — Befundliste (für Dora's Fix-Job, Messung im selben Lauf)

**B1 — Interaktion XP-Kurve × Massen-Spike Minute 18–24 (Hauptbefund, K2-FAIL).**
- *Beleg:* mira/7 Branch (ohne `635ad50`): Sieg 30,46 min, Level 38. main (mit `635ad50`):
  Tod 21,21 min, Level 30, Kills 2.132 (−62 %). Level-30-Region = Start des
  `XP_ENDGAME`-Aufschlags (wirkt ab Level 28) — genau im Todesfenster.
- *Kette:* steifere XP-Kurve ab Level 28 → weniger Level-ups/Waffenausbau im Fenster 18–24 →
  Kill-Rate sinkt → Ankunftsrate überwältigt den Spieler trotz Late-Deckel (300 @ 960x540)
  und HP-Relief (−25 % ab Minute 18).
- *Hebel 1 (empfohlen):* `src/data/waves.ts` — **Ankunftsrate statt Deckel dämpfen**:
  dedizierte Spawnraten-Dämpfung Minute 18–24 (z. B. Faktor auf `lateGameSpawnRate`/Basis-Rate
  mit Rampe, analogous zum HP-Relief-Muster). Erwarteter Gewinn: Gegner-Dichte im Todesfenster
  sinkt auch bei niedrigerem Spieler-Level; Minute 0–17 und 25+ bleiben unberührt.
- *Hebel 2 (Alternative, riskanter):* `src/logic/scaling.ts` — HP-Relief früher/steiler
  (`HP_RELIEF_START_S` 1080 → 960 oder max −25 % → −30 %). Risiko: Boss-Dauern sind bereits
  4× unter Korridor (B2) — ein tieferes HP-Relief verkürzt sie weiter. Nur in Kombination
  mit einer B2-Kompensation fahren.
- *Nicht empfohlen:* XP-Kurve zurückschrauben (`src/logic/xp.ts`) — die erfüllt das
  Level-Band [25,40] (6/6) und ist A5-Abnahme; berühren verschiebt das Problem nur.

**B2 — Boss-Dauern unter Korridor in Seed-42-Läufen (K3-FAIL).**
- *Beleg:* Tabelle oben; 4 Verstoße, alle seed 42; kürzester 8,4 s (Moorkönigin @ min 5).
- *Datei/Hebel:* `src/data/bosses.ts` (Boss-HP/Grundtempo) bzw. DPS-Referenz der Messläufe.
- *Reihenfolge:* erst B1 fixen und neu messen — B1 ändert Level-/Waffenstand und damit die
  Boss-Dauern mit. B2 erst dann bewerten (Messskript zeichnet Boss-Dauern jetzt mit aus).

## Abnahme-Übersicht

| Karte | Kriterium | Ergebnis |
|---|---|---|
| K1 | Renderer-String pro Lauf + Boss-Aufzeichnung im Skript (kein Spielcode) | ✅ PASS (1fa59d1) |
| K2 | 6/6 Endzeit [25,40], Streuung ≤ 4 min, Level [25,40], 0 JS-Fehler | ❌ **FAIL** (5/6, Streuung 9,32) |
| K3 | Boss-Dauern im Korridor 20–60 s | ❌ **FAIL** (29/33) |
| K4 | nur bei FAIL: Befundliste | ✅ erstellt (B1/B2 oben) |

Gesamt: **Lane-Ergebnis FAIL → Fix-Job (Dora) nötig.** Spielcode unangetastet; Belege nur in
dieser Area (`shots/m10-balance-band-after.json`, dieses Dokument, Skript-Commit 1fa59d1).
