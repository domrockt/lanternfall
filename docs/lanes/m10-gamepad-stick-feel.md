# Lane m10-gamepad-stick-feel — Gamepad-Stick-Feel (wirksame Deadzone, Snapping, Einheitsvektoren)

Worktree `/home/ai/games/lf-lanes/m10-gamepad-stick-feel`, Branch `m10-gamepad-stick-feel`.
Nur `src/input/Gamepad.ts` (+ Tests/Messskript) — `InputState.ts` (m10-pad-start-pause-r2) und die
Szenen-/Widget-Ebene (m10-gamepad-nav-scenes-r2) unberührt; deren Tests laufen unverändert grün.

## Ziel (Dom-Freigabe 06:00Z, Android-TV-Bediengefühl)

- Wirksame Deadzone: kein Drift/Rauschen im Stillstand,
- Richtungswechsel ohne Zwischen-Dither,
- Stick und D-Pad liefern konsistente Einheitsvektoren.

## Ist vor dem Fix (K1)

Messskript `scripts/m10-gamepad-stick.mjs` treibt synthetische Stick-Streams durch den **echten
Szenen-Pfad** (`readNavigatorGamepad` → `InputState.update`): Code per tsc in ein Temp-Dir
kompiliert, `navigator.getGamepads()` gestubbt — derselbe Weg, den alle Szenen gehen. Streams:
Stillstand+Drift, Kreis, Kanten-Push, Push über Kante, Winkel-Sweep über die 45°-Grenze.

Belege: `~/games/.evidence/m10-gamepad-stick-feel/m10-gamepad-stick-{before,after}.json`
(`shots/*.json` ist .gitignore-ignoriert; Before-Baseline auf dem **alten** Code gemessen,
Commit f0668b0 / K1 — erste Baseline mit härterem Rauschen: 33,67 % Fehlbewegung im Stillstand).

| Serie | vor → nach | Gate |
|---|---|---|
| Stillstand (Drift 0.125 + σ 0.05) | Fehlbewegungs-Quote **8,67 %** → **0 %** (0 Events, 0 Toggles) | < 5 % / 0 Events **PASS** |
| Kanten-Push r=0.19 (straddelt alte 0.18-Kante) | moveRatio 0,65 mit **68 Richtungs-Toggles** (Dither) → **0 Events** (ruht sauber unter der 0.28-Kante) | **PASS** |
| Push über Kante r=0.34 | 1,0 → 1,0 (durchgehend aktiv, 0 Zero-Frames) | Regression **PASS** |
| Kreis r=0.85 | 20 Toggles / 9 Jitter-Sektoren → 10 Toggles (8 legitime Sektor-Schritte) / **0 Jitter** | **PASS** |
| Sweep über 45°-Grenze | **2 Doppel-Events** (2 Richtungen wechseln in einem Frame) → **0** | **PASS** |

## Fix (K2, Commit a8f1f16) — nur `src/input/Gamepad.ts`

Filter sitzt im Adapter (`readNavigatorGamepad`/`readSceneGamepad`), damit alle Szenen bereinigte
Achsen sehen und die Deadzone-Remap in `InputState` unverändert auf stabilen Werten arbeitet:

1. **Radiale Engage-Deadzone 0,28** (`STICK_ENGAGE_DEADZONE`) — oberhalb des typischen
   Drift-/Rausch-Bands (K1-Befund: alte 0,18-Kante war nicht wirksam), unterhalb des "echten
   Push" (Micro-Push 0,34 bleibt aktiv).
2. **Hysterese-Release 0,18** (`STICK_RELEASE_DEADZONE`) — zwischen 0,18 und 0,28 bleibt der
   Stick engagiert (kein Ein/Aus-Zittern an der Kante), unter 0,18 saubere Freigabe.
3. **8-Richtungs-Snapping** (45°-Sektoren) auf den **Sektormittelpunkt** mit
   **Sektor-Hysterese** (Marge 5,625°): an Sektorgrenzen bleibt der bisherige Sektor stehen,
   bis der Rohwinkel > 22,5° + 5,625° vom Zentrum entfernt ist — kein Flackern, keine
   Doppel-Events.
4. **Einheitsvektor-Ausgabe**: engaged gibt der Stick exakt `cos/sin(k*45°)` zurück
   (Diagonale √2/2) — derselbe Wert wie das D-Pad via `normalizeVector`. Bediengefühl damit
   digital-konsistent (Stick = D-Pad = Tastatur, volle Geschwindigkeit ab Engage); die
   Magnituden-Remap in `InputState.applyDeadzone` bleibt unangetastet und sieht nur 0 oder 1.
5. Nicht engaged: **exakt (0, 0)** — kein Drift/Rauschen im Stillstand.

`snapshotFromPad` bleibt absichtlich roh (InputState-Tests + input-adapters-Tests prüfen die
Rein-Funktion); der Filter greift nur auf den Read-Pfaden. Modulzustand via `resetStickFeel()`
(Hotplug/Tests). `InputState.ts` wurde nicht berührt.

## Tests (K3, Commit 9c77..  — `tests/gamepad-stick-feel.test.ts`, 13 Tests)

Deadzone wirksam (Rauschen/Drift → exakt 0; Engage-Kante; Hysterese-Band; Half-Push-Einheitsvektor;
NaN/Inf), 8-Richtungs-Konsistenz (45°-Raster; Stick-Diagonale == `normalizeVector(1,1)`;
Richtungs-Aktionen deckungsgleich mit D-Pad), Sektor-Hysterese (Grenze hält, kein Flacker-Sweep),
kein Doppel-Event im rauschenden Sweep (max. 1 Richtungs-Wechsel pro Frame), 0 Events im Stillstand.

**79/79 grün** — inklusive der unveränderten Fremd-Tests `gamepad-nav` (menu-nav),
`input-adapters`, `input`, `input-latency`, `esc-pause`.

## Abnahme

- Fehlbewegungs-Quote bei Rauschen: **0 % < 5 %** ✓
- 0 Events im Stillstand ✓ (300/300 Frames exakt 0, keine Richtungs-Aktionen)
- gamepad-nav-Tests (menu-nav + widget) unverändert grün ✓
- npm test + npm run build: siehe K4-Abschluss im Commit.

## Offene Punkte

- Analoges (teilstufiges) Tempo bewusst aufgegeben: Stick verhält sich digital wie D-Pad —
  Dom-Freigabe war ausdrücklich „Gamepad-Kurs" mit konsistenten Einheitsvektoren.
- Falls ein künftiges Pad deutlich stärker driftet als Stream-Annahme (Drift > 0,28):
  `STICK_ENGAGE_DEADZONE` ist die einzige Stellschraube (Gamepad.ts, exportiert).
