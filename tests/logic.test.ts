import { describe, expect, it } from "vitest";
import { SeededRng } from "../src/logic/rng";
import { generateOffers, type OwnedItem } from "../src/logic/levelup";
import { applyXp, GEMS, xpProgress, xpToNext } from "../src/logic/xp";
import { advanceSpawnBudget, pickEnemy, ringSpawnOffsets, spawnRateForMinute } from "../src/logic/waves";
import { aggregateMods, effectiveCooldown, effectiveDamage, effectivePickupRadius, weaponLevel } from "../src/logic/stats";
import { damageAfterArmor, knockbackVector, timeScaleClamped } from "../src/logic/combat";
import { SpatialHash } from "../src/systems/SpatialHash";
import { WEAPONS } from "../src/data/weapons";
import { PASSIVES } from "../src/data/passives";
import { CHARACTERS } from "../src/data/characters";

const w = (id: string, level: number): OwnedItem => ({ id, level });
const p = (id: string, level: number): OwnedItem => ({ id, level });

describe("RNG", () => {
  it("ist mit gleichem Seed reproduzierbar", () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new SeededRng(43).next()).not.toBe(seqA[0]);
  });
  it("int bleibt im Bereich, shuffle verliert nichts", () => {
    const rng = new SeededRng("test");
    for (let i = 0; i < 100; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(7);
    }
    const arr = [1, 2, 3, 4, 5];
    expect(rng.shuffle(arr).sort()).toEqual(arr);
  });
});

describe("Level-up-Angebote", () => {
  it("bietet 3 verschiedene, gültige Optionen an", () => {
    const offers = generateOffers([w("ember", 1)], [p("boots", 1)], new SeededRng(7));
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((o) => o.kind + o.id)).size).toBe(3);
    for (const o of offers) {
      expect(o.level).toBeGreaterThanOrEqual(1);
      expect(o.level).toBeLessThanOrEqual(o.kind === "weapon" ? 8 : 5);
    }
  });

  it("bietet keine maxed Items an", () => {
    const offers = generateOffers([w("ember", 8)], [p("boots", 5)], new SeededRng(1));
    expect(offers.some((o) => o.id === "ember" && !o.isNew)).toBe(false);
    expect(offers.some((o) => o.id === "boots" && !o.isNew)).toBe(false);
  });

  it("keine neuen Items bei vollen Slots", () => {
    const weapons = [w("ember", 1), w("flail", 1), w("frost", 1), w("thorn", 1), w("storm", 1), w("lantern", 1)];
    const passives = [p("boots", 1), p("tome", 1), p("heart", 1), p("charm", 1), p("whetstone", 1), p("hourglass", 1)];
    const offers = generateOffers(weapons, passives, new SeededRng(3));
    for (const o of offers) expect(o.isNew).toBe(false);
  });

  it("alles maxed und Slots voll → keine Angebote", () => {
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 8));
    const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => p(id, 5));
    expect(generateOffers(weapons, passives, new SeededRng(9))).toHaveLength(0);
  });

  it("Upgrade erhöht exakt um eine Stufe", () => {
    const offers = generateOffers([w("ember", 3)], [], new SeededRng(2));
    const up = offers.find((o) => o.id === "ember" && !o.isNew);
    if (up) expect(up.level).toBe(4);
  });

  it("neue Waffen nur wenn Waffenslot frei ist", () => {
    // Leerer Build: alle Angebote sind neu.
    const fresh = generateOffers([], [], new SeededRng(4));
    expect(fresh).toHaveLength(3);
    expect(fresh.every((o) => o.isNew)).toBe(true);
    for (const o of fresh.filter((o) => o.kind === "weapon")) {
      expect(WEAPONS[o.id as keyof typeof WEAPONS].implemented).toBe(true);
    }
    // Volle Waffenslots: keine neuen Waffen mehr.
    const full = ["ember", "flail", "frost", "thorn", "storm", "lantern"].map((id) => w(id, 1));
    const off2 = generateOffers(full, [], new SeededRng(4));
    expect(off2.some((o) => o.kind === "weapon" && o.isNew)).toBe(false);
    for (const o of off2.filter((o) => o.kind === "weapon")) {
      expect(o.isNew).toBe(false);
      expect(full.some((f) => f.id === o.id)).toBe(true);
    }
  });
});

describe("XP", () => {
  it("Level-Up-Schwelle wächst", () => {
    expect(xpToNext(1)).toBe(8);
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
  });
  it("mehrere Level-Ups in einem Schritt", () => {
    const r = applyXp({ level: 1, xp: 0, pendingLevelUps: 0 }, 1000);
    expect(r.level).toBeGreaterThan(5);
    expect(r.pendingLevelUps).toBe(r.level - 1);
    expect(r.xp).toBeLessThan(xpToNext(r.level));
  });
  it("Fortschritt 0..1", () => {
    expect(xpProgress({ level: 1, xp: 0, pendingLevelUps: 0 })).toBe(0);
    expect(xpProgress({ level: 1, xp: 4, pendingLevelUps: 0 })).toBeCloseTo(0.5);
    expect(GEMS.large.value).toBeGreaterThan(GEMS.small.value);
  });
});

