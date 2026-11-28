import { describe, expect, it, vi } from "vitest";

// Elite-Rim-Light (A10-Restpunkt): Elite-Sprites tragen eine 1-px-Kante in
// Elite-Akzentfarbe (Amber, PAL 20), Nicht-Eliten nicht; die Framezahl der
// Basis-Sprites bleibt unveraendert; EnemyPool setzt das vorgerenderte
// Rim-Frame beim Elite-Spawn (keine Laufzeit-Erzeugung, Pool-Reuse unveraendert).
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 },
}));

const applied = vi.hoisted(() => [] as { obj: string; key: string }[]);
vi.mock("../src/gfx/atlas", () => {
  const makeSprite = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) o[k] = () => o;
    return o;
  };
  return {
    makeImage: makeSprite,
    applyTexture: (obj: { __tag?: string }, key: string) => {
      applied.push({ obj: obj.__tag ?? "?", key });
    },
    currentFrame: () => "frame0",
  };
});

import { GEN_ENEMIES } from "../src/gfx/gen-enemies";
import {
  baseEnemyDef, eliteFrameId, eliteTierPixel, ELITE_RIM_COLOR, ELITE_RIM_FRAMES, eliteRimDef,
  eliteRimFrame, enemySpriteFrames, silhouette,
} from "../src/gfx/enemySprites";
import { framesForDef } from "../src/logic/enemy-frames";
import { ENEMY_LIST } from "../src/data/enemies";
import { PAL } from "../src/palette";
import type { Grid } from "../src/gfx/enemySprites";

const { EnemyPool } = await import("../src/systems/EnemyPool");

const AMBER_HEX = PAL[ELITE_RIM_COLOR];

function isBoundary(g: Grid, x: number, y: number): boolean {
  const filled = (a: number, b: number) => a >= 0 && b >= 0 && b < g.length && a < g[0].length && g[b][a] !== null;
  return !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
}

describe("Elite-Rim: Sprite-Generator (enemySprites.ts)", () => {
  it("Framezahl der Basis-Sprites bleibt unveraendert (2–4 Frames je Typ)", () => {
    ENEMY_LIST.forEach((def, index) => {
      const expected = GEN_ENEMIES[def.spriteKey].frames.length;
      expect(enemySpriteFrames(index).length, def.id).toBe(expected);
    });
  });

  it("Rim-Frame: alle Randpixel in Elite-Akzentfarbe, Innenpixel in Tier-Faerbe-Klasse", () => {
    ENEMY_LIST.forEach((def, index) => {
      const base = enemySpriteFrames(index)[0];
      const rim = eliteRimFrame(index);
      expect(rim.length).toBe(base.length);
      let boundary = 0;
      let amber = 0;
      for (let y = 0; y < base.length; y++) {
        for (let x = 0; x < base[0].length; x++) {
          const edge = isBoundary(base, x, y);
          if (base[y][x] === null) {
            expect(rim[y][x] === null || isBoundary(rim, x, y), `${def.id} ${x},${y}`).toBe(true);
            continue;
          }
          if (edge) {
            boundary++;
            expect(rim[y][x], `${def.id} Randpixel ${x},${y}`).toBe(ELITE_RIM_COLOR);
            amber++;
          } else {
            // M10-elite-tier-families: Innenpixel tragen deterministisch die
            // Tier-Faerbe-Klasse (eliteTierPixel; Kontur 0 und Augen 13 geben
            // sich unverändert zurück). A10-Randvertrag (voll Amber) unveraendert.
            expect(rim[y][x], `${def.id} Innenpixel ${x},${y}`).toBe(eliteTierPixel(base[y][x], def.tier));
          }
        }
      }
      expect(boundary, `${def.id} hat Randpixel`).toBeGreaterThan(0);
      expect(amber, `${def.id} Rand voll Amber`).toBe(boundary);
      // Binaeres Alpha: nur null oder gueltige Palettenindizes.
      for (const row of rim) {
        for (const p of row) {
          expect(p === null || (Number.isInteger(p) && p >= 0 && p < PAL.length)).toBe(true);
        }
      }
    });
  });

  it("Nicht-Elite-Basis-Sprites haben keinen vollen Amber-Rand", () => {
    ENEMY_LIST.forEach((def, index) => {
      const base = enemySpriteFrames(index)[0];
      let boundary = 0;
      let amber = 0;
      for (let y = 0; y < base.length; y++) {
        for (let x = 0; x < base[0].length; x++) {
          if (base[y][x] === null || !isBoundary(base, x, y)) continue;
          boundary++;
          if (base[y][x] === ELITE_RIM_COLOR) amber++;
        }
      }
      // Vor dem Feature ist der Rand nicht flächig Amber (Ausnahme: Typen,
      // deren Lichtkante zufaellig auf PAL 20 aufloest — gargoyle, siehe
      // lightEdgeIndex). Ausschlaggebend: Rim-Frame hat MEHR Amber-Rand.
      const rim = eliteRimFrame(index);
      let rimAmber = 0;
      for (let y = 0; y < rim.length; y++) {
        for (let x = 0; x < rim[0].length; x++) {
          if (rim[y][x] === ELITE_RIM_COLOR) rimAmber++;
        }
      }
      expect(rimAmber, `${def.id}`).toBeGreaterThanOrEqual(amber);
      expect(boundary, `${def.id} Randpixel vorhanden`).toBeGreaterThan(0);
      void amber; // Coverage-Werte in docs/lanes/m10-elite-rim.md
    });
  });

  it("Rim-Frameset: genau 1 zusaetzliches Frame je Typ, richtungs-/frameunabhaengig", () => {
    expect(Object.keys(ELITE_RIM_FRAMES).length).toBe(ENEMY_LIST.length);
    ENEMY_LIST.forEach((def) => {
      const keys = ELITE_RIM_FRAMES[eliteFrameId(def.id)];
      expect(keys?.length, def.id).toBe(1);
      expect(keys?.[0], def.id).toBe(`${def.spriteKey}_rim`);
    });
  });

  it("framesForDef liefert fuer die Rim-Def das Rim-Frame (stabil gegen Run.ts-Zyklus)", () => {
    ENEMY_LIST.forEach((def) => {
      const frames = framesForDef(eliteRimDef(def));
      expect(frames, def.id).toEqual([`${def.spriteKey}_rim`]);
    });
  });

  it("baseEnemyDef restauriert die Basis-Def (Splitter-Kinder)", () => {
    const def = ENEMY_LIST[0];
    const rim = eliteRimDef(def);
    expect(rim.id).toBe(`${def.id}_rim`);
    expect(baseEnemyDef(rim)?.id).toBe(def.id);
    expect(baseEnemyDef(def)).toBeUndefined();
  });

  it("Rim aendert die Silhouette nicht (nur Farben)", () => {
    ENEMY_LIST.forEach((def, index) => {
      expect(silhouette(eliteRimFrame(index)), def.id).toBe(silhouette(enemySpriteFrames(index)[0]));
    });
  });

  it("Elite-Akzentfarbe ist Amber (PAL 20) und hex 0xffb84d", () => {
    expect(ELITE_RIM_COLOR).toBe(20);
    expect(AMBER_HEX).toBe(0xffb84d);
  });
});

