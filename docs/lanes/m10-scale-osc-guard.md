# Lane m10-scale-osc-guard (M10: Hysterese-Nachweis + Pump-Guard für RENDER_SCALE)

Ziel (Dom, 19:20Z): stabile iGPU-Belege — RENDER_SCALE bleibt 1 im Messlauf.
Unter Lastspitzen kann der Regler (`src/logic/scale.ts`, `stepRenderScale`)
zwischen Stufen pendeln ("Pumpen") und so Abnahme-Belege und das
Android-Sicherheitsnetz destabilisieren. Nachweis deterministisch führen,
falls belegt: Guard, ohne 640er-Pfad und ?rbscale-Override anzutasten.

## #7428 K1 — Lastserie gegen stepRenderScale (Commit 474a41f)

`scripts/m10-scale-osc.mjs`: deterministische Lastserien (dt = 16,67 ms,
EWMA 0,9/0,1 wie die Verdrahtung in `src/config.ts`) gegen die reine
Funktion `stepRenderScale`. Determinismus im Skript geprüft (2 Läufe
byte-gleich). Vorher-Beleg `shots/m10-scale-osc-before.json`:

| Muster                    | Wechsel/240 s | davon hoch/runter | Ende Stufe |
|---------------------------|---------------|-------------------|------------|
| alternating_5s (5s@41,5 / 5s@62) | **49** | 24 / 25           | 2          |
| alternating_3s            | 2             | 0 / 2             | 3          |
| spikes_4s (8× 30s@62 + 4s@41,5) | 15      | 7 / 8             | 2          |

**Pumpen belegt**: bei 5-s-Epochen pendelt der Regler permanent (49
Stufenwechsel). Ursache: jede 5-s-Lastspitze erreicht die 2-s-Senk-Schwelle,
jede 5-s-Entlastung die 4-s-Heb-Schwelle — die Totzone schützt nicht gegen
alternierende Epochen.

## #7429 K2 — Hysterese-Deckel + Tests (Commit 2c9b1c1)

`src/logic/scale.ts` (einzige geänderte Quelldatei; `src/config.ts` NICHT
angefasst — neue State-Felder sind optional, damit die bestehende
Verdrahtung kompiliert):

- `SCALE_MIN_STEP_MS = 8000`: zwischen zwei beliebigen Stufenwechseln
  liegen mindestens 8 s (max 1 Wechsel je ~480 Frames bei 60 FPS).
- `SCALE_RECOVER_MS = 12000`: Abbau (Teiler −1) braucht 12 s **am Stück**
  ≥ 57 FPS (die belowMs-Zone setzt `aboveMs` zurück — "am Stück" ist damit
  abgedeckt). Erstwechsel ohne Historie bleibt beim alten 4-s-Schwellwert,
  damit der Kaltstart unter Last nicht verzögert.
- `applyRenderScaleOverride(override, controllerScale)`: reine Abbildung
  der Override-Priorität (0 = Regler aus/voller Buffer, wird NICHT auf 1
  geklemmt; 1..3 fest; null = Regler). Verdrahtung in config.ts
  (`forced !== null → apply(forced); return`, src/config.ts:179-186) hat
  Vorrang vor dem Regler — dort nur gelesen.

Nachher-Beleg `shots/m10-scale-osc-after.json`:

| Muster         | vorher | nachher | Verhalten nachher |
|----------------|--------|---------|-------------------|
| alternating_5s | 49     | **2**   | Einschwingen bis Stufe 3 (cap), dann 0 Wechsel über ~230 s |
| alternating_3s | 2      | 2       | unverändert stabil |
| spikes_4s      | 15     | 15      | legitime Ereignis-Reaktion (Spitze → hoch, 12 s Erholung → runter), kein Ratchet (Tests belegen Abbau) |

Tests: `tests/scale-osc.test.ts`, 11 Fälle (0 Wechsel nach Einschwingen für
5-s- und 3-Serien, Determinismus, kein Ratchet bei Spitzen, Guard-Einzelregeln,
Override-Vorrang 0..3 über jeden Regler-Zustand, 640er-Pfad cap 1 wechselt
NIE). Bestehende `tests/scale-budget.test.ts` (13 Fälle) unverändert grün;
ganze Suite 1124/1124, `tsc --noEmit` rc=0.

## #7430 K3 — Messbelege unter flock (Commit 51fb4c5)

`scripts/m10-dpr-budget.mjs` (nur gelesen) unter
`flock /home/ai/games/.lf-perf.lock`, M25-Last, je 10-s-Messfenster:

- `shots/m10-scale-osc-trace-780.json` (780×360 dpr3, `rbscale=3` erzwungen):
  Buffer 260×120 stabil in 3/3 Läufen, 60,0 / 60,0 / 59,4 FPS, 0 JS-Fehler.
- `shots/m10-scale-osc-trace-640.json` (auto-Regler 780×360 dpr3 + 640×360
  dpr1): Regler bleibt auf **Teiler 1 in 3/3 Läufen** (Buffer 780×360, kein
  Pendeln — das Dom-Kriterium); 640×360 dpr1: divisor 1, 60,0 FPS,
  minEnemies 300, passed.
- WebGL-Renderer-String in allen 8 Läufen: `ANGLE (Intel, Mesa Intel(R)
  Graphics (RPL-S), OpenGL ES 3.2)` — echte iGPU, **kein SwiftShader**.

Hinweis (nicht lane-bedingt): der 640-Lauf exitet rc=1, weil das Skript
`renderWidth === 480` als Kriterium hat; main-Verhalten nach #4658 liefert
CSS/Buffer 640×360 (divisor 1). Der Lauf selbst ist `passed: true`; das
stale Kriterium sollte der Besitzer von `scripts/m10-dpr-budget.mjs`
anpassen (Datei ist für diese Lane gesperrt).

## Abnahme (Soll/Ist)

- Test-Serie belegt 0 Oszillationen nach Einschwingen (oder belegter Fix):
  ✅ 49 → 2 (alternierende Serie), 0 Wechsel nach t=30 s, in Tests fixiert.
- RENDER_SCALE im Messlauf stabil: ✅ Teiler 1 in 3/3 Auto-Läufen; erzwungener
  Teiler 3 stabil in 3/3.
- Tests grün: ✅ 1124/1124, tsc rc=0, `npm run build` rc=0.
- 640er-Pfad bitgleich/unchanged: ✅ cap 1 wechselt nie (Test + Messlauf
  divisor 1, 60 FPS). Einzige Änderung in scale.ts: neuer Guard + neue
  Exporte; `stepRenderScale`-Verhalten für States ohne Historie am
  Erstwechsel und alle bestehenden Testpfade unverändert.
- Grenzen eingehalten: keine Commits an `src/config.ts`,
  `tests/scale-budget.test.ts`, `scripts/m10-dpr-budget.mjs`, board.json
  (Board-Datei wird vom Plugin verwaltet).

## Offene Punkte

- `scripts/m10-dpr-budget.mjs`: 640er-Exit-Kriterium `renderWidth === 480`
  ist stale (main liefert 640×360) — Ticket beim Skript-Besitzer.
- Ein 30-min-Fullrun-Beleg (RENDER_SCALE-Trace über die volle Laufzeit)
  war nicht Teil dieses Kartensatzes; die Stabilität ist über die
  deterministische Serie (0 Wechsel nach Einschwingen) + 3×10-s-Messläufe
  belegt.
