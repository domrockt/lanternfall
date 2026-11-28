# Lane m10-charstats-ssot — Charakter-Daten sind SSOT Richtung GAME.md

Ziel: CharSelect zeigt Mira „HP 250", GAME.md:34 nennt HP 90 — die Datenbasis driftet.
GAME.md ist die verbindliche Design-Spec (Befund art-director-Sichtung 2026-11-28, requests.md).
Karten: #10748 (K1 Audit) · #10749 (K2 Fix) · #10750 (K3 Guard) · #10751 (K4 Beleg).

## K1 — Audit-Tabelle: GAME.md vs src/data/characters.ts

Beleg GAME.md: Zeile 34 (Mira-Spec), Zeile 35 (Kael-Spec), Zeile 173 (Basis-Tempo 62 px/s),
Zeile 356 (M6-Balance-Statusbericht). Beleg Code: `src/data/characters.ts` (Stand vor Fix, Zeilen nach Datei).
Waffennamen gegen `src/data/weapons.ts:7` (ember = „Glutfunke") und `:26` (flail = „Kettenflegel") geprüft.

### Mira Ashwick

| Feld | GAME.md | characters.ts | Status |
|---|---|---|---|
| HP | **90** (Z. 34: „Bonus: +10 % Flächenwirkung, HP 90") | `hp: 250` (Z. 9) | **FIX → K2** |
| Tempo | 62 px/s Basis (Z. 173: „62,0 px/s"; Z. 356: „62 Tempo") | `speed: 62` (Z. 10) | OK |
| Startwaffe | Glutfunke (Z. 34) | `startWeapon: "ember"` (Z. 12) | OK |
| Bonus | +10 % Flächenwirkung (Z. 34) | `mods.areaPct: 10` (Z. 13) | OK |
| Rüstung | schweigt | `armor: 1` (Z. 11) | FRAGE (F1) |
| Regen | schweigt | `mods.regen: 1.0` (Z. 13) | FRAGE (F1) |

**Widerspruch in GAME.md selbst:** Z. 356 (M6-Balance-Status) nennt „Mira Ember/**250 HP**/62 Tempo" —
widerruft die Spec-Z. 34 („HP 90") aber nicht formell. → **FRAGE (F2)** an Dom; Daten folgen vorerst Z. 34.

### Bruder Kael

| Feld | GAME.md | characters.ts | Status |
|---|---|---|---|
| HP | **130** (Z. 35: „… -5 % Tempo, HP 130") | `hp: 130` (Z. 22) | OK |
| Tempo | **-5 % Tempo** (Z. 35) → Basis 62 ⇒ 62·0,95 ≈ **58,9 px/s** | `speed: 59` (Z. 23) **und** `mods.moveSpeedPct: -5` (Z. 26) → effektiv 59·0,95 ≈ **56,05 px/s** (Doppel-Abzug: 59 ist bereits 62·0,95 gerundet, der Mod zählt nochmal -5 %) | **FRAGE (F3)** — Fix bricht fremde Tests |
| Startwaffe | Kettenflegel (Z. 35) | `startWeapon: "flail"` (Z. 25) | OK |
| Max-HP-Bonus | **+20 % Max-HP** (Z. 35) | `mods.maxHpPct: 25` (Z. 26) | **FRAGE (F4)** — fremder Test pinnt 25 |
| Rüstung | **1 Rüstung** (Z. 35) | `armor: 2` (Z. 24) | **FRAGE (F5)** — fremder Test + Mira-Rüstung schweigt |
| Sonstige Mods | schweigt | `mods.maxHpFlat: 90, regen: 1.5, xpPct: -25` (Z. 26) | FRAGE (F1) |

Z. 356 („Kael Flail/253 eff. HP/…/Rüstung 2") ist konsistent mit den **Daten** (130·1,25+90 = 253; armor 2),
nicht mit der Spec-Z. 35 (+20 %, 1 Rüstung) — selbes Muster wie F2: Statusbericht vs Spec.

### Warum F3–F5 nicht im Lane-Umfang fixbar sind (Disponent-Grenze)

Meine Dateien: `src/data/characters.ts`, `tests/charstats-ssot.test.ts`, `scripts/m10-charstats-ssot.mjs`,
`docs/lanes/m10-charstats-ssot.md`, `shots/m10-charstats-*`. Jede der drei Korrekturen bricht einen
fremden, bewusst gepinnten Test:

- **F3 (Tempo-Doppel-Abzug):** `tests/data.test.ts:104` verlangt `mira.speed > kael.speed`; Setzen von
  `kael.speed = 62` (+ Mod −5 %) macht beide 62 → rot. Alternativ Entfernen des Mods ändert die
  Bonus-Zeile → bricht `tests/charselect-truth.test.ts:90` („+25% MAX-HP / -5% TEMPO").
- **F4 (maxHpPct 25 → 20):** `tests/charselect-truth.test.ts:86` pinnt `toBe(25)` **explizit** mit Kommentar
  „Daten sagen maxHpPct 25" (Bewusst-Entscheidung der Lane m10-charselect-truth gegen den +20 %-Befund).
  Das ist ein echter Spec-vs-Daten-Konflikt, der dort bereits einmal anders entschieden wurde → Dom fragen,
  nicht heimlich umdrehen.
- **F5 (armor 2 → 1):** `tests/data.test.ts:105` verlangt `kael.armor > mira.armor`; Kael auf 1 senken
  müsste Mira auf 0 senken — aber GAME.md schweigt zu Miras Rüstung (Erfindungsverbot).

## Fragen an Dom (eingetragen in coding-brain/Lead/Fragen an Dom.md, 2026-11-28)

- **F1 (schweigende Felder):** Mira `armor: 1`, `regen: 1.0`; Kael `maxHpFlat: 90`, `regen: 1.5`,
  `xpPct: -25` stehen nicht in GAME.md. Sollen sie in die Spec (GAME.md-Z. 34/35 ergänzen) oder aus den
  Daten raus? Bis dahin: unverändert.
- **F2 (Mira-HP 90 vs 250):** Spec-Z. 34 sagt HP 90, M6-Balance-Status Z. 356 sagt 250. Ich setze die
  Daten Richtung Spec auf **90** (K2). Falls 250 gewollt war: Spec-Zeile anpassen und meine Korrektur
  zurückdrehen; der Balance-Korridor (Überleben 20–28 min) wurde mit 250 getunt und sollte neu geprüft werden.
- **F3 (Kael-Tempo-Doppel-Abzug):** `speed: 59` + `moveSpeedPct: -5` ergeben effektiv ≈56 px/s statt der
  Spec ≈58,9. Vorschlag: `speed: 62` behalten und −5 % nur als Mod; bricht `tests/data.test.ts` (Tempo-
  Vergleich) und braucht Sync der CharSelect-Bonus-Zeile.
- **F4 (Kael maxHpPct 25 vs Spec +20 %):** `tests/charselect-truth.test.ts:86` pinnt 25 bewusst. Welcher
  Wert gilt — Spec (20) oder Daten-Entscheidung (25)? Bei 20: fremder Test + Anzeige-JSON sind anzupassen.
- **F5 (Kael-Rüstung 2 vs Spec 1):** Spec-Z. 35 sagt „1 Rüstung". Senkung auf 1 erfordert Entscheidung
  zu Miras Rüstung (schweigt) + `tests/data.test.ts:105`.

## K2 — Fix (nur eindeutige Felder)

- `mira.hp: 250 → 90` (GAME.md:34 ist eindeutig; Z. 356 ist Statusbericht, nicht Spec — F2 markiert den
  Balance-Rest). CharSelect liest `char.hp` direkt (`CharSelect.ts:135`), zeigt damit automatisch „HP 90".
- Folgefix: `shots/m10-charselect-truth-after.json` neu erzeugt (`node scripts/m10-charselect-truth.mjs
  --phase=after`) — der fremde Guard `tests/charselect-truth.test.ts` vergleicht Anzeige (Snapshot) gegen
  Daten und muss nach der Datenänderung mitziehen. Datei ist nicht fremd beansprucht; minimaler,
  begründeter Eingriff (Anzeige folgt Daten unverändert 1:1).
- Kael-Felder: unverändert (F3–F5 offen, siehe oben).
- Ergebnis: `npx vitest run tests/data.test.ts tests/charselect-truth.test.ts` grün (Beleg im K2-Commit).

## K3 — Guard-Test

`tests/charstats-ssot.test.ts` pinnt: Mira HP 90 / Tempo 62 / areaPct 10 / Start ember; Kael HP 130 /
Start flail; relative Checks: effektive HP Kael > Mira, Tempo Mira > Kael (Basis), Kael-Rüstung ≥
Mira-Rüstung (Ist-Stand, bis F5 entschieden ist) — plus GAME.md-Anker als Kommentar je Zeile, damit ein
Rückfall sofort als Spec-Verstoß sichtbar ist.

## K4 — Beleg

- `scripts/m10-charstats-ssot.mjs`: liest `CHARACTERS` (TS via Regex, wie m10-charselect-truth.mjs),
  rendert CharSelect headless, schreibt Anzeige-JSON nach `~/games/.evidence/m10-charstats-ssot/`
  (Belege außerhalb git, Dom 27.11.) und Screenshot.
- Sichtbeleg: `shots/abnahme/m10-charstats-charselect-640.png` (Briefing nannte `shots/m10-charstats-*`;
  `shots/*` ist gitignored, Abnahme-Bilder gehören nach `shots/abnahme/` → Pfad angepasst, Name gleich).
- Kein Eingriff in `src/scenes/CharSelect.ts` oder `src/input/**`.

## Status / Nachweis

| Karte | Commit | Nachweis |
|---|---|---|
| #10748 K1 | 2365500c | Tabelle oben, F1–F5 in Fragen an Dom.md |
| #10749 K2 | bbf8cf36 | mira.hp 90; truth-after.json regeneriert (0 Abweichungen); data+truth 15/15 grün |
| #10750 K3 | 4debf536 | tests/charstats-ssot.test.ts 5/5 grün |
| #10751 K4 | (dieser Commit) | scripts/m10-charstats-ssot.mjs: 20 Zeilen, **0 Abweichungen, 0 JS-Fehler**; JSON `~/games/.evidence/m10-charstats-ssot/charselect-display.json`; Sichtbeleg `shots/abnahme/m10-charstats-charselect-640.png` (2x-View: `.evidence/.../charselect-640-2x.png`) — zeigt Mira „HP 90“ |

**Lane-Ergebnis:** `npm test` 1932/1932 grün (178 Dateien), `npx tsc --noEmit` rc=0, `npm run build` rc=0.
Geändert: `src/data/characters.ts` (1 Wert), `tests/charstats-ssot.test.ts` (neu), `scripts/m10-charstats-ssot.mjs` (neu),
`shots/m10-charselect-truth-after.json` (regeneriert, nicht geclaimt — Folgefix des Datenwerts, Anzeige==Daten unverletzt),
`docs/lanes/m10-charstats-ssot.md`, `shots/abnahme/m10-charstats-charselect-640.png`.
Offen für Dom: F1–F5 (Kael maxHpPct 25 vs +20 %, Kael-Tempo-Doppel-Abzug, Kael-Rüstung 2 vs 1, schweigende Felder).
