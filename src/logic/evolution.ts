import { EVOLUTIONS } from "../data/evolutions";
import { EVOLUTION_WEAPONS } from "../data/evolution-weapons";
import type { EvolutionDef, PassiveId, WeaponId } from "../data/types";
import { generateOffers, type Offer, type OwnedItem } from "./levelup";
import type { Rng } from "./rng";

export interface ChestReward {
  kind: "evolution" | "weapon" | "passive";
  id: string;
  name: string;
  description: string;
  level: number;
  isNew: boolean;
  iconColor: number;
  evolution?: EvolutionDef;
}

export interface ChestResult {
  /** Anzahl der Belohnungen: 1, 3 oder 5 (zeitabhängig). */
  count: number;
  rewards: ChestReward[];
}

/**
 * Evolution ist möglich, wenn die Basiswaffe Stufe 8 erreicht hat, das passende
 * Powerup mindestens Stufe 1 besitzt und die Evolution noch nicht im Slot liegt.
 * Reine Funktion, erster Treffer aus EVOLUTIONS.
 */
export function canEvolve(
  weapons: readonly OwnedItem[],
  passives: readonly OwnedItem[],
): EvolutionDef | null {
  return evolvableList(weapons, passives)[0] ?? null;
}

/** Alle aktuell möglichen Evolutionen (für UI/Tests). */
export function evolvableList(
  weapons: readonly OwnedItem[],
  passives: readonly OwnedItem[],
): EvolutionDef[] {
  const passiveLevels = new Map(passives.map((p) => [p.id, p.level]));
  const out: EvolutionDef[] = [];
  for (const evo of EVOLUTIONS) {
    if (!evo.implemented) continue;
    if (weapons.some((w) => w.id === evo.id)) continue;
    const base = weapons.find((w) => w.id === evo.baseWeapon);
    if (!base || base.level < 8) continue;
    if ((passiveLevels.get(evo.passive) ?? 0) < 1) continue;
    out.push(evo);
  }
  return out;
}

/**
 * Anzahl der Truhen-Belohnungen. Die Chance auf 3/5 steigt mit der Run-Zeit.
 * Deterministisch über den übergebenen RNG (Tests reproduzierbar).
 */
export function chestUpgradeCount(elapsedSeconds: number, rng: Rng): 1 | 3 | 5 {
  const t = Math.max(0, Math.min(1, elapsedSeconds / 1800));
  const p5 = 0.05 + 0.45 * t;
  const p3 = 0.15 + 0.25 * t;
  const roll = rng.next();
  if (roll < p5) return 5;
  if (roll < p5 + p3) return 3;
  return 1;
}

/**
 * Truhen-Inhalt: Evolution hat Vorrang (belegt den ersten Slot), danach werden
 * die restlichen Slots mit gültigen Waffen-/Powerup-Upgrades gefüllt.
 * Die Evolutions-Basiswaffe wird dabei nicht erneut angeboten.
 */
export function chestRewards(
  weapons: readonly OwnedItem[],
  passives: readonly OwnedItem[],
  elapsedSeconds: number,
  rng: Rng,
): ChestResult {
  const count = chestUpgradeCount(elapsedSeconds, rng);
  const evolution = canEvolve(weapons, passives);
  const rewards: ChestReward[] = [];

  let offerWeapons: OwnedItem[] = weapons.map((w) => ({ ...w }));
  if (evolution) {
    const def = EVOLUTION_WEAPONS[evolution.id];
    rewards.push({
      kind: "evolution",
      id: evolution.id,
      name: evolution.name,
      description: evolution.effect,
      level: def?.maxLevel ?? 8,
      isNew: true,
      iconColor: evolution.iconColor,
      evolution,
    });
    // Evolution ersetzt die Basiswaffe → für die Angebotslogik Slot bereits belegt.
    offerWeapons = offerWeapons.filter((w) => w.id !== evolution.baseWeapon);
    offerWeapons.push({ id: evolution.id, level: def?.maxLevel ?? 8 });
  }

  const remaining = Math.max(0, count - rewards.length);
  const offers: Offer[] = generateOffers(offerWeapons, passives, rng, remaining);
  for (const o of offers) {
    rewards.push({
      kind: o.kind,
      id: o.id,
      name: o.name,
      description: o.description,
      level: o.level,
      isNew: o.isNew,
      iconColor: o.iconColor,
    });
  }
  return { count: rewards.length, rewards };
}

/** Nur für Typ-Export: passive IDs bleiben Teil der Evolutionsregeln. */
export type EvolutionPassive = PassiveId;
export type EvolutionWeapon = WeaponId;
