# Lane m10-loadscreen-pretext — Ladescreen: Vor-Text mittig (Dom-Wunsch 2026-11-28T13:25Z)

## Befund (Vorher)
Kaltstart Redmi Pad Pro (Beleg Dom: `~/games/.evidence/device/boot/`): 0–3,6 s schwarz
(App/WebView-Start, **bei Vera/Infra**, out of scope) → 3,6–5,2 s Vor-Text „LADE MOOR …“
**links der Mitte** → 5,2–7,4 s Ladescreen (Laterne + Balken, gut) → ab 7,4 s Titel.

Ursache im Spielcode: `src/scenes/Boot.ts` setzte den PixelText auf fix
`x=240` — das Zentrum einer 480er-Annahme. `GAME_WIDTH` ist seit M8 dynamisch
(logische Höhe 360, Breite je Seitenverhältnis): auf 640er-View sitzt der Text
bei 240/640 = **37,5 %** statt 50 % Breite.

## Vorher-Belege (K1, vor dem Fix committet)
- Desktop (960×540, Logical 640×360): `shots/abnahme/m10-loadscreen-pretext-before.png`
  (Text bei 37,5 % Breite) — Frames + Timeline:
  `~/games/.evidence/m10-loadscreen-pretext/desktop-before/`
- Gerät (Kopien aus Doms Belegen): `~/games/.evidence/m10-loadscreen-pretext/before-device/`
  (Original: `~/games/.evidence/device/boot/t-4.png`)

## Fix (K2) — Option (a) Zentrierung
`Boot.preload`: `new PixelText(this, Math.round(GAME_WIDTH / 2), 132, "LADE MOOR ...", C.mist, "center")`
— X an die View-Breite gekoppelt, Y unverändert 132. Eine Zeile aktivem Code.

**Warum nicht (b) (Laternen-Ladescreen ab Frame 0):** option (b) braucht eine
Änderung des Szenen-Flusses (Boot.preload lädt WAVs; die Loading-Szene würde
während des Preloads starten und `startTitleOnce` gegen Boot-Abschluss gates
werden müssen) — Risiko für den Titeltstart vor Audioload. Die Zentrierung ist
die kleinere Änderung ohne Kosten/Nachladen; die Vor-Text-Phase schließt nahtlos
an den stilechten Ladescreen an. [Supervisor-Steer 2026-11-28: Option (a).]

## Nachher-Belege
- Desktop, Vor-Text-Streckung via SFX-Route-Stall (Phase ist real < 40 ms):
  `shots/abnahme/m10-loadscreen-pretext-after.png` (Text mittig, 50 %);
  Frames: `~/games/.evidence/m10-loadscreen-pretext/desktop-after-stall/`
- Gerät (Redmi Pad Pro, installierte Lane-APK `out-lane/m10-loadscreen-pretext.apk`,
  WebView-Reload bei laufendem CDP-Screencast): Vor-Text **mittig** —
  `~/games/.evidence/m10-loadscreen-pretext/device-after-reload/dev-005.jpg`;
  Ladescreen Laterne+Balken mittig: `device-after/dev-000..002.jpg`;
  Renderer-String **Adreno (TM) 710**, 0 JS-Fehler, Ready bis Titel 7,0–7,4 s
  (Vorher-Dom: 7,4 s — im Rauschen unverändert; der schwarze App-Start 0–3,6 s
  ist APK/Theme-Sache bei Vera).

## Desktop-Regression (K3)
- `scripts/shot.mjs` 960×540 und 1280×720: **0 JS-Fehler**
  (`~/games/.evidence/m10-loadscreen-pretext/shot-960.png`, `shot-1280.png`).
- Boot-Startup (`scripts/m10-boot-startup.mjs`), Renderer
  **ANGLE (Mesa Intel(R) Graphics (RPL-S))** (`desktop-renderer.txt`):
  - Erstmessung (3 Läufe je before/after): before Ø 3346 ms, after Ø 4102 ms —
    **verworfen**, Streuung ±500 ms durch Parallel-Lanes (Drift).
  - Verbindlich: **verschränkte Paare** (je 1 Run before/after, 3 Paare):
    +248 / +27 / −524 ms → **Median +27 ms ≤ FAIL-Grenze 50 ms**.
    Belege: `~/games/.evidence/m10-loadscreen-pretext/pair{1,2,3}-{before,after}.json`.
- Build + Tests: `npm run build` grün; `npm test` 210 Dateien / **2320 Tests grün**.

## Test (pinnt die Zentrierung)
`tests/boot-preload.test.ts` (3 Guards): PixelText-X ist
`Math.round(GAME_WIDTH / 2)`, kein fixer 240er-X-Rest, `GAME_WIDTH`-Import
erhalten (Quelltext-Check, Muster `tests/boot-light-textures.test.ts`).

## Commits (Lane `m10-loadscreen-pretext`)
1. `a3dbb8bf` #12351 Vorher-Beleg + Frame-Skript `scripts/m10-loadscreen-pretext.mjs`
2. `04cac82d` #12352 Zentrierung + Guard-Test
3. `6fe6d2fa` #12353 Nachher-Beleg + stall-sfx-Option
4. (K4) Lane-Doku + `.lane-done` (Commit nach art-director-PASS)

## Offene Punkte
- 0–3,6 s Schwarz beim App-Start: `~/lf-apk` MainActivity/Theme — **bei Vera**
  (escalations.md 13:45Z), nicht in dieser Lane.
- Mess-Hinweis: `npm test` regeneriert `shots/m10-passive-math-*.json`
  (nur `generatedAt`) — Nebeneffekt, im Worktree zurückgesetzt.
