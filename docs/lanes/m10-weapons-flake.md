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
      *Status 2026-11-26 20:15 UTC:* Läufe 00–07 ausgewertet (8/12), alle `Roll-Namen` PASS.
      Auf Supervisor-Weisung nach Lauf 07 gestoppt (keine weiteren Läufe); Rest 08–12 offen.
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
| 07 | 217260 | 0 | PASS | – |

**Flake-Rate `chest-roll-names` (Zwischenstand): 0 / 8 beobachtete Läufe** (Lauf 00 Baseline mitgezählt;
der 12er-Loop selbst: 0/7 bis Lauf 07). Auffällig: `evolution-state` flakte in der Baseline (Seele 0),
in den Loop-Läufen 01–07 aber nicht — separater Flake, nicht Gegenstand dieser Lane.

**Einschränkung:** Auf Supervisor-Weisung wurde der 12er-Loop nach Lauf 07 abgebrochen
(`run12.out` zeigte Fortschritt, aber kein Polling-Warten erlaubt). Es liegen 8 Läufe (00–07) vor,
Läufe 08–12 fehlen. Die Flake-Rate ist damit **0/8**, nicht 0/12.

## Analyse (Karte 2)

**Beobachtung:** In 8 gewerteten Läufen (00–07) trat `chest-roll-names` **0×** auf; die 7 Loop-Läufe 01–07
endeten mit rc=0. Die Baseline 00 endete rc=1 nur wegen des separaten `evolution-state`-Fehlers (Seele 0).
Ein Fehlschlag von `chest-roll-names` ließ sich in diesem Lauf-Zeitfenster also nicht reproduzieren.

**RNG ist für diesen Check ausgeschlossen.** Das Szenario ist fix: `seed=12`, `ember` Lvl 8 + `tome` Lvl 1.
Die Truhe enthält dann die Evolution `Phönixschwarm` (upper `PHÖNIXSCHWARM` = 13 Zeichen) plus Angebote aus
`generateOffers` (`src/logic/levelup.ts:37`). Alle möglichen Angebotsnamen sind ≤13 Zeichen
(`GLUTFUNKE` 9, `KETTENFLEGEL` 12, `FROSTNOVA` 9, `DORNENSALVE` 11, `STURMRUNE` 9, `GEISTERLATERNE` 13,
`WINDSTIEFEL` 11, `ARKANES BUCH` 12, `EISENHERZ` 9, `MAGNETAMULETT` 13, `WETZSTEIN` 9, `SANDUHR` 7).
Damit ist `needsTwoLine` (`verify-weapons.mjs:64`) **immer false**; die Bedingung reduziert sich auf
`rolling && allFull` (`:65`). `allFull` ist während des Rollens stets wahr, weil `pickRollName` nur Namen aus
`result.rewards` zieht (`UI.ts:455,807`). Übrig bleibt allein `rolling`.

**Der Check ist ein reines Timing-Rennen.** `rolling = slots.every(s => !s.level.value)` (`:60`) ist nur
zwischen Rollstart `UI.ts:443` (t≈520 ms) und dem ersten Settle `UI.ts:465` (t≈1450 ms) wahr — ein Fenster
von **≈930 ms**. Die Poll-Schleife (`verify-weapons.mjs:468`) macht pro Iteration zuerst einen **Screenshot**
(`:469`, ~50–150 ms unbelastet), dann die Prüfung (`:471`), dann `waitForTimeout(90)` (`:478`). Unter Last
(parallele Lanes, viele Screenshots) kann der erste Screenshot nach `openChest()` >930 ms brauchen; dann landet
der erste `rollNamesComplete`-Aufruf **nach** t≈1450 ms, `rolling` ist dauerhaft false und `rollCaptured` bleibt
false. **Fehlschlag-Zeitpunkt:** genau der erste `evaluate`-Aufruf von `rollNamesComplete`, der nach dem ersten
Slot-Settle (`UI.ts:465`) ausgeführt wird.

**Nicht waffen- oder framezahlabhängig:** der Check läuft nur im Truhen-Block (`seed=12`), unabhängig von den
12 Waffen-Screenshots; die 48 Schleifen-Iterationen sind nur ein grober Zeitdeckel, keine Frame-Zählung.

