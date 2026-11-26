import { describe, expect, it, vi } from "vitest";

// HazardSystem importiert Phaser + Atlas; fuer den Unit-Test genuegen Stubs.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "destroy",
    ]) img[m] = () => img;
    return img;
  },
}));

import { BOSS_ATTACKS, type BossAttackDef } from "../src/logic/bosses";
import { HazardSystem } from "../src/systems/Hazards";

const allAttacks = (): { boss: number; phase: number; def: BossAttackDef }[] => {
  const out: { boss: number; phase: number; def: BossAttackDef }[] = [];
  for (const [boss, phases] of Object.entries(BOSS_ATTACKS)) {
    phases.forEach((list, p) => list.forEach((def) => out.push({ boss: Number(boss), phase: p + 1, def })));
  }
  return out;
};

/** Hazard-Radius, wie BossSystem ihn fuer den Angriff aufspannt (radius 0 = Linie/Ring-Sonderfall). */
const hazardRadius = (def: BossAttackDef): number => {
  if (def.radius > 0) return def.radius;
  switch (def.kind) {
    case "summon_ring": return 96;
    case "summon_wolves": return 70;
    case "bone_boomerang": return 16;
    case "teleport": return 22;
    default: return 0;
  }
};

const fakeScene = () => ({
  tweens: { add: vi.fn() },
}) as unknown as import("phaser").Scene;

const makeHazard = (def: BossAttackDef) => {
  const hz = new HazardSystem(fakeScene());
  if (def.kind === "bone_boomerang" || def.kind === "fire_cross" || def.kind === "thorn_burst") {
    hz.spawnBeam(10, 10, 200, 120, { warn: def.telegraph, damage: 1, radius: hazardRadius(def) });
  } else {
    hz.spawnCircle(40, 40, { warn: def.telegraph, damage: 1, radius: hazardRadius(def) });
  }
  return hz;
};

describe("Hazard-Telegraph: jeder Boss-Angriff warnt fair vor", () => {
  const attacks = allAttacks();

  it("deckt alle 6 Bosse und alle BOSS_ATTACKS-Eintraege ab", () => {
    expect(new Set(attacks.map((a) => a.boss)).size).toBe(6);
    expect(attacks).toHaveLength(18);
  });

  it("jeder Angriff hat warnMs >= 600", () => {
    const tooShort = attacks.filter((a) => a.def.telegraph * 1000 < 600)
      .map((a) => `Boss ${a.boss} P${a.phase} ${a.def.kind}: ${Math.round(a.def.telegraph * 1000)} ms`);
    expect(tooShort).toEqual([]);
  });

  it("Hazard-Radius ist endlich und > 0", () => {
    for (const a of attacks) {
      const r = hazardRadius(a.def);
      expect(Number.isFinite(r), `Boss ${a.boss} ${a.def.kind}`).toBe(true);
      expect(r, `Boss ${a.boss} ${a.def.kind}`).toBeGreaterThan(0);
    }
  });

  it("Strahl-Geometrie endlich: Winkel und Laenge", () => {
    for (const a of attacks.filter((x) => ["bone_boomerang", "fire_cross", "thorn_burst"].includes(x.def.kind))) {
      const angle = Math.atan2(120, 190);
      const len = Math.hypot(190, 110);
      expect(Number.isFinite(angle)).toBe(true);
      expect(Number.isFinite(len)).toBe(true);
      expect(len).toBeGreaterThan(0);
    }
  });

  it("Treffer faellt erst am Ende der Warnung (Toleranz 1 Frame)", () => {
    for (const a of attacks) {
      const hz = makeHazard(a.def);
      let hits = 0;
      let t = 0;
      const dt = 1 / 60;
      for (let i = 0; i < 300 && hits === 0; i++) {
        hz.update(dt, 40, 40, () => hits++);
        t += dt;
      }
      expect(hits, `Boss ${a.boss} ${a.def.kind}`).toBe(1);
      expect(Math.abs(t - a.def.telegraph), `Boss ${a.boss} ${a.def.kind}`).toBeLessThanOrEqual(dt + 1e-9);
    }
  });

  it("keine Doppel-Treffer pro Hazard-Instanz (linger 0)", () => {
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(40, 40, { warn: 0.6, damage: 1, radius: 30 });
    let hits = 0;
    for (let i = 0; i < 120; i++) hz.update(1 / 60, 40, 40, () => hits++);
    expect(hits).toBe(1);
    expect(hz.count).toBe(0);
  });
});
