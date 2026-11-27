# Lane m10-weapons-stability — `chest-roll-names` nicht mehr timing-flaky

Offener Restpunkt aus ACCEPTANCE: „`verify-weapons`-Check `chest-roll-names` timing-flaky,
1× FAIL bei hoher Last“. Ziel: Check wartet auf einen stabilen UI-Zustand; 12 Läufe unter
Last ergeben 12/12 PASS. Keine Spieländerung — nur `scripts/verify-weapons.mjs` und
Mess-/Doku-Dateien dieser Lane.

## #K1 Flake reproduziert (Baseline, Commit 26f442e)

12 serialisierte Läufe von `scripts/verify-weapons.mjs` (Truhen-Sektion via
`M10_CHEST_ONLY=1`) mit 16 parallelen CPU-Spinnern als Last, Beleg
`shots/m10-weapons-stability.json`.

- Ergebnis: **11/12 PASS, 1/12 FAIL** (`flakeRate 1/12 = 0,083`).
- FAIL in Lauf 12: `failed: ["chest-roll-names"]`, `rollNames=false`.
- Laufzeiten: 48,4–62,7 s (Median ≈ 55,5 s); der FAIL-Lauf war mit 62,7 s der längste.
- Damit ist die in ACCEPTANCE notierte Flake-Rate vor dem Fix belegt.

## #K2 Ursache (Commit 05a4055)

Instrumentierung in der Truhen-Schleife: pro Screenshot-Frame wurde notiert, wann das
Panel sichtbar wird und wann der Check die Namensbedingung liest.

- `rollNamesComplete` wurde **ereignislos im Screenshot-Takt** abgefragt (ein Read pro
  90-ms-Frame plus Screenshot-Dauer), nicht per Zustandsbeobachtung.
- Gemessener Median-Abstand zwischen zwei Reads ohne Last: **299 ms**; unter 16-Spinner-Last
  wächst der Abstand weiter (Screenshot-/Frame-Stalls).
- Das gültige Roll-Fenster ist nur **≈170 ms** breit: alle 8 Roll-Ticks sind ab
  ≈1280 ms durch (520 ms Start + 8×95 ms), der erste Slot settlet bei ≈1450 ms und setzt
  dann `STUFE`/`EVOLUTION` (Bedingung `rolling` wird falsch).
- Ein Read-Takt von 299 ms (Last: mehr) trifft dieses 170-ms-Fenster oft nicht → der Check
  liest entweder zu früh (Namen noch „?“/unvollständig) oder zu spät (Level gesetzt).
  Ursache ist also der **feste Sample-/Timeout-Takt statt einer Zustandsprüfung**.

## #K3 Umbau (Commit ec84378)

`chest-roll-names` wartet jetzt per `page.waitForFunction(..., { polling: "raf" })` auf:

1. Truhen-Panel sichtbar (`ui.chestGroup.visible`),
2. alle Slots zeigen den vollständigen Belohnungsnamen (ein- oder zweizeilig wie zuvor),
3. noch kein `STUFE`/`EVOLUTION` gesetzt (`rolling`),
4. derselbe Textzustand in **2 aufeinanderfolgenden Frames**.

Timeout **15 s** mit klarer Meldung („kein stabiler Panel-/Namenszustand innerhalb 15 s“).
Die inhaltlichen Assertions (vollständiger Name, 2-Zeilen-Pflicht bei >13 Zeichen) sind
unverändert; nur der Zeitpunkt der Messung ist jetzt ein stabiler Zustand statt ein
zufälliger Sample. Kein `sleep`/`waitForTimeout` als Ersatz für die Zustandsprüfung.

## #K4 12-Lauf-Beleg (dieser Commit)

12 Läufe, gleiche Last wie #K1 (16 CPU-Spinner), Beleg
`shots/m10-weapons-stability.json`:

- Ergebnis: **12/12 PASS, 0/12 FAIL** (`flakeRate 0`).
- Wartezeit bis stabiler Zustand (`waitMs`): Median **3961,5 ms**, p95 **6043 ms**,
  min 3773 ms, max 6441 ms — deutlich unter dem 15-s-Timeout.
- Panel sichtbar (`panelVisibleMs`): Median **190 ms** (145–332 ms).
- Laufzeiten: 47,8–73,0 s.

Die Wartezeit liegt über dem reinen Roll-Fenster, weil unter Last die rAF-Frames des
Browsers selbst unregelmäßig kommen (2 stabile Frames brauchen dann Zeit); der Check
bleibt aber korrekt, weil er auf den Zustand wartet statt ihn zu erraten.

**Empfehlung:** `scripts/verify-display.mjs` hat dasselbe Muster (viele feste
`waitForTimeout`-Wartezeiten vor Screenshots/Pixel-Checks, u. a. Profil-/Szenenwechsel).
Es sollte als Nächstes auf `waitForFunction` mit sichtbarem/gesetztem UI-Zustand umgestellt
werden; `verify-input` und `verify-menus` sind ebenfalls Kandidaten, sobald dort
lastabhängige FAILs auftreten.

## #K5 Abschluss

`npm run build` und `npm test` grün: Build OK, 301/301 Tests in 26 Dateien.
`.lane-done` mit Flake-Rate vorher/nachher (1/12 → 0/12) und Messwerten ist als
letzter Commit dieser Lane angelegt.
