import { beforeEach, describe, expect, it, vi } from "vitest";

// DamageNumbers.ts importiert Phaser nur fuer PixelText/Scene — fuer die
// reinen Darstellungs-Helfer genuegt ein Container-Stub (kein DOM-Phaser).
vi.mock("phaser", () => {
  class Container {
    scene: unknown;
    children: unknown[] = [];
    constructor(scene: unknown) { this.scene = scene; }
    add(child: unknown) { this.children.push(child); return this; }
    setDepth() { return this; }
  }
  return { default: { GameObjects: { Container } } };
});

import {
  DAMAGE_ANCHOR_BELOW, DAMAGE_GRID_CELL_H, DAMAGE_GRID_CELL_W, DAMAGE_GRID_MAX_CELLS,
  DAMAGE_K_THRESHOLD, DAMAGE_LABEL_MAX_CHARS, DAMAGE_SINK_PX,
  formatDamageLabel, gridCellKey, pickGridSlot,
} from "../src/systems/DamageNumbers";

/** Rect eines 6-Zeichen-Krit-Labels (schlimmster Fall: Scale 1,6). */
function critRect(x: number, y: number): { x: number; y: number; w: number; h: number } {
  const chars = DAMAGE_LABEL_MAX_CHARS;
  return { x, y, w: Math.ceil((chars * 6 - 1) * 1.6), h: Math.ceil(7 * 1.6) };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0;
}

describe("M10 Damage-Grid: Kuerzung formatDamageLabel (B4: 6-stellige Werte dominieren)", () => {
  it("Werte unter der Schwelle bleiben unveraendert (inkl. Krit-!)", () => {
    expect(formatDamageLabel(4577, false)).toBe("4577");
    expect(formatDamageLabel(4577, true)).toBe("4577!");
    expect(formatDamageLabel(1, true)).toBe("1!");
    expect(formatDamageLabel(0.4, false)).toBe("1"); // Mindestwert 1
  });

  it(">= 100.000 wird als k-Wert mit deutschem Komma gekuerzt", () => {
    expect(formatDamageLabel(184526, false)).toBe("184,5k");
    expect(formatDamageLabel(101266, false)).toBe("101,3k");
    expect(formatDamageLabel(100000, false)).toBe("100k"); // ,0 entfaellt
    expect(formatDamageLabel(999499, false)).toBe("999,5k");
    expect(formatDamageLabel(DAMAGE_K_THRESHOLD - 1, false)).toBe("99999");
  });

  it("Krit-Highlight bleibt erhalten; passt die Nachkommastelle nicht, ganze k", () => {
    expect(formatDamageLabel(184526, true)).toBe("185k!");
    expect(formatDamageLabel(999500, true)).toBe("1000k!");
    expect(formatDamageLabel(101266, true)).toBe("101k!"); // 101,3k! = 7 Zeichen
  });

  it("max. 6 Zeichen inkl. '!' ueber den ganzen Wertebereich", () => {
    const values = [1, 9999, 99999, 100000, 184526, 999499, 999500, 1000000,
      12345678, 123456789, 987654321, 1e9, 1e12, 1.5e15];
    for (const v of values) {
      for (const crit of [false, true]) {
        const s = formatDamageLabel(v, crit);
        expect(s.length).toBeLessThanOrEqual(DAMAGE_LABEL_MAX_CHARS);
        expect(s.endsWith("!")).toBe(crit);
      }
    }
    expect(formatDamageLabel(12345678, false)).toBe("12346k");
    expect(formatDamageLabel(12345678, true)).toBe("1234k!");
  });

  it("kein NaN/Infinity-Label", () => {
    expect(formatDamageLabel(Number.NaN, true)).toBe("1!");
    expect(formatDamageLabel(Number.POSITIVE_INFINITY, false)).toBe("1");
  });
});

