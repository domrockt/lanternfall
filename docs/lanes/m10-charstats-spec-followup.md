# Lane m10-charstats-spec-followup — SSOT-Dreiklang GAME.md-Spec ↔ characters.ts ↔ Tests

Nachfolge-Lane zu `m10-charstats-ssot` (gemergt): die dort offenen Fragen F1–F5 werden daten-/test-seitig
beantwortet bzw. mit Kommentar + Guard gepinnt. GAME.md und `src/scenes/CharSelect.ts` werden **nicht**
angefasst (Daten sind SSOT; Anzeige folgt Daten 1:1). Karten: #12925 (K1 Audit) · #12926 (K2 Daten) ·
#12927 (K3 Tests) · #12928 (K4 Guard).

## K1 — Ist-Audit (Stand vor dieser Lane)

**Baseline `npm test`: 226 Dateien / 2455 Tests grün** (2026-11-28, Worktree `m10-charstats-spec-followup`).

Belege: `src/data/characters.ts` (Ist), GAME.md Z.34/35 (Spec Charaktere), Z.173 (Basis-Tempo 62,0 px/s),
Z.356/357 (M6-Balance-Statusbericht — Status, nicht Spec), `src/logic/stats.ts:133-137`
(`effectiveMoveSpeed = base · (1 + moveSpeedPct/100)`), `tests/data.test.ts:100-102`,
`tests/charselect-truth.test.ts:84-91`, `tests/charstats-ssot.test.ts:30-46`.

| # | Befund | Spec (GAME.md) | Daten (characters.ts) | Tests | Audit-Urteil |
|---|---|---|---|---|---|
| F1 | Schweigende Felder | Z.34/35 schweigen zu Miras `armor`/`regen` und Kaels `maxHpFlat`/`regen`/`xpPct` | `mira.armor 1`, `mira.mods.regen 1.0`, `kael.mods.maxHpFlat 90`, `regen 1.5`, `xpPct -25` — **ohne Kommentar** | keine Pins | Keine Drift (Spec schweigt), aber **stille Felder** → K2 kommentiert, Produkt-Frage bleibt offen (P1) |
| F2 | Mira HP 250→90 | Z.34 „HP 90“ | `hp: 90` (ssot-Lane gefixt) | effektive HP Kael > Mira (unabhängig vom Wert) | **Erledigt** (ssot-Lane); Balance-Vorbehalt → P2 |
| F3 | Kael-Tempo-Doppel-Abzug | Z.35 „-5 % Tempo“ auf Basis 62 (Z.173) ⇒ **≈58,9 px/s** | `speed: 59` **und** `mods.moveSpeedPct: -5` ⇒ effektiv 59·0,95 = **56,05 px/s** | `data.test.ts:101` verlangt nur mira.speed > kael.speed (Intent, kein Wert-Pin); `charstats-ssot.test.ts:44` ebenso (Basis-Vergleich) | **Objektiver Bug**: 56,05 war nie intendiert (Z.356 nennt 55,9 — mit Doppel-Abzug getunt). Ein Abzug fliegt raus ⇒ effektiv ≈58,9 |
| F4 | Kael maxHpPct 25 vs Spec +20 % | Z.35 „+20 % Max-HP“ | `mods.maxHpPct: 25` | `charselect-truth.test.ts:86` pinnt `toBe(25)` — Kommentar „Daten sagen 25“ ist deskriptiv (folgte der Datenlage), kein Produkt-Entscheid; Z.356 „253 eff. HP“ ist aus 25 abgeleitet (zirkulär) | **Daten-seitig beantwortbar**: Spec Z.35 ist die einzige unabhängige Quelle ⇒ **20** (gleiche Beweislage wie F2, wo die Spec gewann) |
| F5 | Kael Rüstung 2 vs Spec 1 | Z.35 „1 Rüstung“ | `armor: 2` | `data.test.ts:102` verlangt `kael.armor > mira.armor`; Z.356 „Rüstung 2“ zirkulär aus Daten | **Daten-seitig beantwortbar**: Spec ⇒ **1**; Intent „Kael ist der Tank“ bleibt über `>=`-Vergleich + HP-/Regen-Bonus erhalten; Miras Rüstung (Spec schweigt) bleibt 1 (F1) |