## Ursachen-Hypothese (Karte 2)

**Timing, nicht RNG.** Der Check ist nur in einem ≈930-ms-Fenster wahr und wird über eine Screenshot-getaktete
Schleife geprüft. Die Screenshot-Latenz ist lastabhängig und kann das Fenster überspringen. RNG kann den Fehler
hier nicht auslösen, weil `needsTwoLine` im fixen Seed-12-Szenario immer false ist und `allFull` während des
Rollens immer wahr. Der bekannte Flake ist damit ein Last-/Timing-Flake.

## Code-Lesung (Karte 2)

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

## Entscheidung / Kartenstatus (Karte 3)

**Der Check muss umgebaut werden — Empfehlung, keine Umsetzung in dieser Lane.** Er ist ein Timing-Rennen:
Die Assertion ist nur ≈930 ms wahr (`UI.ts:443` → `UI.ts:465`) und wird über eine Screenshot-getaktete Schleife
mit potenziell >930 ms pro Iteration geprüft (`verify-weapons.mjs:468–479`). Unter Last ist ein Fehlschlag damit
strukturell möglich, auch wenn er in den 8 beobachteten Läufen (**0/8**) nicht auftrat. RNG ist als Ursache
ausgeschlossen (siehe Analyse).

**Karte #3 = blocked.** Grund: Das Abnahmekriterium „12/12 Läufe dokumentiert“ ist nicht erreichbar — der
12er-Loop wurde auf Supervisor-Weisung nach Lauf 07 gestoppt (keine weiteren Läufe, kein Polling). Vorhanden
sind 8 belegte Läufe (00–07). Flake-Rate `chest-roll-names` = **0/8**. Rest (08–12) als eigene Folge-Karte.

## Konkrete Umbau-Empfehlung (Karte 3)

1. **Screenshot aus dem Poll-Takt nehmen.** Die Roll-Assertion direkt nach `openChest()` (`verify-weapons.mjs:463`)
   als `page.waitForFunction(predicate, { timeout: 1200, polling: 50 })` starten; die 48 Screenshots für das GIF
   danach separat aufnehmen. Damit hängt die Assertion nicht mehr an der Screenshot-Latenz.
2. **Zustandslatch statt Momentaufnahme.** `rollNamesComplete` (`:52–66`) einmalig als Latch im `evaluate`
   akkumulieren (z. B. `window.__lf`-Flag bei jedem rAF, bis t≈1450 ms), statt sie in der Bildschleife zufällig
   zu treffen. Das prüft denselben Zustand, aber ohne Race.
3. **Zwei-Zeilen-Prüfung entkoppeln.** `needsTwoLine` (`:64`) ist im Seed-12-Szenario immer false, die
   „auch 2-zeilig“-Zusicherung feuert dort nie. Sinnvoller als Unit-Test auf `slotNameLines` (`src/logic/text.ts:7`)
   bzw. mit einem deterministisch langen Belohnungsnamen in einem eigenen Testfall.
4. **Assertion semantisch schärfen.** `allFull` (`:61`) vergleicht Rollnamen gegen dieselbe `rewards`-Quelle und
   ist während des Rollens trivial wahr; besser den Endzustand (ausgerollte Namen + `STUFE`/`EVOLUTION` +
   `text2.visible` bei langen Namen) nach dem Settle prüfen, analog zu `evolutionSlotReady` (`:39`).

## Einschränkung / offene Punkte

- **8/12 Läufe** (00–07) dokumentiert, nicht 12/12: der 12er-Loop wurde auf Supervisor-Weisung nach Lauf 07
  gestoppt (kein Polling-Warten erlaubt). Läufe 08–12 fehlen; für eine belastbare Flake-Rate müssten sie
  nachgeholt werden (eigene Folge-Karte).
- Die Baseline 00 zeigte zusätzlich einen **separaten** Flake in `evolution-state` (Seele 0 Schaden), der in
  01–07 nicht auftrat. Nicht Gegenstand dieser Lane, aber als eigener Verdacht notiert.
- Beleg-JSON: `shots/m10-weapons-flake-runs.json` (Läufe + Laufzeiten + Fehlerfelder, Basis-SHA `9477f33`).

