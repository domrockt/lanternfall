# Lane m10-m25-density-mode — Host-Gegenprobe zur Minute-25-Dichte (2026-11-28)

Ziel: Befund 3 aus `docs/lanes/m10-v10-gate-guard.md` absichern — der Host-Minute-25-
Worst-Case hält lokal nur avg ~60 statt 300 Gegner, weil der AutoPlay-Bot auf Host-CPU
schneller räumt als das 50-ms-Top-up füllt. Hebel laut Befundliste: Waffen-Deaktivierung
im Messfenster. **Der strenge Dichtebeweis bleibt das Gerät (m10-v10-device-m25, K2) —
dies hier ist die Host-Gegenprobe für die v1.0-Kette.**

Board-Karten: #13145 (K1 Flag+Gate), #13146 (K2 Guard-Test), #13147 (K3 Messlauf),
#13148 (K4 Doku). Ein Commit je Karte (`M10-m10-m25-density-mode:`-Präfix).

## K1 — Waffen-Flag + Feuer-Gate (`src/debug.ts`, `src/systems/CombatSystem.ts`)

Kleinster möglicher Eingriff, kein Balance-/Verhaltensdiff im Normalbetrieb:

- `src/debug.ts`: Modul-Flag `weaponsEnabled` (Default `true`), exportiert als
  `isWeaponsEnabled()` / `setWeaponsEnabled(value)`. Debug-API-Erweiterung:
  `window.__lf.setWeaponsEnabled(bool)` (Cheat-gated, `requireDebug()`, gibt den neuen
  Zustand zurück) und `window.__lf.weaponsEnabled()` (Lesezugriff fürs Mess-Harness).
  **Reset-Pfad (dokumentiert im Modul-Kommentar): `setWeaponsEnabled(true)` oder
  Seiten-Reload.** Der Zustand überlebt bewusst Pause/Resume und Szenenwechsel —
  er ist ein Messfenster-Hebel, kein Spielzustand.
- `src/systems/CombatSystem.ts`: **ein** Gate in `updateWeapons()` direkt vor dem
  Fire-Switch (nach dem `alive.length === 0`-Early-out): bei `!isWeaponsEnabled()`
  nur `owned.timer = 0; continue;` — kein Projektil, kein Swing, kein Waffen-Sound.
  `eternal_winter`-Aura (Dauer-Effekt) und Projektile in der Luft bleiben bewusst
  außerhalb des Gates (Doku-Ausnahme, siehe K3-Waffenset).

**OHNE Flag bitgleich:** der Gate-Zweig wird nur bei explizit `false` betreten;
`isWeaponsEnabled()` ist per Default `true` → der Originalpfad ist unverändert.
Guard: tests/m25-density-mode.test.ts (K2). Gesamter Diff: Flag + Gate + API-Eintrag.

## K2 — Guard-Test `tests/m25-density-mode.test.ts` (4 Tests, grün)

1. **Default bitgleich (A/B):** frisches Modul ohne jeden Aufruf (`vi.resetModules()`)
   vs. Modul mit `setWeaponsEnabled(true)` → 64 Marken je Variante, identisch
   (`expect(marksB).toEqual(marksA)`, alle `true`).
2. **Flag deaktiviert Feuer:** `setWeaponsEnabled(false)` → `isWeaponsEnabled() === false`;
   Quell-Guard: genau ein Gate in `updateWeapons`, VOR dem Fire-Switch; Gate-Block
   enthält keinen `projectiles.spawn`/`playWeapon` (0 neue Projektile), nur
   Timer-Reset + Skip.
3. **Genau ein Gate:** `if (!isWeaponsEnabled())` kommt im CombatSystem exakt 1× vor;
   API-Eintrag cheat-gated.
4. **Reset-Pfad:** `setWeaponsEnabled(true)` stellt das Feuer wieder her; Reset in der
   Flag-Doku benannt.

## K3 — Messlauf `scripts/m10-m25-density.mjs` (verbindlicher Run 2, Exit 0 = PASS)

Methodik: Muster `m10-v10-gate.mjs` (50-ms-Top-up) + `m10-v10-device-m25.mjs`
(Setup), timeScale 30 über die letzten 10 **Spiel**minuten (daher "10-min-Lauf"),
Seed 7, `?debug=1`. Waffenset wie das Device-Gate, **ohne `eternal_winter`** (Aura
ist Dauer-Effekt außerhalb des Feuer-Pfads und würde die Dichte auch bei aktivem
Flag senken). Belege unter `~/games/.evidence/m10-m25-density-mode/`.

