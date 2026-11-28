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

(siehe Commit)

## K3 — Nachher-Messung (#12206)

(offen)

## K4 — Guard-Test + Abschluss (#12207)

(offen)
