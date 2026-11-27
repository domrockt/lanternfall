// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { describe, expect, it, vi } from "vitest";

/**
 * m10-boss-death-shards: Boss-Tod-Partikel im ParticleSystem (Folgekarte aus
 * m10-boss-fx-contrast). Beim Boss-Tod laufen killsFx -> particles.burst
 * ("fx_boss_core") und playBossDeathFx -> particles.shards(...). Dort griffen
 * die #5220-Ausnahmen aus dem FxSystem-Pfad bisher NICHT — der Boss-Tod wurde
 * ausgewaschen (Ist-Messung shots/m10-boss-shards-before.json). Erwartet:
 *  - Boss-Partikel (fx_boss_core): NORMAL, Alpha >= 0,7, kein Glow-Slot,
 *    keine fxAlpha-/dpr-Daempfung (auch bei alphaScale 0,72 und dpr 3),
 *  - reguläre Partikel unverändert: ADD + Daempfung + Glow-Slot (Regression).
 */
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

import Phaser from "phaser";
import { isBossFxKey } from "../src/gfx/gen-fx";
import {
  BOSS_FX_ALPHA_FLOOR,
  FxSystem,
  ParticleSystem,
  type FxRuntime,
} from "../src/systems/FxSystem";

type SpriteRec = {
  textureKey: string;
  alpha: number;
  blend: number;
  scale: number;
};

function makeSprite(rec: SpriteRec): Record<string, unknown> {
  const s: Record<string, unknown> = {
    width: 32,
    height: 32,
    alpha: 1,
    texture: { key: "" },
    setTexture(key: string) {
      rec.textureKey = key;
      (s.texture as { key: string }).key = key;
      return s;
    },
    setPosition() { return s; },
    setScale(sx: number) { rec.scale = sx; return s; },
    setAlpha(a: number) { rec.alpha = a; return s; },
    setRotation() { return s; },
    setDepth() { return s; },
    setBlendMode(m: number) { rec.blend = m; return s; },
    setTint() { return s; },
    clearTint() { return s; },
    setVisible() { return s; },
    setActive() { return s; },
  };
  return s;
}

function makeParticleSystem(): { ps: ParticleSystem; recs: SpriteRec[] } {
  const recs: SpriteRec[] = [];
  const scene = {
    add: {
      image: () => {
        const rec: SpriteRec = { textureKey: "", alpha: 1, blend: Phaser.BlendModes.NORMAL, scale: 1 };
        recs.push(rec);
        return makeSprite(rec);
      },
    },
    events: { once: () => {} },
  } as unknown as Phaser.Scene;
  return { ps: new ParticleSystem(scene), recs };
}

/** Reduced-LOD wie in der Ist-Messung (283 Gegner): alphaScale 0,72. */
const REDUCED = 0.72;

describe("m10-boss-death-shards: Boss-Partikel im ParticleSystem (#5220-Analog)", () => {
  it("Key-Erkennung: fx_boss_core ja (Textur + Frame 0), reguläre Keys nein", () => {
    expect(isBossFxKey("fx_boss_core")).toBe(true);
    // Frame 0 traegt den Basis-Key (fxFrames); Frame-Keys (fx_boss_core_2)
    // erkennt gen-fx bewusst ebenfalls als Boss-FX (StartsWith auf die Basis):
    expect(isBossFxKey("fx_boss_core_2")).toBe(true);
    for (const key of ["fx_fire", "fx_death_bone", "fx_halo", "fx_spark", undefined, null]) {
      expect(isBossFxKey(key)).toBe(false);
    }
  });

  it("Boss-Kern (killsFx-Pfad): NORMAL + Alpha-Boden 0,7 trotz reduced-LOD-Daempfung", () => {
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    // killsFx: burst("fx_boss_core") mit additive:false, alphaFrom 0,95 (Shard)
    ps.burst("fx_boss_core", 10, 10, 3, { life: 1.1, additive: false, alphaFrom: 0.95 });
    expect(ps.count).toBe(3);
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.additive).toBe(false);
    expect(rt.glow).toBe(false);
    expect(rt.alphaFrom).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
    expect(recs[0].alpha).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
  });

  it("Boss-Rim (alphaFrom 0,35 in der Spec) wird auf den Boden 0,7 geklemmt, nicht weggedaempft", () => {
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    // killsFx: rim-Burst mit alphaFrom 0,35 — Ist-Stand: 0,35 * 0,72 = 0,252.
    ps.burst("fx_boss_core", 0, 0, 2, { life: 1.05, additive: false, alphaFrom: 0.35 });
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.alphaFrom).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].alpha).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
  });

  it("Boss-Partikel sind von der dpr-Alpha-Daempfung ausgenommen (additiver Spec-Fall, dpr 3)", () => {
    // dissolve/sputter-Bosse spawnen fx_boss_core mit additive:true — der Fix
    // stellt auf NORMAL um statt den ADD-Pfad (mit dpr-Alpha) zu nutzen.
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    ps.burst("fx_boss_core", 0, 0, 2, { life: 1.4, additive: true, alphaFrom: 0.95 });
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.additive).toBe(false); // bewusst NORMAL (ADD kann nicht abdunkeln)
    expect(rt.glow).toBe(false); // kein Glow-Slot
    expect(rt.alphaFrom).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
  });

  it("setAlphaScale verschiebt laufende Boss-Partikel nicht mehr (Peak bleibt lesbar)", () => {
    const { ps, recs } = makeParticleSystem();
    ps.burst("fx_boss_core", 0, 0, 2, { life: 1.1, additive: false, alphaFrom: 0.95 });
    ps.setAlphaScale(0.5); // LOD-Wechsel mitten im Boss-Tod
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.alphaFrom).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].alpha).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
  });

  it("Boss-Partikel belegen keinen Glow-Slot (Deckel bleibt fuer reguläre FX frei)", () => {
    const { ps } = makeParticleSystem();
    ps.setMaxActive(280); // full
    ps.burst("fx_boss_core", 0, 0, 20, { life: 1.1, additive: true, alphaFrom: 0.95 });
    expect(ps.glowUsed).toBe(0);
    expect(ps.glowCap).toBeGreaterThan(0);
  });

  it("Boss-Shards via shards() (playBossDeathFx-Muster) mit Frame-Liste werden erkannt", () => {
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    ps.shards("fx_boss_core", 0, 0, 4, { life: 0.9, scaleFrom: 1.35, additive: false, alphaFrom: 1 });
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.frames[0]).toBe("fx_boss_core");
    expect(rt.alphaFrom).toBeGreaterThanOrEqual(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
  });
});

