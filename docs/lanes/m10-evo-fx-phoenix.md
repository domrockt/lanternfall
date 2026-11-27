# Lane m10-evo-fx-phoenix — Phönixschwarm-FX neu (Vorlage für Evolutions-Effekte)

Dom-Wunsch 21:45Z, Punkt 1. Erster von 5 Evo-Effekt-Jobs (Reihenfolge: Phönixschwarm →
Ewiger Winter → Seelenleuchtfeuer → Zornpendel → Gewittersiegel). **Diese Datei ist die
Vorlage für die 4 Folge-Jobs** — gleicher Karten-Schnitt, gleiche Mess-Skript-Basis,
gleiche Abnahmekriterien.

## Regelwerk „Eine Pixelgröße für alles"

1. **Textur in Zielgröße backen, mit Draw-Scale 1 zeichnen** — nie > 1x hochskalieren
   (auch nicht die Signaturen: Zielgröße statt kleiner Textur × Scale).
2. **Klare Farbe je Element**: Feuer = Treppe Glow(22)/Lantern(21)/LanternWhite(13) →
   Amber(20)/FlameBright(19) → Flame(18)/EmberOrange(17) → EmberBrown(16)/EmberDark(15)/
   EmberShadow(14). **Kein Ink(0)/Grau** an Effekt-Texturen — Konturen nur als warme
   Dunkelstufe.
3. **Aufbau ≤ 0,3 s (Anticipation) → klarer Impact → kurzer Ausklang** als eigene
   Texturen/Phasen, nicht als skalierter Alleskleber.
4. **Lesbarkeit vor Menge**: wenige, große, klar gestufte Formen; Anim über 2–3 Frames.

## Ist-Zustand (Vorher, Commit 97eec10)

Skript: `node scripts/m10-evo-fx-phoenix.mjs before` (Playwright, `?debug=1&seed=7`,
`addWeapon("phoenix", 8)` + 20 Gegner; 640x360@2x und 960x540@1.5x). Belege:
`shots/m10-evo-fx-phoenix-before.json` (+ PNGs `-before-640/-before-960/-swarm`),
Renderer **ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)**, 0 JS-Fehler.

Mängel (Mixel + Farbfehler):
| Effekt | Vorher | Problem |
|---|---|---|
| `projectile_phoenix` | 13x9, **19/51 Ink-Pixel** | schwarz umrandete Raute, harte 0/1-Farben |
| `fx_evo_death_phoenix` | 32x32 @ **Draw-Scale 4.03x** | fette orange Rauten, Mixel-Blöcke |
| Burn (`fx_fire` 14x14) | @ **2.38x** | Matsch-Pixel |
| `fx_halo` | @ **2.47x** | Mixel |
| `fx_shock` | @ **1.29x** | Mixel |

## Fix (Commit 61083b0)

**gen-fx.ts** — neue reine Frame-Generatoren (Port-Paar: `scripts/tmp`-Preview war
Werkzeug, nicht Deliverable):
- `phoenixBirdFrame(flap)` — Vogel 15x11, 3 Flatter-Frames (Flügelraute + Rumpfträne +
  Schwanzflammen), Kern Glow→Lantern, Bauchkante EmberBrown statt Ink. Keys
  `projectile_phoenix(_2|_3)` (Alt-Eintrag aus `SPRITE_GRIDS` in textures.ts entfernt).
- `phoenixLaunchFrame(stage)` — Anticipation 14x14, 3 Frames, `launchLife: 0.28 s` (≤ 0,3 s).
- `phoenixBoomFrame(stage)` — Impact 64x64 (≈ Explode-Radius 34), 4 Frames: Feuerkranz
  mit gezackter Außenstufe (17 statt Ink), Zungen, späte Glutflecken. Draw-Scale 1.
- `phoenixBurnFrame(stage)` — Ausklang 64x64, 3 Frames, dunkle Glut (15/16/17/18) mit
  Körnern, flackert im `updateBurns`-Takt.
- `phoenixSignatureFrame(kind, stage)` — Treffer-/Todes-Signatur in **Zielgröße 128x128**
  (fette Flammen-Scherben, Taper, zentraler Glutkern, kein `outlineAndRim`).
  Mechanismus: `EvoSignature.drawScale?: [from, to]` — gesetzt → 128er-Textur + Scale 1,
  nicht gesetzt → Alt-Verhalten (32x32 @ 3,2–4,6). **Folge-Evo-Jobs ziehen hier nach.**

