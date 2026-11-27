import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die geprueften Konstanten/Werte sind rein.
// Phaser wird neutral gemockt (PixelText erweitert Phaser.GameObjects.Container).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import { computeView } from "../src/logic/view";
import {
  BOSS_HUD_CLEARANCE, BOSS_SAFE_TOP, BOSS_SPRITE_SIZE, bossHudRects, bossSpriteRect,
  composedBossCenterY, rectsOverlap,
} from "../src/systems/BossSystem";
import { BANNER_FADE_IN_MS, BANNER_HOLD_MS, BANNER_FADE_OUT_MS } from "../src/scenes/UI";

// Dom-Wunsch 21:15Z (4b): Boss-Banner fest unter der HP-Leiste, keine Kollision
// mit Schadenszahlen. Die 3 Fensterformate laufen ueber die echte computeView-
// Kette (640x360 und 960x540 fallen auf Fit 480x360, 1280x720 auf 640x360).
const WINDOWS = [
  { label: "640x360", width: 640, height: 360 },
  { label: "960x540", width: 960, height: 540 },
  { label: "1280x720", width: 1280, height: 720 },
];
const BOSS_IDS = ["moor_queen", "bone_lord", "pale_shepherd", "bell_golem", "coven", "hollow_king"];

/**
 * Damage-Text-Rect eines BOSSES an der komponierten Position: Zahl startet
 * 8 px ueber der Sprite-Mitte und driftet 18 px nach oben (DamageNumbers),
 * 7 px hoch. Scope: nur Boss-Zahlen — die safeTop-Kette garantiert fuer sie
 * "unter dem Banner". Zahlen normaler Gegner an der View-Oberkante sind nicht
 * komponiert und koennen das Banner-Rect geometrisch weiter schneiden; sie
 * liegen aber hinter dem opaken Banner (UI-Szene ueber Run-Szene) und sind
 * damit nicht sichtbar kollidierend — dokumentiert in der Lane-Doku (K2).
 */
function bossDamageRect(centerY: number, big: boolean) {
  const scale = big ? 1.6 : 1;
  const w = (5 * 6 - 1) * scale; // 5-stellige Zahl im Bitmap-Font
  const h = 7 * scale;
  const top = centerY - 8 - 18;
  return { x: -(w / 2), y: top, w, h }; // x egal: Overlap hier nur vertikal relevant
}

describe("M10 Boss-Banner-Layout (Dom 4b)", () => {
  for (const win of WINDOWS) {
    it(`${win.label}: Banner haengt fest unter der HP-Leiste (Rect-Kette, kein freier Mitte-Wert)`, () => {
      const spec = computeView({ width: win.width, height: win.height, dpr: 1 });
      const { hpBar, banner } = bossHudRects(spec.width);
      expect(banner.y).toBeGreaterThanOrEqual(hpBar.y + hpBar.h);
      expect(banner.y).toBe(hpBar.y + hpBar.h + BOSS_HUD_CLEARANCE);
      expect(banner.y + banner.h).toBeLessThan(spec.height / 2); // oberes Drittel, kein Spielfeld-Panel
    });

    for (let index = 0; index < BOSS_IDS.length; index++) {
      it(`${win.label} Boss ${BOSS_IDS[index]}: Damage-Text-Rect schneidet das Banner-Rect nicht`, () => {
        const spec = computeView({ width: win.width, height: win.height, dpr: 1 });
        const { banner } = bossHudRects(spec.width);
        const distance = spec.width; // Ring-Distanz egal: worst case ist der nach-oben-Winkel
        for (let step = 0; step < 72; step++) {
          const angle = (step / 72) * Math.PI * 2;
          const centerY = composedBossCenterY(
            spec.height / 2 + Math.sin(angle) * -distance,
            spec.height / 2, index, spec.width, spec.height,
          );
          const sprite = bossSpriteRect(0, centerY, index);
          expect(sprite.y).toBeGreaterThanOrEqual(banner.y + banner.h + BOSS_HUD_CLEARANCE);
          for (const big of [false, true]) {
            const dmg = bossDamageRect(centerY, big);
            dmg.x = banner.x + banner.w / 2 - dmg.w / 2; // horizontal ueber dem Banner
            expect(rectsOverlap(dmg, banner)).toBe(false);
          }
        }
      });
    }

    it(`${win.label}: Banner-Rect ist horizontal im View`, () => {
      const spec = computeView({ width: win.width, height: win.height, dpr: 1 });
      const { banner } = bossHudRects(spec.width);
      expect(banner.x).toBeGreaterThanOrEqual(0);
      expect(banner.x + banner.w).toBeLessThanOrEqual(spec.width);
    });
  }

  it("safeTop-Fallback entspricht der Rect-Kette (hpBar + Banner + Luft)", () => {
    const { hpBar, banner } = bossHudRects(640);
    const safeTop = Math.max(hpBar.y + hpBar.h, banner.y + banner.h) + BOSS_HUD_CLEARANCE;
    expect(safeTop).toBe(banner.y + banner.h + BOSS_HUD_CLEARANCE);
    // BOSS_SAFE_TOP ist aus derselben Kette abgeleitet, kein Literal (Review-Hinweis).
    expect(BOSS_SAFE_TOP).toBe(safeTop);
  });

  it("Banner-Timer: kurz einblenden, halten, ausblenden (verschwindet nach < 3 s)", () => {
    expect(BANNER_FADE_IN_MS).toBeLessThan(BANNER_HOLD_MS);
    expect(BANNER_HOLD_MS + BANNER_FADE_OUT_MS).toBeLessThan(3000);
    expect(BANNER_FADE_OUT_MS).toBeGreaterThan(0);
  });

  it("Sprite-Framegroessen unveraendert (kein Eingriff in Boss-Spawn-Logik)", () => {
    expect(BOSS_SPRITE_SIZE).toEqual([56, 64, 72, 80, 96, 96]);
  });
});
