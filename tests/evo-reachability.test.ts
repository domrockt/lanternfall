import { describe, expect, it, afterEach } from "vitest";
import { SeededRng, type Rng } from "../src/logic/rng";
import { canEvolve, chestRewards, evolvableList, evolutionReadyList } from "../src/logic/evolution";
import { generateOffers } from "../src/logic/levelup";
import { EVOLUTIONS } from "../src/data/evolutions";
import { LevelUpSystem } from "../src/systems/LevelUpSystem";
import type { EvolutionDef } from "../src/data/types";
import type { OwnedItem } from "../src/logic/levelup";

const w = (id: string, level: number): OwnedItem => ({ id, level });
const p = (id: string, level: number): OwnedItem => ({ id, level });
const rng = () => new SeededRng(4711);

/** Alle 6 Kombinationen Basiswaffe (Stufe 8) + passendes Powerup. */
const fullBuilds = EVOLUTIONS.filter((e) => e.implemented).map((evo) => ({
  evo,
  weapons: [w(evo.baseWeapon, 8)] as OwnedItem[],
  passives: [p(evo.passive, 1)] as OwnedItem[],
}));

describe("Evolution-Reachability: alle 6 Evolutionen erreichbar", () => {
  it("6/6 über evolvableList (Gate: Basiswaffe 8 + Powerup >= 1)", () => {
    for (const { evo, weapons, passives } of fullBuilds) {
      const list = evolvableList(weapons, passives);
      expect(list.some((e) => e.id === evo.id), evo.id).toBe(true);
      expect(canEvolve(weapons, passives)?.id, evo.id).toBe(evo.id);
    }
  });

  it("6/6 über evolutionReadyList ohne Duplikate", () => {
    for (const { evo, weapons, passives } of fullBuilds) {
      const list = evolutionReadyList(weapons, passives);
      expect(list.some((e) => e.id === evo.id), evo.id).toBe(true);
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size, evo.id).toBe(ids.length);
    }
  });

  it("6/6 über den Level-Up-Pfad (generateOffers, Slot 0, applyOffer)", () => {
    for (const { evo, weapons, passives } of fullBuilds) {
      const offers = generateOffers(weapons, passives, rng(), 3, true);
      expect(offers[0]?.kind, evo.id).toBe("weapon");
      expect(offers[0]?.id, evo.id).toBe(evo.id);
      const sys = new LevelUpSystem("ember");
      sys.weapons = weapons.map((x) => ({ ...x, timer: 0 })) as typeof sys.weapons;
      sys.passives = passives.map((x) => ({ ...x }));
      sys.applyOffer(offers[0]);
      expect(sys.weapons.some((x) => x.id === evo.id), evo.id).toBe(true);
      expect(sys.weapons.some((x) => x.id === evo.baseWeapon), evo.id).toBe(false);
      expect(sys.passives.some((x) => x.id === evo.passive), evo.id).toBe(true);
    }
  });

  it("6/6 über den Truhe-Pfad (chestRewards, Slot 0, applyChestReward)", () => {
    for (const { evo, weapons, passives } of fullBuilds) {
      const result = chestRewards(weapons, passives, 600, rng());
      const evoReward = result.rewards.find((r) => r.kind === "evolution");
      expect(evoReward?.id, evo.id).toBe(evo.id);
      expect(result.rewards[0]?.kind, evo.id).toBe("evolution");
      const sys = new LevelUpSystem("ember");
      sys.weapons = weapons.map((x) => ({ ...x, timer: 0 })) as typeof sys.weapons;
      sys.passives = passives.map((x) => ({ ...x }));
      sys.applyChestReward(result.rewards[0]);
      expect(sys.weapons.some((x) => x.id === evo.id), evo.id).toBe(true);
      expect(sys.weapons.some((x) => x.id === evo.baseWeapon), evo.id).toBe(false);
      expect(sys.passives.some((x) => x.id === evo.passive), evo.id).toBe(true);
    }
  });
});