describe("m10-boss-death-shards: Regression — reguläre Partikel bleiben unveraendert", () => {
  it("fx_fire-Shard (playBossDeathFx): ADD + Glow-Slot + fxAlpha-/dpr-Daempfung", () => {
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    ps.shards("fx_fire", 0, 0, 6, { life: 0.8, scaleFrom: 1.2, additive: true });
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.additive).toBe(true);
    expect(rt.glow).toBe(true);
    // Ist-Stand: shards() default alphaFrom 1 -> 1 * 0,72 * 0,72 = 0,5184 @dpr1
    // (alphaScale squared beim ADD-Pfad; Messung: 0,518)
    expect(rt.alphaFrom).toBeCloseTo(1 * REDUCED * REDUCED, 5);
    expect(rt.alphaFrom).toBeLessThan(BOSS_FX_ALPHA_FLOOR);
    expect(recs[0].blend).toBe(Phaser.BlendModes.ADD);
    expect(recs[0].alpha).toBeCloseTo(1 * REDUCED * REDUCED, 5);
  });

  it("fx_death_bone-Shard: additive:false, aber weiter von alphaScale daempfbar (Ist-Stand 0,72)", () => {
    const { ps, recs } = makeParticleSystem();
    ps.setAlphaScale(REDUCED);
    ps.shards("fx_death_bone", 0, 0, 6, { life: 0.9, additive: false, alphaFrom: 1 });
    const rt = (ps.active as FxRuntime[])[0];
    expect(rt.additive).toBe(false);
    expect(rt.glow).toBe(false);
    expect(rt.alphaFrom).toBeCloseTo(REDUCED, 5);
    expect(recs[0].blend).toBe(Phaser.BlendModes.NORMAL);
  });

  it("Glow-Deckel zaehlt weiter: 40 fx_fire-Slots fuellen den Cap, Boss-Keys nicht", () => {
    const { ps } = makeParticleSystem();
    ps.setMaxActive(280); // full -> Cap wie fx-overdraw (72 gesamt, hier solo)
    ps.shards("fx_fire", 0, 0, 100, { life: 0.8, additive: true });
    expect(ps.glowUsed).toBe(ps.glowCap);
    ps.burst("fx_boss_core", 0, 0, 10, { life: 1.1, additive: true, alphaFrom: 0.95 });
    expect(ps.glowUsed).toBe(ps.glowCap); // Boss-Partikel haben nichts belegt
  });

  it("FxSystem unberuehrt: reguläre ADD-FX daempfen weiter wie zuvor", () => {
    const scene = {
      add: { image: () => makeSprite({ textureKey: "", alpha: 1, blend: 0, scale: 1 }) },
      events: { once: () => {} },
    } as unknown as Phaser.Scene;
    const fx = new FxSystem(scene);
    fx.setAlphaScale(REDUCED);
    const rt = fx.spawn({ texture: "fx_fire", x: 0, y: 0, additive: true });
    expect(rt).not.toBeNull();
    expect((rt as FxRuntime).additive).toBe(true);
    expect((rt as FxRuntime).alphaFrom).toBeCloseTo(0.9 * REDUCED * REDUCED, 5);
  });
});
