import type { EnemyId } from "../data/types";
import { waveForMinute } from "../data/waves";
import { SeededRng, type Rng } from "./rng";

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

/**
 * M10-Spawn-Burst-Glättung: maximale Anzahl Director-Spawns, die pro echtem
 * Frame materialisiert wird. Ein Frame-Hitch (z. B. bei timeScale 30) lässt
 * `advanceSpawnBudget` einen großen Spawn-Rückstau aufbauen; ohne Deckel würde
 * der ganze Rückstau in einem Frame gespawnt (Bursts von 40+ Spawns) und die
 * Frame-Zeit-Spitze weiter verstärken. Verzögerte Spawns werden über das
 * Restbudget nachgeholt — Gesamtanzahl bleibt exakt erhalten; die Mischung
 * bleibt näherungsweise erhalten (kreuzt die Nachholphase eine Minuten-Grenze,
 * werden verzögerte Spawns mit der Mischung des neuen Abschnitts neu gewählt).
 */
export const SPAWN_FRAME_BUDGET = 8;

export interface SpawnBurstSplit {
  /** Spawns, die dieser Frame materialisiert (≤ Allowance). */
  now: number;
  /** Spawns, die über das Restbudget in späteren Frames nachgeholt werden. */
  deferred: number;
  /** Verbleibende Allowance für den Rest des Frames. */
  allowanceLeft: number;
}

/**
 * Teilt die in einem Substep fälligen Spawns in „jetzt“ und „später“ auf.
 * Reine Funktion: nie mehr als `allowance` Spawns pro Frame, Summe bleibt
 * erhalten (`now + deferred === granted`), Grenz-/Müllwerte → 0.
 */
export function splitSpawnBurst(granted: number, allowance: number): SpawnBurstSplit {
  const want = Number.isFinite(granted) ? Math.max(0, Math.floor(granted)) : 0;
  const allow = Number.isFinite(allowance) ? Math.max(0, Math.floor(allowance)) : 0;
  const now = Math.min(want, allow);
  return { now, deferred: want - now, allowanceLeft: allow - now };
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

export interface CoverageSimResult {
  seed: number;
  seconds: number;
  totalSpawns: number;
  /** Spawns je Gegner-ID. */
  spawns: Record<EnemyId, number>;
  /** Erste Spawn-Sekunde je Gegner-ID (null = nie gespawnt). */
  firstSpawn: Record<EnemyId, number | null>;
  /** Spawns je 5-min-Block (Index 0..5). */
  blockTotals: number[];
  /** Prozentualer Anteil je Gegner-ID und 5-min-Block. */
  blockShares: Record<EnemyId, number>[];
}

/**
 * Reine 30-min-Simulation der Director-Semantik aus `Spawner.update()`:
 * Spawnrate pro Sekunde über `advanceSpawnBudget`, gewichtete Wahl über
 * `pickEnemy`, Spezialwelle und Elite-Paket am Minutengrenzpunkt.
 *
 * Kein Phaser, kein Rendering — damit die Abnahme die echte Abdeckung
 * (jeder der 30 Typen spawnt) deterministisch und ohne Browser belegen kann.
 */
export function simulateEnemyCoverage(
  seed: number,
  seconds = 30 * 60,
  ids: readonly EnemyId[],
  rateFactor = 1,
): CoverageSimResult {
  const rng = new SeededRng(seed);
  const spawns = Object.fromEntries(ids.map((id) => [id, 0])) as Record<EnemyId, number>;
  const firstSpawn = Object.fromEntries(ids.map((id) => [id, null])) as Record<EnemyId, number | null>;
  const blockCounts = Array.from({ length: Math.ceil(seconds / 300) }, () =>
    Object.fromEntries(ids.map((id) => [id, 0])) as Record<EnemyId, number>);
  const blockTotals = Array(blockCounts.length).fill(0) as number[];
  let budget = 0;
  let lastMinute = -1;

  const record = (id: EnemyId, second: number): void => {
    spawns[id] += 1;
    if (firstSpawn[id] === null) firstSpawn[id] = second;
    const block = Math.min(blockCounts.length - 1, Math.floor(second / 300));
    blockCounts[block][id] += 1;
    blockTotals[block] += 1;
  };

  for (let second = 0; second < seconds; second++) {
    const minute = Math.min(29, Math.floor(second / 60));
    const wave = waveForMinute(minute);
    if (minute !== lastMinute) {
      lastMinute = minute;
      if (wave.special === "ring" || wave.special === "stream") {
        const count = wave.special === "ring"
          ? 6 + Math.floor(wave.minute / 6)
          : 6 + Math.floor(wave.minute / 5);
        for (let i = 0; i < count; i++) {
          const id = pickEnemy(wave.mix, rng);
          if (id) record(id, second);
        }
      }
      if (wave.elitePack) {
        const count = elitePackCount(wave.minute);
        for (let i = 0; i < count; i++) {
          const id = pickEnemy(wave.mix, rng);
          if (id) record(id, second);
        }
      }
    }
    const scaled = advanceSpawnBudget(budget, wave.spawnRate * rateFactor, 1);
    budget = scaled.budget;
    for (let i = 0; i < scaled.count; i++) {
      const id = pickEnemy(wave.mix, rng);
      if (!id) throw new Error(`pickEnemy lieferte null (Minute ${minute})`);
      record(id, second);
    }
  }

  const blockShares = blockCounts.map((counts, i) => {
    const total = blockTotals[i];
    return Object.fromEntries(ids.map((id) => [
      id,
      total === 0 ? 0 : Math.round((counts[id] / total) * 1000) / 10,
    ])) as Record<EnemyId, number>;
  });

  return { seed, seconds, totalSpawns: blockTotals.reduce((a, b) => a + b, 0), spawns, firstSpawn, blockTotals, blockShares };
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