describe("Evolution-Reachability: Gate-Negativfälle", () => {
  it("Grenzfall Stufe 7 vs 8: Level 7 bietet keine Evolution (beide Pfade)", () => {
    for (const { evo } of fullBuilds) {
      const weapons = [w(evo.baseWeapon, 7)];
      const passives = [p(evo.passive, 1)];
      expect(canEvolve(weapons, passives), evo.id).toBeNull();
      const offers = generateOffers(weapons, passives, rng(), 3, true);
      expect(offers.some((o) => o.id === evo.id), evo.id).toBe(false);
      const chest = chestRewards(weapons, passives, 600, rng());
      expect(chest.rewards.some((r) => r.kind === "evolution"), evo.id).toBe(false);
    }
  });

  it("nicht erreichbar ohne passendes Powerup", () => {
    for (const { evo } of fullBuilds) {
      // gar kein Powerup:
      expect(canEvolve([w(evo.baseWeapon, 8)], []), evo.id).toBeNull();
      // Powerup auf Level 0 wird als fehlend gewertet:
      expect(canEvolve([w(evo.baseWeapon, 8)], [p(evo.passive, 0)]), evo.id).toBeNull();
      // entsprechend auch in beiden Angebots-Pfaden:
      const offers = generateOffers([w(evo.baseWeapon, 8)], [], rng(), 3, true);
      expect(offers.some((o) => o.id === evo.id), evo.id).toBe(false);
      const chest = chestRewards([w(evo.baseWeapon, 8)], [], 600, rng());
      expect(chest.rewards.some((r) => r.kind === "evolution"), evo.id).toBe(false);
    }
  });

  it("falsches Powerup evolviert nicht (auch mit zweitem, richtigem Versuch davor)", () => {
    for (let i = 0; i < EVOLUTIONS.length; i++) {
      const evo = EVOLUTIONS[i];
      const wrong = EVOLUTIONS[(i + 1) % EVOLUTIONS.length].passive;
      // nur falsches Powerup:
      expect(canEvolve([w(evo.baseWeapon, 8)], [p(wrong, 5)]), evo.id).toBeNull();
      // falsches + richtiges Powerup: Evolution kommt, aber genau einmal:
      const list = evolvableList([w(evo.baseWeapon, 8)], [p(wrong, 5), p(evo.passive, 1)]);
      expect(list.filter((e) => e.id === evo.id), evo.id).toHaveLength(1);
    }
  });

  it("keine Doppel-Evolution: bereits evolvierte Waffe blockt beide Pfade", () => {
    for (const { evo } of fullBuilds) {
      expect(canEvolve([w(evo.id, 8)], [p(evo.passive, 1)]), evo.id).toBeNull();
      const offers = generateOffers([w(evo.id, 8)], [p(evo.passive, 1)], rng(), 3, true);
      expect(offers.some((o) => o.id === evo.id), evo.id).toBe(false);
      const chest = chestRewards([w(evo.id, 8)], [p(evo.passive, 1)], 600, rng());
      expect(chest.rewards.some((r) => r.kind === "evolution"), evo.id).toBe(false);
    }
  });

  it("zweites Powerup (Stufe 5) ändert nichts: keine Duplikate, genau eine Evolution", () => {
    for (let i = 0; i < EVOLUTIONS.length; i++) {
      const evo = EVOLUTIONS[i];
      const extra = EVOLUTIONS[(i + 2) % EVOLUTIONS.length].passive;
      const list = evolutionReadyList(
        [w(evo.baseWeapon, 8)],
        [p(extra, 5), p(evo.passive, 3)],
      );
      expect(list, evo.id).toHaveLength(1);
      const offers = generateOffers([w(evo.baseWeapon, 8)], [p(extra, 5), p(evo.passive, 3)], rng(), 3, true);
      expect(offers.filter((o) => o.id === evo.id), evo.id).toHaveLength(1);
    }
  });
});

describe("Evolution-Reachability: Gate-Härtung (K2)", () => {
  // Nicht implementierte Evolutions-Waffe (kein weaponDef-Eintrag): darf von
  // keinem Angebots-Pfad angeboten werden — sonst würde die Truhe eine
  // Evolution anbieten, die applyChestReward/addWeapon ablehnen müsste.
  const FAKE: EvolutionDef = {
    id: "test_evo" as EvolutionDef["id"],
    name: "Test-Evolution",
    baseWeapon: "ember",
    passive: "tome",
    description: "Test",
    effect: "Test",
    implemented: true,
    iconColor: 0,
  };

  afterEach(() => {
    const idx = EVOLUTIONS.indexOf(FAKE);
    if (idx >= 0) EVOLUTIONS.splice(idx, 1);
  });

  it("nicht implementierte Evolutions-Waffe wird von allen Pfaden ausgelassen", () => {
    EVOLUTIONS.push(FAKE);
    const weapons = [w("ember", 8)];
    const passives = [p("tome", 1)];
    expect(evolvableList(weapons, passives).some((e) => e.id === FAKE.id)).toBe(false);
    expect(evolutionReadyList(weapons, passives).some((e) => e.id === FAKE.id)).toBe(false);
    expect(canEvolve(weapons, passives)?.id).not.toBe(FAKE.id);
    const offers = generateOffers(weapons, passives, rng(), 3, true);
    expect(offers.some((o) => o.id === FAKE.id)).toBe(false);
    const chest = chestRewards(weapons, passives, 600, rng());
    expect(chest.rewards.some((r) => r.kind === "evolution" && r.id === FAKE.id)).toBe(false);
    // Die reguläre Evolution (phoenix) bleibt davon unberührt:
    expect(canEvolve(weapons, passives)?.id).toBe("phoenix");
  });

  it("nicht implementierte Evolutions-Waffe: evolve() lehnt ab", () => {
    EVOLUTIONS.push(FAKE);
    const sys = new LevelUpSystem("ember", 8);
    sys.addPassive("tome", 1);
    expect(sys.evolve(FAKE.id)).toBe(false);
    expect(sys.weapons[0]?.id).toBe("ember");
  });
});

describe("Evolution-Reachability: LevelUpSystem.evolve() Gate (K2-Härtung)", () => {
  it("evolve() verlangt das passende Powerup (auch bei Waffe Stufe 8)", () => {
    const sys = new LevelUpSystem("ember", 8);
    expect(sys.evolve("phoenix")).toBe(false);
    expect(sys.weapons[0]?.id).toBe("ember");
    sys.addPassive("tome", 1);
    expect(sys.evolve("phoenix")).toBe(true);
    expect(sys.weapons[0]?.id).toBe("phoenix");
    expect(sys.passives.some((x) => x.id === "tome")).toBe(true);
  });

  it("evolve() ohne Level 8 bleibt gesperrt", () => {
    const sys = new LevelUpSystem("ember", 7);
    sys.addPassive("tome", 1);
    expect(sys.evolve("phoenix")).toBe(false);
    expect(sys.weapons[0]?.id).toBe("ember");
  });

  it("evolve() mit unbekannter ID liefert false", () => {
    const sys = new LevelUpSystem("ember", 8);
    expect(sys.evolve("gibt_es_nicht")).toBe(false);
  });
});
