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

## K2/K3 — umgesetzt im Worktree, Commit durch Area-Claim blockiert

**Stand 2026-11-27 (dieser Worktree):** Fix ist implementiert, getestet und
gemessen — der Commit von `src/systems/FxSystem.ts` wird aber vom
pre-commit-Hook (claimcheck) blockiert, bis der Disponent die Datei freigibt
(Anfrage in `/home/ai/games/.dispatch/requests.md`, siehe Abschnitt oben).

Umsetzung (Patch: `~/tmp/m10-boss-death-shards/k2-fxsystem-fix.patch`,
81 Zeilen; zusätzlich uncommittet im Worktree):

- `ParticleSystem.spawn`: Boss-Keys (`isBossParticleFxKey(opts.texture) ||
  isBossParticleFxKey(opts.frames[0])`, Basis `["fx_boss_core"]`) werden
  non-additiv gespawnt (NORMAL-Blend), mit `scaleFactor = 1` (keine
  fxAlpha-Dämpfung, kein alphaScale² wie beim ADD-Pfad), ohne dpr-Alpha,
  mit Alpha-Boden `BOSS_PARTICLE_ALPHA_FLOOR = 0,7` und ohne Glow-Slot
  (`blendAdd` schließt Boss-Keys explizit aus; der Screengrößen-Cap greift
  nur für additive Sprites).
- `ParticleSystem.setAlphaScale`: Boss-Partikel werden im Dämpfungs-Loop
  übersprungen (LOD-Wechsel mitten im Boss-Tod verschiebt sie nicht mehr).
- SYNC-HINWEIS im Code: `BOSS_FX_BASES`/`isBossFxKey` liegen seit fd66146 in
  `src/gfx/gen-fx.ts`; bis zum Merge wird die Key-Liste lokal gehalten, beim
  Merge durch den Import ersetzen.

**Merge-Karte (für den Disponenten/Merge-Job):** Patch anwenden (oder
FxSystem.ts-Claim freigeben und die Karten K2–K4 als Lane-Commit bringen),
dann gen-fx-Import ersetzen, K3-Tests grün, K4-Belege committen.

Tests: `tests/boss-death-shards.test.ts` — 11 Tests, alle grün:
Boss-Kern/Rim NORMAL + Alpha ≥ 0,7 trotz alphaScale 0,72; additiver Spec-Fall
(dissolve/sputter) → NORMAL statt ADD; kein Glow-Slot (Deckel bleibt frei);
setAlphaScale verschiebt Boss-Partikel nicht; Regression: fx_fire bleibt ADD +
Glow-Slot + Dämpfung (0,5184 @dpr1 = Ist-Messung), fx_death_bone weiter
dämpfbar, Glow-Deckel zählt reguläre FX weiter, FxSystem unberührt.
`npx tsc --noEmit` rc=0, `npm test` 713/713 grün, `npm run build` rc=0.

## K4 — Nachher-Messung (Fix im Worktree aktiv)

`node scripts/m10-boss-shards.mjs --tag=after` (gleicher Harness, 283 Gegner,
alphaScale 0,72, Renderer RPL-S, jsErrors 0):

| Partikel-Key | Vorher alphaFrom | Nachher alphaFrom | Vorher Blend/Glow | Nachher Blend/Glow |
|---|---|---|---|---|
| `fx_boss_core` | 0,252–0,684 | **0,700–0,950** | NORMAL / 0 | NORMAL / 0 |
| `fx_halo` (Staub, kein Boss-Key) | 0,288 | 0,288 (unverändert) | NORMAL / 0 | NORMAL / 0 |
| `fx_death_bone` | 0,720 | 0,720 (unverändert) | NORMAL / 0 | NORMAL / 0 |
| `fx_fire` | 0,518 / 0,311 (@3) | 0,518 / 0,311 (unverändert) | ADD / 30 | ADD / 30 |

Belege (Worktree + `~/tmp/m10-boss-death-shards/`, Commit gemeinsam mit dem
Fix): `shots/m10-boss-shards-after-640x3601.png`, `-780x3603.png`,
`-after.json`. Im 780er-Nachher-Shot sind einzelne Splitter und der hellere
Kern der Explosion unterscheidbar (Vorher: homogener Schlamm-Blob).
art-director-Sichtprüfung: läuft / Ergebnis siehe Board-Notiz zu #5921.

Offen für K4: art-director-PASS dokumentieren, Nachher-Belege zusammen mit
K2/K3 committen (sobald die Area frei ist), dann `npm run build` + Tests im
Merge-Kontext erneut.

