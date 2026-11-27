import { describe, expect, it } from "vitest";
import { ENEMIES } from "../src/data/enemies";
import { TIER_MIXES } from "../src/data/waves";
import type { EnemyId } from "../src/data/types";
import { simulateEnemyCoverage } from "../src/logic/waves";

const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
const SEEDS = [101, 202];

describe("M10 Wellen-Abdeckung: alle 30 Gegnertypen spawnen", () => {
  it("(a) 30/30 IDs stehen in mindestens einer Tier-Mix mit Gewicht > 0", () => {
    expect(ENEMY_IDS).toHaveLength(30);
    const idsInMixes = new Set<EnemyId>();
    for (const tier of Object.values(TIER_MIXES)) {
      for (const [id, weight] of Object.entries(tier)) {
        if ((weight ?? 0) > 0) idsInMixes.add(id as EnemyId);
      }
    }
    expect(idsInMixes.size).toBe(30);
    for (const id of ENEMY_IDS) {
      expect(idsInMixes.has(id), `${id} fehlt in allen Tier-Mixes`).toBe(true);
    }
    // Jeder Typ muss in der Mischung seiner eigenen Zeitstufe vorkommen,
    // sonst kann er vor seinem Tier-Ende gar nicht gewaehlt werden.
    for (const id of ENEMY_IDS) {
      const tier = Math.min(4, Math.floor(ENEMIES[id].tier));
      expect(TIER_MIXES[tier][id] ?? 0, `${id} fehlt in Tier ${tier}`).toBeGreaterThan(0);
    }
  });

  it("(b) jede Tier-Mix ist normalisiert (nur bekannte IDs, Gewichte > 0, Summe 100 %)", () => {
    const tiers = Object.keys(TIER_MIXES);
    expect(tiers).toHaveLength(5);
    for (const tier of tiers) {
      const mix = TIER_MIXES[Number(tier)];
      const entries = Object.entries(mix);
      expect(entries.length).toBeGreaterThan(0);
      let sum = 0;
      for (const [id, weight] of entries) {
        expect(ENEMY_IDS, `unbekannte ID ${id} in Tier ${tier}`).toContain(id as EnemyId);
        expect(Number.isFinite(weight)).toBe(true);
        expect(weight as number).toBeGreaterThan(0);
        sum += weight as number;
      }
      expect(sum).toBeGreaterThan(0);
      const shares = entries.map(([, weight]) => (weight as number) / sum);
      for (const share of shares) expect(share).toBeGreaterThan(0);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it("(c) deterministische 30-min-Simulation deckt 30/30, jeweils vor Tier-Ende", () => {
    for (const seed of SEEDS) {
      const sim = simulateEnemyCoverage(seed, 30 * 60, ENEMY_IDS);
      const missing = ENEMY_IDS.filter((id) => sim.spawns[id] === 0);
      expect(missing, `Seed ${seed}: nie gespawnt`).toEqual([]);
      expect(sim.totalSpawns).toBeGreaterThan(0);
      for (const id of ENEMY_IDS) {
        const tierEnd = (ENEMIES[id].tier + 1) * 5 * 60;
        expect(sim.firstSpawn[id], `Seed ${seed}: ${id} ohne First-Spawn`).not.toBeNull();
        expect(sim.firstSpawn[id] as number, `Seed ${seed}: ${id} erst nach Tier-Ende`).toBeLessThanOrEqual(tierEnd);
      }
    }
  });

  it("(d) kein ID-Anteil > 35 % in einem 5-min-Block", () => {
    for (const seed of SEEDS) {
      const sim = simulateEnemyCoverage(seed, 30 * 60, ENEMY_IDS);
      sim.blockShares.forEach((shares, block) => {
        expect(sim.blockTotals[block]).toBeGreaterThan(0);
        for (const id of ENEMY_IDS) {
          expect(shares[id], `Seed ${seed}, Block ${block}: ${id} Share ${shares[id]}%`).toBeLessThanOrEqual(35);
        }
      });
    }
  });
});
