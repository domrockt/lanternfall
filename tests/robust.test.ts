import { describe, expect, it } from "vitest";
import { integerScale } from "../src/logic/scale";
import { acquireVoiceSlot, busyVoiceCount, type VoiceSlot } from "../src/logic/voice-pool";

describe("Ganzzahlige Fenster-Skalierung", () => {
  it("liefert nur ganzzahlige Vielfache", () => {
    expect(integerScale(960, 540, 480, 270)).toBe(2);
    expect(integerScale(1440, 810, 480, 270)).toBe(3);
    expect(integerScale(191, 540, 480, 270)).toBe(1);
    expect(integerScale(800, 450, 480, 270)).toBe(1);
  });

  it("bleibt nie unter 1x und verkraftet ungueltige Masse", () => {
    expect(integerScale(100, 100, 480, 270)).toBe(1);
    expect(integerScale(0, 540, 480, 270)).toBe(1);
    expect(integerScale(Number.NaN, 540, 480, 270)).toBe(1);
    expect(integerScale(960, -1, 480, 270)).toBe(1);
  });

  it("begrenzt auf das kleinere Fensterverhaeltnis", () => {
    expect(integerScale(1920, 500, 480, 270)).toBe(1);
    expect(integerScale(1920, 1620, 480, 270)).toBe(4);
    expect(integerScale(3840, 2160, 480, 270)).toBe(8);
  });
});

describe("SFX-Stimmen-Pool", () => {
  it("nimmt zuerst eine freie Stimme", () => {
    const slots: VoiceSlot[] = [{ busy: true }, { busy: false }, { busy: true }];
    const picked = acquireVoiceSlot(slots, 4, () => {
      throw new Error("sollte keine neue Stimme anlegen");
    });
    expect(picked).toBe(slots[1]);
  });

  it("legt bis maxVoices neue Stimmen an und blockt danach", () => {
    const slots: VoiceSlot[] = [];
    for (let i = 0; i < 3; i++) {
      const s = acquireVoiceSlot(slots, 3, () => ({ busy: false }));
      expect(s).not.toBeNull();
      s!.busy = true;
    }
    expect(slots).toHaveLength(3);
    expect(busyVoiceCount(slots)).toBe(3);
    expect(acquireVoiceSlot(slots, 3, () => ({ busy: false }))).toBeNull();
    slots[0].busy = false;
    expect(acquireVoiceSlot(slots, 3, () => ({ busy: false }))).toBe(slots[0]);
  });

  it("verkraftet fehlgeschlagene Audio-Anlage ohne Wachstum", () => {
    const slots: VoiceSlot[] = [];
    expect(acquireVoiceSlot(slots, 4, () => null)).toBeNull();
    expect(slots).toHaveLength(0);
  });
});
