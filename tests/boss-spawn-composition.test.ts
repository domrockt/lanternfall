import { describe, expect, it, vi } from "vitest";
// BossSystem importiert Phaser fuer die Szene; die reinen Kompositionsfunktionen
// brauchen kein DOM. Phaser wird fuer diesen Unit-Test neutral gemockt.
vi.mock("phaser", () => ({ default: {} }));
import { bossSpawnDistance } from "../src/logic/scaling";
import {
  BOSS_HUD_CLEARANCE, BOSS_SPRITE_SIZE, bossHudRects, bossSpriteRect, composedBossCenterY,
  rectsOverlap,
} from "../src/systems/BossSystem";

const VIEWS = [
  { width: 640, height: 360 },
  { width: 480, height: 360 },
];
const ANGLE_STEPS = 72;
const BOSS_IDS = ["moor_queen", "bone_lord", "pale_shepherd", "bell_golem", "coven", "hollow_king"];

describe("M10 A10 Boss-Spawn-Komposition", () => {
  it("kennt fuer alle 6 Bosse eine Sprite-Framegroesse", () => {
    expect(BOSS_SPRITE_SIZE).toHaveLength(6);
    expect(BOSS_IDS).toHaveLength(6);
    for (const size of BOSS_SPRITE_SIZE) expect(size).toBeGreaterThan(0);
  });

  for (const view of VIEWS) {
    for (let index = 0; index < 6; index++) {
      it(`${view.width}x${view.height} Boss ${BOSS_IDS[index]}: top >= hpBar.bottom + 6 und Banner disjunkt`, () => {
        const { hpBar, banner } = bossHudRects(view.width);
        const distance = bossSpawnDistance(view.width, view.height);
        const playerScreenX = view.width / 2;
        const playerScreenY = view.height / 2;
        for (let step = 0; step < ANGLE_STEPS; step++) {
          const angle = (step / ANGLE_STEPS) * Math.PI * 2;
          const desiredScreenY = playerScreenY + Math.sin(angle) * distance;
          const screenY = composedBossCenterY(
            desiredScreenY, playerScreenY, index, view.width, view.height,
          );
          const screenX = playerScreenX + Math.cos(angle) * distance;
          const rect = bossSpriteRect(screenX, screenY, index);
          expect(rect.y).toBeGreaterThanOrEqual(hpBar.y + hpBar.h + BOSS_HUD_CLEARANCE);
          expect(rectsOverlap(rect, banner)).toBe(false);
        }
      });
    }
  }
});
