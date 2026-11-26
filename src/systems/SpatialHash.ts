export interface PointLike {
  x: number;
  y: number;
}

/**
 * Uniform Grid für Kollisionen/Separation. Keine Arcade-Physik — Gegner werden
 * pro Frame neu eingehängt und Nachbarn über die Zellen im Query-Radius gesucht.
 */
export class SpatialHash<T extends PointLike> {
  readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  /** Leere Bucket-Arrays fuer den naechsten Frame (Recycling ohne Map-Wachstum). */
  private readonly freeBuckets: T[][] = [];
  private readonly offset = 4096;
  private readonly stride = 8192;

  constructor(cellSize = 32) {
    this.cellSize = Math.max(4, cellSize);
  }

  private key(cx: number, cy: number): number {
    return (cx + this.offset) * this.stride + (cy + this.offset);
  }

  clear(): void {
    // Buckets wiederverwenden statt bei jedem Frame neue Arrays zu allozieren;
    // die Map selbst bleibt klein (nur Zellen des aktuellen Frames).
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.freeBuckets.push(bucket);
    }
    this.cells.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = this.freeBuckets.pop() ?? [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /** Alle Items in Zellen, die den Kreis (x,y,r) überdecken (ohne Distanzfilter). */
  queryCircle(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) out.push(item);
      }
    }
    return out;
  }

  get cellCount(): number {
    let n = 0;
    for (const bucket of this.cells.values()) if (bucket.length > 0) n += 1;
    return n;
  }

  /** Nur je einmal allozierter Buckets (bleibt nach clear erhalten = Recycling). */
  get allocatedCellCount(): number {
    return this.cells.size + this.freeBuckets.length;
  }
}