### Entscheidungs-Logik (begründet, nicht still)

- **Spec Z.34/35 > M6-Statusbericht Z.356/357:** Der Statusbericht beschreibt den getunten Ist-Stand und
  widerruft die Spec nicht formell — exakt die Beweislage, mit der die ssot-Lane F2 (HP 90 statt 250)
  entschieden hat. F4/F5 folgen demselben Muster ⇒ Daten Richtung Spec.
- **F3 Varianten:** (a) `speed 62` + Mod behalten = exakt 58,9, aber `charstats-ssot.test.ts:44`
  (fremde Datei, nicht im Disponent-Bereich) pinnt `mira.speed > kael.speed` auf Basis-Werte ⇒ bricht.
  (b) Mod `moveSpeedPct: -5` entfernen, `speed: 59` behalten (59 = 62·0,95 gerundet, wie bisher angezeigt) ⇒
  effektiv 59 ≈ 58,9, **kein fremder Test bricht**, Anzeige bleibt „TEMPO 59“. Gewählt: **(b)** — der
  Bonus-Mod ist in der Basis eingerechnet, der Doppel-Abzug ist weg. Nebeneffekt: die Bonus-Zeile zeigt
  künftig kein „-5 % TEMPO“ mehr (die Information steckt jetzt in der TEMPO-Zeile selbst) — dokumentiert,
  nicht still.
- **Kosten aller Spec-Fixes (F2–F5):** Der M6-Balance-Korridor (Überleben 20–28 min) wurde mit
  Mira 250 / Kael 25 %, Rüstung 2, Tempo 55,9 getunt. Nach dieser Lane gilt Mira 90 / Kael 20 %, 1, 59.
  ⇒ **P2: Balance-Korridor neu prüfen** (Balance-Lane, nicht hier).

## Offene PRODUKT-Fragen (nur Spec-Text betrifft — Code ändert sich dafür nicht)

- **P1 (aus F1):** Sollen Miras `armor 1`/`regen 1.0` und Kaels `maxHpFlat 90`/`regen 1.5`/`xpPct -25`
  in GAME.md Z.34/35 ergänzt werden (Spec-Vervollständigung) oder aus den Daten entfernt werden?
  Bis zur Entscheidung: unverändert + Kommentar („Spec schweigt, F1/P1“).
- **P2 (aus F2–F5):** Balance-Korridor-Neuprüfung nach Mira HP 90, Kael maxHpPct 20 / Rüstung 1 /
  effektiv 59 px/s (M6 war mit 250 / 25 % / 2 / 55,9 getunt).
- **P3:** GAME.md Z.356/357 (M6-Balance-Status) widersprechen jetzt der Spec — beim nächsten GAME.md-Sync
  den Statusbericht aktualisieren oder als historisch markieren, damit keine neue Drift-Verwirrung entsteht.

## K2 — Daten festziehen (`src/data/characters.ts`)

- Jedes spec-schweigende Feld bekommt Kommentar („Spec schweigt (F1/P1) — M6-Tuning-Basis“) mit GAME.md-Anker
  oder Bewusst-Markierung; **keine stillen Felder mehr**.
- F3: `mods.moveSpeedPct: -5` entfernt (Variante b, s. o.) ⇒ effektives Tempo 59 ≈ Spec 58,9.
- F4: `maxHpPct 25 → 20` (Spec Z.35). F5: `armor 2 → 1` (Spec Z.35).
- Test-Repoints, die durch diese Entscheidungen **zwingend grün-brechend** sind, liegen im K2-Commit
  (Grün-Abhängigkeit: ein Daten-Commit ohne Mitziehen der gepinnten Tests wäre rot); K3 vervollständigt
  die Kommentare/Intents. `shots/m10-charselect-truth-after.json` regeneriert
  (`node scripts/m10-charselect-truth.mjs --phase=after`, Anzeige folgt Daten 1:1 — gleiche Begründung
  wie in der ssot-Lane).

## K3 — Tests repointen

