# Lane m10-fx-alloc-trim (M10, 2026-11-28)

Ziel: letzten belegten CPU-Rest im Frame-Pfad fixen — Per-Frame-Allokationen /
Phaser-Setter-Churn im FX-Draw-Pfad (`src/systems/FxSystem.ts`). Zwei Quellen
benennen den Befund: m10-run-cpu-budget (Dora-Backlog 12:4xZ, „Phaser-Setter/FX
liegt hinter FxSystem.ts“) und v10-Geräteabnahme K3 Hebel B
(`docs/qa/v10-device-acceptance-2026-11-28.md`: worstFrame 33–34 ms wiederkehrend
durch Allokationen/Uploads im Frame; der Upload-Teil läuft als fremde Lane
m10-ground-chunk-budget und wurde NICHT angefasst).

Karten: #12640 (K1 Mess-Skript/Baseline), #12641 (K2 Fix), #12642 (K3 Nachher +
Test + Doku), #12643 (K4 Abschluss). Belege: `~/games/.evidence/m10-fx-alloc-trim/`.

## K1 — Mess-Skript + Baseline (#12640, Commit e4f55b14)

`scripts/m10-fx-alloc.mjs`: Chaos-Lauf wie m10-run-cpu (Seed 1, skipTo(1500),
6 Evolutionen + 6 Passives St. 5, 500-Gegner-Top-up, god/autoplay), 30-s-Fenster,
rAF-CPU-ms je Frame + CDP Sampling-Heap-Profiler (Intervall 512) + FX-Attribution
über die Zeilen-Spanne `var FxSystem = class …` im unminifizierten Run-Chunk.
Läuft ohne flock (kein FPS-Kriterium). Vorher-Beleg:
`m10-fx-alloc-before.json` (3 Läufe):

