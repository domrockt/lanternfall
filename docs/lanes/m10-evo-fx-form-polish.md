# Lane m10-evo-fx-form-polish — Querschnitts-Fix alle 6 Evo-Effekte

**Datum:** 2026-11-28 · **Worktree:** `lf-lanes/m10-evo-fx-form-polish` (Branch `m10-evo-fx-form-polish`)
**Anlass:** Dom-Wunsch 2026-11-28T00:00Z + Argus-Sichtungen 01:10Z/02:00Z/03:00Z (Winter-After-Belege,
Claude-Sichtung Ewiger Winter / Gewittersiegel + Zornpendel): EIN konsolidierter Nachlauf-Job statt
Einzelfixes, 3 Dom-Kriterien + Farbidentität je Evo + „Element auf einem Standbild ohne Beschriftung
erkennbar".

## K1 — Vorher-Sichtung aller 6 Evos (Karte #8558)

**Beleg:** `node scripts/m10-evo-fx-form-polish.mjs before` (Playwright, 640-View 1280x720, seed 7,
je Evo Lv 8 + 20 Gegner, Shot im Death-Signatur-Peak). Renderer **ANGLE (Intel, Mesa Intel(R)
Graphics (RPL-S), OpenGL ES 3.2)** je Evo — kein SwiftShader. 0 JS-Fehler.
Shots: `shots/m10-evo-fx-form-polish-before-<evo>-640.png` (6x), Rohdaten
`shots/m10-evo-fx-form-polish-before.json`. Frame-Kontaktblatt der verdächtigen Texturen:
`shots/m10-evo-fx-form-polish-frames-raw.png` (Skript `scripts/m10-evo-fx-form-polish-frames.mjs`).

### Befundtabelle

Kriterien: **K1** Dither nur an Übergangskanten 1–2 px · **K2** Kerne flächig hell ·
**K3** organische Formen · **F** Farbidentität · **E** Element auf Standbild erkennbar.

| Evo | K1 | K2 | K3 | F / E | Befund (belegt) | betroffene Textur/Spawn |
|---|---|---|---|---|---|---|
| phoenix | ❌ | ❌ | ⚠️ | F: Feuer-Rampe ✅ (18–22, 0 Ink) | **Flächendither in den Signaturen**: die 128x128-Signatur-Textur hat systematische 1-px-Löcher (Kontaktblatt + ASCII-Dump des Generators) — forward-rotierte Shard-Gitter (`for k/s … putPixel(Math.round)`) aliasen; Hist. zeigt nur pal18–22, die Löcher sind Alpha-Löcher. | `phoenixSignatureFrame` (hit+death) |
| wrath_pendulum | ✅ | ✅ | ✅ | F: Ring/Signaturen Glut/Rot ✅; **E: Treffer-Funken weiß/neutral + grüne Burst-Wolken an Kill-Punkten** | Treffer-Sparks sind `fx_star` mit Glow-Tint (CombatSystem `strike`/`hitEnemy`); die grünen Dither-Wolken sind der **burst-Tod-Klassen-Cloud** (`fx_death_blob`, 16 Shards @ 2,4x, marshLight, `src/logic/death.ts` — **fremde Datei**, Dispo-Notiz angelegt). | Swing-Hit-Loop `fireFlail`, `killsFx` |
| eternal_winter | ✅ | ⚠️ | ✅ | F/E: **kein Eisblau-Reading** | Signaturen fogBlue-dominant statt weiß (Hit: pal6 374 vs. pal13+12 312); Aura `ring_frost` mist/paleMist-dominant (Hist. pal9:521 pal8:516 vs. pal5:260) → liest sich als Rauch; **keine Reif-Kante** am Aura-Rand; **Gegner nicht als gefroren erkennbar** (freeze nur slow/Timer, kein Overlay); kein Bodenfrost. ring_frost-Tint/Alpha ist winter-w2 (gemergt) — hier nicht angefasst. | `frostRingFrame`, `winterSignatureFrame`, `updateWinter` |
| thorn_storm | ❌ | ❌ | ❌ | F: giftgrün/rotbraun fehlt | **32x32-Signatur @ Draw-Scale 4,1–4,4x (Mixel)** mit **55–68 % Ink-Pixeln** (Hit 137/250, Death 188/354–258/470): schwarzes Block-Mosaik, im Shot als grobes grau-grün-amber Mosaik sichtbar. Generischer `signatureFrame("splitter")`-Pfad mit `outlineAndRim`. | `EVOLUTION_SIGNATURES.thorn_storm`, generic `signatureFrame` |
| thunder_seal | ⚠️ | ❌ | ⚠️ | F: Gelb-Weiß ✅ in BOLT_RAMP; **E: Siegel-Ankündigung unsichtbar** | **32x32-Signatur @ 3,2–4,6x mit ~60 % Ink** (Hit 135/208, Death 213/428) → schwarzer Block mit weißem Zickzack. Boden-Siegel existiert (`THUNDER_FX.anticipation`, Sprite alpha 0,45→1), aber **Ring/Zacken der Anticipation-Frames sind nightSlate(4)** — auf Nachtboden unsichtbar; nur der Impact-Frame (2) nutzt lantern/glow. | generic `signatureFrame("beam")`, `thunderSealFrame` Stage 0/1/3 |
| soul_beacon | ✅ | ✅ | ✅ | F: blasses Grün-Weiß ✅ (orb_soul 13/11 + mossDark-Kontur, Signaturen 13-dominant) | **kein Fix nötig** — Vorher-Shot: Seelen als blasse grün-weiße Flammen mit kaltem Halo lesbar. Wird nicht angeändert (nur Nachher-Beleg). | — |

