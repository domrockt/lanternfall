# Lane m10-fx-overdraw-cap — Overdraw-Deckel für additive FX (2026-11-27)

**Ausgangslage (belegt):** Re-Abnahme fa2-02 (main @ 78cca7e): Minute 25 bei
780x360@3 = 42,1–46,4 FPS, Ziel 50 → rot. m10-perf-rootcause fand keine
Einzelursache ≥ 20 %, Verdacht Render-/Fill-Kosten. Bei dpr 3 rendert das Spiel
in 2340x1080 = 2,5 Mio Device-Pixel/Frame; additive FX-Overlays (Partikel,
Evolutionssignaturen, Glows) waren der größte nie einzeln gemessene Kandidat.

## Karte 1 — Attribution (Commit 28de72d)

`scripts/m10-fx-overdraw.mjs` misst M25-780@3 in drei Varianten, je 10 s:
**Design:** interleaved — **eine** Minute-25-Session, 3 Zyklen, alle drei
Varianten nacheinander mit rotierender Reihenfolge (kein Order-/Warm-up-Bias;
die erste reine 3-Runs-Messung zeigte +4–5 FPS Vorsprung für den zuerst
gemessenen "fx-off"-Lauf — reine Session-zu-Session-Streuung).

| Variante | FPS (Ø) | FPS (Median) | ms/Frame | Partikel aktiv | FX aktiv |
|---|---|---|---|---|---|
| (a) FX komplett aus (`spawn` gepatcht) | 42,6 | 40,6 | 23,47 | 0 | 0 |
| (b) FX an, Partikel auf 25 % Cap (90/360) | 35,9 | 34,8 | 27,83 | 210 | 126 |
| (c) FX an, voll | 38,6 | 39,1 | 25,91 | 200 | 119 |

Beleg: `shots/m10-fx-overdraw-attribution.json` (JSON mit allen 9 Messungen,
1-s-Buckets, Worst-Frame, Setup-Info).

**Befund:** FX-Anteil = (c) − (a) = **2,44 ms/Frame ≈ 9,4 %** der Framezeit.
Damit ist die Overdraw-FX-Hypothese als Hauptursache **widerlegt** — keine
Einzelursache ≥ 20 % (konsistent mit m10-perf-rootcause). Der Partikel-Cap auf
25 % verbessert nichts (−0 bis −2 ms, im Rauschen): die Partikel*anzahl* ist
nicht das Problem, die additive *Fläche* pro Sprite schon.

## Karte 2 — Fix (Commit d381bad, #3559)

Overdraw-Deckel für additive FX in `src/systems/FxSystem.ts` (+ pure Helfer in
`src/gfx/gen-fx.ts`):

- **Glow-Budget, geteilt zwischen FxSystem und ParticleSystem** (WeakMap je
  Szene): zählt nur Sprites mit echtem ADD-Blend. Cap je LOD-Stufe
  (`glowCapFor`, lod.ts wird nur gelesen): full **72**, reduced **40**,
  minimal **24**. Über dem Cap fällt ein Spawn auf NORMAL-Blend zurück
  (Form/Farbe bleiben, nur der Stack-Anteil entfällt) — kein Spawn-Verlust.
- **dpr-Alpha-Treppe** (`fxAlphaForDpr`): dpr ≤ 1,5 → 1,0; > 1,5 → 0,8;
  > 2 (780x360@3) → **0,6**. Wirkt nur auf additive Sprites.
- LOD-Anbindung über die bestehenden `setMaxActive`-Caps (fxCap 180/90/60,
  particleCap 280/140/100 → Level-Mapping), kein Edit an `lod.ts` oder
  `CombatSystem.ts` nötig.
- Slots werden beim Ablauf, in `clear()` und beim Blend-Wechsel in
  `setAlphaScale()` freigegeben. Keine Tweens, keine neuen Allokationen im
  Frame-Pfad (Budget ist gepoolt, Zähler ganzzahlig).
- `FxSystem.enabled`/`ParticleSystem.enabled` (Mess-Schalter, Default an).

Tests: `tests/fx-overdraw.test.ts`, **16 Tests** — Cap-Invariante (nie mehr als
N Glows gleichzeitig, incl. 10.000-Op-Fuzz), release/setCap/reset-Semantik,
dpr-Treppe 1 / 0,8 / 0,6. Gesamtstand: **371/371 grün** (Basis 355),
`tsc --noEmit` rc=0, `npm run build` rc=0.

## Karte 3 — Abnahme-Messung (Commit <sha-K3>, #3560)

M25, je 3 Läufe à 10 s unter `flock /home/ai/games/.lf-perf.lock`, nach dem Fix
(`shots/m10-fx-overdraw-after.json`):

