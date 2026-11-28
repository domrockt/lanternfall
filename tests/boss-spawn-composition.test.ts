import { describe, expect, it, vi } from "vitest";
// BossSystem importiert Phaser fuer die Szene; die reinen Kompositionsfunktionen
// brauchen kein DOM. Phaser wird fuer diesen Unit-Test neutral gemockt.
vi.mock("phaser", () => ({ default: {} }));
import { bossSpawnDistance } from "../src/logic/scaling";
import { BOSSES } from "../src/data/bosses";
import {
  BOSS_HUD_CLEARANCE, BOSS_INTRO_ZOOM, BOSS_SPRITE_SIZE, bossHudRects, bossSpriteRect,
  bossSpriteScreenRect, composedBossCenterY, rectsOverlap,
} from "../src/systems/BossSystem";

const VIEWS = [
  { width: 640, height: 360 },
  { width: 480, height: 360 },
];
const ANGLE_STEPS = 72;

describe("M10 A10 Boss-Spawn-Komposition", () => {
  it("kennt fuer alle 6 Bosse eine Sprite-Framegroesse", () => {
    expect(BOSS_SPRITE_SIZE).toHaveLength(6);
    expect(BOSSES).toHaveLength(6);
    for (let i = 0; i < BOSSES.length; i++) {
      expect(BOSSES[i].index).toBe(i);
      expect(BOSS_SPRITE_SIZE[i]).toBeGreaterThan(0);
    }
  });

  for (const view of VIEWS) {
    for (let index = 0; index < 6; index++) {
      it(`${view.width}x${view.height} Boss ${BOSSES[index].id}: top >= Banner.bottom + 6 und Banner disjunkt`, () => {
        const { banner } = bossHudRects(view.width);
        const safeTop = banner.y + banner.h + BOSS_HUD_CLEARANCE;
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
          expect(rect.y).toBeGreaterThanOrEqual(safeTop);
          expect(rectsOverlap(rect, banner)).toBe(false);
        }
      });

      // A10-Restpunkt (m10-boss-spawn-lower): Invariante gegen die HP-Leiste
      // selbst (nicht nur Banner) — im Spawn-Moment muss das Boss-Sprite-Rect
      // UNTER der Leiste beginnen (rect.y >= bar.bottom) und sie nicht
      // schneiden. Zusätzlich die Puls-Magnifikation der Render-Teiler
      // (BOSS_INTRO_ZOOM * s, s = 1..3): der Intro-Zoom-Tween kaempft mit
      // enforceCameraProjection, Worst-Case-Magnifikation = 1.14 * Teiler.
      for (const s of [1, 2, 3]) {
        it(`${view.width}x${view.height} Boss ${BOSSES[index].id}: Puls-Magnifikation 1.14*${s} — unter HP-Leiste, kein Schnitt`, () => {
          const { hpBar, banner } = bossHudRects(view.width);
          const distance = bossSpawnDistance(view.width, view.height);
          const playerScreenX = view.width / 2;
          for (const playerScreenY of [90, 180, 270]) {
            for (let step = 0; step < ANGLE_STEPS; step++) {
              const angle = (step / ANGLE_STEPS) * Math.PI * 2;
              const desiredScreenY = playerScreenY + Math.sin(angle) * distance;
              const screenY = composedBossCenterY(
                desiredScreenY, playerScreenY, index, view.width, view.height,
                0, BOSS_INTRO_ZOOM * s,
              );
              const screenX = playerScreenX + Math.cos(angle) * distance;
              const worldX = screenX + 100;
              const rect = bossSpriteScreenRect(
                worldX, screenY, index, 100, 0, BOSS_INTRO_ZOOM * s,
                view.width, view.height,
              );
              expect(rect.y).toBeGreaterThanOrEqual(hpBar.y + hpBar.h);
              expect(rectsOverlap(rect, hpBar)).toBe(false);
              expect(rectsOverlap(rect, banner)).toBe(false);
            }
          }
        });
      }

      it(`${view.width}x${view.height} Boss ${BOSSES[index].id}: auch bei Intro-Zoom 1,14 und Weltkanten frei`, () => {
        const { banner } = bossHudRects(view.width);
        const safeTop = banner.y + banner.h + BOSS_HUD_CLEARANCE;
        const distance = bossSpawnDistance(view.width, view.height);
        for (const camTop of [0, 2000, 3736]) {
          for (const playerScreenY of [30, 180, 300]) {
            for (let step = 0; step < ANGLE_STEPS; step++) {
              const angle = (step / ANGLE_STEPS) * Math.PI * 2;
              const desiredScreenY = playerScreenY + Math.sin(angle) * distance;
              const screenY = composedBossCenterY(
                desiredScreenY, playerScreenY, index, view.width, view.height,
                camTop, BOSS_INTRO_ZOOM,
              );
              const screenX = view.width / 2 + Math.cos(angle) * distance;
              const worldX = screenX + 100;
              const worldY = camTop + screenY;
              const rect = bossSpriteScreenRect(
                worldX, worldY, index, 100, camTop, BOSS_INTRO_ZOOM,
                view.width, view.height,
              );
              expect(rect.y).toBeGreaterThanOrEqual(safeTop);
              expect(rectsOverlap(rect, banner)).toBe(false);
            }
          }
        }
      });
    }
  }
});
