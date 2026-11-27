export interface PointLike {
  x: number;
  y: number;
}

/**
 * Temporäre Profil-Instrumentierung (K2). Nur aktiv, wenn
 * `globalThis.__lfSpatialHashProfile.enabled = true` gesetzt ist; im normalen
 * Spielbetrieb bleibt der Zweig ein billiger Boolean-Check. Wird nach der
 * Messung wieder entfernt (K3).
 */
interface HashProfile {
  enabled: boolean;
  queryMs: number;
  buildMs: number;
  queries: number;
  rebuilds: number;
  cellsVisited: number;
  itemsReturned: number;
  callers: Record<string, { ms: number; queries: number }>;
}

const profile: HashProfile = {
  enabled: false,
  queryMs: 0,
  buildMs: 0,
  queries: 0,
  rebuilds: 0,
  cellsVisited: 0,
  itemsReturned: 0,
  callers: {},
};
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { __lfSpatialHashProfile?: HashProfile }).__lfSpatialHashProfile = profile;
}
const callerByOut = new WeakMap<object, string>();


function classifyCaller(out: object): string {
  let label = callerByOut.get(out);
  if (!label) {
    const stack = new Error().stack ?? "";
    if (stack.includes("updateProjectiles")) label = "CombatSystem.updateProjectiles";
    else if (stack.includes("updateEnemies")) label = "Run.updateEnemies";
    else if (stack.includes("fireFrost")) label = "CombatSystem.fireFrost";
    else label = "other";
    callerByOut.set(out, label);
  }
  return label;
}

function addProfile(caller: string, ms: number): void {
  const entry = profile.callers[caller] ?? (profile.callers[caller] = { ms: 0, queries: 0 });
  entry.ms += ms;
  entry.queries += 1;
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
    const t0 = profile.enabled ? performance.now() : 0;
    // Buckets wiederverwenden statt bei jedem Frame neue Arrays zu allozieren;
    // die Map selbst bleibt klein (nur Zellen des aktuellen Frames).
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.freeBuckets.push(bucket);
    }
    this.cells.clear();
    if (profile.enabled) profile.buildMs += performance.now() - t0;
  }

  insert(item: T): void {
    const t0 = profile.enabled ? performance.now() : 0;
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = this.freeBuckets.pop() ?? [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
    if (profile.enabled) profile.buildMs += performance.now() - t0;
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) this.insert(item);
    if (profile.enabled) profile.rebuilds += 1;
  }

  /** Alle Items in Zellen, die den Kreis (x,y,r) überdecken (ohne Distanzfilter). */
  queryCircle(x: number, y: number, radius: number, out: T[] = []): T[] {
    const t0 = profile.enabled ? performance.now() : 0;
    out.length = 0;
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    let cells = 0;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) out.push(item);
        cells += 1;
      }
    }
    if (profile.enabled) {
      const ms = performance.now() - t0;
      profile.queryMs += ms;
      profile.queries += 1;
      profile.cellsVisited += cells;
      profile.itemsReturned += out.length;
      addProfile(classifyCaller(out), ms);
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

// Profil-Hook (K2): erlaubt Mikrobenchmarks im Browser ohne Rebuild.
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { __lfSpatialHashCtor?: typeof SpatialHash }).__lfSpatialHashCtor = SpatialHash;
}