**data/evolution-weapons.ts** — `PHOENIX_FX`: alle FX-Parameter (Frame-Keys, Takte,
Lifetimes, Texturen) an einem Ort. **FxSystem.ts** — `spawnEvolution` liest `drawScale`.
**CombatSystem.ts** — Launch/Boom/Burn nutzen die neuen Texturen mit Scale 1; Vogel
flattert synchron (3 Frames, Takt 0,09 s, `applyTexture` am Sprite).

## Nachher (Commit mit `-after`-Belegen)

`shots/m10-evo-fx-phoenix-after.json` (gleicher Renderer, 0 JS-Fehler):
| Effekt | Nachher | Kriterium |
|---|---|---|
| `projectile_phoenix` | 15x11, **0 Ink-Pixel**, Histogramm nur Pal 13/16/17/18/19/20/21/22 | Farbtreppe ✓ |
| `fx_evo_death_phoenix` | **128x128, Draw-Scale 1** | Mixel-Regel ✓ |
| Boom/Burn/Launch | 64x64/64x64/14x14, **alle live Scales ≤ 1** (max 0.93) | Mixel-Regel ✓ |
| Phasen | Launch 0,28 s → Boom 0,4 s (4 Frames) → Burn 3,2 s Ausblend-Fade | Aufbau/Impact/Ausklang ✓ |

Tests: `tests/evo-fx-phoenix.test.ts` (8 Guards: Zielgrößen, Draw-Scale-1-Guard am
Quelltext, Farb-Treppe ohne Ink/Grau/Fremdfarben, Flatter-Frames verschieden,
Launch ≤ 0,3 s). Suite 842/842 grün, `npx tsc --noEmit` rc=0, `npm run build` rc=0.
Sichtprüfung: art-director-Urteil unten; 0 JS-Fehler im Probe-Lauf.

## Vorlage für die 4 Folge-Evo-Jobs (Checkliste)

1. **Karte 1 — Ist-Beleg**: `scripts/m10-evo-fx-phoenix.mjs` kopieren → `<slug>.mjs`;
   Waffen-ID + wait-Keys (Impact-Textur) austauschen; `before`-Lauf EINMAL, JSON+PNGs
   committen. JSON muss den WebGL-Renderer-String tragen (SwiftShader = ungültig).
2. **Karte 2 — Fix**: eigene `element*Frame`-Generatoren in gen-fx.ts (Zielgröße!),
   Element-Treppe statt Feuer-Treppe, `drawScale: [1, 1]` am Signatur-Eintrag,
   Parameter-Block im data-File, Registrierung in `createFxTextures` + `FX_FRAME_COUNTS`.
3. **Karte 3 — Tests**: `tests/<slug>.test.ts` nach `tests/evo-fx-phoenix.test.ts`
   (Zielgrößen, Scale-1-Guard, Farbtreppe ohne Ink/Grau).
4. **Karte 4 — Nachher + Abnahme**: `after`-Lauf, art-director-Vision PASS, diese
   Doku-Struktur kopieren.
5. Fertig erst, wenn GESEHEN: Screenshots während der Wirkung mit lebenden Gegnern.

## Offene Punkte

- Vogel-Lesbarkeit bei 1x im schnellen Flug: 3 synchrone Frames lesen sich als Flattern;
  falls art-director mehr will → asynchroner Schlag pro Vogel (Projektil-Zustand nötig,
  ProjectilePool ist fremd) oder 4. Frame.
- `fx_fire`-Burst (6 Partikel, shrink ≤ 0.93) im `explode()` ist generisch und bleibt;
  die generische Mixel-Bake-Lane (m10-fx-mixel-fix, Branch noch nicht gemergt) deckt
  FxSystem-Scales ab — meine Lane hat nur die phoenix-spezifischen Direkt-Pfade (Burn,
  `makeImage`) und Signaturen gefixt, Merge-Konflikte in FxSystem.spawnEvolution sind
  möglich (drawScale-Zeilen).
- Fremd-Datei-Berührung: `tests/evo-signature-calls.test.ts` 1 Assertion (Alt-Scale 3.2 →
  `sig.drawScale?.[0] ?? 3.2`), unumgänglich da Phönix-Scale bewusst geändert.
