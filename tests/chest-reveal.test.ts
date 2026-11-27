import { describe, expect, it } from "vitest";
import { EVOLUTIONS } from "../src/data/evolutions";
import { PASSIVES } from "../src/data/passives";
import { WEAPONS } from "../src/data/weapons";
import {
  chestRewardLabel,
  chestRewards,
  revealOrder,
  type ChestReward,
} from "../src/logic/evolution";
import { SeededRng } from "../src/logic/rng";
import { slotNameLines } from "../src/logic/text";

// M10-chest-reveal: jede Belohnung erscheint lesbar — Reveal-Reihenfolge
// deterministisch, Labels eindeutig, Namen passen in den Slot (2 Zeilen à 13).

const owned = (id: string, level: number) => ({ id, level });

describe("chestRewardLabel", () => {
  it("Evolution bekommt EVOLUTION, Upgrades die klare Stufe", () => {
    expect(chestRewardLabel({ kind: "evolution", level: 8 })).toBe("EVOLUTION");
    expect(chestRewardLabel({ kind: "weapon", level: 3 })).toBe("STUFE 3");
    expect(chestRewardLabel({ kind: "passive", level: 1, isNew: true } as ChestReward)).toBe("STUFE 1");
  });
});

describe("revealOrder", () => {
  const rewards: ChestReward[] = [
    { kind: "weapon", id: "frost", name: "Frostnova", description: "d", level: 2, isNew: false, iconColor: 13 },
    { kind: "evolution", id: "phoenix_swarm", name: "Phönixschwarm", description: "e", level: 8, isNew: true, iconColor: 13 },
    { kind: "passive", id: "tome", name: "Arkanes Buch", description: "p", level: 1, isNew: true, iconColor: 13 },
    { kind: "weapon", id: "ember", name: "Glutfunke", description: "w", level: 4, isNew: false, iconColor: 13 },
  ];

  it("Evolution zuerst, dann Neu, dann Upgrades; Gleichstand alphabetisch", () => {
    const ordered = revealOrder(rewards);
    expect(ordered.map((r) => r.kind)).toEqual(["evolution", "passive", "weapon", "weapon"]);
    expect(ordered.map((r) => r.id)).toEqual(["phoenix_swarm", "tome", "ember", "frost"]);
  });

  it("verändert die Rewards nicht (nur Reihenfolge) und das Eingabefeld nicht", () => {
    const snapshot = JSON.parse(JSON.stringify(rewards));
    const ordered = revealOrder(rewards);
    expect(ordered).not.toBe(rewards);
    for (const r of ordered) {
      const src = snapshot.find((s: ChestReward) => s.id === r.id);
      expect(r).toEqual(src);
    }
    expect(rewards[0].id).toBe("frost"); // Eingabe unangetastet
  });

  it("ist deterministisch (zwei Aufrufe, gleiches Ergebnis)", () => {
    expect(JSON.stringify(revealOrder(rewards))).toBe(JSON.stringify(revealOrder(rewards)));
  });
});

describe("chestRewards: Rewards unverändert + Lesbarkeit aller Inhalte", () => {
  it("chestRewards liefert count = rewards.length und unveränderte Felder", () => {
    const rng = new SeededRng(101);
    const result = chestRewards(
      [owned("ember", 5), owned("flail", 3)],
      [owned("tome", 2)],
      240,
      rng,
    );
    expect(result.count).toBe(result.rewards.length);
    for (const r of result.rewards) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.level).toBeGreaterThanOrEqual(1);
    }
  });

  it("jeder echte Belohnungsname passt lesbar in den Slot (≤ 2 Zeilen à 13)", () => {
    const names = [
      ...Object.values(WEAPONS).map((w) => w.name),
      ...Object.values(PASSIVES).map((p) => p.name),
      ...EVOLUTIONS.filter((e) => e.implemented).map((e) => e.name),
    ];
    expect(names.length).toBeGreaterThanOrEqual(18);
    for (const name of names) {
      const lines = slotNameLines(name.toUpperCase(), 13);
      expect(lines.length, name).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length, name).toBeLessThanOrEqual(13);
    }
  });

  it("jedes Label bleibt einzeilig und kurz (Slot-Breite 96 px ≈ 16 Zeichen)", () => {
    for (let level = 1; level <= 8; level++) {
      expect(chestRewardLabel({ kind: "weapon", level })).toBe(`STUFE ${level}`);
      expect(chestRewardLabel({ kind: "weapon", level }).length).toBeLessThanOrEqual(9);
    }
    expect(chestRewardLabel({ kind: "evolution", level: 8 }).length).toBeLessThanOrEqual(9);
  });
});
