# Lane m10-game-md-sync-r2 — GAME.md-Sync nach der Merge-Welle (2026-11-28)

Auftrag: GAME.md (verbindliche Spec) nach dem Ist bringen. Anlass: P3 aus
`m10-charstats-spec-followup` („GAME.md Z.356/357-Spec-Drift über den nächsten
GAME.md-Sync-Job“) plus Divergenzprüfung nach den Merges `charstats-spec-followup`,
`mira-hp-balance-check`, `mobile-fps-cap` (BILDRATE-Option, 8 Zeilen) und der
Heap-Kette. Karten: #13304 (K1 Divergenzliste) · #13305 (K2 Korrekturen) ·
#13306 (K3 Gegenprobe) · #13307 (K4 Commit).

Area (Disponent): `GAME.md`, `docs/lanes/m10-game-md-sync-r2.md`, `.lane-done`.
Keine Änderungen an `src/` oder `tests/`. Kein Push.

## K1 — Divergenzliste Spec ↔ Daten (je Zeile Beleg)

Prüfumfang: Charaktere (Z.34/35), Powerups (Z.47–55), Waffen/Evolutionen (Z.37–65),
Gegner-/Boss-Zeiten (Z.71–89), Gegner-Cap (Z.170), Optionsmenü (Z.311/389/400),
M6-Balance-Status (Z.356/357), v1.0-Status (Z.447–463), `scripts/acceptance-count.mjs`.

