import { weaponDef, isEvolutionWeapon } from "../data/weaponIds";
import { EVOLUTIONS } from "../data/evolutions";
import { slotNameLines } from "./text";

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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResultLayoutRow {
  id: string;
  name: string;
  damage: number;
  isEvolution: boolean;
  lines: string[];
  y: number;
  icon: Rect;
  nameRects: Rect[];
  barBg: Rect;
  barFill: Rect;
  valueText: string;
  valueRect: Rect;
}

export interface ResultsLayoutOptions {
  width?: number;
  /** Vertikaler Offset der Szenen-Mitte (Results nutzt round((H-270)/2)). */
  oy?: number;
  rowsTop?: number;
  limit?: number;
  /** Bereits gerundeter Gesamtschaden fuer das "GESAMT:"-Label. */
  totalDamage?: number;
}

export interface ResultsLayout {
  rows: ResultLayoutRow[];
  header: Rect;
  totalLabel: Rect;
  divider: Rect;
  banner: Rect;
  overlaps: string[];
}

function sumRounded(entries: DamageEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.damage, 0);
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Layout des Ergebnis-Screens als reine Funktion, damit der echte Screen und
 * die Tests dieselben Rechtecke sehen. Namen laufen ueber slotNameLines auf
 * max. 2 Zeilen; Zeilen mit Umbruch bekommen mehr Hoehe. `overlaps` listet
 * jede Ueberlappung (Text vs. Trennlinie/Banner/Balken/Zahlen) mit Namen.
 */
export function layoutResultRows(
  entries: DamageEntry[],
  options: ResultsLayoutOptions = {},
): ResultsLayout {
  const width = options.width ?? 640;
  const oy = options.oy ?? 45;
  const cx = width / 2;
  const nameX = cx + 6;
  const barX = cx + 104;
  const barW = 70;
  const valueRightX = cx + 204;
  const nameMaxWidth = barX - nameX - 4;
  const nameMaxChars = Math.max(1, Math.floor((nameMaxWidth + 1) / 6));
  const maxDamage = entries.reduce((m, e) => Math.max(m, e.damage), 1);

  let y = (options.rowsTop ?? 64) + oy;
  const rows: ResultLayoutRow[] = entries.map((entry) => {
    const lines = slotNameLines(entry.name.toUpperCase(), nameMaxChars);
    const nameRects = lines.map((line, i) => ({
      x: nameX, y: y + i * 8, w: Math.max(1, line.length * 6 - 1), h: 7,
    }));
    // 16-px-Zeilen passen zu den 16-px-Icons; zwei Textzeilen liegen bei +0/+8.
    const rowHeight = 16;
    const valueText = formatDamageCompact(entry.damage);
    const valueRect = {
      x: valueRightX - Math.max(0, valueText.length * 6 - 1),
      y, w: Math.max(1, valueText.length * 6 - 1), h: 7,
    };
    const row: ResultLayoutRow = {
      id: entry.id,
      name: entry.name,
      damage: entry.damage,
      isEvolution: entry.isEvolution,
      lines,
      y,
      icon: { x: cx - 20, y: y - 1, w: 16, h: 16 },
      nameRects,
      barBg: { x: barX, y: y + 3, w: barW, h: 5 },
      barFill: { x: barX, y: y + 3, w: Math.max(2, Math.round(entry.damage / maxDamage * barW)), h: 5 },
      valueText,
      valueRect,
    };
    y += rowHeight;
    return row;
  });

  const headerText = "SCHADEN PRO WAFFE";
  const totalText = `GESAMT: ${formatDamageCompact(options.totalDamage ?? sumRounded(entries))}`;
  const header: Rect = { x: cx - 20, y: 46 + oy, w: headerText.length * 6 - 1, h: 7 };
  const totalLabel: Rect = { x: cx - 20, y: 56 + oy, w: totalText.length * 6 - 1, h: 7 };
  const divider: Rect = { x: cx - 35, y: 107 + oy, w: 2, h: 140 };
  const banner: Rect = { x: cx - 200, y: 187 + oy, w: 164, h: 17 };

  const named: { label: string; rect: Rect }[] = [
    { label: "header", rect: header },
    { label: "total", rect: totalLabel },
    { label: "divider", rect: divider },
    { label: "banner", rect: banner },
  ];
  for (const row of rows) {
    named.push({ label: `${row.id}:icon`, rect: row.icon });
    row.nameRects.forEach((rect, i) => named.push({ label: `${row.id}:name${i}`, rect }));
    named.push({ label: `${row.id}:bar`, rect: row.barBg });
    named.push({ label: `${row.id}:value`, rect: row.valueRect });
  }
  const overlaps: string[] = [];
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      if (intersects(named[i].rect, named[j].rect)) {
        overlaps.push(`${named[i].label}|${named[j].label}`);
      }
    }
  }

  return { rows, header, totalLabel, divider, banner, overlaps };
}

/** Komfort-Wrapper: Schadenstabelle + Layout in einem Schritt. */
export function resultsLayout(
  damageByWeapon: Record<string, number>,
  options: ResultsLayoutOptions = {},
): ResultsLayout {
  const entries = damageTable(damageByWeapon, options.limit ?? 12);
  return layoutResultRows(entries, {
    ...options,
    totalDamage: options.totalDamage ?? damageTotal(damageByWeapon),
  });
}

/** Alle 12 moeglichen Waffennamen als Layout-Stresstabelle (Test/Beleg). */
export function stressEntries(): DamageEntry[] {
  const ids = [
    "ember", "phoenix", "flail", "wrath_pendulum", "frost", "eternal_winter",
    "thorn", "thorn_storm", "storm", "thunder_seal", "lantern", "soul_beacon",
  ];
  return ids.map((id, i) => ({
    id,
    name: weaponDef(id)?.name ?? id,
    damage: 300000 - i * 21000,
    isEvolution: isEvolutionWeapon(id),
  }));
}
