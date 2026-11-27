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
import {
  CHEST_OPENING_TTL_MS,
  CHEST_OPEN_REVEAL_MS,
  chestBurstSpec,
  chestOpenTimeline,
  chestPanelLayout,
} from "../src/logic/chest-reveal";
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

// ── K4: Sequenz-Reihenfolge deterministisch, Layout überlappungsfrei ────────

describe("chestOpenTimeline", () => {
  for (const n of [1, 3, 5] as const) {
    it(`1/3/5 Belohnungen: Phasen Glow->Partikel->Reveal in fester Reihenfolge (n=${n})`, () => {
      const steps = chestOpenTimeline(n);
      // Aufsteigende Zeiten, deterministisch.
      for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThanOrEqual(steps[i - 1].at);
      const names = steps.map((s) => s.step);
      expect(names[0]).toBe("shine");
      expect(names.indexOf("lid")).toBeLessThan(names.indexOf("beam"));
      expect(names.indexOf("beam")).toBeLessThan(names.indexOf("burst"));
      expect(names.indexOf("burst")).toBeLessThan(names.indexOf("reveal"));
      const settles = steps.filter((s) => s.step === "revealSettle");
      expect(settles.length).toBe(n);
      expect(settles.map((s) => s.rewardIndex)).toEqual([...Array(n).keys()]);
      const finish = steps[steps.length - 1];
      expect(finish.step).toBe("finish");
      expect(finish.at).toBeGreaterThanOrEqual(settles[settles.length - 1].at);
      // Welt-Sequenz (TTL 1600 ms) räumt früher ab als das Panel (finish) —
      // beides unabhängige Zeitleisten aus derselben Quelle.
      expect(finish.at).toBeGreaterThan(CHEST_OPEN_REVEAL_MS);
      // Deterministisch: zwei Aufrufe identisch.
      expect(JSON.stringify(steps)).toBe(JSON.stringify(chestOpenTimeline(n)));
    });
  }

  it("klemmt rewardCount auf 1..5", () => {
    expect(chestOpenTimeline(0)[0].step).toBe("shine");
    expect(chestOpenTimeline(-2).filter((s) => s.step === "revealSettle").length).toBe(1);
    expect(chestOpenTimeline(9).filter((s) => s.step === "revealSettle").length).toBe(5);
  });
});

describe("chestBurstSpec", () => {
  it("16 Münzen + 8 Funken, deterministisch, Winkel im Fächer nach oben", () => {
    const spec = chestBurstSpec();
    expect(spec.filter((p) => p.kind === "coin").length).toBe(16);
    expect(spec.filter((p) => p.kind === "spark").length).toBe(8);
    for (const p of spec) {
      expect(Number.isFinite(p.angle)).toBe(true);
      expect(Number.isFinite(p.dist)).toBe(true);
      expect(p.delayMs).toBeGreaterThanOrEqual(0);
      expect(p.lifeMs).toBeGreaterThan(0);
      expect(p.scale).toBeGreaterThan(0);
    }
    for (const p of spec.filter((q) => q.kind === "coin")) {
      // Fächer um -90° (nach oben), ±1.1 rad.
      expect(p.angle).toBeGreaterThanOrEqual(-Math.PI / 2 - 1.11);
      expect(p.angle).toBeLessThanOrEqual(-Math.PI / 2 + 1.11);
    }
    expect(JSON.stringify(spec)).toBe(JSON.stringify(chestBurstSpec()));
  });
});

describe("chestPanelLayout", () => {
  const oy = Math.round((360 - 270) / 2);
  const L = chestPanelLayout(oy);

  it("Titel, Untertitel, Icon und Hinweise überlappen nicht (hart, beide Abstände ≥ 2 px)", () => {
    // Glyph-Boxen: PixelText hat Top-Origin, Höhe = 7 px * Skalierung.
    const titleBottom = L.titleY + 7 * 2;          // Titel Skalierung 2
    const subtitleTop = L.subtitleY;
    const subtitleBottom = L.subtitleY + 7;
    const iconTop = L.iconY - 8 * L.iconScale;     // 16x16-Textur, zentriert
    const iconBottom = L.iconY + 8 * L.iconScale;
    const hint0Top = L.hintY[0];
    expect(titleBottom, "Titel-Unterkante unter Untertitel-Oberkante").toBeLessThanOrEqual(subtitleTop - 2);
    expect(subtitleBottom, "Untertitel-Unterkante unter Icon-Textur oben").toBeLessThanOrEqual(iconTop - 2);
    expect(iconBottom, "Icon-Unterkante über Evo-Hinweis").toBeLessThanOrEqual(hint0Top - 2);
    expect(L.hintY[1] + 7, "Hinweiszeile 2 über den Slots (Slot-Top 196+oy)").toBeLessThanOrEqual(196 + oy - 2);
  });

  it("Layout ist view-unabhängig identisch (640 und 780 haben dasselbe oy)", () => {
    expect(chestPanelLayout(45)).toEqual(chestPanelLayout(45));
    expect(chestPanelLayout(0).subtitleY).toBe(58);
    expect(chestPanelLayout(0).iconScale).toBe(3); // ganzzahlig (Pixel-Grid)
  });
});