describe("M10 Damage-Grid: Grid-Offset bei Kollision (B4: '184526!' ueberlappt '4577')", () => {
  it("freier Slot: Label bleibt exakt an der Gegner-Position", () => {
    const slot = pickGridSlot(300, 180, new Set());
    expect(slot).toEqual({ x: 300, y: 180, key: gridCellKey(300, 180) });
  });

  it("belegter Slot: Umlauf um ganze Zellen, deterministisch, nie nach oben", () => {
    const occupied = new Set([gridCellKey(100, 100)]);
    const a = pickGridSlot(100, 100, occupied);
    const b = pickGridSlot(100, 100, occupied);
    expect(a).toEqual(b); // gleiche Eingaben -> gleicher Slot (kein Flackern)
    expect(a.key).not.toBe(occupied.values().next().value);
    // Offset ist ein ganzzahliges Vielfaches der Zellengroesse.
    const dx = (a.x - 100) / DAMAGE_GRID_CELL_W;
    const dy = (a.y - 100) / DAMAGE_GRID_CELL_H;
    expect(Number.isInteger(dx)).toBe(true);
    expect(Number.isInteger(dy)).toBe(true);
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
    expect(dy).toBeGreaterThanOrEqual(0); // nie ueber das Anker-Sprite
    expect(a.key).toBe(`${Math.round(100 / DAMAGE_GRID_CELL_W) - 1},${Math.round(100 / DAMAGE_GRID_CELL_H)}`);
  });

  it("Spirale erzeugt nie einen Versatz nach oben (dy < 0)", () => {
    // Der natuerliche Slot plus alle Zellen darunter/daneben sind belegt:
    // trotz freier Zellen oberhalb muss die Spirale dy >= 0 wahren.
    const bx = Math.round(300 / DAMAGE_GRID_CELL_W);
    const by = Math.round(200 / DAMAGE_GRID_CELL_H);
    const occupied = new Set<string>();
    for (let dy = 0; dy <= DAMAGE_GRID_MAX_CELLS; dy++) {
      for (let dx = -DAMAGE_GRID_MAX_CELLS; dx <= DAMAGE_GRID_MAX_CELLS; dx++) {
        occupied.add(`${bx + dx},${by + dy}`);
      }
    }
    const slot = pickGridSlot(300, 200, occupied);
    const dy = (slot.y - 200) / DAMAGE_GRID_CELL_H;
    expect(dy).toBeGreaterThanOrEqual(0); // Sättigungs-Fallback ist dy = 0
  });

  it("Cluster-Repro: 12 Labels in 3 Gegner-Trauben ueberlappen nie", () => {
    // Wie im 500er-Chaos: Gegner sitzen eng beieinander (18 px Versatz), die
    // natuerlichen Slots landen in derselben Grid-Zelle -> Spirale muss greifen.
    const bases: Array<[number, number]> = [];
    for (let c = 0; c < 3; c++) {
      const cx = 110 + c * 230;
      const cy = 110 + (c % 2) * 90;
      bases.push([cx, cy], [cx + 18, cy], [cx, cy + 10], [cx + 18, cy + 10]);
    }
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const occupied = new Set<string>();
    for (const [bx, by] of bases) {
      const rect = critRect(bx, by + DAMAGE_ANCHOR_BELOW);
      // Wie im System: Rect inkl. Sink-Reserve an die Slot-Suche geben.
      const slot = pickGridSlot(rect.x, rect.y, occupied, rect.w, rect.h + DAMAGE_SINK_PX, placed);
      occupied.add(slot.key);
      placed.push({ ...critRect(slot.x, slot.y), h: critRect(slot.x, slot.y).h + DAMAGE_SINK_PX });
    }
    let pairs = 0;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (overlaps(placed[i], placed[j])) pairs += 1;
      }
    }
    expect(pairs).toBe(0);
    expect(occupied.size).toBe(12); // jeder Label hat seinen eigenen Slot
  });

  it("Anker-Sprite bleibt frei: Umlauf verschiebt nie nach oben (y nie < Basis)", () => {
    const baseX = 300;
    const baseY = 150;
    for (let n = 1; n <= 6; n++) {
      const occupied = new Set<string>();
      const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (let i = 0; i < n; i++) {
        const rect = critRect(baseX, baseY);
        const slot = pickGridSlot(baseX, baseY, occupied, rect.w, rect.h + DAMAGE_SINK_PX, placed);
        occupied.add(slot.key);
        placed.push({ ...critRect(slot.x, slot.y), h: critRect(slot.x, slot.y).h + DAMAGE_SINK_PX });
        expect(slot.y).toBeGreaterThanOrEqual(baseY); // never above the anchor
      }
    }
  });

  it("Spirale bleibt begrenzt: bei Volllage eigene Key + natuerliche Position", () => {
    const bx = 400;
    const by = 200;
    const occupied = new Set<string>();
    for (let dy = -DAMAGE_GRID_MAX_CELLS; dy <= DAMAGE_GRID_MAX_CELLS; dy++) {
      for (let dx = -DAMAGE_GRID_MAX_CELLS; dx <= DAMAGE_GRID_MAX_CELLS; dx++) {
        occupied.add(`${Math.round(bx / DAMAGE_GRID_CELL_W) + dx},${Math.round(by / DAMAGE_GRID_CELL_H) + dy}`);
      }
    }
    const slot = pickGridSlot(bx, by, occupied);
    expect(slot.x).toBe(bx);
    expect(slot.y).toBe(by);
    expect(slot.key.startsWith("sat,")).toBe(true);
  });
});

describe("M10 Damage-Grid: Anker unterhalb des Gegners (B4: Sprites verdeckt)", () => {
  it("Anker liegt unterhalb des Zentrums, Sink driftet weiter weg vom Sprite", () => {
    expect(DAMAGE_ANCHOR_BELOW).toBeGreaterThan(0);
    expect(DAMAGE_SINK_PX).toBeGreaterThan(0);
  });

  it("Label-Rect ueberdeckt das Sprite-Zentrum nicht (worst case Krit + Sink)", () => {
    const enemyY = 200;
    const baseY = enemyY + DAMAGE_ANCHOR_BELOW;
    const rect = critRect(300, baseY);
    const sunk = { ...rect, y: rect.y + DAMAGE_SINK_PX };
    expect(baseY).toBeGreaterThan(enemyY); // Label beginnt unterhalb des Zentrums
    expect(sunk.y).toBeGreaterThan(enemyY);
    expect(enemyY >= sunk.y && enemyY <= sunk.y + sunk.h).toBe(false);
  });

  it("Raster-Zellen hoch genug: Absinken erreicht die Nachbarzeile nicht", () => {
    // Worst case: Nachbar-Label frisch aktiviert (p=0) unter einem Label am
    // Fade-Ende (p=0.9, Drift 0,9x): Zellenhoehe >= Drift + Glyphenhoehe.
    const worst = Math.ceil(0.9 * DAMAGE_SINK_PX + 7 * 1.6);
    expect(DAMAGE_GRID_CELL_H).toBeGreaterThanOrEqual(worst);
  });
});
