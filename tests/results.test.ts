import { describe, expect, it } from "vitest";
import {
  collapseEvolutionDamage, damageTable, damageTotal, layoutResultRows, resultsLayout, stressEntries,
} from "../src/logic/results";
import { slotNameLines } from "../src/logic/text";
import { WEAPONS } from "../src/data/weapons";
import { EVOLUTION_WEAPONS } from "../src/data/evolution-weapons";

const ALL_WEAPON_IDS = [...Object.keys(WEAPONS), ...Object.keys(EVOLUTION_WEAPONS)];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("M10 Results: Gesamtschaden und Rundung", () => {
  it("0 Waffen: leere Tabelle, Gesamtschaden 0", () => {
    expect(damageTable({})).toEqual([]);
    expect(damageTotal({})).toBe(0);
  });

  it("1 Waffe: kaufmaennische Rundung, Summe = Gesamtschaden", () => {
    const table = damageTable({ ember: 12.6 });
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ id: "ember", name: "Glutfunke", damage: 13 });
    expect(sum(table.map((e) => e.damage))).toBe(damageTotal({ ember: 12.6 }));
  });

  it("viele Waffen: Largest-Remainder, Summe exakt = HUD-Gesamtschaden", () => {
    const baseIds = Object.keys(WEAPONS);
    const input = Object.fromEntries(baseIds.map((id, i) => [id, 100.4 + i * 37.3]));
    const table = damageTable(input);
    const total = damageTotal(input);
    expect(table).toHaveLength(baseIds.length);
    expect(sum(table.map((e) => e.damage))).toBe(total);
    expect(total).toBe(Math.round(sum(Object.values(input))));
  });

  it("Rundungs-Reste gehen an die groessten Nachkommareste (deterministisch)", () => {
    const input = { ember: 0.5, flail: 0.5, frost: 0.5 };
    const table = damageTable(input);
    expect(sum(table.map((e) => e.damage))).toBe(2);
    expect(table.map((e) => e.damage).sort((a, b) => b - a)).toEqual([1, 1, 0]);
  });

  it("filtert NaN/Infinity/0/negative Werte", () => {
    const table = damageTable({ ember: Number.NaN, flail: Number.POSITIVE_INFINITY, frost: 0, thorn: -5 });
    expect(table).toEqual([]);
    expect(damageTotal({ ember: Number.NaN, frost: -5, flail: 4 })).toBe(4);
  });

  it("Sortierung absteigend, Gleichstand deterministisch nach id", () => {
    const table = damageTable({ flail: 500, ember: 500, frost: 900 });
    expect(table.map((e) => e.id)).toEqual(["frost", "ember", "flail"]);
    expect(damageTable({ flail: 500, ember: 500, frost: 900 })).toEqual(table);
  });

  it("respektiert das Tabellenlimit", () => {
    expect(damageTable({ ember: 10, flail: 20, frost: 30 }, 2)).toHaveLength(2);
    expect(damageTable({ ember: 10 }, 0)).toHaveLength(0);
  });
});

describe("M10 Results: Evolutions-Slot-Ersetzung", () => {
  it("Basis-Schaden geht in die Evolutionszeile ueber, Summe bleibt erhalten", () => {
    const input = { ember: 1000, phoenix: 5000, frost: 250 };
    const collapsed = collapseEvolutionDamage(input);
    expect(collapsed).toEqual({ phoenix: 6000, frost: 250 });
    expect(damageTotal(collapsed)).toBe(damageTotal(input));

    const table = damageTable(input);
    expect(table.map((e) => e.id)).toEqual(["phoenix", "frost"]);
    expect(table[0]).toMatchObject({ name: "Phönixschwarm", damage: 6000, isEvolution: true });
    expect(sum(table.map((e) => e.damage))).toBe(6250);
  });

  it("Basiswaffe ohne Evolution bleibt als eigene Zeile stehen", () => {
    expect(damageTable({ ember: 700, thorn: 120 }).map((e) => e.id)).toEqual(["ember", "thorn"]);
  });

  it("alle sechs Evolutionspaare werden ohne Doppel-Slot zusammengefasst", () => {
    const input: Record<string, number> = {};
    for (const id of ALL_WEAPON_IDS) input[id] = 10;
    const rows = damageTable(input);
    expect(rows).toHaveLength(6);
    expect(rows.every((e) => e.isEvolution)).toBe(true);
    expect(sum(rows.map((e) => e.damage))).toBe(damageTotal(input));
  });
});

describe("M10 Results: Layout Namensumbruch und Ueberlappung", () => {
  const names = stressEntries().map((entry) => entry.name.toUpperCase());

  it("alle 12 Waffennamen vollstaendig auf max. 2 Zeilen", () => {
    expect(names).toHaveLength(12);
    for (const name of names) {
      const lines = slotNameLines(name, 15);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join("")).toBe(name);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(15);
    }
  });

  it("12-Zeilen-Stresstabelle: 0 Ueberlappungen bei 640x360 und 1920x1080", () => {
    const entries = stressEntries();
    for (const width of [640, 1920]) {
      const layout = layoutResultRows(entries, { width, oy: 45, rowsTop: 70 });
      expect(layout.rows).toHaveLength(12);
      expect(layout.overlaps).toEqual([]);
      for (const row of layout.rows) {
        expect(row.nameRects.length).toBeLessThanOrEqual(2);
        for (const rect of row.nameRects) {
          expect(rect.x + rect.w).toBeLessThanOrEqual(row.barBg.x);
        }
      }
    }
  });

  it("Banner, Trennlinie und Gesamt-Label kollidieren mit keinem Text", () => {
    const layout = resultsLayout({ ember: 900, flail: 500, frost: 300 }, { width: 640, oy: 45 });
    expect(layout.overlaps).toEqual([]);
    expect(layout.totalLabel.w).toBeGreaterThan(0);
    expect(layout.banner.x + layout.banner.w).toBeLessThan(layout.divider.x);
    expect(layout.totalLabel.x).toBeGreaterThan(layout.divider.x);
  });
});
