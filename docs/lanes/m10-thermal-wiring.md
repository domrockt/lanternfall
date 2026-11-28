# Lane m10-thermal-wiring — Verdrahtung des thermal-Guards im tick()

Bedarfsmeldung (requests.md, von m10-quality-thermal-guard): die Verdrahtung von
`evaluateThermalStep` + `QUALITY = "thermal"` fehlt — die Guard-Logik liegt in
`src/logic/quality.ts` (seit merge-m10-quality-thermal-guard in main), der Aufrufer-Teil
in `src/config.ts` war offen. Diese Lane setzt genau das um.

## K1 — Stand (#11678)

**Merge-Stand:** `merge-m10-quality-thermal-guard` (3c09b7db) ist in main; der Worktree ist
bitgleich mit main auf `src/logic/quality.ts` und `src/config.ts`. Alle Guard-Teile vorhanden:

- `src/logic/quality.ts`: `THERMAL_FPS=30`, `THERMAL_WINDOW_MS=8000`, `THERMAL_HOLD_MS=10 000`,
  `THERMAL_RECOVERY_FPS=45 (=QUALITY_LOW_FPS)`, `THERMAL_RECOVERY_MS=20 000`,
  `THERMAL_BUDGET` (48/640/4/4/3, glow aus), `ThermalState`, `initialThermalState()`,
  `evaluateThermalStep()` (Zeile 278), `qualityBudgetFor()` akzeptiert `ThermalTier`.
- **`tick()` liegt in `src/config.ts`** (Funktion `installRenderBudget()`, intern `tick`),
  NICHT in `src/scenes/Run.ts` — Run.ts ist dadurch NICHT betroffen, keine Kollision mit
  m10-loading-screen, kein Zusatz-Bedarf für Run.ts.

**Befund Aufrufer-Kontrakt:** `THERMAL_WINDOW_MS` war bisher ungenutzt — laut Doku führt der
AUFRUFER die Median-Serie (1-Hz-Samples, 8 s Fenster). Genau das implementiert K2 in config.ts.

**Befund Typisierung (offener Rest für eine Folgelane):** `QUALITY` ist als `QualityTier`
deklariert; `"thermal"` ist `ThermalTier = QualityTier | "thermal"`. Die Cap-Wrapper
(`glowAreaCapForQuality`, `glowEnabledFor`, `damageLabelCapForQuality`, `particlesPerHitFor`
in `src/logic/quality.ts`, `audioBudgetFor` in `src/audio/mixing.ts`) deklarieren nur
`QualityTier`, delegieren aber intern an `qualityBudgetFor(ThermalTier)` — d. h. zur
Laufzeit greifen die Budgets korrekt, nur die Signaturen sind schmal. K2 setzt die
Verdrahtung deshalb mit einer dokumentierten Engstelle (Cast in config.ts, siehe K2)
um und beantragt die Signatur-Erweiterung als Bedarfsmeldung (`requests.md`), damit der
Cast später entfallen kann. `drawQualityTier`/Hazard-Helfer behandeln Nicht-`low` als
offene Caps — Warn-Disc-Lesbarkeit bleibt in `thermal` bewusst erhalten (Lesbarkeit im Chaos).
`audioBudgetFor("thermal")` fällt auf `high` zurück (Audio ist kein thermal-Hebel,
`THERMAL_BUDGET` kennt kein Audio-Feld).

## K2 — Verdrahtung src/config.ts (#11679)

Im `tick()` (config.ts, nur Browser-Laufzeit — in Vitest/Node passiv, siehe
`installRenderBudget`-Guard):

1. **FPS-Serie führen:** 1-Hz-Sampling von `fpsEwma` in ein Ringfenster mit
   `Math.round(THERMAL_WINDOW_MS/1000) = 8` Samples (Hilfsfunktion `pushFpsSample`, rein).
2. **Guard-Schritt:** nach `qState = stepQuality(...)`:
   `thermalState = evaluateThermalStep(serie, { ...thermalState, tier: qState.tier }, dt)`
   — `tier` folgt dem Basis-Regler, engage nur ab Basis-Stufe `low` (Definition
   „trotz LOW-Stufe", siehe Quelldoku).
3. **Wirkung:** `QUALITY = thermalState.active ? "thermal" : qState.tier` — die Budgets
   greifen über die bestehenden Cap-Helfer automatisch (`qualityBudgetFor` kennt `thermal`).
   Engstelle: Cast `as QualityTier`, weil die Wrapper-Signaturen noch schmal sind (siehe K1).
4. **Telemetrie:** `__rbDbg.thermalState = thermalState`.

Werte-Nahme: exclusively aus `src/logic/quality.ts` (Quelldoku
`docs/lanes/m10-quality-thermal-guard.md`) — config.ts deklariert KEINE eigenen
THERMAL-Konstanten (keine Duplikate; Test pinnt das).

## K3 — Test tests/thermal-wiring.test.ts (#11680)

16 Tests, alle grün (`npx vitest run tests/thermal-wiring.test.ts`); Gesamtsuite
2218 Tests / 198 Dateien grün, `npx tsc --noEmit` + `npm run build` grün (Commit c19b0a5e):

- Konfig-Konsistenz (aus `src/logic/quality.ts`): `THERMAL_FPS < THERMAL_RECOVERY_FPS (= QUALITY_LOW_FPS)`,
  `THERMAL_WINDOW_MS < THERMAL_HOLD_MS < THERMAL_RECOVERY_MS`, `THERMAL_BUDGET` strikt unter
  `QUALITY_BUDGETS.low` je Komponente, Glow aus (low wie thermal — Glow ist schon auf low aus).
- Verdrahtungs-Pin: `pushFpsSample` (1-Hz, Fensterkappung, Riesen-Delta = genau 1 Sample),
  effektive Tier-Auswahl (`thermal` nur bei aktiv, engage nur ab Basis `low`, voller Zyklus
  engage nach THERMAL_HOLD_MS → Rückkehr auf `low` nach THERMAL_RECOVERY_MS), config.ts
  importiert `evaluateThermalStep` aus `./logic/quality`, ruft es GENAU 1x im `tick()` und
  deklariert keine eigenen THERMAL-Konstanten (keine Duplikate, kein zweiter TICK-Hebel).

## Commits

- #11678 f029b5ee — K1 Stand
- #11679 7ed715cf — K2 Verdrahtung src/config.ts
- #11680 c19b0a5e — K3 Test
- #11681 K4 — Doku + .lane-done

## Offen / Folgekarten

1. **Signatur-Erweiterung (Bedarfsmeldung in `requests.md`):** Cap-Wrapper
   `QualityTier → ThermalTier` in `src/logic/quality.ts` (4 Delegationen) und
   `src/audio/mixing.ts` (`audioBudgetFor`, dort Index-Fallback beachten) — dann kann der
   dokumentierte Cast in config.ts entfallen. Keine Verhaltensänderung, reine Typ-Gewinnrate.
2. Geraet-Messung (10-min-Thermik-Lauf) bleibt bei `m10-v10-device-acceptance` — hier NICHT
   doppelt gemessen (Quelldoku-Punkt 2 unverändert).
