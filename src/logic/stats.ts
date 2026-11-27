import type { StatMods, WeaponDef, WeaponLevel } from "../data/types";

export interface AggregateStats {
  moveSpeedPct: number;
  cooldownPct: number;
  maxHpFlat: number;
  maxHpPct: number;
  regen: number;
  xpPct: number;
  pickupRadiusPct: number;
  damagePct: number;
  areaPct: number;
  durationPct: number;
  armorFlat: number;
}

/**
 * Harte Obergrenzen der Passiv-Wirkung. Die Passives haben maxLevel 5; hoehere
 * (z. B. durch doppelt angewendete Mods oder korrupte Saves) Werte werden auf
 * den dokumentierten Maximalbonus geklemmt, statt unbegrenzt zu stapeln.
 * M10-Passive-Math: Bewegung, Feuerrate (Abklingzeit), Schaden und Pickup-Radius
 * sind die vier vom Auftrag geforderten Caps. Die uebrigen Werte haben bewusst
 * grosszuegige Sanity-Caps (Charakter-Boni bleiben erhalten), damit NaN/Infinity
 * nie in die Simulation gelangen.
 */
export const STAT_CAPS = {
  moveSpeedPct: 40,
  cooldownPct: 40,
  maxHpFlat: 500,
  maxHpPct: 200,
  regen: 50,
  xpPct: 200,
  pickupRadiusPct: 125,
  damagePct: 50,
  areaPct: 200,
  durationPct: 200,
  armorFlat: 50,
} as const;

/** Untergrenzen: nur Bewegungstempo und XP duerfen negativ sein (Kael-Profil). */
export const STAT_FLOORS = {
  moveSpeedPct: -50,
  cooldownPct: 0,
  maxHpFlat: 0,
  maxHpPct: 0,
  regen: 0,
  xpPct: -100,
  pickupRadiusPct: 0,
  damagePct: 0,
  areaPct: 0,
  durationPct: 0,
  armorFlat: 0,
} as const;

const STAT_KEYS = Object.keys(STAT_CAPS) as Array<keyof AggregateStats>;

export function aggregateMods(modsList: readonly StatMods[]): AggregateStats {
  const agg: AggregateStats = {
    moveSpeedPct: 0,
    cooldownPct: 0,
    maxHpFlat: 0,
    maxHpPct: 0,
    regen: 0,
    xpPct: 0,
    pickupRadiusPct: 0,
    damagePct: 0,
    areaPct: 0,
    durationPct: 0,
    armorFlat: 0,
  };
  for (const m of modsList) {
    if (!m) continue;
    for (const key of STAT_KEYS) {
      const value = m[key];
      // 0/NaN-Schutz: fehlende, nicht-finite oder falsch typisierte Werte ignorieren.
      if (typeof value === "number" && Number.isFinite(value)) agg[key] += value;
    }
  }
  for (const key of STAT_KEYS) {
    const capped = Math.min(STAT_CAPS[key], Math.max(STAT_FLOORS[key], agg[key]));
    agg[key] = Number.isFinite(capped) ? capped : 0;
  }
  return agg;
}

/** Defensiver Prozent-Klemm-Helfer fuer die effective*-Funktionen. */
function pctClamped(value: number, cap: number, floor = 0): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(cap, Math.max(floor, value));
}

/** Basiswert absichern: nicht-finite/negative Basis faellt auf einen neutralen Wert. */
function safeBase(base: number, fallback = 1): number {
  if (!Number.isFinite(base) || base < 0) return fallback;
  return base;
}

export function weaponLevel(def: WeaponDef, level: number): WeaponLevel {
  const l = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
  return def.levels[l - 1] ?? def.levels[0];
}

/** Abklingzeit mit Tome-Bonus: hoechstens -40 %, nie unter 20 % der Basis. */
export function effectiveCooldown(base: number, agg: AggregateStats): number {
  const reduction = pctClamped(agg?.cooldownPct, STAT_CAPS.cooldownPct);
  const factor = Math.max(0.2, 1 - reduction / 100);
  return safeBase(base) * factor;
}

/** Schaden: hoechstens +50 %, nie unter 1. */
export function effectiveDamage(base: number, agg: AggregateStats): number {
  const bonus = pctClamped(agg?.damagePct, STAT_CAPS.damagePct);
  const value = Math.round(safeBase(base) * (1 + bonus / 100));
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}

export function effectiveRadius(base: number, agg: AggregateStats): number {
  const bonus = pctClamped(agg?.areaPct, STAT_CAPS.areaPct);
  return safeBase(base, 0) * (1 + bonus / 100);
}

export function effectiveDuration(base: number, agg: AggregateStats): number {
  const bonus = pctClamped(agg?.durationPct, STAT_CAPS.durationPct);
  return safeBase(base, 0) * (1 + bonus / 100);
}

/** Pickup-Radius: hoechstens +125 %, nie negativ. */
export function effectivePickupRadius(base: number, agg: AggregateStats): number {
  const bonus = pctClamped(agg?.pickupRadiusPct, STAT_CAPS.pickupRadiusPct);
  return safeBase(base, 0) * (1 + bonus / 100);
}

/** Bewegungstempo: hoechstens +40 %, Untergrenze absolut 10 px/s. */
export function effectiveMoveSpeed(base: number, agg: AggregateStats): number {
  const bonus = pctClamped(agg?.moveSpeedPct, STAT_CAPS.moveSpeedPct, STAT_FLOORS.moveSpeedPct);
  return Math.max(10, safeBase(base, 0) * (1 + bonus / 100));
}