Paletten-Hinweis: die „OUTSIDE"-Einträge im Probe-JSON für `#3d5a38/#6f9b58/#22382a/#16261e` sind
pal30/31/29/28 — das Probe-Skript übernahm die falschen Hex-Werte der letzten 4 Indizes aus dem
Winter-Skript (dokumentiert, korrigiert in der Auswertung; kein Spieleffekt).

## K2 — Fixes (ein Commit je Evo)

- **#8560 / thunder_seal:** `thunderSealFrame` Stage 0/1/3: Siegel-Ring lantern(21) statt nightSlate(4)
  (Ankündigung sichtbar, Impact bleibt glow(22)); baked Signaturen (96x96, Draw-Scale 1) mit
  lanternWhite/candleWhite-Kern + glow/lantern-Kante statt Ink-Block.
- **K2a phoenix:** `phoenixSignatureFrame` auf inverses Mapping (Distance-Field) umgestellt —
  flächige Füllung ohne Alias-Löcher (K1+K2), Feuer-Rampe unverändert.
- **K2a eternal_winter:** `frostRingFrame` Eisblau-Identität (fogBlue/blueGrey-Band breiter, Reif-Kante
  am Rand) + Signaturen weißer Kern; `updateWinter`: Eiskristall-Overlay an gefrorenen Gegnern +
  Bodenfrost-Partikel.
- **K2b thorn_storm:** baked Signatur 96x96 (Draw-Scale 1): organische Dornen-Tendrils, Kern flächig
  hell marshLight(31) → marsh(30) → rotbraun(24), Kontur mossDark(29)/bloodNight(23) statt Ink-Flut.
- **K2b wrath_pendulum:** Treffer-Funken in Pendel-Farbe (hotRed/crimson), Burst-Tod-Wolken bei
  Wrath-Kills gedämpft (kleiner, weniger Shards) — Death-Spec selbst bleibt in logic/death.ts (fremd).
- soul_beacon: kein Commit (unverändert, Beleg reicht).

## Status

