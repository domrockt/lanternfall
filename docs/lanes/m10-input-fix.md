# Lane m10-input-fix — die zwei Input-FAILs aus m10-input-qa beheben

Worktree `/home/ai/games/lf-lanes/m10-input-fix`, Branch `m10-input-fix`.
**Basis-SHA beim Start: `0c3ea08`** (main-HEAD beim Lane-Start, enthält den Merge der QA-Lane
`m10-input-qa`). Ausgangsbelege: `docs/lanes/m10-input-qa.md`, `shots/m10-input-chest-repro.json`,
`shots/m10-input-profiles.json`, `shots/m10-input-verify.json`.
Keine Umbauten, nur die zwei kleinen Fixes; Diff laut Abnahme in `src/scenes/UI.ts`,
`scripts/verify-input.mjs`, `tests/input.test.ts` (plus Doku und Belege). `src/input/TouchControls.ts`
wurde **nicht** angefasst.

## F1 — Truhen-Übernehmen-Tipp startet den Joystick

### Ursache (bestätigt)
Die bildschirmfüllende Skip-Zone der Truhe (`src/scenes/UI.ts`, `createChestUI`) schloss die Truhe im
`pointerdown`. Im selben Touchstart sah `TouchControls.onTouchStart` danach `canTouchMove() === true`
und übernahm den noch gehaltenen Finger (`identifier=4`) als Joystick → Spieler +22 px.

### Gewählte Variante und Begründung
**Skip-Zone auf `pointerup` umgestellt** (ein Handler-Name, kein weiterer Code). Die zweite Variante
(„Touch in `TouchControls.onTouchStart` verwerfen, dessen Start bei `canMove=false` lag“) hätte einen
Zustand über `touchstart`/`touchmove`/`touchend` führen müssen (Set verworfener `identifier`, Aufräumen
bei `touchcancel`/`destroy`) — deutlich größerer Diff und mehr Fehlerquellen. Mit `pointerup` gilt:
Der Tipp wird erst beim Loslassen übernommen, der Finger war während der gesamten Berührung gesperrt,
und ein einzelner Maus-Klick (`pointerdown`+`pointerup`) verhält sich unverändert.

```diff
-    skip.on("pointerdown", () => {
+    skip.on("pointerup", () => {
       if (this.run?.chestOpen) this.run.finishChest();
     });
```

### Repro vorher/nachher (Pixel-7-Profil, 915×412 @dpr2)
Befehl: `BASE_SHA=$(git rev-parse HEAD) node ~/tmp/m10-input-fix/chest-repro.mjs`
(Skript liegt absichtlich außerhalb des Worktrees, Temp-Dateien nie im Repo).

| Messpunkt | vorher (m10-input-qa) | nachher (m10-input-fix) |
|---|---|---|
| `stickVisible` nach Touchstart+Drag | `true` (`identifier=4`) | `false` (alle 5 Samples) |
| `playerX` Delta | +22 px | **0 px** |
| `chestOpen` nach Touchstart | `false` (im selben Event geschlossen) | **`true` bis zum Loslassen** |
| `chestOpen` nach `touchend`/`pointerup` | — | `false` (Truhe schließt beim Loslassen) |
| Maus-Klick auf Truhe | unverändert | schließt weiterhin, `playerX` Delta 0 |

Belege: `shots/m10-input-fix-chest.json` (`passed: true`, 4 Checks, `jsErrors: []`),
`shots/m10-input-fix-chest-open-lock.png` (Truhe offen, kein Joystick),
`shots/m10-input-fix-chest-held.png` (gehaltener Finger + Drag: Truhe offen, kein Stick),
`shots/m10-input-fix-chest-dismissed.png` (nach Loslassen: Truhe weg, kein Stick).
Sichtprüfung der Bilder: Held-Bild zeigt offenes Truhen-Panel ohne Joystick-Ring; Dismissed-Bild zeigt
den Run ohne Truhe/Panel und ohne Joystick.

### Nebenwirkungen geprüft
- **Truhe per Touch:** `verify-input` Check „Touch: Truhe per Tippen übernommen“ **OK**.
- **Truhe per Gamepad A:** „Gamepad: Truhe per A übernommen“ **OK**.
- **Truhe per Maus:** eigener Check im Repro (Klick) **OK**, `playerX` unverändert.
- **Pause-/Level-up-Sperren:** `verify-input` „Touch: Pause per zweitem Finger“, „Sperre Pause“,
  „Level-up-Karten per Tippen“, „Gamepad: Start pausiert“, „Gamepad: Level-up per A“ **alle OK**.
- Auto-Finish der Truhe (`finishAt`) bleibt unverändert; wer nicht tippt, wird weiterhin automatisch
  weitergeleitet.

## F2 — `verify-input.mjs` bricht bei CharSelect ab

### Ursache / Fix
Das Skript suchte den Knopftext `"BRUDER KAEL"`. Das redesignte CharSelect rendert den Namen als
`PixelText`-Wert `"Bruder Kael"` (Mixed Case), nicht als Knopf-Label. Zwei kleine, spielcode-freie
Änderungen im Skript:
1. Label auf `"Bruder Kael"` korrigiert (Kommentar zur Ursache).
2. `tapText` tippt jetzt die **interaktive Fläche des Eltern-Containers** an, nicht das PixelText-Label.
   Grund: `START (ENTER)` liegt im 9-Slice-Knopf nicht mittig unter dem Label; der Label-Mittelpunkt
   lag unterhalb des Knopfes und der Tipp lief ins Leere (Timeout in `waitForScene("run")`).

### Ergebnis nach Fix
`node scripts/verify-input.mjs` → **PASS 28/28 Checks, 0 JS-Fehler** (Exit 0). Touch-, Gamepad- und
Tastatur-Checks wieder vollständig erreicht; Log `~/tmp/m10-input-fix/verify2.log`.
JSON-Beleg: `shots/m10-input-fix-verify.json` (`milestone: "M8-input"`, `passed: true`, 28 Checks).
Die vom Skript geschriebenen `shots/m8-input-*.png` / `shots/m8-input.json` wurden nach dem Lauf auf
ihren committeten Stand zurückgesetzt (geschützter Pfad `shots/m8-*` bleibt unangetastet).

## Tests / Build
- `npx vitest run` → **193/193 Tests grün** (12 Dateien). Neu:
  `tests/input.test.ts` › „TouchControls chest gate“ — ein Finger, der bei `canMove=false` aufsetzt,
  erzeugt keinen Joystick; Gegenprobe: neuer Touchstart bei `canMove=true` erzeugt ihn weiterhin.
- `npm run build` → **rc=0** (tsc + vite, 908 ms).

## Abnahme
- [x] F1-Repro: `stickVisible=false`, `playerX` Delta 0, Truhe schließt erst nach `pointerup`
      (`shots/m10-input-fix-chest.json`).
- [x] `node scripts/verify-input.mjs`: 28/28 PASS inkl. Touch/Gamepad; JSON `shots/m10-input-fix-verify.json`.
- [x] `npx vitest run` 193/193 grün; `npm run build` rc=0.
- [x] Diff nur in `src/scenes/UI.ts` (1 Zeile), `scripts/verify-input.mjs`, `tests/input.test.ts`
      plus Doku/Belege; `shots/m8-*`, `board.json` (nur Board-Update der eigenen Karte) und
      `ACCEPTANCE.md` nicht verändert.
