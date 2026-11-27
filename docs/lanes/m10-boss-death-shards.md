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
| K2 | Fix in ParticleSystem — Boss-FX-Keys NORMAL + Alpha-Boden 0,7, ohne fxAlpha-/dpr-Dämpfung, ohne Glow-Slot | **erledigt** (s. u.) |
| K3 | Tests `tests/boss-death-shards.test.ts` | **erledigt** (s. u.) |
| K4 | Nachher-Messung + art-director-Sichtprüfung + diese Doku | **erledigt** (s. u.) |

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

## K2 — Blocker: Area (zwischenzeitlich entfallen)

Der Briefing-Area nennt `src/systems/ParticleSystem.ts` — **diese Datei
existiert nicht**: Die Klasse `ParticleSystem` liegt in
`src/systems/FxSystem.ts` (Zeilen ab ~554). Diese Datei war beim Disponenten
an `m10-perf-cap-rollback` vergeben. **Beide Blocker sind entfallen
(2026-11-27, Versuch 2):** der Claim ist weg (claims.json enthält
`FxSystem.ts` nicht mehr; Lane `m10-perf-cap-rollback` abgeschlossen,
`145cd61`), und `fd66146` (`isBossFxKey` in `src/gfx/gen-fx.ts`) ist über den
Merge `588b344` **bereits in main** — unsere Lane basiert nur noch auf einem
älteren Base-Stand, deshalb bleibt die Key-Liste lokal (s. SYNC-HINWEIS).

## K2/K3 — umgesetzt im Worktree, Commit durch neuen Claim blockiert

**Stand 2026-11-27, Versuch 2:** Fix und Tests sind implementiert, getestet
(11/11 Lane-Tests, 713/713 Suite, tsc rc=0, build rc=0) und vom Reviewer
geprüft (PASS) — der Commit von `src/systems/FxSystem.ts` ist aber erneut
blockiert: der Disponent hat die Datei nach dem Wegfall von
`m10-perf-cap-rollback` **neu** an `m10-fx-mixel-fix` vergeben (claims.json
seit 22:19Z, zusammen mit `src/gfx/gen-fx.ts`). Anfrage zur Freigabe bzw.
Merge-Übernahme ist in `/home/ai/games/.dispatch/requests.md` aktualisiert;
aktuelle Fassung des Patches: `~/tmp/m10-boss-death-shards/k2-fxsystem-fix.patch`
(83 Zeilen, applyt auf dem Lane-Branch).

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

**Merge-Hinweis (für den Merge-Job/Lead):** beim Merge dieser Lane in main die
lokale Key-Liste (`BOSS_PARTICLE_FX_BASES`/`isBossParticleFxKey` in
`FxSystem.ts`) durch den Import aus `src/gfx/gen-fx.ts` (`BOSS_FX_BASES`/
`isBossFxKey`, fd66146, in main) ersetzen — ein Ort, eine Wahrheit. Danach
K3-Tests erneut fahren.

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

Belege: `shots/m10-boss-shards-after-640x3601.png`, `-780x3603.png`,
`-after.json` (im K4-Commit). Im 780er-Nachher-Shot sind einzelne Splitter und
der hellere Kern der Explosion unterscheidbar (Vorher: homogener Schlamm-Blob).
art-director-Sichtprüfung (Vision, 2026-11-27): **PASS, Note 4** (Grenze 3).
Geprüft: beide Views Vorher/Nachher, Crops/Zooms 2x/4x nearest in
`~/tmp/m10-boss-death-shards/` (`crop-after-780-2x.png`, `zoom-after-640-core-4x.png` …).

- Vorher Note 2 (nicht abnahmefähig): kein heller Kern erkennbar, Explosion
  „ausgewaschen in den Untergrund" — genau der beanstandete Defekt.
- Nachher Note 4: klarer warmer Kern mit dunklem Ring (fx_boss_core alphaFrom
  0,7–0,95), dunkle Struktur/Silhouette bleibt lesbar, kein Weiß-Blowout,
  klare Abgrenzung Kern ↔ Boss-Masse. Passung zum FX-Vokabular ok, keine
  neuen Artefakte.
- Nachbesser-Vorschlag (nicht blockierend, spätere Karte): fx_death_bone-
  Splitter im Horde-Kontext stärker absetzen (dunkler Rim/Tint bzw. alpha
  0,63→0,75) und fx_fire im 780er-View an den 640er-Wert angleichen
  (0,24–0,45 vs. 0,40–0,45) — vom Fix bewusst nicht angefasst (kein Boss-Key).

## Lane-Urteil / Abschluss

- K1 erledigt + committet (`989d92c`); K2/K3 umgesetzt + Reviewer-PASS, aber
  Commit von `src/systems/FxSystem.ts` durch Claim `m10-fx-mixel-fix` blockiert
  (s. o.); K4-Messung + art-director-PASS fertig, Belege WIP-committet.
- Abnahme-Kern: art-director-Sichtprüfung **PASS Note 4** (Vorher Note 2 =
  Defekt bestätigt); Tests 713/713, `npx tsc --noEmit` rc=0,
  `npm run build` rc=0, 0 jsErrors, Renderer-String in beiden Mess-JSONs
  (RPL-S, kein SwiftShader).
