import { weaponDef, isEvolutionWeapon } from "../data/weaponIds";
import { EVOLUTIONS } from "../data/evolutions";

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
/** Gesamtschaden aller Waffen (nur endliche, positive Werte), kaufmännisch gerundet. */
export function damageTotal(damageByWeapon: Record<string, number>): number {
  let sum = 0;
  for (const value of Object.values(damageByWeapon)) {
    if (Number.isFinite(value) && value > 0) sum += value;
  }
  return Math.round(sum);
}

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

export function collapseEvolutionDamage(damageByWeapon: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(damageByWeapon)) {
    if (Number.isFinite(value) && value > 0) out[id] = value;
  }
  // Eine Evolution ersetzt ihren Basis-Slot: historischer Basis-Schaden gehoert
  // zur selben Zeile wie die Evolutionswaffe, sonst erscheint der Slot doppelt.
  for (const evolution of EVOLUTIONS) {
    const base = out[evolution.baseWeapon];
    const evolved = out[evolution.id];
    if (base != null && evolved != null) {
      out[evolution.id] = evolved + base;
      delete out[evolution.baseWeapon];
    }
  }
  return out;
}

/**
 * Deterministische Schadenstabelle: Evolutionen ersetzen ihre Basiswaffe,
 * absteigend nach Schaden, Gleichstand nach id. Die angezeigten Ganzzahlen
 * werden per Largest-Remainder so verteilt, dass ihre Summe exakt dem
 * gerundeten Gesamtschaden entspricht (kein Rundungs-Delta).
 */
export function damageTable(damageByWeapon: Record<string, number>, limit = 12): DamageEntry[] {
  const collapsed = collapseEvolutionDamage(damageByWeapon);
  const selected = Object.entries(collapsed)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit));
  if (selected.length === 0) return [];

  const exact = selected.map(([, value]) => value);
  const target = Math.round(exact.reduce((sum, value) => sum + value, 0));
  const rounded = exact.map(Math.floor);
  let remainder = target - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    rounded[order[i].index] += 1;
  }

  return selected
    .map(([id], index) => ({
      id,
      name: weaponDef(id)?.name ?? id,
      damage: rounded[index],
      isEvolution: isEvolutionWeapon(id),
    }))
    .sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));
}
