import { describe, expect, it } from "vitest";
import { generateOffers, type Offer, type OwnedItem } from "../src/logic/levelup";
import { evolvableList } from "../src/logic/evolution";
import { isEvolutionWeapon } from "../src/data/weaponIds";
import { SeededRng } from "../src/logic/rng";

const w = (id: string, level: number): OwnedItem => ({ id, level });
const p = (id: string, level: number): OwnedItem => ({ id, level });
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

interface BuildState {
  name: string;
  weapons: OwnedItem[];
  passives: OwnedItem[];
}

const builds: BuildState[] = [
  { name: "leer", weapons: [], passives: [] },
  {
    name: "5-waffen",
    weapons: ["ember", "flail", "frost", "thorn", "storm"].map((id, i) => w(id, [3, 2, 4, 1, 5][i])),
    passives: [p("boots", 2), p("heart", 1)],
  },
  {
    name: "6-waffen-ohne-passiv",
    weapons: ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 4)),
    passives: [],
  },
  {
    name: "6-waffen-stufe8-6-passives",
    weapons: ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 8)),
    passives: ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => p(id, 2)),
  },
];

const offerKey = (o: Offer): string => `${o.kind}:${o.id}`;
const evolutionOffers = (offers: readonly Offer[]): Offer[] =>
  offers.filter((o) => o.kind === "weapon" && isEvolutionWeapon(o.id));

function offersFor(build: BuildState, seed: number): Offer[] {
  return generateOffers(build.weapons, build.passives, new SeededRng(seed), 3);
}

describe("Level-Up-Angebote: genau 3 waehlbare Optionen", () => {
  it("liefert fuer nicht erschoepfte Pools in 30 Seeds exakt 3 Angebote", () => {
    for (const build of builds) {
      for (const seed of SEEDS) {
        expect(offersFor(build, seed), `${build.name} seed ${seed}`).toHaveLength(3);
      }
    }
  });

  it("dokumentierte Ausnahme: alles maxed + Evolution einloesbar → genau 1 Evolutionsangebot statt 0", () => {
    // Pool erschöpft: keine Upgrades/neuen Items mehr. Aber 6 Evolutionen sind
    // einlösbar (Basiswaffe 8, Powerup 5) und müssen als Angebot erscheinen.
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 8));
    const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => p(id, 5));
    for (const seed of SEEDS) {
      const offers = generateOffers(weapons, passives, new SeededRng(seed), 3);
      expect(offers.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(offers.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      expect(offers.every((o) => evolutionOffers([o]).length === 1), `seed ${seed} nur Evolution`).toBe(true);
    }
  });
});

describe("Level-Up-Angebote: keine Duplikate", () => {
  it("hat in 30 Seeds x 4 Builds keine doppelten IDs", () => {
    for (const build of builds) {
      for (const seed of SEEDS) {
        const offers = offersFor(build, seed);
        const keys = offers.map(offerKey);
        expect(new Set(keys).size, `${build.name} seed ${seed}: ${keys.join(",")}`).toBe(keys.length);
      }
    }
  });
});

describe("Level-Up-Angebote: nur Upgrades besessener Waffen", () => {
  it("bietet nie das Upgrade einer nicht besessenen Waffe an", () => {
    for (const build of builds) {
      for (const seed of SEEDS) {
        for (const offer of offersFor(build, seed)) {
          if (offer.kind !== "weapon" || offer.isNew || isEvolutionWeapon(offer.id)) continue;
          const owned = build.weapons.find((x) => x.id === offer.id);
          expect(owned, `${build.name} seed ${seed}: ${offer.id} nicht besessen`).toBeDefined();
          expect(offer.level, `${build.name} seed ${seed}: ${offer.id} Stufe`).toBe((owned?.level ?? 0) + 1);
        }
      }
    }
  });
});

describe("Level-Up-Angebote: Evolutionsregeln wie src/logic/evolution.ts", () => {
  it("bietet eine einloesbare Evolution an (Basiswaffe 8 + Powerup >= 1)", () => {
    const offers = generateOffers([w("ember", 8)], [p("tome", 1)], new SeededRng(3), 3);
    const evos = evolutionOffers(offers).map((o) => o.id);
    expect(evos).toContain("phoenix");
  });

  it("bietet keine Evolution ohne Stufe 8 oder ohne passendes Powerup", () => {
    const cases: BuildState[] = [
      { name: "basis-stufe7", weapons: [w("ember", 7)], passives: [p("tome", 5)] },
      { name: "powerup-fehlt", weapons: [w("ember", 8)], passives: [] },
      { name: "falsches-powerup", weapons: [w("ember", 8)], passives: [p("boots", 5)] },
      { name: "evolution-schon-im-slot", weapons: [w("phoenix", 8)], passives: [p("tome", 1)] },
    ];
    for (const build of cases) {
      for (const seed of SEEDS) {
        expect(evolutionOffers(offersFor(build, seed)), `${build.name} seed ${seed}`).toHaveLength(0);
      }
    }
  });

  it("bietet hoechstens eine Evolution pro Angebot an", () => {
    // Alle 6 Evolutionen waeren gleichzeitig einlösbar.
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 8));
    const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => p(id, 1));
    for (const seed of SEEDS) {
      const evos = evolutionOffers(offersFor({ name: "alle-evos", weapons, passives }, seed));
      expect(evos.length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it("das Evolutionsangebot ist neu, auf Maximalstufe und als Waffe nutzbar (UI-kompatibel)", () => {
    const offers = generateOffers([w("ember", 8)], [p("tome", 2)], new SeededRng(3), 3);
    const evo = evolutionOffers(offers)[0];
    expect(evo).toBeDefined();
    expect(evo.kind).toBe("weapon");
    expect(evo.isNew).toBe(true);
    expect(evo.level).toBe(8);
    expect(evo.name).toBe("Phönixschwarm");
  });

  it("Evolutionen entsprechen exakt evolvableList (keine fehlende, keine unerlaubte)", () => {
    for (const build of builds) {
      const eligible = new Set<string>(evolvableList(build.weapons, build.passives).map((e) => e.id));
      for (const seed of SEEDS) {
        const offered = new Set(evolutionOffers(offersFor(build, seed)).map((o) => o.id));
        for (const id of offered) expect(eligible.has(id), `${build.name} seed ${seed}: ${id}`).toBe(true);
        if (eligible.size > 0) {
          expect([...offered].some((id) => eligible.has(id)), `${build.name} seed ${seed}: keine Evolution angeboten`).toBe(true);
        }
      }
    }
  });
});
