# Lane m10-weapons-flake — `chest-roll-names` quantifizieren

- **Basis-SHA:** `9477f33` (main-HEAD beim Start; Merge m8-display lief parallel)
- **Ziel-Check:** `chest-roll-names` in `scripts/verify-weapons.mjs`
- **Auftrag:** 12 Wiederholungen, Flake-Rate, Zeitpunkt des Fehlschlags, Hypothese Timing vs. RNG.
  Ergebnis = Empfehlung, ob der Check umgebaut werden muss. **Keine Umsetzung in dieser Lane.**
- **Regeln:** nur in diesem Worktree, kein checkout/merge/rebase/push; `scripts/**` und `src/**` nur lesen.
  Kein `sleep`-Polling; lange Läufe synchron mit `timeout`; Logs unter `~/tmp/m10-weapons-flake/`.

## Karten-Checkliste

- [x] **Karte 1 — Läufe (WIP, Zwischenstand):** `node scripts/verify-weapons.mjs`
      seriell, je Lauf eigenes Log + Laufzeit + Ergebnis. Beleg: `shots/m10-weapons-flake-runs.json`.
      *Status 2026-11-26 20:05 UTC:* Läufe 00–06 ausgewertet, alle `Roll-Namen` PASS.
      Lauf 07 lief beim Supervisor-Stop noch (orphaned, wird nach Abschluss nachgetragen).
- [ ] **Karte 2 — Analyse:** Fehlschlag-Läufe vs. PASS-Läufe, Code-Lesung (Zeile/Bedingung). Abnahme: Flake-Rate n/12, Hypothese mit Zeile.
- [ ] **Karte 3 — Report:** diese Datei mit Tabelle, Hypothese, Umbau-Empfehlung (Zeilenbezug).

## Zwischenstand Karte 1 (Läufe)

| Lauf | Dauer (ms) | rc | `chest-roll-names` | sonstige Fehler |
|---|---|---|---|---|
| 00 (Baseline, vor Loop) | 262899 | 1 | PASS | `evolution-state` (Seele 0) |
| 01 | 214967 | 0 | PASS | – |
| 02 | 213258 | 0 | PASS | – |
| 03 | 213730 | 0 | PASS | – |
| 04 | 215084 | 0 | PASS | – |
| 05 | 214856 | 0 | PASS | – |
| 06 | 215216 | 0 | PASS | – |
| 07 | (läuft / nachgetragen) | ? | ? | ? |

**Flake-Rate `chest-roll-names` (Zwischenstand): 0 / 7 beobachtete Läufe** (Lauf 00 Baseline mitgezählt;
der 12er-Loop selbst: 0/6 bis Lauf 06). Auffällig: `evolution-state` flakte in der Baseline (Seele 0),
in den Loop-Läufen 01–06 aber nicht — separater Flake, nicht Gegenstand dieser Lane.

## Code-Lesung (Vorarbeit Karte 2)

Der Check pollt während der Rollphase in der Screenshot-Schleife:

- `scripts/verify-weapons.mjs:468` — `for (let i = 0; i < 48; i++)` (Screenshot-Schleife)
- `scripts/verify-weapons.mjs:469` — `await chestPage.screenshot(...)` (dominanter Zeitfresser pro Iteration)
- `scripts/verify-weapons.mjs:471` — `if (!rollCaptured && (await rollNamesComplete(chestPage))) rollCaptured = true;`
- `scripts/verify-weapons.mjs:478` — `await chestPage.waitForTimeout(90);`
- `scripts/verify-weapons.mjs:52–66` — `rollNamesComplete`:
  - `:60` `rolling = slots.every(s => !s.level?.value)` (alle Slots noch nicht ausgerollt)
  - `:61` `allFull = slots.every(s => rewards.includes(text + text2))`
  - `:62` `twoLine = slots.some(s => s.text2?.visible && s.text2?.value)`
  - `:64` `needsTwoLine = rewards.some(r => r.length > 13)`
  - `:65` `return rolling && allFull && (!needsTwoLine || twoLine)`

Roll-/Settle-Timing in der UI:

- `src/scenes/UI.ts:443` — Rollphase startet erst bei `delayedCall(520)`
- `src/scenes/UI.ts:450–459` — Rollnamen-Ticks alle `delay: 95`, `repeat: 7` (8 Ticks)
- `src/scenes/UI.ts:455` — `pickRollName(rewards, tick++)`; `:807` zyklisch `rewards[tick % len]`
- `src/scenes/UI.ts:465` — erster Slot settelt bei `1450 + i*220` ms und setzt `slot.level` → `rolling` wird false
- `src/logic/text.ts:7` — `slotNameLines(name, 13)`: erst ab >13 Zeichen zweizeilig

## Ursachen-Hypothese (Timing, nicht RNG)

`rollNamesComplete` ist nur in einem **schmalen Zeitfenster** wahr:
`rolling` gilt von t≈520 ms bis zum ersten Settle t≈1450 ms (≈930 ms). Zusätzlich verlangt `needsTwoLine`
(bei einem Belohnungsnamen >13 Zeichen, z. B. `PHÖNIXSCHWARM`=13 → nein, `GEWITTERSIEGEL`=14 oder
`SEELENLEUCHTFEUER`=17 → ja), dass mindestens ein Slot zweizeilig ist. Da `pickRollName` **pro Tick** für
alle Slots denselben Namen liefert (`UI.ts:455,807`), ist `twoLine` nur an den 95-ms-Ticks wahr, an denen
gerade ein langer Name gezeigt wird.

Die Schleife macht pro Iteration einen Screenshot (~50–150 ms unbelastet). Unter Last (parallele Lanes,
viele Screenshots) steigt die Screenshot-Latenz stark; dann springt die Poll-Iteration über die 95-ms-Ticks
hinweg und `rollCaptured` bleibt false, obwohl die Rollphase korrekt ablief. **RNG allein kann den Fehler
nicht auslösen** (der angezeigte Name stammt immer aus `result.rewards`, `allFull` ist damit erfüllt); RNG
bestimmt nur, *ob* überhaupt ein >13-Zeichen-Name in der Truhe liegt und damit wie schmal das Fenster ist.

## Umbau-Empfehlung (Karte 3, vorläufig)

Den Check **zustandsbasiert** machen statt screenshot-getaktet zu pollen:

1. Kein Screenshot als Poll-Takt: `page.waitForFunction(() => /* rollNamesComplete-Bedingung */, { timeout })`
   bzw. Polling nur mit `waitForTimeout(30–50)` und `evaluate`, Screenshots separat/parallel.
2. Roll-Assert nicht an einem zufälligen Tick festmachen, sondern **einmalig** in einem `page.evaluate`
   den Rollzustand beobachten und das Ergebnis über ein `window.__lf`-Flag/Event einsammeln, ODER die
   Zwei-Zeilen-Prüfung aus dem Timing lösen (z. B. Belohnungsname deterministisch lang wählen oder
   `twoLine` über einen ganzen Tick-Zyklus akkumulieren statt pro Poll).
3. Besser noch: den Check von der Animation entkoppeln — `slotNameLines`/`needsTwoLine` rein funktional
   testen (Unit-Test auf `src/logic/text.ts`) und im Verify nur den Endzustand prüfen.

*(Wird in Karte 3 finalisiert, sobald alle Läufe vorliegen.)*
