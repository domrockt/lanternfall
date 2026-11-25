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

/**
 * Schwarm-Strom: eine geschlossene Reihe in einer Richtung (±70°), die als
 * Strom auf den Spieler zuläuft und den Rand des Views kreuzt.
 */
export function streamSpawnOffsets(count: number, radius: number, angle: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const base = angle + Math.PI;
  const perp = base + Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const lateral = (i - (count - 1) / 2) * 16;
    out.push({
      x: Math.cos(base) * radius + Math.cos(perp) * lateral,
      y: Math.sin(base) * radius + Math.sin(perp) * lateral,
    });
  }
  return out;
}

/** Elite-Paketgröße (steigt leicht mit der Minute). */
export function elitePackCount(minute: number): number {
  return Math.min(5, 2 + Math.floor(minute / 8));
}

/**
 * Director-Plan für eine Spielzeit: Mischung, Spezialwelle und Elite-Markierung.
 * Reine Funktion, damit die Abnahme die Wellenstruktur prüfen kann.
 */
export function directorPlan(elapsedSeconds: number): {
  minute: number;
  wave: ReturnType<typeof waveForMinute>;
  elite: boolean;
} {
  const minute = Math.max(0, Math.min(29, Math.floor(elapsedSeconds / 60)));
  const wave = waveForMinute(minute);
  return { minute, wave, elite: wave.elitePack };
}
