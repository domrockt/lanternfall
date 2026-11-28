# Lane m10-warmup-chunk-fine

Offener Nice-to-have aus den Merge-Hinweisen der Lane m10-loading-screen
(`requests.md` 11:5xZ): `src/gfx/warmup.ts` nutzt für den `derived-atlas`-Chunk
den groben Sammelaufruf `createAllTextures`, weil `textures.ts` die Creator
nicht exportiert. Mit Exporten wird der Warmup feiner gechunkt — Kaltstart/
First-Paint ist ein v1.0-Gerätetor (Dom 10:00Z).

**Umfang:** `src/gfx/textures.ts` (nur Export-Zeilen + Kommentare), `src/gfx/warmup.ts`,
`tests/warmup-chunks.test.ts`, `scripts/m10-warmup-chunk.mjs`, diese Doku.
`Boot.ts` bewusst NICHT in der Area. Karten #12204–#12207.

## Metriken (vor der Messung festgelegt)

- **First-Chunk-Wartezeit** = Dauer des längsten Einzel-Chunks innerhalb der
  Texturen-Creator-Familie (`derived-atlas` vorher).
- **Gesamt-Warmup** = Summe aller Chunk-Zeiten (`sumChunkMs`, Median über 3 Läufe).
  Regressionsschwelle: nachher <= vorher × 1,05 (kein Chunk-Overhead-Verlust).

## K1 — Vorher-Messung (#12204)

Skript: `scripts/m10-warmup-chunk.mjs` (Playwright, 3 Läufe à frischer Context =
kalter Cache; liest `window.__bootTimings.tasks`, das `src/scenes/Loading.ts`
ohne Eingriff protokolliert).

Beleg: `~/games/.evidence/m10-warmup-chunk-fine/m10-warmup-chunk-before.json`

| Metrik (Median, 3 Läufe) | Vorher |
|---|---|
| Chunks | 48 |
| maxChunk | 1672,5 ms |
| sumChunk | 3625,8 ms |
| titleRendered | 4211 ms |

Top-Chunks (Lauf 1):

| ms | Chunk |
|---|---|
| 1740,2 | runtime-atlas (`buildRuntimeAtlas`, **fremde Datei**, nicht in der Lane-Area) |
| 956,1 | fx (bereits eigener Chunk) |
| 291,6 | derived-atlas (`createAllTextures`-Sammelaufruf — Lane-Ziel) |
| 228,6 | enemies |
| 83,6 | chars |

**Ehrlicher Befund:** Der größte Frame-Stall ist `runtime-atlas` (1740 ms), NICHT
`derived-atlas`. Diese Lane kann den `derived-atlas`-Sammelchunk (~292 ms) in
Creator-Familien-Chunks auflösen; der `runtime-atlas`-Stall liegt außerhalb des
Bereichs (`src/gfx/atlas.ts`) und wird als offener Punkt gemeldet.

## K2 — Exporte + feineres Chunking (#12205)

Commits b0449eba + bc1af0d0:

- `src/gfx/textures.ts`: die 4 Creator `createRingTexture`,
  `createEnemyProjectileTextures`, `createTelegraphTextures`,
  `createShadowTexture` exportiert. `git diff` enthält NUR Export-Zeilen +
  Kommentarzeilen (Abnahmekriterium erfüllt, Funktionskörper unberührt).
  `createAllTextures` bleibt unangetastet (Aufrufer: Boot.ts).
- `src/gfx/warmup.ts`: der Sammel-Chunk `derived-atlas` ist aufgelöst in 6
  Creator-Familien-Chunks, Reihenfolge nach Sichtbarkeit:
  `light-vignette` (light_radius + vignette = Spieler-/Boden-Sichtbarkeit) →
  `shadow` → `rings` (ring_burst/seal/soul) → `enemy-projectiles` (inkl.
  elite_aura wie im Original) → `telegraphs` → `static-atlas` (bakeStaticAtlas).
- **Fremd-Datei, begründet:** `tests/loading-warmup.test.ts` (Lane
  m10-loading-screen, von niemandem geclaimt) frierte das alte Label
  `derived-atlas` ein. Einzeilige Label-Listen-Anpassung; Eintrag in
  `/home/ai/games/.dispatch/requests.md`. Sonst keine Dateien außerhalb der Area.

## K3 — Nachher-Messung (#12206)

Identisches Skript (`scripts/m10-warmup-chunk.mjs`, 3 Läufe, kalter Cache).

Beleg: `~/games/.evidence/m10-warmup-chunk-fine/m10-warmup-chunk-after.json`

| Metrik (Median, 3 Läufe) | Vorher | Nachher | Δ |
|---|---|---|---|
| Chunks | 48 | 53 | +5 (Sammelchunk → 6 Familien) |
| **derived-atlas-Chunk** | 291,6 ms | **entfallen** | Nachfolge-Chunks je ≤ ~24 ms |
| maxChunk (alle Chunks) | 1672,5 ms | 1042,7 ms | −38 % (runtime-atlas schwankt laufweise) |
| sumChunk (Gesamt-Warmup) | 3625,8 ms | 2597,7 ms | **−28 %** (Schwelle war ≤ +5 %) |
| titleRendered (interaktiv) | 4211 ms | 2983 ms | −29 % |

**Abnahme:** First-Chunk-Wartezeit (derived-atlas-Sammelchunk 291,6 ms) entfällt
— kein Nachfolge-Chunk liegt über ~24 ms. Gesamt-Warmup liegt mit −28 % weit
unter der Regressionsschwelle +5 %. Keine JS-Fehler in allen Läufen, Atlas
vollständig.

**Offener Punkt (außerhalb der Lane-Area):** Der größte verbleibende Stall ist
`runtime-atlas` (`buildRuntimeAtlas`, `src/gfx/atlas.ts` — fremde Datei) mit
~980–1740 ms je Lauf. Wer den Kaltstart weiter drückt, muss dort chunking/
Splatten; das gehört in eine eigene Karte.

## K4 — Guard-Test + Abschluss (#12207)

(offen)
