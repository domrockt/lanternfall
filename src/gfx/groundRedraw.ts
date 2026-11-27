/**
 * M10-ground-cost: reine Helfer fuer den gecachten Terrain-Chunk-Redraw.
 *
 * `GroundRenderer` zeichnet alle sichtbaren 256-px-Chunks in *eine* Canvas-Textur
 * und blendet die Einzelbilder aus. Dadurch kostet das Terrain pro Frame nur
 * einen statt ~20 Draw-Calls. Neu gezeichnet wird nur, wenn sich der
 * Chunk-Ausschnitt der Kamera (Nahtwechsel) oder ein Chunk selbst (Dirty:
 * gebaut/freigegeben) geaendert hat. Die Entscheidung ist bewusst Seiteneffekt-
 * frei und ohne Phaser-Abhaengigkeit, damit sie in Vitest ohne Browser laeuft.
 */
export interface ChunkRedrawState {
  /** Erster/sichtbarer Chunk-Spaltenindex im Ausschnitt. */
  minCx: number;
  maxCx: number;
  minCy: number;
  maxCy: number;
  /** Zaehlt Chunk-Builds/-Freigaben: aendert sich bei Dirty-Chunks. */
  version: number;
}

/** Muss die gecachte Terrain-Textur in diesem Frame neu gezeichnet werden? */
export function needsChunkRedraw(prev: ChunkRedrawState | null, next: ChunkRedrawState): boolean {
  if (prev === null) return true;
  if (prev.version !== next.version) return true;
  return prev.minCx !== next.minCx
    || prev.maxCx !== next.maxCx
    || prev.minCy !== next.minCy
    || prev.maxCy !== next.maxCy;
}