- [x] K1 Befundtabelle + Vorher-Belege (#8558, Commit 5a01965)
- [x] K2a/K2b Fixes (#8560, #8559) — siehe unten
- [ ] K3 art-director-Abnahme ≥ 4/5 je geändertem Evo (#8561)
- [ ] K4 Tests/FPS/Doku/lane-done (#8562)

## K2 — Umsetzung (Commits, in Reihenfolge)

| Evo | Kriterien-Fix | Commits |
|---|---|---|
| thunder_seal | E: Siegel-Ring/Zacken der Anticipation+Dauer lantern(21) statt nightSlate(4) → Ankündigung sichtbar; K1–K3: Signatur 96x96 gebacken, 0 Ink, Gelb-Weiß-Kern | 84f577c (Shot/JSON; Code über c1e9be9) |
| thorn_storm | K1–K3+F: Signatur 96x96 gebacken (inverses Mapping, organische Ranken, Kern flächig 31, Widerhaken 24, Kontur 29 statt Ink-Flut); fx_thorn + projectile_thorn giftgrün/rotbraun statt Glutrampe | b078632 (Shot) + e5e1e59/9eeee03 (Code) |
| wrath_pendulum | F/E: Treffer-Funken hotRed(26)/crimson(25); Burst-Tod-Wolken bei Zorn-Kills x0.55/Spread x0.7 (klein statt schlammig) | c90ffa6 |
| phoenix | K1/K2: phoenixSignatureFrame invers gemappt — Alias-Löcher (Flächendither) weg, Kern flächig, Feuer-Rampe unverändert | c1e9be9 |
| eternal_winter | F/E: frostRingFrame fogBlue-Bänder innen+außen + Reif-Kante (24 Kristalle 12/13); Signatur weiß-dominant; updateWinter: Eiskristall-Overlay an gefrorenen Gegnern + Bodenfrost; blauer Freeze-Tint existiert in Run.ts (fremd, unangetastet); w2-Tint/Alpha-Invariante unberührt | e5e1e59 + 6a013b8 |
| soul_beacon | unverändert (K1-Befund: i.O.); after-Shot als Beleg | (Shot-Commit) |

**Historie-Hinweis (ehrlich):** Durch einen `git stash`/`git stash pop`-Zyklus bei der
Zwischenvalidierung wurden Staging-Areas geleert und Inhalte/Messages verschoben:
thunder/thorn-Code landete über den Phönix-Commit c1e9be9 bzw. die Nachträge
e5e1e59/9eeee03 in HEAD; e5e1e59 trägt eine thorn-Message, enthält aber die
Winter-Code-Änderungen. Der ENDSTAND in HEAD ist vollständig und wird von den
Commits 9eeee03/6a013b8 abgedeckt; alle Commits nennen genau eine Karte (#8560/#8559).

**Guard-Tests:** tests/evo-fx-form-polish.test.ts (7 Tests): Loch-Guard (keine
voll umschlossenen transparenten Pixel = kein Flächendither) für phoenix/thorn/
thunder-Signaturen, Farbidentität (Ink=0, Kern-Dominanz), Siegel-Ankündigung
(frame 0/3 enthält lantern-Ring). FX-Guard-Fixture neu generiert: ring_frost
Dither-Band 3→6 px = beabsichtigte Reif-Kante (Commit 5580c28/9eeee03).

## K4 — Messwerte

- `npm test`: **1401/1401 grün** (132 Dateien), `npx tsc --noEmit` rc=0, `npm run build` grün.
- **FPS Vorher/Nachher im selben flock-Lauf** (Burst 500 Gegner + Minute 25 mit 300 Gegnern
  + 6 Evolutionen; Vorher = Lane-Start-Commit 5a01965, Nachher = HEAD, beide Builds
  back-to-back unter `/home/ai/games/.lf-perf.lock`):
  - Burst: 60,0 → 59,8 FPS (worstFrame 16,8 ms → 16,8 ms, je 500 Gegner)
  - Minute 25: 60,2 → 60,4 FPS
  - 0 JS-Fehler in beiden Läufen. **Kein Regression**, JSON: `shots/perf-m3-evo-before.json`
    und `shots/perf-m3-evo-after.json`. Kein absolutes Tor (Anforderung K4).

## Dispo / Fremd-Dateien

- `src/logic/death.ts` (burst-Tod-Wolke, marshLight) ist fremd — Dispo-Notiz in
  `.dispatch/requests.md` (05:3xZ): globale Verkleinerung bitte als Folgekarte beim
  Owner vergeben; diese Lane dämpft nur Zorn-Kills (CombatSystem, eigenes Area).
- `src/scenes/Run.ts` (blaue Freeze-Tönung, freeze → paleMist) nicht angefasst.
- `m10-chaos-fix-raster-glow` hat gen-fx.ts NICHT geclaimt (claims.json geprüft
  bei Lane-Start) — keine Meldung an Dora nötig.