| Lauf | p95 | max | Spikes >16 ms | Alloc B/Frame | Ø Gegner |
|---|---|---|---|---|---|
| before-1 | 5.2 | 16.5 | 1 | 2 757 | 181 |
| before-2 | 9.2 | 23.3 | 25 | 2 060 | — |
| before-3 (offiziell) | 10.6 | 25.3 | 21 | 2 378 | 66 |

Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`.

### Attribution (Vorher, Sampling 512)

- **75–80 % des gesampelten Alloc-Volumens = Harness-Rauschen**:
  `queueEnemyWave @ Run-*.js` (Spawn-Top-up alle 50 ms, 1 035–1 866 B/Frame) —
  dasselbe Artefakt, das bereits m10-run-cpu-budget („Spawn-Top-up des Harness,
  teils Messartefakt“) und v10 K3 Hebel B („300 bog_rat im 50-ms-Takt“) benennen.
- Phaser-interne Setter-/Batch-Sites (`set`, `setValue`, `setAlpha`, `batchQuad`,
  `clearTint`/`setTint`): ~243 B/Frame — CPU-seitig dem Setter-Churn zuzuordnen,
  getriggert aus allen Sprite-Systemen (Gegner/Gems/FX).
- **FxSystem-Eigenanteil: unter Sampling-Sichtbarkeit (<1 %, fxAttribution 0 %)**
  in JEDEM Vorher-Lauf — auch mit Intervall 512. Die FX-Spreads/Frame-Arrays sind
  klein und kurzlebig; der p95-Rest „Phaser-Setter/FX“ ist (wie in
  m10-run-cpu-budget K2) eine CPU-Attribution, keine Alloc-Menge.

## K2 — Fix (#12641, Commits 178e0086 WIP + Review-Fix)

Umsetzung in `src/systems/FxSystem.ts` (einzige geänderte Quelldatei), als eine
Einheit VOR dem Supervisor-Steer 14:35Z umgesetzt — kein nachträglicher Loop:

1. **Setter-Gates (Draw-Pfad, bitgleich):** `FxRuntime` erhält `cx/cy/csx/csy/ca/cr`
   (zuletzt gezeichnete Werte). `update()` ruft `setPosition`/`setScale`/
   `setAlpha`/`setRotation` nur noch bei geänderter Wert; identischer Wert erzeugt
   identischen Sprite-Zustand (kein Dirty-Churn). Größter Einzelnutzen: `setRotation`
   entfällt komplett für spinlose FX (Signaturen, Decals, Halos) und die Spawn-Pfade
   setzen die Caches mit.
2. **Scratch-Options statt Spreads:** `burst/shards/beam/bolt/decal/spawnAnim/
   spawnEvolution` füllen wiederverwendete Options-Objekte (`resetOpts`/`
   copyOptsInto`; bolt hat eigenes `boltOpts`, da `spawnAnim` intern `scratchOpts`
   nutzt) — vorher je Aufruf ein Objekt-Literal-Spread, im Chaos mehrere hundert/s.
3. **Geteilte Frame-Arrays:** `cachedFrames(base,count)` + `mixelFramesFor` mit
   Identitäts-Schutz — fremde `opts.frames`-Arrays verhalten sich bitgleich
   (frisches `map()`), nur systemeigene Arrays werden geteilt. Kein `[texture]`-
   Array mehr je Spawn.
4. **spawnEvolution ohne String-Keys:** Cooldown-Slots numerisch (`sigSlotFor`,
   `signatureLast: Map<number, number>` statt `${evolution}:${kind}` je Aufruf).

Review (`reviewer`, PASS, 2393 Tests grün): Setzer-Gates bitgleich (Reuse setzt
alle 6 Caches neu, NaN-Verhalten wie vorher), Scratch-Objekte synchron ohne
Retention, Cache-Key-Bildung kollisionsfrei, kein Regelverstoß. Reviewer-Sollte 1
umgesetzt: `setAlphaScale` (Fx + Particle) führt `ca` nach (einziger Pfad, der die
Gate-Invariante hätte desynchronisieren können).

Guards: `tests/fx-alloc-trim.test.ts` 12/12 (Setter-Gates, Stale-Reuse, Scratch-
Stale-Fälle, Identitäts-Fallback, ca-Invariante, bolt-Isolation, Evolution-Cooldown);
FX-/Palette-/A7-Suiten grün: fx-mixel, fx-add-cap, tablet-fx-budget, boss-death-shards,
boss-fx-contrast, fx-overdraw, fx-evolution, death-fx, evo-fx-* (6), vfx-restore*,
weapon-shot-readability, shot-clarity.

## K3 — Auswertung (verbindlich, ohne weitere Edit-Iterationen)

Nachher-Lauf mit identischem Protokoll (`m10-fx-alloc-after.json`):

| Lauf | p95 | max | Spikes >16 ms | Alloc B/Frame | Ø Gegner | Harness-Anteil |
|---|---|---|---|---|---|---|
| after-1 | 12.3 | 25.2 | 33 | 1 632 (−31 %) | 283 | 1 035 B/Frame |

**Befund: das Container-Protokoll kann den Hebel nicht trennscharf belegen.**

1. **Load-Confounds:** Ø Gegner im Fenster streut 66→181→283 über Läufe (Spawn-
   Top-up × Spawn-Burst-Budget × Kill-Rate); p95 streut 5.2→12.3 ms bei
   Parallel-Lanes auf 20 Kernen — dasselbe Muster wie m10-run-cpu-budget
   („Host-Rauschen übersteigt das Ziel-Signal“). Vorher/Nachher-Deltas im
   rAF-CPU-Pfad sind auf diesem Host nicht belastbar.
2. **Der Metrik-Term „Frame-Allokationen“ ist zu 75–80 % Harness-Artefakt.** Eine
   ≥50 %-Reduktion der GESAMT-Frame-Allokationen ist über den FX-Pfad prinzipiell
   nicht erreichbar — der FX-Eigenanteil liegt (vor und nach dem Fix) unter der
   Sampling-Sichtbarkeit. Gemessen: gesamt −31 % (2378→1632 B/Frame), davon
   überwiegend geringerer Harness-Anteil (weniger Gegner im Fenster).
3. **Der eigentliche Hebel des Befunds ist Setter-Churn (CPU), nicht Alloc-Masse.**
   Dessen Wirkung ist deterministisch nur über Setter-Aufrufzählung zeigbar
   (tests/fx-alloc-trim.test.ts): pro aktivem FX/Frame sinken die Setter-Aufrufe
   von 4 (pos+scale+alpha+rot) auf 1–3 (Rotation entfällt bei spin=0, Scale nach
   Einschwingen, Position bei Stillstand), plus ~2–3 Objekt-Allokationen weniger
   je Spawn (Spread, `[texture]`, Mixel-Map, Cooldown-String).
4. **Keine weitere Allokationsquelle im FX-Draw-Pfad messbar:** nach K2 enthält
   das Sampling keine Site hinter FxSystem (vorher schon <1 %). Die größte
   verbleibende spielseitige Alloc-Quelle im Frame ist Phaser-Engine-Interna
   (Setter/Batch, ~243–357 B/Frame, alle Sprite-Systeme) — engine-seitig, kein
   FxSystem-Hebel; danach AudioSystem `onended` (fremd, m10-run-cpu-budget).

### Android-Proxy A/B (Echtzeit, CPU-Drosselung ×4)

`android-proxy-before.json` / `android-proxy-after.json` (flock, 30 s M25-Echtzeit,
Target 300) — Zahlen nach Messende ergänzt (siehe unten), Renderer-String im JSON.

## Status

- #12640 K1: erledigt (Skript + Baseline, e4f55b14).
- #12641 K2: **blocked gemäß Supervisor-Abbruchkriterium** — der Code-Hebel ist
  umgesetzt, 12/12 Guard-Tests grün, Reviewer-PASS; die geforderte ≥50 %-
  Frame-Alloc-Reduktion ist im Container-Protokoll aber nicht messbar (Harness-
  Dominanz + Load-Confounds, siehe K3-Punkt 1–3). Entscheidung über Übernahme
  liegt beim Lead/Disponent; der Commit ist sauber (tsc, Suite, Guards grün).
- #12642 K3: Doku + Test erledigt; Nachmessung im Container als nicht trennscharf
  dokumentiert, Proxy-A/B als bestes verfügbares Instrument beigefügt.
- #12643 K4: offen bis Lead-Entscheidung.

## Nachtrag (Supervisor-Steer 15:00Z)

- **Fremde Karte #12013 (Merge-Fix m10-loading-screen) geschlossen:** der Fix-
  Commit `5a3e91de` („boot-light-textures-Guard an neuen Boot-Import repointet“)
  ist im Branch bereits enthalten (`git merge-base --is-ancestor 5a3e91de HEAD`
  → rc 0) und die Guard-Tests laufen in diesem Worktree grün
  (`npx vitest run tests/boot-light-textures.test.ts tests/boot-light-textures-w2.test.ts`
  → 12/12). Karte war verwaist (Fix gemerged, Karte blieb offen) und wurde auf
  ausdrückliche Supervisor-Weisung auf `done` gesetzt — Abweichung von der
  „nur eigene Karten“-Regel ist im Board vermerkt.
- Android-Proxy-A/B: Läufe unter flock gestartet (before detached auf e4f55b14,
  after auf Lane-HEAD); Belegpfade
  `~/games/.evidence/m10-fx-alloc-trim/android-proxy-{before,after}.json`.
  Zahlen werden nach Abschluss ergänzt; die Container-Protokoll-Bewertung
  (K3-Punkt 1–4) ist davon unabhängig und verbindlich.
