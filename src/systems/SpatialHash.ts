export interface PointLike {
  x: number;
  y: number;
}

/**
 * Uniform Grid für Kollisionen/Separation. Keine Arcade-Physik — Gegner werden
 * pro Frame neu eingehängt und Nachbarn über die Zellen im Query-Radius gesucht.
 *
 * K3-Optimierung: flaches Zell-Array statt `Map<number, T[]>` für den normalen
 * Weltbereich (mit Rand), Overflow-Map nur für Koordinaten außerhalb. `clear`
 * leert nur die benutzten Zellen; die Bucket-Arrays bleiben für den nächsten
 * Frame erhalten (keine Allokation pro Frame). Key-Berechnung per Bitpacking,
 * Zellkoordinaten über Multiplikation mit dem Inversen statt Division.
 */
export class SpatialHash<T extends PointLike> {
  readonly cellSize: number;
  private readonly inv: number;
  /** Zellkoordinaten [-2048, 6144) px abgedeckt (Welt 0..4096 plus Rand). */
  private readonly minCell: number;
  private readonly dim: number;
  private readonly grid: (T[] | undefined)[];
  private readonly usedIdx: number[] = [];
  /** Zellen außerhalb des flachen Bereichs (praktisch nie benutzt). */
  private readonly overflow = new Map<number, T[]>();
  private readonly freeBuckets: T[][] = [];
  private allocated = 0;
  private readonly offset = 4096;
  private readonly stride = 8192;

  constructor(cellSize = 32) {
    this.cellSize = Math.max(4, cellSize);
    this.inv = 1 / this.cellSize;
    this.minCell = Math.floor(-2048 * this.inv);
    const maxCell = Math.floor((6144 - 0.001) * this.inv);
    this.dim = maxCell - this.minCell + 1;
    this.grid = new Array(this.dim * this.dim);
  }

  private key(cx: number, cy: number): number {
    return ((cx + this.offset) << 13) | ((cy + this.offset) & 0x1fff);
  }

  clear(): void {
    for (let i = 0; i < this.usedIdx.length; i++) this.grid[this.usedIdx[i]]!.length = 0;
    this.usedIdx.length = 0;
    this.overflow.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.x * this.inv);
    const cy = Math.floor(item.y * this.inv);
    const ix = cx - this.minCell;
    const iy = cy - this.minCell;
    if (ix >= 0 && ix < this.dim && iy >= 0 && iy < this.dim) {
      const idx = ix * this.dim + iy;
      let bucket = this.grid[idx];
      if (!bucket) {
        bucket = this.freeBuckets.pop() ?? [];
        this.grid[idx] = bucket;
        this.allocated += 1;
      }
      if (bucket.length === 0) this.usedIdx.push(idx);
      bucket.push(item);
    } else {
      const k = this.key(cx, cy);
      let bucket = this.overflow.get(k);
      if (!bucket) {
        bucket = this.freeBuckets.pop() ?? [];
        this.overflow.set(k, bucket);
        this.allocated += 1;
      }
      bucket.push(item);
    }
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /** Alle Items in Zellen, die den Kreis (x,y,r) überdecken (ohne Distanzfilter). */
  queryCircle(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minCx = Math.floor((x - radius) * this.inv);
    const maxCx = Math.floor((x + radius) * this.inv);
    const minCy = Math.floor((y - radius) * this.inv);
    const maxCy = Math.floor((y + radius) * this.inv);
    const dim = this.dim;
    const ixMin = minCx - this.minCell;
    const ixMax = maxCx - this.minCell;
    const iyMin = minCy - this.minCell;
    const iyMax = maxCy - this.minCell;
    if (ixMin >= 0 && ixMax < dim && iyMin >= 0 && iyMax < dim) {
      // Fast-Path (M10-Budget): Query liegt komplett im flachen Grid — keine
      // Bounds-/Overflow-Pruefung pro Zelle, Zeilenbasis einmal berechnet.
      // Deckt den Normalfall (Welt 0..4096) ab; der Query ist der zweit-
      // heisseste Separations-Pfad nach dem Paar-Check.
      const grid = this.grid;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const row = ix * dim;
        for (let iy = iyMin; iy <= iyMax; iy++) {
          const bucket = grid[row + iy];
          if (bucket !== undefined) {
            for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
          }
        }
      }
      return out;
    }
    for (let cx = minCx; cx <= maxCx; cx++) {
      const ix = cx - this.minCell;
      const xIn = ix >= 0 && ix < dim;
      for (let cy = minCy; cy <= maxCy; cy++) {
        const iy = cy - this.minCell;
        let bucket: T[] | undefined;
        if (xIn && iy >= 0 && iy < dim) {
          bucket = this.grid[ix * dim + iy];
        } else {
          bucket = this.overflow.get(this.key(cx, cy));
        }
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  /**
   * Wie `queryCircle`, aber mit echtem Distanzfilter: liefert genau die Items
   * im Kreis (gleiche Treffermenge wie eine Brute-Force-Referenz). Fuer
   * Separation ist das die richtige Query — nur Nachbarzellen werden gelesen,
   * der Distanzfilter ersetzt die quadratische Vollsuche.
   */
  queryNeighbors(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const r2 = radius * radius;
    const minCx = Math.floor((x - radius) * this.inv);
    const maxCx = Math.floor((x + radius) * this.inv);
    const minCy = Math.floor((y - radius) * this.inv);
    const maxCy = Math.floor((y + radius) * this.inv);
    const dim = this.dim;
    const ixMin = minCx - this.minCell;
    const ixMax = maxCx - this.minCell;
    const iyMin = minCy - this.minCell;
    const iyMax = maxCy - this.minCell;
    if (ixMin >= 0 && ixMax < dim && iyMin >= 0 && iyMax < dim) {
      // Fast-Path wie queryCircle: nur Nachbarzellen, keine Overflow-Checks.
      const grid = this.grid;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const row = ix * dim;
        for (let iy = iyMin; iy <= iyMax; iy++) {
          const bucket = grid[row + iy];
          if (bucket === undefined) continue;
          for (let i = 0; i < bucket.length; i++) {
            const item = bucket[i];
            const dx = item.x - x;
            const dy = item.y - y;
            if (dx * dx + dy * dy <= r2) out.push(item);
          }
        }
      }
      return out;
    }
    for (let cx = minCx; cx <= maxCx; cx++) {
      const ix = cx - this.minCell;
      const xIn = ix >= 0 && ix < dim;
      for (let cy = minCy; cy <= maxCy; cy++) {
        const iy = cy - this.minCell;
        let bucket: T[] | undefined;
        if (xIn && iy >= 0 && iy < dim) {
          bucket = this.grid[ix * dim + iy];
        } else {
          bucket = this.overflow.get(this.key(cx, cy));
        }
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }

  /**
   * Empfohlene Zellgroesse fuer eine maximale Suchradius-Klasse: so gross,
   * dass ein Suchkreis in hoechstens 2x2 Zellen faellt. Damit liest eine
   * Separation-Query pro Gegner nur Nachbarzellen statt der ganzen Welt.
   */
  static recommendedCellSize(maxQueryRadius: number): number {
    const r = Number.isFinite(maxQueryRadius) ? Math.max(2, maxQueryRadius) : 8;
    return Math.max(16, Math.min(64, Math.ceil(r * 2)));
  }

  get cellCount(): number {
    return this.usedIdx.length;
  }

  /** Nur je einmal allozierte Buckets (bleibt nach clear erhalten = Recycling). */
  get allocatedCellCount(): number {
    return this.allocated;
  }
}
