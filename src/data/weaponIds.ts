import { WEAPONS } from "./weapons";
import { EVOLUTION_WEAPONS } from "./evolution-weapons";
import type { WeaponAnyId, WeaponDef, WeaponId } from "./types";

/** Waffen-Definition für Basis- und Evolutionswaffen. */
export function weaponDef(id: string): WeaponDef | null {
  return WEAPONS[id as WeaponId] ?? EVOLUTION_WEAPONS[id as WeaponAnyId] ?? null;
}

export function evolutionWeapon(id: string): WeaponDef | null {
  return EVOLUTION_WEAPONS[id as WeaponAnyId] ?? null;
}

export function isEvolutionWeapon(id: string): boolean {
  return id in EVOLUTION_WEAPONS;
}
