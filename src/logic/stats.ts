import type { StatMods, WeaponDef, WeaponLevel } from "../data/types";

export interface AggregateStats {
  moveSpeedPct: number;
  cooldownPct: number;
  maxHpFlat: number;
  maxHpPct: number;
  regen: number;
  pickupRadiusPct: number;
  damagePct: number;
  areaPct: number;
  durationPct: number;
  armorFlat: number;
}

export function aggregateMods(modsList: readonly StatMods[]): AggregateStats {
  const agg: AggregateStats = {
    moveSpeedPct: 0,
    cooldownPct: 0,
    maxHpFlat: 0,
    maxHpPct: 0,
    regen: 0,
    pickupRadiusPct: 0,
    damagePct: 0,
    areaPct: 0,
    durationPct: 0,
    armorFlat: 0,
  };
  for (const m of modsList) {
    agg.moveSpeedPct += m.moveSpeedPct ?? 0;
    agg.cooldownPct += m.cooldownPct ?? 0;
    agg.maxHpFlat += m.maxHpFlat ?? 0;
    agg.maxHpPct += m.maxHpPct ?? 0;
    agg.regen += m.regen ?? 0;
    agg.pickupRadiusPct += m.pickupRadiusPct ?? 0;
    agg.damagePct += m.damagePct ?? 0;
    agg.areaPct += m.areaPct ?? 0;
    agg.durationPct += m.durationPct ?? 0;
    agg.armorFlat += m.armorFlat ?? 0;
  }
  return agg;
}

export function weaponLevel(def: WeaponDef, level: number): WeaponLevel {
  const l = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
  return def.levels[l - 1] ?? def.levels[0];
}

/** Abklingzeit mit Tome-Bonus, nie unter 20 % der Basis. */
export function effectiveCooldown(base: number, agg: AggregateStats): number {
  const factor = Math.max(0.2, 1 - agg.cooldownPct / 100);
  return base * factor;
}

export function effectiveDamage(base: number, agg: AggregateStats): number {
  return Math.max(1, Math.round(base * (1 + agg.damagePct / 100)));
}

export function effectiveRadius(base: number, agg: AggregateStats): number {
  return base * (1 + agg.areaPct / 100);
}

export function effectiveDuration(base: number, agg: AggregateStats): number {
  return base * (1 + agg.durationPct / 100);
}

export function effectivePickupRadius(base: number, agg: AggregateStats): number {
  return base * (1 + agg.pickupRadiusPct / 100);
}

export function effectiveMoveSpeed(base: number, agg: AggregateStats): number {
  return Math.max(10, base * (1 + agg.moveSpeedPct / 100));
}