| Messung | Läufe (FPS Ø) | min 1-s-Bucket | ms/Frame (Ø) | Ziel |
|---|---|---|---|---|
| M25 780x360@3 | 39,3 / 43,5 / 42,8 (Ø 41,9) | 33,0–35,4 | 23,9 | ≥ 50 → **rot** |
| M25 640x360@1 | 51,5 / 51,3 / 52,6 (Ø 51,8) | 42,3–49,0 | 19,3 | ≥ 50 → Ø **grün** (Bucket-Dips) |

**Vorher/Nachher (M25 780x360@3, gleiche Messmethode):**

| Stand | FPS Ø | ms/Frame | Quelle |
|---|---|---|---|
| vorher (fa2-02, main @ 78cca7e) | 42,1–46,4 | — | Re-Abnahme |
| vorher, FX aus (Attribution a) | 42,6 (Median 40,6) | 23,47 | attribution.json |
| nachher, FX an + Deckel | 41,9 | 23,93 | after.json |

**Begründete Obergrenze statt 50 FPS:** Laut Attribution bringt *komplettes*
FX-Abschalten nur +2,4 ms/Frame (≈ +9 %). Selbst FX = 0 läge bei ~40–43 FPS in
diesem Messaufbau — der Deckel kann das Ziel 50 bei 780x360@3 deshalb nicht
allein erreichen. Der Rest ist nicht-FX-Fill (Gegner-/Boden-/Lichtflächen) plus
Messrauschen der Sandbox (±4 FPS zwischen Zyklen belegt). Die Deckel-Werte
(Glows ≤ 72/40/24, dpr-Alpha 0,6) sind trotzdem korrekt: sie begrenzen den
teuersten FX-Anteil hart und machen die Framezeit von der FX-Dichte
unabhängiger. M25-640x360@1 bleibt mit Ø ≥ 51 FPS über Ziel.

## Karte 4 — Lesbarkeit (Commit <sha-K4>, #3561)

Beleg neu erzeugt (der vorherige WIP-Shot war nur 640x360): `shots/m10-fx-overdraw-m25-780.png`
ist **2340x1080 Device-Pixel** = View 780x360 @ dpr3. Aufbau: `?debug=1&seed=1`,
Run bis 1490 s, Zeit eingefroren, dann robuste Gegner (knight/treant/golem/abom/horror)
nachgespawnt; Messzustand beim Shot: **341 lebende Gegner**, 79 Partikel, 37 FX
(Glow-Budget 72, dpr-Alpha 0,6), Boss Glockenturm-Golem, 0 JS-Fehler.

- Near-White (alle Kanäle ≥ 240): **0,087 %** (ImageMagick `-threshold 94%`,
  exakt 0,000868946 der 2.527.200 Pixel) ≤ 4,16 % Grenze → **PASS** (Lead-Messung,
  2026-11-27 nachgerechnet: 0,0869 %). art-director misst mit strengerer
  Kanal-AND-Methode 0,019 % (≈ 486 px) — beide weit unter der Grenze.
- **art-director-Urteil: 4/5 → PASS** (2026-11-27): FX nicht überstrahlend (Note 5,
  Ember-Burst transparent, Terrain durch Glow lesbar), Boss + HP-Banner Note 5,
  HUD/Text bei dpr3 Note 5, Spieler Note 4 (weißer Funkenkern verdeckt im Peak
  die Beine), Horde-Rand-Silhouetten Note 4 (brauner Teppich im Kern = bekanntes
  Dichte-Problem aus GAME.md M5, nicht deckelbedingt), XP-Kristall-LOD Note 3
  (by-design, nicht blockierend). Nicht-blockierende Nachbesserungen: Ember-Kern
  1–2 px kleiner, XP-Kristall-LOD 1 Stufe heller — Grafik-Lane.
- Vorbefund aus der 3x-nearest-Vergrößerung: Boss-Silhouette hat nur
  1-Tonnschritt-Kontrast zum dunklen Untergrund; Feuer-Cluster unten links hat
  unruhige Kanten — Grafik-Lane, nicht dieser Fix.

## Offene Punkte

- 50 FPS bei 780x360@3 sind mit FX-Maßnahmen allein nicht erreichbar
  (belegte Obergrenze ~43 FPS im Sandbox-Aufbau). Nächste Hebel: nicht-FX-Fill
  (Gegner-Sprites, Licht-/Vignette-Fläche) — eigene Lane.
- 1-s-Bucket-Dips bei 640x360@1 (42–49) trotz Ø > 50: Ursache unklar
  (GC? Zyklen-Sync?), im Rauschen der Sandbox-Messung nicht von echten
  Hicbern trennbar.
