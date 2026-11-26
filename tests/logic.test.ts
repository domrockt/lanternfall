import { describe, expect, it } from "vitest";
import { damageTable } from "../src/logic/results";
import { slotNameLines } from "../src/logic/text";
import { SeededRng } from "../src/logic/rng";
import { generateOffers, type OwnedItem } from "../src/logic/levelup";
import { applyXp, GEMS, xpProgress, xpToNext } from "../src/logic/xp";
import { advanceSpawnBudget, pickEnemy, ringSpawnOffsets, spawnRateForMinute } from "../src/logic/waves";
import {
  aggregateMods, effectiveCooldown, effectiveDamage, effectiveDuration,
  effectiveMoveSpeed, effectivePickupRadius, effectiveRadius, weaponLevel,
} from "../src/logic/stats";
import { damageAfterArmor, knockbackVector, timeScaleClamped } from "../src/logic/combat";
import { SpatialHash } from "../src/systems/SpatialHash";
import { WEAPONS } from "../src/data/weapons";
import { PASSIVES } from "../src/data/passives";
import { CHARACTERS } from "../src/data/characters";
import { directionToPlayer, fallbackDir, separationPush } from "../src/logic/separation";

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

describe("Powerups wirken auf die Stats (alle 6, Stufe 1-5)", () => {
  const statFor = (id: keyof typeof PASSIVES, level: number) =>
    aggregateMods([PASSIVES[id].levels[level - 1].mods]);

  it("Windstiefel: +8 % Tempo pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      expect(effectiveMoveSpeed(100, statFor("boots", l))).toBeCloseTo(100 + l * 8);
    }
  });
  it("Arkanes Buch: -8 % Abklingzeit pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      expect(effectiveCooldown(1, statFor("tome", l))).toBeCloseTo(1 - l * 0.08);
    }
  });
  it("Eisenherz: +20 Max-HP und +0.2 HP/s pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      const agg = statFor("heart", l);
      expect(agg.maxHpFlat).toBe(l * 20);
      expect(agg.regen).toBeCloseTo(l * 0.2);
    }
  });
  it("Magnetamulett: +25 % Aufsammelradius pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      const expected = 20 * (1 + (l * 25) / 100);
      expect(effectivePickupRadius(20, statFor("charm", l))).toBeCloseTo(expected);
    }
  });
  it("Wetzstein: +10 % Schaden pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      expect(effectiveDamage(100, statFor("whetstone", l))).toBe(100 + l * 10);
    }
  });
  it("Sanduhr: +10 % Dauer und Fläche pro Stufe", () => {
    for (let l = 1; l <= 5; l++) {
      const agg = statFor("hourglass", l);
      expect(effectiveRadius(100, agg)).toBeCloseTo(100 + l * 10);
      expect(effectiveDuration(10, agg)).toBeCloseTo(10 + l);
    }
  });
  it("Stufe 5 ist jeweils deutlich staerker als Stufe 1", () => {
    expect(effectiveDamage(100, statFor("whetstone", 5))).toBeGreaterThan(effectiveDamage(100, statFor("whetstone", 1)));
    expect(effectiveMoveSpeed(100, statFor("boots", 5))).toBeGreaterThan(effectiveMoveSpeed(100, statFor("boots", 1)));
    expect(effectiveCooldown(1, statFor("tome", 5))).toBeLessThan(effectiveCooldown(1, statFor("tome", 1)));
    expect(effectivePickupRadius(20, statFor("charm", 5))).toBeGreaterThan(effectivePickupRadius(20, statFor("charm", 1)));
    expect(effectiveRadius(50, statFor("hourglass", 5))).toBeGreaterThan(effectiveRadius(50, statFor("hourglass", 1)));
    expect(statFor("heart", 5).maxHpFlat).toBeGreaterThan(statFor("heart", 1).maxHpFlat);
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

describe("Separation", () => {
  it("deckungsgleiche Gegner bekommen einen Push ungleich (0,0)", () => {
    const push = separationPush(100, 100, 6, 100, 100, 6, 7);
    expect(push).not.toBeNull();
    expect(Math.hypot(push!.x, push!.y)).toBeGreaterThan(0.5);
  });
  it("verschiedene uids ergeben verschiedene Fallback-Richtungen", () => {
    const a = fallbackDir(1);
    const b = fallbackDir(2);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(1, 6);
  });
  it("kein Push, wenn Gegner weit genug entfernt sind", () => {
    expect(separationPush(0, 0, 6, 50, 50, 6, 1)).toBeNull();
  });
  it("exakt auf dem Spieler: Richtung kommt aus der uid", () => {
    const dir = directionToPlayer(0, 0, 9);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
    const normal = directionToPlayer(3, 4, 9);
    expect(normal.x).toBeCloseTo(0.6, 6);
    expect(normal.y).toBeCloseTo(0.8, 6);
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
  it("recycelt Buckets nach clear statt sie zu verwerfen", () => {
    const hash = new SpatialHash<{ x: number; y: number }>(16);
    hash.insert({ x: 5, y: 5 });
    hash.insert({ x: 200, y: 200 });
    expect(hash.allocatedCellCount).toBe(2);
    hash.clear();
    // Neue Implementierung behaelt die Arrays fuer den naechsten Frame;
    // die alte (cells.clear) haette hier 0.
    expect(hash.allocatedCellCount).toBe(2);
    hash.insert({ x: 6, y: 6 });
    expect(hash.queryCircle(5, 5, 5)).toHaveLength(1);
  });
  it("waechst durch recycling nicht unbegrenzt pro Zelle", () => {
    const hash = new SpatialHash<{ x: number; y: number }>(16);
    for (let i = 0; i < 100; i++) {
      hash.insert({ x: 5, y: 5 });
      hash.clear();
    }
    expect(hash.allocatedCellCount).toBeLessThanOrEqual(1);
  });
});

describe("Ergebnis-Schadenstabelle", () => {
  it("filtert 0/ungueltig, sortiert absteigend und begrenzt", () => {
    const table = damageTable({ ember: 120, flail: 900, frost: 0, thorn: 45, phoenix: 3000 }, 3);
    expect(table).toHaveLength(3);
    expect(table.map((e) => e.id)).toEqual(["phoenix", "flail", "ember"]);
    expect(table[0].name).toBe("Phönixschwarm");
    expect(table[0].isEvolution).toBe(true);
    expect(table[1].isEvolution).toBe(false);
    expect(table[1].damage).toBe(900);
    expect(damageTable({})).toHaveLength(0);
    expect(damageTable({ bogus: Number.NaN, ember: -5 })).toHaveLength(0);
  });

  it("liefert hoechstens 12 Eintraege", () => {
    const input = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`w${i}`, i + 1]));
    expect(damageTable(input)).toHaveLength(12);
  });
});

describe("Truhen-Slot-Namen", () => {
  it("verteilt lange Woerter vollstaendig auf zwei Zeilen", () => {
    for (const name of ["SEELENLEUCHTFEUER", "PHÖNIXSCHWARM", "GEWITTERSIEGEL", "SEELENLEUCHT"]) {
      const lines = slotNameLines(name);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join("")).toBe(name);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(11);
    }
  });

  it("bricht an Wortgrenzen statt mitten im Wort", () => {
    expect(slotNameLines("ARKANES BUCH")).toEqual(["ARKANES", "BUCH"]);
    expect(slotNameLines("GEISTERLATERNE")).toEqual(["GEISTER", "LATERNE"]);
  });

  it("verliert auch bei sehr langen Namen keine Zeichen", () => {
    for (const name of ["X".repeat(23), "SEELENLEUCHTFEUERWOLKEN", "AB CDEFGHIJKLMNOP"]) {
      const lines = slotNameLines(name);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join("")).toBe(name);
    }
  });

  it("laesst kurze Namen in einer Zeile", () => {
    expect(slotNameLines("STURMRUNE")).toEqual(["STURMRUNE"]);
    expect(slotNameLines("")).toEqual([""]);
  });
});