describe("Wellen", () => {
  it("Spawnrate steigt und Budget akkumuliert", () => {
    expect(spawnRateForMinute(20)).toBeGreaterThan(spawnRateForMinute(2));
    const a = advanceSpawnBudget(0, 1, 0.5);
    expect(a.count).toBe(0);
    const b = advanceSpawnBudget(a.budget, 1, 0.5);
    expect(b.count).toBe(1);
    expect(b.budget).toBeCloseTo(0);
  });
  it("pickEnemy liefert nur Mischungs-IDs", () => {
    const mix = { bog_rat: 1, wisp: 2 } as const;
    const rng = new SeededRng(5);
    for (let i = 0; i < 50; i++) {
      expect(["bog_rat", "wisp"]).toContain(pickEnemy({ ...mix }, rng));
    }
  });
  it("Ring-Offsets sind gleichmäßig", () => {
    const pts = ringSpawnOffsets(8, 100);
    expect(pts).toHaveLength(8);
    for (const pt of pts) expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(100, 5);
  });
});

describe("Stats", () => {
  it("Passive stapeln sich", () => {
    const agg = aggregateMods([{ damagePct: 10 }, { damagePct: 10 }, { cooldownPct: 8, armorFlat: 1 }, { pickupRadiusPct: 25 }]);
    expect(agg.damagePct).toBe(20);
    expect(effectiveDamage(100, agg)).toBe(120);
    expect(effectiveCooldown(1, agg)).toBeCloseTo(0.92);
    expect(effectivePickupRadius(20, agg)).toBe(25);
  });
  it("Passive-Stufen sind kumulativ (Stufe 2 = doppelter Bonus)", () => {
    const boots = PASSIVES.boots.levels;
    expect(boots[0].mods.moveSpeedPct).toBe(8);
    expect(boots[1].mods.moveSpeedPct).toBe(16);
    expect(boots[4].mods.moveSpeedPct).toBe(40);
    const agg = aggregateMods([boots[1].mods]);
    expect(agg.moveSpeedPct).toBe(16);
    expect(PASSIVES.whetstone.levels[2].mods.damagePct).toBe(30);
    expect(PASSIVES.heart.levels[4].mods.maxHpFlat).toBe(100);
  });
  it("Kael: +20 % Max-HP auf Basis-HP", () => {
    const agg = aggregateMods([CHARACTERS.kael.mods]);
    expect(agg.maxHpPct).toBe(20);
    expect(Math.round(CHARACTERS.kael.hp * (1 + agg.maxHpPct / 100))).toBe(156);
  });
  it("weaponLevel clamped", () => {
    expect(weaponLevel(WEAPONS.ember, 0).level).toBe(1);
    expect(weaponLevel(WEAPONS.ember, 99).level).toBe(8);
    expect(weaponLevel(WEAPONS.ember, 4).damage).toBe(16);
  });
});

describe("Kampf-Helfer", () => {
  it("Rüstung reduziert, aber nie unter 1", () => {
    expect(damageAfterArmor(10, 1)).toBe(9);
    expect(damageAfterArmor(5, 99)).toBe(1);
  });
  it("Rückstoß zeigt vom Ursprung weg", () => {
    const v = knockbackVector(0, 0, 10, 0, 5);
    expect(v.vx).toBeCloseTo(5);
    expect(v.vy).toBeCloseTo(0);
  });
  it("Zeitskalierung 1..60", () => {
    expect(timeScaleClamped(0)).toBe(1);
    expect(timeScaleClamped(999)).toBe(60);
    expect(timeScaleClamped(NaN)).toBe(1);
  });
});

describe("SpatialHash", () => {
  it("findet Nachbarn über Zellgrenzen", () => {
    const hash = new SpatialHash<{ x: number; y: number }>(32);
    const items = [{ x: 10, y: 10 }, { x: 31, y: 31 }, { x: 200, y: 200 }];
    hash.rebuild(items);
    const near = hash.queryCircle(20, 20, 12);
    expect(near).toContain(items[0]);
    expect(near).toContain(items[1]);
    expect(near).not.toContain(items[2]);
  });
  it("rebuilt korrekt nach clear", () => {
    const hash = new SpatialHash<{ x: number; y: number }>(16);
    hash.insert({ x: 5, y: 5 });
    hash.clear();
    expect(hash.queryCircle(5, 5, 5)).toHaveLength(0);
    expect(hash.cellCount).toBe(0);
  });
});
