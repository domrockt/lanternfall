import { describe, expect, it } from "vitest";
import { SeededRng, type Rng } from "../src/logic/rng";
import { canEvolve, chestRewards, chestUpgradeCount, evolvableList } from "../src/logic/evolution";
import { EVOLUTIONS } from "../src/data/evolutions";
import { EVOLUTION_WEAPONS } from "../src/data/evolution-weapons";
import { weaponDef, isEvolutionWeapon } from "../src/data/weaponIds";
import { EVOLUTION_WEAPON_IDS } from "../src/data/types";
import { LevelUpSystem } from "../src/systems/LevelUpSystem";

const w = (id: string, level: number) => ({ id, level });
const p = (id: string, level: number) => ({ id, level });

describe("Evolution-Regeln (canEvolve)", () => {
  it("nur mit Basiswaffe Stufe 8 + passendem Powerup >= 1", () => {
    expect(canEvolve([w("ember", 7)], [p("tome", 1)])).toBeNull();
    expect(canEvolve([w("ember", 8)], [p("tome", 0)])).toBeNull();
    expect(canEvolve([w("ember", 8)], [])).toBeNull();
    const evo = canEvolve([w("ember", 8)], [p("tome", 1)]);
    expect(evo?.id).toBe("phoenix");
    expect(evo?.baseWeapon).toBe("ember");
    expect(evo?.passive).toBe("tome");
  });

  it("alle 6 Evolutionen sind erreichbar", () => {
    const weapons = EVOLUTIONS.map((e) => w(e.baseWeapon, 8));
    const passives = EVOLUTIONS.map((e) => p(e.passive, 1));
    expect(evolvableList(weapons, passives)).toHaveLength(6);
  });

  it("bereits evolvierte Waffe wird nicht erneut angeboten", () => {
    expect(canEvolve([w("phoenix", 8)], [p("tome", 1)])).toBeNull();
  });

  it("falsches Powerup evolviert nicht", () => {
    expect(canEvolve([w("ember", 8)], [p("boots", 5)])).toBeNull();
  });
});

describe("Truhen-Belohnungen (chestRewards)", () => {
  it("Anzahl 1/3/5 steigt mit der Zeit (deterministisch über RNG)", () => {
    const fixed = (v: number) => ({ next: () => v }) as unknown as Rng;
    expect(chestUpgradeCount(0, fixed(0.99))).toBe(1);
    expect(chestUpgradeCount(900, fixed(0.05))).toBe(5);
    expect(chestUpgradeCount(1800, fixed(0.2))).toBe(5);
    const early = chestUpgradeCount(0, new SeededRng(1));
    const late = chestUpgradeCount(1800, new SeededRng(1));
    expect([1, 3, 5]).toContain(early);
    expect([1, 3, 5]).toContain(late);
  });

  it("Evolution hat Vorrang im ersten Slot", () => {
    const result = chestRewards([w("ember", 8)], [p("tome", 1)], 1200, new SeededRng(2));
    expect(result.rewards[0].kind).toBe("evolution");
    expect(result.rewards[0].id).toBe("phoenix");
    expect(result.rewards.length).toBe(result.count);
    // Die Basiswaffe (ember) darf nicht als normales Upgrade auftauchen.
    expect(result.rewards.some((r) => r.id === "ember")).toBe(false);
    for (const r of result.rewards) {
      if (r.kind === "weapon") expect(isEvolutionWeapon(r.id)).toBe(false);
    }
  });

  it("ohne Evolution sind alle Belohnungen gültige Upgrades", () => {
    const result = chestRewards(
      [w("ember", 3), w("thorn", 6)],
      [p("boots", 2), p("heart", 5)],
      1800,
      new SeededRng(7),
    );
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeLessThanOrEqual(5);
    expect(result.rewards).toHaveLength(result.count);
    expect(result.rewards.every((r) => r.kind !== "evolution")).toBe(true);
    for (const r of result.rewards) {
      if (r.kind === "weapon") expect(r.level).toBeGreaterThanOrEqual(1);
      if (r.kind === "passive") expect(r.level).toBeGreaterThanOrEqual(1);
      expect(r.level).toBeLessThanOrEqual(8);
    }
  });

  it("volle maxed Slots → nur Evolution oder leere Liste", () => {
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 8));
    const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => p(id, 5));
    const result = chestRewards(weapons, passives, 1800, new SeededRng(3));
    expect(result.rewards.every((r) => r.kind === "evolution")).toBe(true);
  });
});

describe("Evolutionsdaten", () => {
  it("6 evolvierte Waffen, je 8 Stufen, deutlich stärker als Basis", () => {
    expect(EVOLUTION_WEAPON_IDS).toHaveLength(6);
    for (const id of EVOLUTION_WEAPON_IDS) {
      const def = weaponDef(id);
      expect(def, id).not.toBeNull();
      expect(def!.implemented).toBe(true);
      expect(def!.levels).toHaveLength(8);
      expect(EVOLUTION_WEAPONS[id]).toBeTruthy();
    }
    expect(weaponDef("phoenix")!.levels[7].damage).toBeGreaterThan(28);
    expect(weaponDef("wrath_pendulum")!.levels[7].damage).toBeGreaterThan(40);
    expect(weaponDef("thunder_seal")!.levels[7].chain).toBe(8);
    expect(weaponDef("thorn_storm")!.levels[7].pierce).toBe(999);
  });
});

describe("Evolution ersetzt die Basiswaffe im Slot", () => {
  it("LevelUpSystem.evolve tauscht id im selben Slot", () => {
    const sys = new LevelUpSystem("ember", 8);
    sys.addPassive("tome", 1);
    const before = sys.weapons.length;
    expect(sys.evolve("phoenix")).toBe(true);
    expect(sys.weapons).toHaveLength(before);
    expect(sys.weapons[0].id).toBe("phoenix");
    expect(sys.weapons[0].level).toBe(8);
    expect(sys.evolve("phoenix")).toBe(false);
  });

  it("addWeapon mit Evolutions-ID ersetzt die Basis statt einen zweiten Slot zu belegen", () => {
    const sys = new LevelUpSystem("flail", 8);
    sys.addWeapon("wrath_pendulum", 8);
    expect(sys.weapons).toHaveLength(1);
    expect(sys.weapons[0].id).toBe("wrath_pendulum");
  });
});
