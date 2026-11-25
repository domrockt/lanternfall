/**
 * Wang-/Blob-Autotiling-Masken für das Moor-Terrain (M4b).
 *
 * Das Terrain wird pro Pixel klassifiziert; die Kantenbehandlung liest für
 * jeden Pixel die 8 Nachbarn. Die Maske ist ein 8-Bit-Blob-Set:
 *
 *   N=1  NE=2  E=4  SE=8  S=16  SW=32  W=64  NW=128
 *
 * `wangIndex` normalisiert die Maske auf die 47 gültigen Blob-Konfigurationen
 * (Ecken zählen nur, wenn beide angrenzenden Seiten gesetzt sind) und liefert
 * einen stabilen Index 0..46. `sideMask` ist das klassische 16er-Set (N/E/S/W).
 */

export const BLOB_N = 1;
export const BLOB_NE = 2;
export const BLOB_E = 4;
export const BLOB_SE = 8;
export const BLOB_S = 16;
export const BLOB_SW = 32;
export const BLOB_W = 64;
export const BLOB_NW = 128;

/** Baut eine Blob-Maske aus einer Nachbarschaftsfunktion. */
export function blobMask(isSame: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  if (isSame(0, -1)) mask |= BLOB_N;
  if (isSame(1, -1)) mask |= BLOB_NE;
  if (isSame(1, 0)) mask |= BLOB_E;
  if (isSame(1, 1)) mask |= BLOB_SE;
  if (isSame(0, 1)) mask |= BLOB_S;
  if (isSame(-1, 1)) mask |= BLOB_SW;
  if (isSame(-1, 0)) mask |= BLOB_W;
  if (isSame(-1, -1)) mask |= BLOB_NW;
  return mask;
}

/** 16er-Set: nur die vier Seiten. */
export function sideMask(mask: number): number {
  return mask & (BLOB_N | BLOB_E | BLOB_S | BLOB_W);
}

/**
 * Entfernt Ecken, deren beide Nachbarseiten fehlen (klassische Blob-47-
 * Normalisierung). Das Ergebnis ist idempotent.
 */
export function normalizeBlob(mask: number): number {
  let m = mask & 0xff;
  if (!(m & BLOB_N) || !(m & BLOB_E)) m &= ~BLOB_NE;
  if (!(m & BLOB_E) || !(m & BLOB_S)) m &= ~BLOB_SE;
  if (!(m & BLOB_S) || !(m & BLOB_W)) m &= ~BLOB_SW;
  if (!(m & BLOB_W) || !(m & BLOB_N)) m &= ~BLOB_NW;
  return m;
}

export function isNormalizedBlob(mask: number): boolean {
  return normalizeBlob(mask) === (mask & 0xff);
}

/**
 * Stabiler Index 0..46 für eine normalisierte Blob-Maske. Alle 256 möglichen
 * 8-Bit-Masken werden auf 47 Normalformen abgebildet (0 = komplett allein).
 */
const BLOB_INDEX = (() => {
  const table = new Uint8Array(256);
  const seen: number[] = [];
  for (let m = 0; m < 256; m++) {
    const n = normalizeBlob(m);
    let idx = seen.indexOf(n);
    if (idx < 0) {
      idx = seen.length;
      seen.push(n);
    }
    table[m] = idx;
  }
  return { table, count: seen.length, canonical: seen };
})();

export function wangIndex(mask: number): number {
  return BLOB_INDEX.table[mask & 0xff];
}

/** Anzahl der 47 Normalformen (für Tests / Debug). */
export function blobCount(): number {
  return BLOB_INDEX.count;
}

export function blobCanonical(index: number): number {
  return BLOB_INDEX.canonical[Math.max(0, Math.min(BLOB_INDEX.canonical.length - 1, index))];
}

/** Fehlende Seiten einer Maske (true = Nachbar gehört zu einer anderen Art). */
export interface MissingSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export function missingSides(mask: number): MissingSides {
  return {
    n: !(mask & BLOB_N),
    e: !(mask & BLOB_E),
    s: !(mask & BLOB_S),
    w: !(mask & BLOB_W),
  };
}

/**
 * Ecken-Maske für abgerundete Übergänge: eine Ecke ist nur "offen", wenn
 * mindestens eine der beiden Seiten fehlt. Ergibt 4 Bit (NE=1, SE=2, SW=4,
 * NW=8). Wird für 2-px-Ränder genutzt, damit Ecken nicht eckig wirken.
 */
export function cornerMask(mask: number): number {
  let m = 0;
  if (!(mask & BLOB_NE) && ((mask & BLOB_N) === 0 || (mask & BLOB_E) === 0)) m |= 1;
  if (!(mask & BLOB_SE) && ((mask & BLOB_E) === 0 || (mask & BLOB_S) === 0)) m |= 2;
  if (!(mask & BLOB_SW) && ((mask & BLOB_S) === 0 || (mask & BLOB_W) === 0)) m |= 4;
  if (!(mask & BLOB_NW) && ((mask & BLOB_W) === 0 || (mask & BLOB_N) === 0)) m |= 8;
  return m;
}

/** Kantenlänge eines Requisitenblocks in Tiles (3er-Cluster). */
export const PROP_BLOCK_TILES = 3;

/**
 * Besitz-Regel für chunkübergreifende Requisitenblöcke: Ein Block gehört
 * genau dem Chunk, in dessen Tile-Bereich sein Start-Tile liegt. So wird
 * jeder Cluster (inkl. Laternen-Glow) an Chunk-Nähten nur einmal angelegt.
 */
export function ownsPropBlock(
  blockX: number,
  blockY: number,
  chunkX: number,
  chunkY: number,
  chunkTiles: number,
): boolean {
  const startX = chunkX * chunkTiles;
  const startY = chunkY * chunkTiles;
  const bx = blockX * PROP_BLOCK_TILES;
  const by = blockY * PROP_BLOCK_TILES;
  return bx >= startX && bx < startX + chunkTiles && by >= startY && by < startY + chunkTiles;
}
