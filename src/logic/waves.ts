import type { EnemyId } from "../data/types";
import { waveForMinute } from "../data/waves";
import type { Rng } from "./rng";

/** Gewichtete Gegnerwahl aus der Minuten-Mischung. */
export function pickEnemy(mix: Partial<Record<EnemyId, number>>, rng: Rng): EnemyId | null {
  const entries = Object.entries(mix).filter(([, w]) => (w ?? 0) > 0) as [EnemyId, number][];
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

export function spawnRateForMinute(minute: number): number {
  return waveForMinute(minute).spawnRate;
}

/**
 * Spawn-Budget: `budget` sammelt Rate*dt, jeder ganzzahlige Schritt spawnt 1 Gegner.
 * Rückgabe enthält das Restbudget für den nächsten Tick.
 */
export function advanceSpawnBudget(
  budget: number,
  rate: number,
  dt: number,
): { budget: number; count: number } {
  const total = budget + Math.max(0, rate) * Math.max(0, dt);
  const count = Math.floor(total);
  return { budget: total - count, count };
}

/** Ring-Positionen für Spezialwelle "Ring-Einkesselung". */
export function ringSpawnOffsets(count: number, radius: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2;
    out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return out;
}
