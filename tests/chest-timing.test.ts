import { describe, expect, it } from "vitest";
import { bossSpawnSecond, FINAL_BOSS_AT } from "../src/logic/scaling";
import { slotNameLines } from "../src/logic/text";
import { BOSSES } from "../src/data/bosses";
import { WEAPONS } from "../src/data/weapons";
import { PASSIVES } from "../src/data/passives";
import { EVOLUTIONS } from "../src/data/evolutions";

/**
 * M10 chest-timing: Boss-/Truhen-Zeitplan an den Minutenrändern.
 * Die Truhe wird im selben Simulationsschritt wie der Boss-Tod gespawnt
 * (`collectKills`); der Zeitplan darf an 299.99/300/300.01 nicht kippen.
 */
describe("M10 Truhen-Timing: Boss-Zeitplan an Minutenrändern", () => {
  const expected = [300, 600, 900, 1200, 1500, 1800];

  it("liefert exakt die sechs Boss-Sekunden (5..30 min)", () => {
    for (let i = 0; i < 5; i++) {
      expect(bossSpawnSecond(i)).toBe(expected[i]);
    }
    expect(FINAL_BOSS_AT).toBe(expected[5]);
    expect(new Set(expected).size).toBe(6);
  });

  it("spawnt nicht vor der Soll-Sekunde, aber exakt bei und danach", () => {
    for (let i = 0; i < 5; i++) {
      const due = (elapsed: number): boolean => elapsed >= bossSpawnSecond(i);
      expect(due(expected[i] - 0.01)).toBe(false);
      expect(due(expected[i] - 0.0001)).toBe(false);
      expect(due(expected[i])).toBe(true);
      expect(due(expected[i] + 0.01)).toBe(true);
    }
    const finalDue = (elapsed: number): boolean => elapsed >= FINAL_BOSS_AT;
    expect(finalDue(FINAL_BOSS_AT - 0.01)).toBe(false);
    expect(finalDue(FINAL_BOSS_AT)).toBe(true);
  });

  it("Boss-Daten und Zeitplan stimmen überein (kein Off-by-one)", () => {
    for (let i = 0; i < BOSSES.length; i++) {
      expect(BOSSES[i].index).toBe(i);
      expect(BOSSES[i].atSecond).toBe(expected[i]);
      expect(BOSSES[i].atSecond).toBe(bossSpawnSecond(i));
    }
  });
});

describe("M10 Truhen-Namen: vollständig auf höchstens 2 Zeilen", () => {
  const MAX_CHARS = 13; // UI-Slot-Breite 96 px / 6 px Advance minus Rand

  const allRewardNames = [
    ...Object.values(WEAPONS).map((w) => w.name),
    ...Object.values(PASSIVES).map((p) => p.name),
    ...EVOLUTIONS.map((e) => e.name),
  ];

  it("jeder echte Belohnungsname bleibt vollständig und passt in 2 Zeilen", () => {
    for (const name of allRewardNames) {
      const upper = name.toUpperCase();
      const lines = slotNameLines(upper, MAX_CHARS);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join("")).toBe(upper);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(MAX_CHARS);
    }
  });

  it("der längste Name (Seelenleuchtfeuer) bricht ohne Zeichenverlust", () => {
    const lines = slotNameLines("SEELENLEUCHTFEUER", MAX_CHARS);
    expect(lines).toEqual(["SEELENLEU", "CHTFEUER"]);
    expect(lines.join("")).toBe("SEELENLEUCHTFEUER");
  });

  it("Wortumbruch bevorzugt, sonst ausbalanciert geteilt", () => {
    expect(slotNameLines("ARKANES BUCH", MAX_CHARS)).toEqual(["ARKANES BUCH"]);
    expect(slotNameLines("ARKANES BUCH", 11)).toEqual(["ARKANES", "BUCH"]);
    expect(slotNameLines("GEWITTERSIEGEL", MAX_CHARS)).toEqual(["GEWITTE", "RSIEGEL"]);
    expect(slotNameLines("GEWITTERSIEGEL", 11)).toEqual(["GEWITTE", "RSIEGEL"]);
    expect(slotNameLines("STURMRUNE", MAX_CHARS)).toEqual(["STURMRUNE"]);
  });
});