`tests/data.test.ts` (effektive-HP-Kommentar, Tempo-Vergleich mit Basis-Begründung, Rüstung `>` → `>=`
mit Kommentar) und `tests/charselect-truth.test.ts` (maxHpPct 20, Bonus-Zeile `+20% MAX-HP`,
Testname/Kommentar aktuell). Assertions-Intent bleibt: Kael ist der Tank, Mira ist schneller, Anzeige folgt Daten.

**Fremd-Datei, minimal und begründet:** `tests/logic.test.ts:177-181` pinnte Kael `maxHpPct 25`
(M6-Tankprofil) und effektive HP 163 — die K2-Spec-Entscheidung (F4: 20) widerspricht diesem Wert
direkt, der Test wäre dauerhaft rot. Repoint auf 20 / eff. 156 (130·1,2), Testname mit Spec-Anker;
der geprüfte Intent („aggregateMods überträgt Charakter-Mods korrekt“) ist unverändert. Begründung
auch im K3-Commit; permanente Anpassungen an dieser Datei bleiben beim Owner.

## K4 — Guard

`scripts/m10-charstats-followup.mjs`: Spec-Referenztabelle (im Skript mitgepflegt, Quelle GAME.md Z.34/35/173)
gegen `src/data/characters.ts` (Regex-Parse wie `m10-charstats-ssot.mjs`); meldet jede unbekommentierte
Drift (Wert ≠ Spec ohne „Bewusst“-Kommentar bzw. ≠ gepinntem Ist), exit 0/1.

**Verifiziert (Probestriche auf Kopie in `~/tmp/m10-charstats-spec-followup/probe/`):**
- Ist-Stand: `PASS`, exit 0 (alle Werte = Referenztabelle, alle Abweichungen kommentiert).
- Probe 1: `mira.hp 250`, `maxHpPct 25` (unbekommentiert) → `FAIL`, exit 1, beide Drifts benannt.
- Probe 2: `mira.armor`-Kommentar („Spec schweigt (F1/P1)“) entfernt → `FAIL` mit
  `mira.armor: spec-schweigendes Feld ohne Kommentar (F1/P1)` (exit 1).
- Guard erkennt zusätzlich: verbotene Mods (kael `moveSpeedPct` = F3-Doppel-Abzug), unbekannte Mods,
  Charaktere ohne Tabellen-Eintrag.

**Review-Runde (Reviewer-PASS, 2026-11-28):** Reviewer-Befund „sollte" — Guard war nicht feldscharf:
`hasComment` akzeptierte das lockere Muster `F\d`, sodass die Nachbarzeile (`// maxHpPct 20: …
F4-Entscheid`) fälschlich auch Kaels spec-schweigende Mods abdeckte (Reviewer-Probe B: F1-Kommentarzeile
löschen → fälschlich PASS). Behoben: Modus „silent" verlangt jetzt Feldname + Marker
(`Spec schweigt|F1/P1|Bewusst:`) im Kommentar-Fenster; Modus „deviation" bleibt `Bewusst:|F\d`.
Nachfix verifiziert: Ist-Stand PASS exit 0; Probe B (F1-Kommentarzeile gelöscht) → FAIL exit 1 mit
allen drei F1-Feldern benannt (`maxHpFlat`, `regen`, `xpPct`).

## Status / Nachweise

- K1: Audit-Tabelle oben, Baseline 2455/2455 grün (#12925, Commit 01a88a03).
- K2: Daten festgezogen (#12926, Commit 23d030b1) — 0 stille Felder; Zieltests 20/20, tsc rc=0.
- K3: Tests repointet inkl. `tests/logic.test.ts` (#12927, Commit 23adf674).
- K4: Guard verifiziert (#12928, siehe Commit) — `node scripts/m10-charstats-followup.mjs` exit 0.
- **Abschluss: `npm test` 226 Dateien / 2455 Tests grün (3 aufeinanderfolgende Läufe, rc=0),
  `npx tsc --noEmit` rc=0, Guard exit 0.** F1–F5 entschieden (s. Entscheidungs-Logik), offene
  PRODUKT-Fragen P1–P3 oben für Dom.