| # | GAME.md-Stelle | Spec-Wert | Ist (Daten) | Beleg (Datei:Zeile) | Status | Maßnahme (K2) |
|---|---|---|---|---|---|---|
| D1 | Z.52 (Powerup `heart`) | „+20 Max-HP, **+0.2** HP/s Regeneration“ | `maxHpFlat: 20`, `regen: 0.3` je Stufe (seit M6-balance, Commit `a345da9e`) | `src/data/passives.ts:39-41` (Daten), `tests/logic.test.ts:207` (`l * 0.3`), `tests/passive-stack.test.ts:99` (`0.3 * effLevel`) | geklärt: Test pinnt 0.3, Daten = Tests; Spec ist alt | GAME.md Z.52 → **+0.3** HP/s |
| D2 | Z.170 (Gegner-Cap) | „`maxActiveEnemies`: **160 + 16/Minute, max. 500**“ | Basis `100 + 13/Minute`, skaliert mit sichtbarer Fläche (M8, Faktor ≤ 640×360-Referenz), ab Minute 18 Late-Game-Deckel 200, hart max. 500 | `src/logic/scaling.ts:88-101` (`base = 100 + minute * 13`, `LATE_GAME_ACTIVE_CAP = 200`, `Math.min(500, …)`), `tests/balance-endgame.test.ts:35-61` (pinnt 321 @ 17:59, 200-Late-Cap, 244/300 je View) | geklärt: Tests pinnen die M8/M10-Kurve | GAME.md Z.170 → aktuelle Kurve |
| D3 | Z.356/357 (M6-Balance-Status) | Mira Ember/**250 HP**/62 Tempo; Kael Flail/**253 eff. HP/55,9 Tempo/Rüstung 2**; XP-Kurve „8 + 1.1·n²“ (Level 25–40) ohne Endgame-Aufschlag | Mira HP **90**; Kael HP 130, `maxHpPct 20`, Rüstung **1**, Tempo **59** (−5 % eingerechnet, `moveSpeedPct` entfernt); XP-Kurve mit Endgame-Aufschlag ab Level 28 | `src/data/characters.ts:13-33` (Kommentare mit F2–F5-Entscheid), `tests/charselect-truth.test.ts:85-91` (pinnt maxHpPct 20, `+20% MAX-HP`, kein „-5% TEMPO“), `src/logic/xp.ts:51,68-78` (`XP_ENDGAME_START_N = 26`), Entscheidungs-Logik in `docs/lanes/m10-charstats-spec-followup.md` (P3) | geklärt: F2–F5 entschieden (Spec Z.34/35 ist Quelle); Z.356/357 sind M6-Tuning-Ist, kein formeller Spec-Widerruf | GAME.md Z.356/357 als **historisch** markieren + Fußnote mit Ist-Werten (kein Umbau des Statusberichts) |
| D4 | Z.389 (M6-menus Optionsliste) | „Optionen (Musik/SFX/Shake/Damage-Numbers/Skalierung, localStorage)“ | **8 Zeilen**: MUSIK, SFX, SCREEN-SHAKE, DAMAGE-NUMBERS, MASTER MUTE, SKALIERUNG, BILDRATE, ZURÜCK (Master-Mute seit M6-final, BILDRATE seit m10-mobile-fps-cap) | `src/audio/options.ts:141` (OPTION_ROWS), `tests/gamepad-nav.test.ts:217` (`length).toBe(8)`, „inkl. MASTER MUTE, BILDRATE und ZURÜCK“), `tests/m6-menus.test.ts:24-25`, `docs/lanes/m10-mobile-fps-cap.md` | geklärt: Tests pinnen 8 Zeilen | GAME.md Z.389 → Liste ergänzt (Master-Mute, Bildrate) |
| D5 | Z.461–462 (v1.0-Status) | „einziger Suite-Blocker ist das fullrun-Heap-Tor (+18,2 %/+20,8 % > +15 %)“ | Heap-Tor auf aktuellem main **PASS**: 2/2 Läufe HARD **−25,2 %** (endMB 48,5 MB vs Minute 1 64,8 MB), nach Hazard-Tex-Cap-Merge `39fdac5d`; kein Retentions-Leck sichtbar | `docs/lanes/m10-heap-gate-recovery.md` (K1 Tor-Tabelle, K2 Entscheidung „ENTFÄLLT FIX-FALL“), Belege `~/games/.evidence/m10-heap-gate-recovery/` (`k1-run1.json`, `k1-run2-retry.json`), Renderer Mesa Intel RPL-S | geklärt: Messbelege 2 Läufe | GAME.md Z.462 → Blocker-Status aktualisiert (Nachabnahme F-Werte als überholt markieren) |
| B1 | Z.342 (M5-Lückenliste) | „kein separater Master-Mute“ | MASTER MUTE existiert seit M6-final | GAME.md Z.400, `src/audio/options.ts:141` | **historisch, kein Edit**: Z.342 steht im datierten M5-Statusabschnitt und ist dort eine Momentaufnahme; Z.400 (M6-final) dokumentiert die Einführung | nur dokumentiert (keine Korrektur — historische Statusabschnitte werden nicht umgeschrieben) |

**Kein Drift festgestellt (Stichproben mit Beleg):**
- `scripts/acceptance-count.mjs` → `ok:true` (Soll = Ist: 30 Gegner, 6 Waffen, 6 Powerups, 6 Evolutionen, 6 Bosse, 2 Charaktere) gegen Z.13/67/81.
- Z.34/35 Charakter-Spec ↔ `src/data/characters.ts`: HP 90/130, areaPct 10, maxHpPct 20, Rüstung 1, Tempo 59 (= 62·0,95 gerundet, F3-Variante b) — F1–F5 sind bereits datenseitig umgesetzt.
- Z.40–45 Waffennamen/-ids und Z.60–65 Evolutionsnamen ↔ `src/data/weapons.ts`, `src/data/evolutions.ts`: identisch.
- Z.50–55 Powerup-Werte (boots +8 %, tome −8 %, charm +25 %, whetstone +10 %, hourglass +10 %) ↔ `src/data/passives.ts`: identisch (außer D1 heart-regen).
- Z.29 Boss-Zeiten (5/10/15/20/25/30 min) ↔ `src/data/bosses.ts` (`atSecond` 300…1800): identisch.
- Z.37/47 „je Stufe 1–8“ / „1–5“ ↔ `weapons.ts maxLevel: 8`, `passives.ts maxLevel: 5`: identisch.

**Ungeklärte Driften / offene Produkt-Fragen (kein Ratens, keine Änderung):**
- Keine neuen. Die aus der charstats-Lane bekannten Produkt-Fragen P1 (spec-schweigende
  Felder in Z.34/35 ergänzen?) und P2 (Balance-Korridor-Neuprüfung) bleiben dort
  dokumentiert und betreffen `src/data`-Kommentare bzw. Balance, nicht diese Sync-Lane.
- Hinweis für Dom: Die XP-Kurve ist in der Spec nur in historischen Statuszeilen (Z.138, Z.356)
  benannt, es gibt keine normative Zeile. Falls sie verbindlich werden soll (inkl. Endgame-Aufschlag
  ab Level 28, `src/logic/xp.ts`), wäre eine Spec-Zeile im Technik-Abschnitt der richtige Ort.

## K2 — Korrekturen in GAME.md (umgesetzt)

Je Korrektur gilt die Zeile in der Tabelle oben als Beleg. Zusammenfassung:

1. **Z.52 (D1):** heart „+0.2“ → „+0.3 HP/s Regeneration“.
2. **Z.170 (D2):** Gegner-Cap-Formel auf M8/M10-Ist korrigiert (100 + 13/Minute, View-Skalierung,
   Late-Game-Deckel 200 ab Minute 18, hart 500).
3. **Z.356/357 (D3):** als historischen M6-Tuning-Stand markiert (P3), Fußnote mit den seit
   `m10-charstats-spec-followup` geltenden Spec-Werten.
4. **Z.389 (D4):** Optionsliste auf den 8-Zeilen-Ist ergänzt (MASTER MUTE, BILDRATE).
5. **Z.462 (D5):** v1.0-Status um die Heap-Tor-Entwarnung ergänzt (2/2 Läufe −25,2 %, Belege
   in `~/games/.evidence/m10-heap-gate-recovery/`).

Nicht angefasst: historische Statusabschnitte (M1–M9) im Übrigen, `src/`, `tests/`.

## K3 — Gegenprobe (nur lesen)

- `tests/data.test.ts` + `tests/charselect-truth.test.ts` laufen grün (Ausgabe im K4-Commit-Kommentar /
  unten). Testdateien wurden **nicht** geändert.
- Keine der K2-Spec-Korrekturen widerspricht einem gepinnten Test; D1/D2/D4 sind direkt aus den
  Test-Pins abgeleitet (`tests/logic.test.ts:207`, `tests/balance-endgame.test.ts:35-61`,
  `tests/gamepad-nav.test.ts:217`), D3 aus `tests/charselect-truth.test.ts:85-91`.
- Keine Test-/src-Änderungen im Diff (`git diff --stat` zeigt nur GAME.md + Lane-Doku + Board).

## Status / Nachweise

- K1: Divergenzliste oben (#13304) — 5 geklärte Driften (D1–D5), 1 historisch ohne Handlungsbedarf (B1), Stichproben ohne Drift.
- K2: GAME.md korrigiert (#13305) — nur belegte Stellen, keine neuen Spec-Inhalte. Diff: 5 Stellen (heart-Regen,
  maxActiveEnemies, Z.356/357-Historik-Marker, Optionsliste, Heap-Entwarnung).
- K3: Gegenprobe grün (#13306) — `npx vitest run tests/data.test.ts tests/charselect-truth.test.ts`
  → **2 Dateien / 15 Tests passed** (2026-11-28 16:38Z); `npx tsc --noEmit` rc=0.
  `git diff --stat`: nur `GAME.md` (+ Lane-Doku/Board); keine `src/`-/`tests/`-Änderungen.
  Kein GAME.md-Wert widerspricht einem gepinnten Test (D1/D2/D4 sind aus den Pins abgeleitet, D3 aus
  `tests/charselect-truth.test.ts:85-91`, D5 aus Mess-JSON außerhalb des Repos).
- K4: Commit dieser Lane (#13304–#13307, `.lane-done` enthalten). Kein Push, kein Merge.
