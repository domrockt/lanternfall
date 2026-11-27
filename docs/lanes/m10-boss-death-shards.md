# Lane m10-boss-death-shards — Boss-Tod-Shards: Kontrast-Fix im ParticleSystem

Folgekarte aus m10-boss-fx-contrast (Lane-Doku „Offene Punkte“): Beim Boss-Tod
nutzt CombatSystem `ParticleSystem.burst`/`shards` — dort greifen die
#5220-Ausnahmen (Boss-FX NORMAL + Alpha-Boden 0,7 ohne Dämpfung/Glow-Slot) NICHT.
Der Boss-Tod-Explosion-Pfad bleibt ADD + fxAlpha-Dämpfung + Glow-Slot-Buchhaltung
und wird genauso ausgewaschen wie vorher der beanstandete Intro-FX
(art-director-Blocker „Boss-FX-Kontrast“ wurde für den FxSystem-Pfad aufgehoben,
nicht für den Shard-Pfad).

## Karten

| # | Inhalt | Stand |
|---|--------|-------|
| K1 | Ist-Stand messen (`scripts/m10-boss-shards.mjs`) | **erledigt** (s. u.) |
| K2 | Fix in ParticleSystem — Boss-FX-Keys NORMAL + Alpha-Boden 0,7, ohne fxAlpha-/dpr-Dämpfung, ohne Glow-Slot | **blocked** (Area, s. u.) |
| K3 | Tests `tests/boss-death-shards.test.ts` | offen (nach K2) |
| K4 | Nachher-Messung + art-director-Sichtprüfung + diese Doku | offen (nach K2) |

## K1 — Ist-Stand (Messung, EINMAL, kein Tuning-Loop)

Harness: `node scripts/m10-boss-shards.mjs --tag=before`
Boss-Tod wie im Spiel über **beide Pfade**: `collectKills → playBossDeathFx`
(Shards `fx_death_bone`/`fx_fire` im delayedCall 260 ms) **und**
`hitEnemy → CombatSystem.killsFx` (Burst `fx_boss_core` + `fx_halo`).
Horde 283 Gegner (reduced-LOD, `alphaScale 0,72` aktiv), Views 640x360@1 und
780x360@3, Frozen im Shard-Peak (+120 ms nach erster Shard-Sichtbarkeit).

Renderer (beide Views): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
— kein SwiftShader, jsErrors = 0.

| Partikel-Key | n | Blend | Glow-Slots | alphaFrom | alpha (Peak) |
|---|---|---|---|---|---|
| `fx_boss_core` (Kern/Rim, killsFx) | 29 | NORMAL | 0 | 0,252–0,684 | 0,141–0,483 |
| `fx_halo` (Boss-Staub) | 8 | NORMAL | 0 | 0,288 | 0,119–0,165 |
| `fx_death_bone` (Run-Shards) | 26 | NORMAL | 0 | 0,720 | 0,575–0,637 |
| `fx_fire` (Glut-Shards) | 30 | **ADD** | **30** | 0,518 (@1) / 0,311 (@3) | 0,396–0,451 / 0,238–0,271 |

Beide Views identisch gemessen (Dämpfung wirkt dpr-abhängig nur auf ADD).

Befunde:

1. **`fx_fire`-Shards: ADD + 30 von 40 Glow-Slots.** Der Boss-Tod belegt allein
   75 % des geteilten Overdraw-Deckels; bei dpr 3 fällt alphaFrom auf 0,311 —
   die Glut-Shards sind im Peak fast transparent (alpha 0,238–0,271).
2. **`fx_boss_core`-Kern/Rim: fxAlpha-Dämpfung ohne Ausnahme** — alphaFrom bis
   0,252 (Rim 0,35 × 0,72), im Peak bis 0,141. Die dunkle Tintenkontur aus
   Karte #5219 wird damit weggedämpft (Kontur lesbar nur bei vollem Alpha).
3. `fx_death_bone` rendert zwar NORMAL (additive:false), aber alphaFrom 0,72 —
   auch der nicht-additive Pfad wird von der fxAlpha-Dämpfung erfasst.
4. Glow-Deckel 39/40 belegt während des Peaks: der Boss-Tod verdrängt reguläre
   additive FX aus dem Deckel.

Belege: `shots/m10-boss-shards-before-640x3601.png`,
`shots/m10-boss-shards-before-780x3603.png` (Explosion mitten im Effekt,
Kontur als brauner Schlamm-Blob kaum trennbar), `shots/m10-boss-shards-before.json`.

## K2 — Blocker: Area (Disponent-Anfrage gestellt)

Der Briefing-Area nennt `src/systems/ParticleSystem.ts` — **diese Datei
existiert nicht**: Die Klasse `ParticleSystem` liegt in
`src/systems/FxSystem.ts` (Zeilen ab ~554). Diese Datei ist beim Disponenten
an `m10-perf-cap-rollback` vergeben (claims.json), die Lane ist fertig
(`.lane-done` vorhanden), aber noch nicht in main gemergt.

Zweite Abhängigkeit: `isBossFxKey`/`BOSS_FX_BASES` (Commit `fd66146`) liegen nur
auf dem ebenfalls noch nicht gemergten Branch `m10-boss-fx-contrast`.

Konsequenz (Lanemuster wie m10-vfx-restore): Anfrage in
`/home/ai/games/.dispatch/requests.md` gestellt. K2/K3/K4-Nachher warten auf
die Area-Freigabe bzw. den Merge von `m10-perf-cap-rollback` +
`m10-boss-fx-contrast`; bis dahin kein Arbeiten am Rand des Area.

## Fix-Entwurf (K2, sobald Area frei ist)

Analog #5220 (FxSystem-Pfad, `69f2e94`): in `ParticleSystem.spawn` bei
Boss-FX-Keys (`isBossFxKey(opts.texture) || isBossFxKey(opts.frames?.[0])`,
Basis `BOSS_FX_BASES = ["fx_boss_core"]`)
- `additive` erzwingen → false (NORMAL-Blend, dunkle Kontur bleibt sichtbar),
- fxAlpha-/dpr-Dämpfung ausnehmen (alphaScaleExempt-Verhalten, Faktor 1),
- Alpha-Boden `alphaFrom = max(alphaFrom, 0,7)`,
- keinen Glow-Slot belegen (`p.glow = false` ohne `budget.request()`),
- Screengrößen-Cap (clampGlowScreenArea) nicht auf Boss-Partikel anwenden.
Reguläre Partikel unverändert (Regression in K3).
