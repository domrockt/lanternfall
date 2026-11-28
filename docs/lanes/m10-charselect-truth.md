# Lane m10-charselect-truth — CharSelect-Anzeige == src/data (SSOT-Guard)

**Ziel:** Der Charakter-Auswahl-Screen zeigt Startwerte (Name, Titel, HP/TEMPO/RÜSTUNG, Bonus, Startwaffe).
Nach ~70 Merges war ungeprüft, ob die ANGEZEIGTEN Werte noch exakt den Daten in `src/data` entsprechen.
Diese Lane belegt den Ist-Stand, fixt belegte Abweichungen (Anzeige folgt Daten, nie umgekehrt) und baut einen Guard-Test.

## K1 — Mess-Skript + before-JSON (Commit e5f681d)

`scripts/m10-charselect-truth.mjs` rendert die CharSelect-Szene headless (Playwright + statischer dist-Server),
extrahiert alle 20 sichtbaren PixelText-Zeilen (Text + Weltposition) und vergleicht sie gegen
`src/data/characters.ts` + `src/data/weapons.ts` (regex-geparst, Skript ohne TS-Loader lauffähig).

**Before-Befund** (`shots/m10-charselect-truth-before.json`): **1 echte Abweichung**

| Charakter | Feld | angezeigt | Daten (SSOT) |
|---|---|---|---|
| Kael | Bonuszeile | `+20% MAX-HP / -5% TEMPO` | `maxHpPct: 25` → `+25% MAX-HP / -5% TEMPO` |

Datengleich (beide Charaktere): Name, Titel, HP 250/130, TEMPO 62/59, RÜSTUNG 1/2,
Startwaffe `Glutfunke`/`Kettenflegel`, Mira-Bonus `+10% FLÄCHENWIRKUNG` (`areaPct: 10`).

## K2 — Fix in src/scenes/CharSelect.ts (Commit feae7a3)

- `bonusText()` war pro Charakter-ID hardcodiert (+20% statt Datenwert 25). Jetzt wird die Zeile
  aus `char.mods` abgeleitet (areaPct → FLÄCHENWIRKUNG, maxHpPct → MAX-HP, moveSpeedPct → TEMPO).
  Kael zeigt damit datentreu `+25% MAX-HP / -5% TEMPO`.
- `weaponName()` war eine if/else-Zuordnung (`ember → "GLUTFUNKE"`). Jetzt `WEAPONS[char.startWeapon].name`
  aus `src/data/weapons.ts` — ein Waffen-Umbenennen in den Daten kann die Anzeige nicht mehr driften lassen.
- **`src/data/**` wurde nur gelesen, nie geändert.** Die Anzeige folgt den Daten, nicht umgekehrt.

## K3 — Guard-Test + after-JSON (Commit 93ea59f)

`tests/charselect-truth.test.ts` (5/5 grün): liest das headless gerenderte
`shots/m10-charselect-truth-after.json` und prüft unabhängig aus den src/data-Imports,
dass jede angezeigte Zeile dem Datenwert entspricht — für beide Charaktere, plus
Regression auf den +20%-Befund. after-JSON: **0 Abweichungen, 0 JS-Fehler.**

Bei künftigen Daten- oder Anzeige-Änderungen:
`node scripts/m10-charselect-truth.mjs --phase=after` (ggf. `--shots` für Sicht-Belege) und
after-JSON mitcommitten — der Guard-Test muss grün bleiben.

## K4 — Sicht-Belege + Abnahme

- `shots/m10-charselect-truth-1x.png` — Vollbild 960x540
- `shots/m10-charselect-truth-4x.png` — 4x nearest-Zoom der Panelbereiche (convert -filter point, unverzerrt)
- art-director-Sichtung: siehe unten

### art-director-Urteil (strenge Sichtung, 2026-11-28)

**PASS — 4/5** (Schwelle ≥ 4 erreicht)
- 1x-Vollbild: alle Zahlen 250/62/1 und 130/59/2 fehlerfrei lesbar (Werte in C.bone, klar von Labels getrennt); Bonuszeilen im 1x lesbar, kontrastschwächste Zeile.
- 4x-Zoom: 5/5 — sauberes nearest-neighbor-Grid, keine Mixel, Umlaute (Ü/Ö/Ä) intakt, Minuszeichen deutlich.
- Überlappungen: 5/5 — Icons berühren Text nicht, Bonuszeile/START-Zeile ohne Kollision, Portraits ohne Clearing-Fehler.
- Muss neu: nichts. Optional (nicht blockierend): 1) Bonuszeilen-Kontrast eine Stufe heben (Hinweis: die Bonuszeile steht bereits in C.mist, die START-Zeile in C.fog — Empfehlung zielt auf die START-Zeile); 2) Kael-Icon (Kettenflegel) im 1x schwer als Waffe identifizierbar → 1 Signatur-Pixel/Konturton (liegt in src/gfx, nicht in dieser Lane).

## Grenzen / bewusste Entscheidungen

- **Anzeige-Scope:** Kael hat weitere Mods (`maxHpFlat: 90`, `regen: 1.5`, `xpPct: -25`), die in der
  Bonuszeile nicht angezeigt werden. Das ist Anzeige-Umfang, nicht Falschaussage — wurde nicht geändert
  (Anzeige-Scope-Änderung wäre eine eigene Karte, ggf. backlog).
- Die HP-Zeile zeigt `char.hp` (Basiswert aus den Daten); die Mod-Anwendung (maxHpPct/maxHpFlat)
  passiert im Run — auch das ist Datenwahrheit pro Feld, nicht Anzeige-Drift.
- Abdeckung der Prüfung: alle 20 sichtbaren Textzeilen der Szene; Icon-Textur-Key kommt ebenfalls
  aus `char.startWeapon` (datengetrieben, kein eigener Drift-Ort).