- Ausstehend, sobald die Area frei ist (Reihenfolge): Commit #5919
  (FxSystem.ts-Fix), Commit #5920 (tests/boss-death-shards.test.ts), dann
  K4-Abschlussnote + `.lane-done`.

## Update 2026-11-27 22:56Z — v2-Patch auf Mixel-Stand (wichtig für Merge)

- **Der v1-Patch (`~/tmp/m10-boss-death-shards/k2-fxsystem-fix.patch`) passt
  NICHT mehr** auf `m10-fx-mixel-fix`s `FxSystem.ts`: deren #6099 hat dieselben
  spawn/setAlphaScale-Pfade umgeschrieben (`git apply --check` failt).
- **NEU: `~/tmp/m10-boss-death-shards/k2-fxsystem-fix-v2-on-mixel.patch`**
  (71 Zeilen) basiert AUF dem Mixel-Stand, gilt dort `git apply --check`
  sauber und erledigt den geplanten SYNC-Schritt gleich mit: Boss-Erkennung
  über `isBossFxKey` aus `gen-fx` (eine Wahrheit, keine lokale Kopie) +
  `BOSS_PARTICLE_ALPHA_FLOOR = 0.7`. `fx_boss_core` hat keine Mixel-Bakes,
  daher trifft `isBossFxKey(p.frames[0])` auch nach dem Mixel-Frame-Rewrite zu.
- Verifiziert in einer Scratch-Kopie des Mixel-Worktrees (`~/tmp/m10-boss-death-shards/scratch/`):
  11/11 `tests/boss-death-shards.test.ts` (v2-Variante: Key-Erkennung über
  `isBossFxKey`, Boss-Frame-Keys wie `fx_boss_core_2` sind jetzt korrekt Boss-Keys)
  + 40/40 mixel/overdraw-Regressionstests grün; `tsc` nur Lane-fremde Altfehler
  (scratch-Kopie ohne `scripts/`/`shots/`).
- Test-Variante für die Merge-Welt: `~/tmp/m10-boss-death-shards/tests-boss-death-shards-v2.test.ts.bak`
  (v1-Test bleibt gültig, solange der Worktree auf dem alten Stand bleibt).
- Bitte (b) an den Disponenten: Merge-Karte NACH dem m10-fx-mixel-fix-Merge mit
  v2-Patch + v2-Test. claim-watch (aut_21f39a4f…, alle 15 min bis 02:32Z) prüft
  Claim + Merge-Status und entscheidet zwischen v1- (Claim ohne Mixel-Merge)
  und v2-Weg (Mixel in main).
- Offene Folgepunkte (backlog, nicht blockierend): fx_death_bone-Splitter im
  Horde-Kontext stärker absetzen (dunkler Rim/Tint bzw. alpha 0,63→0,75);
  fx_fire im 780er-View an den 640er-Wert angleichen (0,24–0,45 vs. 0,40–0,45).


## Abschluss 2026-11-27 23:2xZ — Blocker gelöst, Lane abgeschlossen

- **K2 (Fix) + K3 (Test) sind über main geliefert**, nicht über den Lane-Branch:
  Nach Bedarfsmeldung hat der Merge-Job den Boss-Partikel-Fix gemeinsam mit
  m10-perf-cap-rollback gemergt (**Merge `db473c7`**, Merge-Karten #6441/#6442
  auf main-Board, beide done). Die gemergte Form ist die v2-Semantik: Boss-
  Erkennung über `isBossFxKey` aus `src/gfx/gen-fx.ts` (eine Wahrheit, keine
  lokale Key-Kopie), Boden `BOSS_FX_ALPHA_FLOOR = 0.7`, Boss-Partikel NORMAL,
  ohne fxAlpha-/dpr-Dämpfung, ohne Glow-Slot, auch `setAlphaScale` lässt sie
  unangetastet. m10-fx-mixel-fix (#6099) ist NICHT Teil des Merges.
- **Lokale Aufräumung:** der Worktree-Patch auf `FxSystem.ts` (v1-Form mit
  lokaler Key-Liste) und der v1-Test wurden verworfen — die main-Version ist
  kanonisch; ein Doppel-Commit hätte Merge-Konflikte erzeugt.
- **Verifikation auf exakt main-Stand (`342f3e8`**, detached Check-Worktree):
  `npx vitest run tests/boss-death-shards.test.ts` → **11/11 grün**;
  `npx tsc --noEmit` → rc=0; Nachmessung `scripts/m10-boss-shards.mjs
  --tag=after` auf main-Code → **fx_boss_core: blend NORMAL 29/29, glow 0,
  alphaFrom 0,7–0,95 (vorher 0,252–0,684), jsErrors 0**, Renderer
  „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)" — identisch
  zu den committeten Werten. Beleg: `shots/m10-boss-shards-after-maindb473c7.json`.
- **K4:** after-Shots + JSON mit Renderer-String committet (`330852c`);
  art-director-Sichtprüfung **PASS Note 4** (heller Kern sichtbar, dunkle
  Kontur lesbar, nicht ausgewaschen) bleibt gültig — Messwerte auf main
  bytegleich im Aussagewert.
- Offene Folgepunkte (backlog, nicht blockierend, unverändert): fx_death_bone-
  Splitter im Horde-Kontext stärker absetzen; fx_fire im 780er-View an den
  640er-Wert angleichen.
