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
/** Kompakte Schadenszahl: grosse Endgame-Werte sprengen sonst die Spalte. */
export function formatDamageCompact(damage: number): string {
  const d = Math.max(0, Math.round(damage));
  if (d >= 1_000_000) {
    const v = (d / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${v}M`;
  }
  if (d >= 10_000) {
    const v = (d / 1000).toFixed(1).replace(/\.0$/, "");
    return `${v}K`;
  }
  return String(d);
}

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
