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

- [x] K1 Befundtabelle + Vorher-Belege (#8558)
- [ ] K2a/K2b Fixes (#8560, #8559)
- [ ] K3 art-director-Abnahme ≥ 4/5 je geändertem Evo (#8561)
- [ ] K4 Tests/FPS/Doku/lane-done (#8562)