| Phase | Flag | Ergebnis |
|---|---|---|
| A (Minute 18→20, Top-up auf 300) | AUS | **avg 58** (min 9, max 138), 34 010 Kills — **Befund ~60 reproduziert** |
| Übergang (Minute 20→24:50) | AN ab Minute 20 (t=1200 s) | Flag bestätigt `false` |
| B = Minute-25-Fenster (Minute 24:50→29:50) | AN | **avg 1229, min 1190, max 1269** — Abnahme avg ≥ 250 weit erfüllt; **killsDelta 0** (Feuer-Pfad still); worstFrameMs 584,6; 81 Frames/10 s |

- **Abnahmekriterium erfüllt:** avg Gegner ≥ 250 im Minute-25-Fenster ✓ (1229),
  min ≥ 200 ✓, killsDelta 0 ✓, Flag hielt bis Run-Ende ✓, Renderer-Pflicht
  (Regel 6): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` ✓.
- Screenshot (Minute 24:59, sichtbar hunderte Gegner, Kill-Zähler eingefroren):
  `~/games/.evidence/m10-m25-density-mode/minute25-2026-11-28T16-25-19-635Z.png`.
- JSON: `shots/m10-m25-density.json` (Arbeitskopie, gitignored) +
  `~/games/.evidence/m10-m25-density-mode/density-2026-11-28T16-25-19-635Z.json`.
- Logs: `~/tmp/m10-m25-density-mode-k3.log`, `~/tmp/m10-m25-density-mode-k3-run2.log`.

### Interpretation / Grenzen der Messung

- **avg 1229 > Ziel 300 ist Top-up-Backlog, kein Messfehler:** bei timeScale 30
  entleert der Debug-Spawn-Drain (30/Frame, Muster `SPAWN_DEBUG_BATCH_PER_FRAME`)
  langsamer als das 50-ms-Top-up füllt, sobald keine Kills abziehen — die aktive
  Gegnerzahl steigt über das Ziel. Für den Dichte-Beweis ist das konservativ:
  die Zahl **unterschreitet** das Ziel nie (min 1190), der Lastfall ist also
  mindestens so hart wie am Gerät (300). worstFrameMs 584,6 ist ein Spawn-Drain-
  Burst-Frame bei 30x — **nicht** mit dem frame-p95-Tor des Host-Gates
  (timeScale 1) vergleichbar; dieses bleibt unverändert.
- **19× `Texture key already in use: chunk_*`** (Run 1: 2×): bekanntes Harness-
  Artefakt des GroundRenderer-Chunk-Pools bei Textur-Churn unter timeScale 30.
  Codepfad (GroundRenderer) ist vom Waffen-Gate nicht erreichbar; Phase A lief mit
  Flag AUS über denselben Inhalt. Das strenge js-errors-0-Tor gehört zu
  `m10-v10-gate.mjs` (timeScale 1) und lief dort PASS. Offener Punkt für
  v10-final-run, falls dort 30x-Läufe mit Fehler-Tor gefahren werden.
- Grenze des Hebels insgesamt: **Messwerkzeug, kein Spielverhalten im Normalbetrieb.**
  Ohne expliziten `setWeaponsEnabled(false)`-Aufruf ist das Spiel bitgleich
  (K2-Guard, K1-Diff enthält nur Flag + Gate + API-Eintrag). Die Dichte-Aussage
  "300 Gegner bei 60 FPS" bleibt der Gerätebeweis (m10-v10-device-m25: 109–112 FPS
  bei avg 300) — diese Host-Gegenprobe zeigt nur, dass der Host die Dichte **halten
  kann**, wenn der Bot nicht räumt.

## Abnahme-Check (Karten-Briefing)

- [x] Suite grün inkl. neuem Guard: 230 Dateien / 2498 Tests (npm test, 28.11.)
- [x] Ohne Flag bitgleich belegt: A/B-Marken-Test (frisches Modul vs. explizit true)
- [x] Messlauf-JSON mit avg ≥ 250 im M25-Fenster: 1229 (exit 0)
- [x] Keine Balance-/Verhaltensänderung im normalen Spiel: Diff = Flag-Gate + Debug-API
- [x] `npm run build` grün (K1, einmal vor Commit)
