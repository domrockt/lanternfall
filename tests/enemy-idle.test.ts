import { describe, expect, it, vi } from "vitest";

// M10-enemy-idle-anim-r2: Regression fuer die Idle-/Frame-Vertraege.
// K1-Befund: alle 30 Basis-Klassen haben 4 unterscheidbare Frames; das
// Standbild saß bei den 30 Elite-Rim-Framesets (vorher genau 1 Frame). Dieser
// Test pinnt beide Vertraege: Frameset-Groesse >= 2, 0 byte-identische
// Duplikate, nur Palettenindizes 0-31, binaeres Alpha (Pixel oder null).
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

const { ENEMY_LIST } = await import("../src/data/enemies");
const {
  ELITE_RIM_COLOR,
  ELITE_RIM_FRAMES,
  eliteFrameId,
  eliteRimFrame,
  enemySpriteFrames,
} = await import("../src/gfx/enemySprites");

const PALETTE_SIZE = 32;

function assertFrameset(frames: ReturnType<typeof enemySpriteFrames>, label: string): void {
  expect(frames.length, `${label}: mindestens 2 Frames`).toBeGreaterThanOrEqual(2);
  const sigs = new Set(frames.map((g) => g.map((r) => r.map((p) => (p === null ? "." : p.toString(36))).join("")) .join("\n")));
  expect(sigs.size, `${label}: 0 Frame-Duplikate`).toBe(frames.length);
  frames.forEach((g, i) => {
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[y].length; x++) {
        const p = g[y][x];
        expect(p === null || (p >= 0 && p < PALETTE_SIZE), `${label} Frame ${i} (${x},${y})=${p}: nur Palette/null`).toBe(true);
      }
    }
  });
}

describe("enemy-idle: Basis-Klassen (Frame-Bank GEN_ENEMIES)", () => {
  it("alle 30 Klassen: >= 2 Frames, 0 Duplikate, nur Palette, binaeres Alpha", () => {
    expect(ENEMY_LIST.length).toBe(30);
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      assertFrameset(enemySpriteFrames(i), ENEMY_LIST[i].id);
    }
  });

  it("Ruhepose (Frame 0) und Bob-Pose (Frame 1) jeder Klasse unterscheiden sich", () => {
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      const [f0, f1] = enemySpriteFrames(i);
      let diff = 0;
      for (let y = 0; y < f0.length; y++) {
        for (let x = 0; x < f0[y].length; x++) if (f0[y][x] !== f1[y][x]) diff++;
      }
      expect(diff, `${ENEMY_LIST[i].id}: Idle/Bob sichtbar`).toBeGreaterThan(0);
    }
  });
});

describe("enemy-idle: Elite-Rim-Framesets (Idle/Bob statt Standbild)", () => {
  it("alle 30 Rim-Framesets: genau 2 Frames, 0 Duplikate, nur Palette, binaeres Alpha", () => {
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      const keys = ELITE_RIM_FRAMES[eliteFrameId(ENEMY_LIST[i].id)];
      expect(keys?.length, `${ENEMY_LIST[i].id}: Rim-Frameset 2 Frames`).toBe(2);
      assertFrameset([eliteRimFrame(i, 0), eliteRimFrame(i, 1)], `${ENEMY_LIST[i].id}_rim`);
    }
  });

  it("Rim-Frame 2 (Bob) unterscheidet sich vom Ruhe-Rim, beide tragen den Amber-Rand", () => {
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      const r0 = eliteRimFrame(i, 0);
      const r1 = eliteRimFrame(i, 1);
      let diff = 0;
      let rim0 = 0;
      let rim1 = 0;
      for (let y = 0; y < r0.length; y++) {
        for (let x = 0; x < r0[y].length; x++) {
          if (r0[y][x] !== r1[y][x]) diff++;
          if (r0[y][x] === ELITE_RIM_COLOR) rim0++;
          if (r1[y][x] === ELITE_RIM_COLOR) rim1++;
        }
      }
      expect(diff, `${ENEMY_LIST[i].id}: Rim-Idle/Bob sichtbar`).toBeGreaterThan(0);
      expect(rim0, `${ENEMY_LIST[i].id}: Amber-Rand Pose 0`).toBeGreaterThan(0);
      expect(rim1, `${ENEMY_LIST[i].id}: Amber-Rand Pose 1`).toBeGreaterThan(0);
    }
  });
});
