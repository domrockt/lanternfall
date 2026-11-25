/** Seeded RNG (mulberry32) — reproduzierbar für Tests und `?seed=123`. */
export interface Rng {
  next(): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng implements Rng {
  private readonly fn: () => number;
  constructor(seed: number | string = 1) {
    this.fn = mulberry32(typeof seed === "string" ? hashString(seed) : seed);
  }
  next(): number {
    return this.fn();
  }
  int(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) return minInclusive;
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Liest `?seed=123` (Default 1). */
export function seedFromUrl(search: string = typeof location !== "undefined" ? location.search : ""): number {
  const m = /[?&]seed=([^&]+)/.exec(search);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : hashString(m[1]);
}

export function hasFlag(flag: string, search: string = typeof location !== "undefined" ? location.search : ""): boolean {
  return new RegExp(`[?&]${flag}(?:=|&|$)`).test(search);
}
