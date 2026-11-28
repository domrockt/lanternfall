# Lane m10-quality-thermal-guard — Geraet-Tor entschärft ohne Auflösungs-Anfassen

**Ziel:** Das Geraet-Tor „10-min-Lauf ohne Thermik-Einbruch" (Dom 10:00Z) über einen
**Qualitäts-Hebel** entschärfen — RENDER_SCALE/Auflösung bleibt UNANGETASTET
(Android-Praxisregel 1: nie unter 640×360 logisch rendern; Last senken statt Auflösung).
Kein Doppel-Messen auf dem Tablet: die Geraet-Messung bleibt Aufgabe von
`m10-v10-device-acceptance`.

## Der Hebel

Neue Qualitätsstufe **`thermal`** unterhalb `low` in `src/logic/quality.ts` — der
stepQuality-Regler endet bislang bei `low`; bleibt das Gerät trotz `low` dauerhaft
überhitzt (FPS-Median unter 30), dreht der neue thermische Guard diese Stufe auf:

| Konstante | Wert | Bedeutung |
|---|---|---|
| `THERMAL_FPS` | 30 | Absturz-Schwelle: FPS-Median dauerhaft darunter |
| `THERMAL_WINDOW_MS` | 8000 | Median-Fenster (8 s @ 1-Hz-Samples, Aufrufer führt die Serie) |
| `THERMAL_HOLD_MS` | 10 000 | Haltefenster: Abstieg erst nach 10 s anhaltendem Absturz |
| `THERMAL_RECOVERY_FPS` | 45 (= `QUALITY_LOW_FPS`) | Erholungs-Schwelle |
| `THERMAL_RECOVERY_MS` | 20 000 | Rückweg erst nach 20 s Erholung AM STÜCK |

Budget der Stufe `thermal` (streng unter `low` = 90/2025/8/8/5): **48 FX-Sprites,
640 ADD-Device-px pro Glow, 4 Partikel/Treffer, 4 Schadenszahlen/s, 3 Labels, Glow aus**.
Nur bestehende Cap-Stellen (FxSystem ADD-Fläche/Slots, DamageNumbers-Labels) —
keine Asset-Textur- und keine Auflösungspfade berührt.

## API (rein, ohne Uhr/Phaser, unit-getestet)

- `evaluateThermalStep(fpsSerie, state, dtMs)` — ein Guard-Schritt; Median der Serie,
  engage nach Haltefenster nur ab Basis-Stufe `low` (Definition „trotz LOW-Stufe"),
  ohne Signal (NaN/leer) Timer eingefroren.
- `evaluateThermalStep` Hysterese wie `stepQuality`/`stepRenderScale`: Abstieg nach
  Haltefenster, Aufstieg nur nach ununterbrochener Erholungszeit (Abbruch setzt
  `recoverMs` auf 0) — kein Flapping; ein neuer Abstieg braucht wieder das volle
  Haltefenster.
- `ThermalTier = QualityTier | "thermal"`, `THERMAL_BUDGET`, `initialThermalState()`;
  `qualityBudgetFor` akzeptiert `thermal` (alle Cap-Helfer damit automatisch).

**Nicht geändert:** `QUALITY_ORDER`, `stepQuality`, alle bestehenden Budgets,
`src/config.ts` — bestehende Tests (`tests/quality-tier.test.ts`) laufen bitgleich.

## Belege

- Test-Matrix `tests/quality-thermal.test.ts` — 33 Tests grün (K1 Definition,
  K2 Hysterese, K3 Grenzfälle: Schwelle strikt `<`, kurzer Einbruch ≠ thermisch,
  ungueltige dt, Kein-Flapping-Matrix, Bitgleichheit bei stabiler FPS).
- Skript-Beleg (deterministisch, kein Geraet nötig):
  `node --experimental-strip-types scripts/m10-thermal-guard.mjs` →
  **6/6 Szenarien PASS**, JSON: `~/games/.evidence/m10-quality-thermal-guard/thermal-guard.json`
  (kein Browser-Lauf ⇒ Renderer-String-Pflicht entfällt; die gilt nur für
  Geraet-Messungen und bleibt bei `m10-v10-device-acceptance`).
  Szenarien: stabil-55fps (nie engage) · thermisch-26fps (engage@10 s) ·
  kurze-einbrueche-7s (nie engage) · flapping-schutz (bleibt thermal) ·
  erholung-nach-abstieg (engage@10 s → Rückkehr@30 s) · totzone-37fps (bleibt thermal).

## Qualitäts-Tier-Reaktion (zusammengefasst)

`high → medium → low` (unverändert, stepQuality 45/57-FPS-Hysterese) → **`thermal`**
(nur ab `low`, Median < 30 über 8 s, 10 s halten) → Rückkehr auf `low` nach 20 s
Erholung ≥ 45 FPS am Stück. Auf jeder Stufe werden nur FX-/ADD-/Partikel-/Label-Budgets
gesenkt — Auflösung und Texturen bleiben gleich, daher keine Textzerfall-Reaktivierung.

## Offen / Folgekarten

1. **Verdrahtung `src/config.ts`** (fremde Datei, hier nur angefragt): im `tick()` nach
   `qState = stepQuality(...)` einen `thermalState` mitführen; wenn
   `evaluateThermalStep` engage → `QUALITY = "thermal"` setzen (Budget greift über die
   bestehenden Cap-Helfer automatisch), `__rbDbg.thermalState` für Telemetrie.
   Wartet auf Disponent-Freigabe für `src/config.ts`.
2. Geraet-Messung (10-min-Thermik-Lauf) bleibt bei `m10-v10-device-acceptance` —
   hier bewusst NICHT doppelt gemessen.
