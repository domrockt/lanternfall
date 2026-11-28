# Lane m10-hud-notch-safearea — Display: iPhone14 Safe-Area (HUD unter Notch)

Stand: 2026-11-28. Worktree `/home/ai/games/lf-lanes/m10-hud-notch-safearea`, Basis `942af93`.
Schliesst Board-#1020 (m10-display-qa FAIL 1, docs/lanes/m10-display-qa.md): iphone14-HUD lief
in die 47-px-Notch-/Rundungs-Zonen.

## Messaufbau

`scripts/m10-hud-safearea.mjs` rendert die 7 Display-Profile (Tabelle wie
`scripts/verify-display.mjs`) und emuliert die Geräte-Insel per CDP
`Emulation.setSafeAreaInsetsOverride` (iphone14: 47/47/0/21, pixel7: rundum 12 — dokumentierte
Gerätewerte aus m10-display-qa C3). Gemessen werden die echt gerenderten Bounding-Boxen der
benannten HUD-Objekte (Spielpixel), per Canvas-Rect in Bildschirm-CSS-Px übersetzt und gegen die
Notch-/Rundungs-Zonen geschnitten. Belege: `shots/m10-hud-safearea-before.json` /
`shots/m10-hud-safearea-after.json` + je 7 Screenshots `shots/m10-hud-safearea-<tag>-<profil>.png`.

## Fix

- **NEU `src/logic/safearea.ts` (rein, in tests/hud-safearea.test.ts geprüft):**
  - `insetsOverCanvas`: nur der Inset-Anteil, der **über dem Canvas** liegt, wird kompensiert.
    Das body-Padding (`env(safe-area-inset-*`, index.html) rückt den Canvas bei Geräten wie
    Pixel 7 bereits in die Safe-Area — dort bleibt alles bitgleich. iPhone 14: Canvas full-bleed
    x=0 → volles Seiten-Inset wirkt.
  - `insetsToGamePx`: CSS→Spielpixel (aufrunden, nie in die Notch ragen).
  - `hudSideMargin` (Deckel Breite/3), `hudTopMargin`, `readDeviceSafeAreaInsets` (body-Padding).
- **`src/scenes/UI.ts`:** `hudAnchorBoxes(…, safe?)` + `create()` rechnen effektive Margen
  (HUD-Konvention + Inset) in den Ankerpfad: level/kills/xp/hp/icons/evo-hint klemmen an
  View-Rand MINUS Marge, Top-Offset für obere Insets. Anker-Mechanik wie m10-hud-wide-anchor.
- **`src/input/TouchControls.ts` (unclaimed, Request in `.dispatch/requests.md` 2026-11-28):**
  Pause-Knopf-Marge = `max(PAUSE_MARGIN, Inset)`; `setName("hud-touch-pause")` als
  Mess-Instrumentierung (kein Layout-Eingriff). Ohne diesen Eingriff bliebe der Pause-Knopf
  (804..834) in der Notch-Zone — der FAIL wäre nicht geschlossen.

## Vorher/Nachher

| Profil | View | Vorher | Nachher |
|---|---|---|---|
| hd | 640×360 | PASS | PASS (AE=0 vs. before) |
| uhd | 640×360 | PASS | PASS (AE=0) |
| wqhd15 | 640×360 | PASS | PASS (AE=0) |
| laptop | 683×360 | PASS | PASS (AE=0) |
| **iphone14** | 844×360 | **FAIL — 9 Verstöße** (hud-level/hp/xp/kills/touch-pause in 47-px-Zone) | **PASS — 0 Verstöße** |
| pixel7 | 860×360 | PASS | PASS (AE=0) |
| ipadpro | 546×360 | PASS | PASS (AE=0) |

- iphone14 Anker: level x 5→52, kills Rechtskante 839→792, XP-Balken 5..839→52..792,
  Touch-Pause 804..834→767..797 (Notch-Kante 797) — effektive Marge 52 = HUD 5 + Inset 47.
- **Regression 6/6 Profile bitgleich:** HUD-Boxen before vs. after AE=0 (Gegenprobe im
  Lane-Verlauf; Pixel-7-Insets wirken wegen `insetsOverCanvas` nicht aufs HUD, Canvas sitzt
  dort bei x≈27,5 bereits in der Safe-Area).
- **Zwischenbefund (K4):** erste Fix-Version kompensierte die Pixel-7-Rundungs-Insets zusätzlich
  (24 Boxen verschoben, AE=24). Ursache: Canvas-Offset ignoriert. Behoben durch
  `insetsOverCanvas` (nur Inset über dem Canvas); danach AE=0. Beleg: after-JSON dieser Version.

## Tests / Abnahme

- `tests/hud-safearea.test.ts` (19 Tests zusammen mit hud-anchor): iphone14 → 0 HUD-Pixel in der
  Notch-Zone; `insetsToGamePx` ceil/Skalierung/NaN; `insetsOverCanvas` iphone14-full-bleed /
  pixel7-bereits-sicher / Teilüberlappung; Regression insets=0 → bitgleich (640×360-Referenzboxen
  + alle 7 Profilbreiten).
- `npx vitest run`: **984/984 grün** (93 Dateien); `npx tsc --noEmit` rc=0; `npm run build` grün.
- After-Lauf finaler Code-Stand: 7/7 PASS, `jsErrors=0`.
- Sichtprüfung (2× nearest, `~/tmp/m10-hud-notch-safearea-{before,after}-iphone14-top-2x.png`):
  vorher LV 1/HP am Canvas-Rand (x=5, in der Notch-Zone), nachher klemmt das HUD 52 px dahinter,
  Layout intakt, keine abgeschnittenen Texte.

## Joystick (n. a.)

Der Joystick entsteht an der Fingerposition (linke Bildhälfte) — auf echten Notch-Geräten liegt
die Notch-Zone physisch außerhalb der touchbaren Fläche; ein Messwert dort immer PASS.

## Offene Punkte

- Keine aus dieser Lane. Der Display-QA-FAIL 2 (#638, Minute-25-FPS 39,5) bleibt separat offen.