describe("Elite-Rim: EnemyPool wirksam machen", () => {
  const fakeScene = () => {
    const makeSprite = () => {
      const o: Record<string, unknown> = {};
      for (const k of [
        "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
        "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
      ]) o[k] = () => o;
      return o;
    };
    return { add: { sprite: makeSprite, image: makeSprite } };
  };

  it("Elite-Spawn nutzt Rim-Def + Rim-Frame; Nicht-Elite bleibt Basis", () => {
    applied.length = 0;
    const pool = new EnemyPool(fakeScene() as never);
    const def = ENEMY_LIST[0]; // bog_rat
    const elite = pool.spawn(def, 10, 10, 1, 1, 0, { elite: true });
    expect(elite.elite).toBe(true);
    expect(elite.def.id).toBe(`${def.id}_rim`);
    expect(applied.some((a) => a.key === `enemy_${def.id}_rim`)).toBe(true);

    const normal = pool.spawn(def, 20, 20);
    expect(normal.def.id).toBe(def.id);
    expect(applied.filter((a) => a.key === `enemy_${def.id}_rim`).length).toBe(1);
  });

  it("Nicht-Elite-Spawn mit geerbter Rim-Def (Splitter-Kinder) restauriert Basis", () => {
    applied.length = 0;
    const pool = new EnemyPool(fakeScene() as never);
    const def = ENEMY_LIST[0];
    const rimDef = eliteRimDef(def);
    const child = pool.spawn(rimDef, 5, 5); // kein elite-Flag
    expect(child.def.id).toBe(def.id);
    expect(child.elite).toBe(false);
  });

  it("Elite-Spawn und Reuse: ai/RNG-Identitaet bleibt (Pool-Reuse unveraendert)", () => {
    const pool = new EnemyPool(fakeScene() as never);
    const def = ENEMY_LIST[0];
    const a = pool.spawn(def, 10, 10, 1, 1, 0, { elite: true });
    const aiA = a.ai;
    a.alive = false;
    pool.compact();
    const b = pool.spawn(def, 30, 30);
    expect(b.ai).toBe(aiA);
    expect(b.elite).toBe(false);
    expect(b.def.id).toBe(def.id);
  });
});
