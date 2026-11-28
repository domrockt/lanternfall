# Lane m10-props-always-visible (2026-11-28)

Ziel (Dom, auf dem Tablet gesehen): "Bei sehr vielen Gegnern und Effekten verschwinden die
Umgebungssprites wie Steine, Pilze usw. — wie ein Flackern, und wenn wieder weniger los ist,
ist alles wieder da."

## Ursache

`propDensityMaxTier` in `src/logic/lod.ts` (Lane m10-prop-density-lod, 27.11.): >= 150 Gegner
-> kleine Deko aus, >= 200 -> nur Laternen. Die Gegnerzahl pendelt im Endgame stark
(laut Repro 23..246 in 12 s), die momentbasierten Schwellen hatten keine Glättung —
Props/Schatten blinkten im Sekundentakt.

## Belege (~/games/.evidence/m10-props-always-visible/)

| Messung | Ergebnis |
|---|---|
| `before.json` (K1-Repro, Seed 7, Minute 22, Pendeln 130..220 Gegner) | **8 Prop-Tier-Wechsel in 12 s**, sichtbare Props 13..458 — das Flackern |
| `after.json` (nach Fix) | **0 Tier-Wechsel**, visProps 216..640 (Zunahme nur durch Chunk-Nachbau, nie Verstecken) |
| `after-proxy.json` (Android-Ersatzprofil, Galaxy Tab S4, CPU 4x, flock) | fpsMedian **57**, fpsMin 49, 0 Tier-Wechsel, Renderer `Mesa Intel(R) Graphics (RPL-S)` |
| Abnahme-Screenshot | `shots/abnahme/m10-props-always-visible-after-proxy.png` — Minute 22:13, dichter Schwarm + Boss, ALLE Props sichtbar |

Messskript: `scripts/m10-props-always-visible.mjs` (`--tag before|after`, `--proxy`,
`--shot <pfad>`; FPS-Messungen nur mit `flock /home/ai/games/.lf-perf.lock`).

## Fix (K2)

- `propDensityMaxTier` gibt **immer 2** zurück (Single-Source "alles sichtbar"); die
  Schwellen `PROP_DENSITY_N1/N2` und die Schalt-Mechanik sind entfernt.
- `GroundRenderer`: `applyPropTier`, `propLodMaxTier` und der Sichtbarkeitsfilter in
  `addProp()` entfernt. Props/Schatten/Prop-Glows sind statisch gebatcht und billig —
  Last wird über FX/Partikel-Qualitätsstufen gesenkt, nie über die Welt.
- `tests/prop-density-lod.test.ts` gelöscht (Prämisse weg), `tests/props-always-visible.test.ts`
  neu: Guard, dass `propDensityMaxTier` bei jeder Eingabe 2 liefert.
- Unvermeidbar angefasste Fremd-Dateien (Verträge bezogen sich auf die entfernte Methode):
  `tests/props-wiring.test.ts` (Quell-Guard jetzt: keine `applyPropTier|propLodMaxTier|`
  `propDensityMaxTier`-Referenz im Renderer) und `scripts/m10-props-wiring.mjs`
  (Tier-0-Zwangversuch entfallen).

## K3: sonstige Welt-Objekt-LODs geprüft

- `ambientBudgetFor` (Glühwürmchen/Nebel): einzige verbleibende lastabhängige Stelle.
  Jetzt mit **Hysterese** (`ambientBudgetWithHysteresis`, Band 40: Abstieg ab off,
  Rückkehr erst unter off-40) und **weicher Überblendung** (`ambientShownStep`,
  Alpha-Rampe ~10 Glows/s bzw. 1,5 Nebel/s) im `GroundRenderer` — nie hartes An/Aus.
- `src/logic/quality.ts` (reduced/minimal/thermal): betrifft ausschließlich FX-Sprites,
  ADD-Glow-Fläche, Partikel, Schadenszahlen — **keine Welt-Objekte**. Regler hat ohnehin
  Totzone + Haltezeiten (Hysterese).
- `FxSystem.setEnemyLoad` (glow-Cap an Gegnerzahl): laut Codekommentar **ohne produktiven
  Aufrufer** (tot) — kein Flacker-Risiko, nicht geändert.
- Chunk-Culling (`GroundRenderer.dispatch/finalizeReady`): rein viewport-/distanzbasiert,
  lastunabhängig — ok.

## Tests / Build

- `npx tsc --noEmit` grün; `npm test` 2225/2225 grün; `npm run build` grün.
- `tests/ambient-batching.test.ts` +6 Tests (Hysterese-Grenzen, Fade-Rate, kein Überschießen).
- 0 JS-Fehler in allen Messläufen (`jsErrors: []` in den JSONs).

## Offene Punkte

- **Geräte-Messung (Dom, nach Merge):** APK auf dem Redmi Pad Pro, Minute 25 mit 300 Gegnern
  + 176 FX — Ziel >= 60 FPS (Gerätemessung 28.11. 11:00: Median 115 / Min 101). Der
  Prop-LOD wird nicht mehr gebraucht; falls das Gerät doch rudelt, über Qualitätsstufen
  (FX/Partikel) drosseln, nie über die Welt.
- `FxSystem.setEnemyLoad` ist toter Code (2x identisch, FxSystem + ParticleSystem) —
  Kandidat für eine Cleanup-Karte (nicht diese Lane).
