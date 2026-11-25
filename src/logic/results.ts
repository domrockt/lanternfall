import { weaponDef, isEvolutionWeapon } from "../data/weaponIds";

export interface DamageEntry {
  id: string;
  name: string;
  damage: number;
  isEvolution: boolean;
}

/**
 * Schadenstabelle für den Ergebnis-Screen: nur Waffen mit Schaden > 0,
 * absteigend sortiert, begrenzt auf die verfügbaren Tabellenplätze.
 */
export function damageTable(damageByWeapon: Record<string, number>, limit = 12): DamageEntry[] {
  return Object.entries(damageByWeapon)
    .filter(([, dmg]) => Number.isFinite(dmg) && dmg > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([id, damage]) => ({
      id,
      name: weaponDef(id)?.name ?? id,
      damage: Math.round(damage),
      isEvolution: isEvolutionWeapon(id),
    }));
}
