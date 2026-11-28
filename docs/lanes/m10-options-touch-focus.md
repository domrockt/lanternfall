# Lane m10-options-touch-focus — Menü-Fokus-/Pressed-Zustände (A10 → 5/5)

**Ziel:** Fokus- und Pressed-Zustand in allen 5 Menü-Screens konsistent
(Lanternfarbe + 1-px-Rahmen, Pressed kurz dunkler), 7/7 Optionszeilen je
Eingabeart anwählbar, sonstige Optik AE=0. Quelle: A10 „Menü-/HUD-Qualität 4/5" —
nach `menu-touch-targets` (Trefferflächen) und `menubg-crisp-rest` (Hintergründe)
war der sichtbare Fokus-/Pressed-Zustand der offene Rest.

## Messaufbau

`scripts/m10-options-focus.mjs` (Playwright, zwei Kontexte: Desktop 960x540
Maus+Tastatur, Touch Pixel-7-Profil 915x412 hasTouch). Pro Screen/Eingabeart
wird der sichtbare Zustand aller Menüknöpfe und Optionszeilen ausgelesen
(Outline sichtbar, Textfarbe-Index, Hintergrund-Alpha) + Screenshot.
Renderer-Pflicht erfüllt, alle Einträge:

```
ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)  [webgl1] — iGPU
```

Screens: Title, Credits, CharSelect, Pause (UI-Overlay), Results plus
Options-Overlay (aus Title und Pause). 37 Einträge je Lauf, 0 JS-Fehler.

## Ist-Matrix vorher (Commit 02c49fb, `shots/m10-options-focus-before.json`)

| Befund | Beleg |
|---|---|
| **Kein Pressed-Zustand**: pointerdown gehalten zeigt identische Optik wie vorher (bgAlpha=1, tint=null) auf Title/CharSelect/Pause | before-Einträge „Pressed" |
| **Hover-Leak**: Options-Overlay öffnet per Maus mit fokussierter Zeile 6 (ZURÜCK) statt Zeile 0 — der stillstehende Zeiger über dem OPTIONEN-Knopf liegt auf der ZURÜCK-Zeile; Tastatur-Öffnung startet mit Zeile 0 → uneinheitlicher Start-Fokus | before „Overlay nach Klick OPTIONEN: sel=6" |
| Hover + Tastatur-Fokus können zwei Knöpfe gleichzeitig aktiv zeigen (beide Lantern+Rahmen) | before title/charselect/results-Hover-Einträge |
| 7/7 Optionszeilen je Eingabeart bereits anwählbar (Maus Klick Zeile 0/6, Tastatur 6×↓+Enter schliesst, Touch 7 Taps, Zeile 6 schliesst) | before options-Einträge |

## Fixes (Commit 42ae58d, K2)

1. **`src/ui/menu.ts`**: reine Zustandsmatrix `menuButtonVisual()` — aktiv
   (Fokus ∪ Hover ∪ Pressed) ⇒ Outline + Lanternfarbe; Pressed zusätzlich
   `bgAlpha 0.72` (`BUTTON_PRESSED_ALPHA`). Verdrahtung: `pointerdown` setzt
   Pressed (Maus **und** Touch), `pointerup`/`pointerupoutside`/`pointerout`
   lösen ihn. Idle bleibt exakt unverändert (kein Outline, Basisfarbe,
   Alpha 1).
2. **`src/ui/options-menu.ts`**: `open()` merkt die Zeigerposition,
   `hoverRowAllowed()` (rein, exportiert) blockt den stationären Zeiger beim
   Erscheinen des Overlays → Overlay öffnet je Eingabeart mit Zeile 0.
3. **`tests/options-focus.test.ts`** (14 Tests): Zustandsmatrix als harte
   Assertions (Idle AE=0, Fokus=Hover=Pressed-Optik, Pressed dunkler,
   0.4 < alpha < 1), Hover-Guard-Fälle, Quelltext-Verankerung.

Entscheidung (dokumentiert): Fokus+Hover gleichzeitig bleibt erlaubt und zeigt
denselben aktiven Zustand — das ist die geforderte Konsistenz; ein
Exklusiv-Highlight wäre eine Optik-Änderung außerhalb des Auftrags (AE>0).

## Nachher (`shots/m10-options-focus-after.json`)

| Check | Ergebnis |
|---|---|
| Pressed sichtbar und konsistent: `outline=true, color=21, bgAlpha=0.72` an VOLLBILD (Title), START (CharSelect), OPTIONEN (Pause) | ✓ alle drei, JSON + Screens |
| Pressed gelöst: `bgAlpha=1` nach `pointerup` (Hover-Optik bleibt, korrekt) | ✓ |
| Options-Overlay öffnet per Maus **und** Touch mit `sel=0` (Leak weg) | ✓ |
| 7/7 Zeilen je Eingabeart: Maus (Klick Zeile 0 ändert Wert, 6 schliesst), Tastatur (6×↓ → ZURÜCK, Enter schliesst), Touch (Taps 0–6, sel folgt 0..6) | ✓ |
| Idle-Zustände unverändert (AE=0): alle Idle-Einträge `outline=false, color=10, bgAlpha=1` wie before | ✓ |
| JS-Fehler Desktop/Touch | 0 |
| Renderer | iGPU (Intel RPL-S), s. o. |

Build grün, Tests 1105/1105 (inkl. options-focus 14/14 und
menu-touch-targets unverändert grün).

## Belege

- `shots/m10-options-focus-before.json` / `-before-*.png` (25 Screens)
- `shots/m10-options-focus-after.json` / `-after-*.png` (28 Screens)
- Zoom (300 % nearest): `shots/m10-options-focus-after-zoom-*.png`
- art-director-Urteil: siehe Board-Karte #7540 (>= 4/5 gefordert)

## Offene Punkte

- **Gamepad-Menü-Navigation**: bewusst NICHT angefasst — Produktentscheidung
  steht offen (Frage an Dom). `handlePad`-Pfade existieren und sind unverändert.
- Mess-Skript-Iterationen: 4 (2 Bugfixes Konstanten/Labels, 1 Matrix-Ergänzung
  Maus-Zeilenklick + bg-Alpha im Probe, 1 Verschiebung der VOLLBILD-Probe vor
  die OPTIONEN-Probe, da das sofort öffnende Overlay den Pressed-Beleg
  verdeckte). Overlays verdecken Pressed-Belege auf OPTIONEN-Knöpfen strukturell
  (Klick öffnet sofort); der freie Beleg läuft über VOLLBILD.
- Grenze eingehalten: keine Commits an gen-title/gen-ui/gen-icons, keine
  Gamepad-Nav, board.json (Main) nicht geändert (Lane-Board-Karten via Plugin).
