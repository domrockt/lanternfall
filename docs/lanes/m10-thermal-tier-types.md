# m10-thermal-tier-types — Typ-Schulden: Cap-Wrapper tragen ThermalTier

Bedarfsmeldung `m10-thermal-wiring` (requests.md, 2026-11-28T11:50Z): `qualityBudgetFor(ThermalTier)`
deckt "thermal" zur Laufzeit bereits voll ab, aber die Cap-Wrapper deklarierten noch `QualityTier`.
**Reine Typ-Gewinnrate, keine Verhaltensänderung.** Lane: Worktree
`/home/ai/games/lf-lanes/m10-thermal-tier-types`, Branch `m10-thermal-tier-types`, Karten #12307–#12310.

## K1 — Signaturen in src/logic/quality.ts (#12307, Commit a0db3fe0)
`glowAreaCapForQuality`, `glowEnabledFor`, `damageLabelCapForQuality`, `particlesPerHitFor`:
Parameter `QualityTier` → `ThermalTier` (4 Einzeiler-Delegationen, die über
`qualityBudgetFor` laufen, das "thermal" → `THERMAL_BUDGET` abdeckt). Dokumentkommentar am
`glowAreaCapForQuality` erklärt die Gewinnrate. `glowSlotCapForQuality`/`damageNumbersPerSecFor`
bleiben bewusst unverändert (nicht Teil der Bedarfsmeldung; keine Aufrufer mit ThermalTier).

## K2 — src/audio/mixing.ts (#12308, Commit 1cb053dc)
`audioBudgetFor`: Parameter `ThermalTier`. **thermal → high = Status quo** (Audio ist kein
thermal-Hebel): vorher lief das über `AUDIO_BUDGETS["thermal"]` = `undefined` → `?? high`, jetzt
expliziter `if (tier === "thermal") return AUDIO_BUDGETS.high;`. Der `?? high`-Fallback für
unbekannte Tiers bleibt erhalten (bitgleich) — der bestehende Guard-Test
`tests/audio-quality-budget.test.ts` ruft `audioBudgetFor("egal" as never)` und blieb dadurch grün,
ohne die fremde Testdatei anzufassen.

## K3 — src/config.ts (#12309, Commit 95d7f1f6)
- **Cast entfallen:** `effectiveQuality` gibt ehrlich `ThermalTier` zurück
  (`return thermal.active ? "thermal" : baseTier;`), der dokumentierte
  `("thermal" as QualityTier)`-Cast ist weg.
- `QUALITY` (config.ts) ist jetzt ehrlich `ThermalTier` — die Assignment-Zeile
  `QUALITY = effectiveQuality(qState.tier, thermalState)` blieb exakt stehen
  (Pin in tests/thermal-wiring.test.ts K3d).
- **Hazard-Helfer bewusst QualityTier** (`drawQualityTier`, `warnDiscDrawCapForQuality`,
  `rimPulsePhaseFractionForQuality` in src/gfx/hazardDisc.ts — unangetastet): Warn-Disc-Lesbarkeit
  in thermal erhalten — "thermal" fällt dort in den offenen Zweig, nie in den low-Draw-Cap.
- **Fremdberührung, unvermeidbar, 1 Zeile:** `src/systems/Hazards.ts:203` —
  `drawQualityTier(QUALITY as QualityTier)` mit Kommentar. Begründung: `QUALITY` trägt jetzt
  `ThermalTier`; die Hazard-Helfer bleiben laut Bedarfsmeldung bewusst `QualityTier`, daher muss an
  der Grenze tsc-sichtlich verengt werden. **Laufzeitidentisch** — auch bisher floss "thermal" zur
  Laufzeit in den `QualityTier`-Parameter (der Cast verlagert nur die bestehende Typlüge sichtbar an
  die Grenze). Hazards.ts war zu diesem Zeitpunkt von keinem anderen Job geclaimt
  (claims.json 28.11., geprüft via claimcheck-Logik).
- `debug.ts` brauchte keine Änderung: `quality: QUALITY` sitzt in inferierten Objektliteralen.

## K4 — Guard-Test + Abnahme (#12310)
`tests/thermal-tier-types.test.ts` (13 Tests):
- Delegations-Guard: alle 4 Wrapper liefern für "thermal" exakt `THERMAL_BUDGET` und für
  high/medium/low bitgleich `QUALITY_BUDGETS[tier]`; Monotonie thermal < low gepinnt.
- `audioBudgetFor`: 4 Tiers bitgleich, `thermal === AUDIO_BUDGETS.high`, Unbekannt-Tier-Fallback.
- Compile-Zeit-Guard: Aufrufe mit `ThermalTier` (inkl. "thermal") scheitern an tsc, falls eine
  Signatur auf `QualityTier` zurückfällt.
- Pins: alte Cast-Codeform in config.ts verboten, neue Implementierung vorhanden,
  Assignment-Zeile unverändert.

## Abnahme-Belege (2026-11-28)
- `npx tsc --noEmit` → rc=0 (je Karte und final).
- `npx vitest run` → **210 Dateien / 2330 Tests, 0 fail** (inkl. 13 neue).
- `npm run build` → grün (je Karte; final 427 ms).
- Kein Verhaltens-Delta: keine Runtime-Änderung in src/ (nur Typ-Annotationen + 2 explizite
  Zweige, die den bisherigen impliziten `undefined ?? high`-Pfad bitgleich abbilden).
  Verify-Smoke entfällt daher als eigenes Kriterium — die Suite deckt die Laufzeitpfade ab;
  zusätzlich pinnen thermal-wiring + audio-quality-budget die Verdrahtung.
- Fremdartefakte: die Vitest-Suite regeneriert `shots/m10-passive-math-*.json` (nur
  `generatedAt`) — nach jedem Vollauf zurückgesetzt (`git checkout -- shots/`), nicht committet.
- Board: #12307–#12310 (reservierter Block), Kontrolleure: reviewer über Merge-Pipeline.

## Offene Punkte
Keine. Optionale Folgeschritte (nicht beauftragt): auch `glowSlotCapForQuality` /
`damageNumbersPerSecFor` auf `ThermalTier` erweitern, sobald sie verdrahtet werden.
