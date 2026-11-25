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
  private readonly offset = 4096;
  private readonly stride = 8192;

  constructor(cellSize = 32) {
    this.cellSize = Math.max(4, cellSize);
  }

  private key(cx: number, cy: number): number {
    return (cx + this.offset) * this.stride + (cy + this.offset);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(item);
    else this.cells.set(k, [item]);
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
    return this.cells.size;
  }
}
