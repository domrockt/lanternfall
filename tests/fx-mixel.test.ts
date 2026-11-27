import { describe, expect, it, vi } from "vitest";
import {
  FX_FRAME_COUNTS,
  FX_MIXEL_BASES,
  deathFrameSets,
  mixelBakes,
  mixelBaseFor,
  mixelFrameKey,
  mixelLevelFor,
  mixelLevel1Frames,
  mixelMaxLevel,
  mixelTextureKey,
} from "../src/gfx/gen-fx";
import { FxSystem, ParticleSystem, type FxRuntime } from "../src/systems/FxSystem";

vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

/**
 * M10-fx-mixel-fix (Dom-Wunsch 21:15Z, Punkt 4a): grosse Feuer-/Aura-Effekte
 * (fx_fire 14x14, fx_halo/fx_halo_cold 24x24, fx_shock 48x48) wurden mit
 * Scale > 1 gezeichnet — ein Textur-Pixel deckte 1,4–4,6 Spielpixel ab
 * (grobe 6–8-px-Bloecke). Guards:
 *   (a) Bake-Texturgroesse = Sprite-Pixelgroesse: w0*L x h0*L,
 *   (b) Level-Auswahl: Draw-Scale = Scale/L <= 1 fuer alle realen Caller-Scales,
 *   (c) kein Scale > 1 am Sprite-Draw in spawn und update,
 *   (d) Glow-Abstufungen fein: max. Farb-Run entlang des Zentralstrahls in der
 *       Stufen-Textur deutlich unter dem Level-1-Block,
 *   (e) nicht-Mixel-Keys und Level-1-Keys bleiben unveraendert.
 */

interface FakeSprite {
  width: number;
  height: number;
  visible: boolean;
  alpha: number;
  scaleCalls: Array<[number, number]>;
  blend: number;
  frame?: { name?: string };
  texture: { key: string };
  setAlpha(a: number): unknown;
  setBlendMode(m: number): unknown;
  setPosition(): unknown;
  setScale(x: number, y: number): unknown;
  setRotation(): unknown;
  setDepth(): unknown;
  setVisible(v: boolean): unknown;
  setActive(v: boolean): unknown;
  setTint(): unknown;
  clearTint(): unknown;
  setTexture(k: string): unknown;
}

function fakeSprite(w = 32, h = 32): FakeSprite {
  const rec: FakeSprite = {
    width: w,
    height: h,
    visible: false,
    alpha: 1,
    scaleCalls: [],
    blend: 0,
    frame: { name: "fx" },
    texture: { key: "fx_halo" },
    setAlpha(a: number) { rec.alpha = a; return rec; },
    setBlendMode(m: number) { rec.blend = m; return rec; },
    setPosition() { return rec; },
    setScale(x: number, y: number) { rec.scaleCalls.push([x, y]); return rec; },
    setRotation() { return rec; },
    setDepth() { return rec; },
    setVisible(v: boolean) { rec.visible = v; return rec; },
    setActive() { return rec; },
    setTint() { return rec; },
    clearTint() { return rec; },
    setTexture() { return rec; },
  };
  return rec;
}

function fakeScene(sprite: FakeSprite): { scene: Phaser.Scene } {
  const scene = {
    events: { once: () => {} },
    add: { image: () => sprite },
    time: { now: 0 },
  } as unknown as Phaser.Scene;
  return { scene };
}

/** Reale Caller-Scales (CombatSystem/Run) je Mixel-Basis — dokumentierte Oberranten. */
const CALLER_SCALES: Record<string, number[]> = {
  fx_fire: [1.4, 2.0, 1.2],          // ember-Aura, Explosion, Shards
  fx_halo: [2.8, 4.6, 1.4, 2.2],     // radius/12, Boss-Tod, Level-up
  fx_halo_cold: [1.8, 0.8],          // Soul-Orb-Halo
  fx_shock: [3.3, 2.6, 1.8, 0.4],    // Explosionsringe (Evolution/Boss)
};

const LEVEL1 = mixelLevel1Frames();

describe("Mixel-Bake: Effekt-Texturgroesse = Sprite-Pixelgroesse", () => {
  it("jede Stufe L rendert w0*L x h0*L (Frame-Zeilen passend)", () => {
    for (const bake of mixelBakes()) {
      const l1 = LEVEL1[bake.base];
      expect(bake.w).toBe(l1.w * bake.level);
      expect(bake.h).toBe(l1.h * bake.level);
      expect(bake.frames.length).toBe(l1.frames.length);
      for (const rows of bake.frames) {
        expect(rows.length).toBe(bake.h);
        for (const row of rows) expect(row.length).toBe(bake.w);
      }
    }
  });

  it("Level-1-Geometrie ist unveraendert (14/24/48er Sets, Frame-Counts gleich)", () => {
    expect(LEVEL1.fx_fire.w).toBe(14);
    expect(LEVEL1.fx_halo.w).toBe(24);
    expect(LEVEL1.fx_halo_cold.w).toBe(24);
    expect(LEVEL1.fx_shock.w).toBe(48);
    for (const base of FX_MIXEL_BASES) {
      expect(FX_FRAME_COUNTS[base]).toBe(LEVEL1[base].frames.length);
    }
  });

  it("nur Palettenfarben oder transparent (binaeres Alpha) in jeder Stufe", () => {
    const ok = (ch: string): boolean =>
      ch === "." || (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "v");
    for (const bake of mixelBakes()) {
      for (const grid of bake.frames) {
        for (const row of grid) for (const ch of row) expect(ok(ch)).toBe(true);
      }
    }
  });
});

describe("Level-Auswahl: Draw-Scale <= 1", () => {
  it("kleinste Stufe >= Scale, fuer alle realen Caller-Scales gilt Scale/L <= 1", () => {
    for (const [base, scales] of Object.entries(CALLER_SCALES)) {
      const max = mixelMaxLevel(base);
      expect(max).toBeGreaterThanOrEqual(1);
      for (const s of scales) {
        const level = mixelLevelFor(base, s);
        if (s <= 1) expect(level).toBe(1);
        else {
          expect(level).toBeGreaterThanOrEqual(2);
          expect(s / level).toBeLessThanOrEqual(1.000001);
          // nicht groeber als noetig: Stufe = ceil(Scale) (nicht darueber)
          expect(level).toBeLessThanOrEqual(Math.ceil(s));
        }
      }
      // Maximaler dokumentierter Scale jeder Basis bleibt unter der Stufengrenze
      expect(Math.max(...scales)).toBeLessThanOrEqual(max);
    }
  });

  it("Stufe waehlt nicht ueber den Base-Maximallevel hinaus (Scale 99 -> maxLevel)", () => {
    expect(mixelLevelFor("fx_halo", 99)).toBe(mixelMaxLevel("fx_halo"));
    expect(mixelLevelFor("fx_fire", 99)).toBe(mixelMaxLevel("fx_fire"));
  });

  it("Scale <= 1 und nicht-Mixel-Keys bleiben bei Level 1", () => {
    expect(mixelLevelFor("fx_halo", 1)).toBe(1);
    expect(mixelLevelFor("fx_halo", 0.5)).toBe(1);
    expect(mixelLevelFor("fx_star", 6)).toBe(1);
    expect(mixelLevelFor("fx_boss_core", 3.6)).toBe(1);
    expect(mixelLevelFor("fx_evo_hit_phoenix", 4)).toBe(1);
    expect(mixelLevelFor("fx_halo", Number.NaN)).toBe(1);
  });
});

describe("Stufen-Keys", () => {
  it("Level 1 und fremde Keys bleiben unveraendert", () => {
    expect(mixelTextureKey("fx_halo", 1)).toBe("fx_halo");
    expect(mixelFrameKey("fx_halo", 1)).toBe("fx_halo");
    expect(mixelFrameKey("fx_fire_3", 1)).toBe("fx_fire_3");
    expect(mixelFrameKey("fx_star", 4)).toBe("fx_star");
    expect(mixelFrameKey("fx_boss_core_2", 3)).toBe("fx_boss_core_2");
  });

  it("Frame-Key wird in die Stufen-Variante ueberfuehrt (Prefix-Transfer)", () => {
    expect(mixelFrameKey("fx_halo", 3)).toBe("fx_halo@3");
    expect(mixelFrameKey("fx_halo_2", 3)).toBe("fx_halo@3_2");
    expect(mixelFrameKey("fx_fire_5", 2)).toBe("fx_fire@2_5");
    // fx_halo_cold gewinnt den Prefix-Kampf gegen fx_halo
    expect(mixelBaseFor("fx_halo_cold")).toBe("fx_halo_cold");
    expect(mixelBaseFor("fx_halo_cold_2")).toBe("fx_halo_cold");
    expect(mixelFrameKey("fx_halo_cold_2", 2)).toBe("fx_halo_cold@2_2");
  });

  it("bereits umgeschriebene Stufen-Keys werden erkannt und umgekeyt (idempotent)", () => {
    expect(mixelBaseFor("fx_halo@2")).toBe("fx_halo");
    expect(mixelBaseFor("fx_halo@2_1")).toBe("fx_halo");
    expect(mixelBaseFor("fx_fire@3_5")).toBe("fx_fire");
    expect(mixelFrameKey("fx_halo@2_1", 3)).toBe("fx_halo@3_1");
    expect(mixelFrameKey("fx_halo@2", 5)).toBe("fx_halo@5");
    // Stufe 1 auf einem Stufen-Key: zurueck zum Level-1-Frame-Name
    expect(mixelFrameKey("fx_halo@2_1", 1)).toBe("fx_halo@2_1");
  });

  it("Todes-Frame-Sets bleiben unveraendert (kein Uebergriff der Bake-Stufen)", () => {
    const sets = deathFrameSets();
    expect(sets.fx_death_bone.w).toBe(9);
    expect(sets.fx_boss_core.w).toBe(32);
    expect(mixelBaseFor("fx_death_blob")).toBeNull();
    expect(mixelBaseFor("fx_boss_core")).toBeNull();
  });
});

describe("FxSystem Draw-Pfad: kein Scale > 1 bei Mixel-Effekten", () => {
  it("spawn: Stufe waehlen, Frames umschreiben, Sprite-Scale = Scale/L", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite).scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, life: 1, scaleFrom: 4.6, scaleTo: 4.6, frames: ["fx_halo", "fx_halo_2"] });
    expect(runtime).not.toBeNull();
    const rt = runtime as FxRuntime;
    // Spielpixel-Groesse bleibt dokumentiert; gezeichnet wird geteilt.
    expect(rt.scaleFrom).toBeCloseTo(4.6, 10);
    expect(rt.mixelLevel).toBe(5);
    expect(rt.frames[0]).toBe("fx_halo@5");
    expect(rt.frames[1]).toBe("fx_halo@5_2");
    const last = sprite.scaleCalls[sprite.scaleCalls.length - 1];
    expect(last[0]).toBeCloseTo(4.6 / 5, 10);
    expect(last[1]).toBeCloseTo(4.6 / 5, 10);
    expect(last[0]).toBeLessThanOrEqual(1.000001);
  });

  it("update: Tween durch den Stufen-Key bleibt <= 1 (von- bis bis-Scale)", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite).scene);
    fx.spawn({ texture: "fx_halo", x: 0, y: 0, life: 1, scaleFrom: 0.6, scaleTo: 2.2 });
    fx.update(0.5);
    fx.update(0.5);
    for (const [sx, sy] of sprite.scaleCalls) {
      expect(sx).toBeLessThanOrEqual(1.000001);
      expect(sy).toBeLessThanOrEqual(1.000001);
    }
  });

  it("Scale <= 1 zeichnet unveraendert Level-1 (kein Oversampling kleiner Effekte)", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite).scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, life: 1, scaleFrom: 0.8, scaleTo: 0.8 });
    const rt = runtime as FxRuntime;
    expect(rt.mixelLevel).toBe(1);
    expect(rt.frames[0]).toBe("fx_halo");
    const last = sprite.scaleCalls[sprite.scaleCalls.length - 1];
    expect(last[0]).toBeCloseTo(0.8, 10);
  });

  it("ParticleSystem: Feuer-Shards (Scale 1,2) zeichnen mit Stufe 2 unter 1", () => {
    const sprite = fakeSprite();
    const ps = new ParticleSystem(fakeScene(sprite).scene);
    const runtime = ps.spawn({ texture: "fx_fire", x: 0, y: 0, life: 1, scaleFrom: 1.2, scaleTo: 1.2 });
    const rt = runtime as FxRuntime;
    expect(rt.mixelLevel).toBe(2);
    expect(rt.frames[0]).toBe("fx_fire@2");
    const last = sprite.scaleCalls[sprite.scaleCalls.length - 1];
    expect(last[0]).toBeCloseTo(0.6, 10);
    expect(last[0]).toBeLessThanOrEqual(1.000001);
  });

  it("nicht-Mixel-Effekte behalten Draw-Scale = Scale (Signatur 32x32 bei 4,0)", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite).scene);
    const runtime = fx.spawn({ texture: "fx_evo_death_phoenix", x: 0, y: 0, life: 1, scaleFrom: 4, scaleTo: 4.6 });
    const rt = runtime as FxRuntime;
    expect(rt.mixelLevel).toBe(1);
    const last = sprite.scaleCalls[sprite.scaleCalls.length - 1];
    expect(last[0]).toBeCloseTo(4, 10);
  });
});

describe("Glow-Abstufungen: 1-px-Stufen statt Bloecke", () => {
  /**
   * Max. Run-Laenge eines Ramp-Farbpixels entlang des Zentralstrahls (+x).
   * Kern (d/c) und Transparenz zaehlen nicht — nur die Glow-Rampe.
   */
  function rampRun(frame: string[], w: number, h: number): number {
    const cy = h >> 1;
    const core = new Set([".", "d", "c"]);
    let run = 0;
    let best = 0;
    let prev = "";
    for (let x = 0; x < w; x++) {
      const ch = frame[cy][x];
      if (core.has(ch)) { run = 0; prev = ""; continue; }
      if (ch === prev) run++;
      else { run = 1; prev = ch; }
      best = Math.max(best, run);
    }
    return best;
  }

  /** Anzahl verschiedener Ramp-Farben auf dem Zentralstrahl. */
  function distinctColors(frame: string[], w: number, h: number): number {
    const cy = h >> 1;
    const set = new Set<string>();
    for (let x = 0; x < w; x++) {
      const ch = frame[cy][x];
      if (ch !== "." && ch !== "d" && ch !== "c") set.add(ch);
    }
    return set.size;
  }

  it("jede Stufe loest die Glow-Rampe in L-fach mehr Texturpixel auf als Level 1", () => {
    for (const bake of mixelBakes()) {
      const fi = bake.base === "fx_shock" ? 2 : 0;
      const l1 = LEVEL1[bake.base];
      const runL = rampRun(bake.frames[fi], bake.w, bake.h);
      const run1 = rampRun(l1.frames[fi], l1.w, l1.h);
      // Stufe L: das Band hat L-fach mehr Pixel (Quantisierung, +-1 Slack) …
      expect(runL).toBeGreaterThanOrEqual(run1 * (bake.level - 1) - 1);
      expect(runL).toBeGreaterThanOrEqual(run1);
      // … aber dieselbe physikalische Bandbreite: run/L == run1 (+-1 px).
      expect(Math.abs(runL / bake.level - run1)).toBeLessThanOrEqual(1);
      // Die Palette-Rampe bleibt vollstaendig erhalten (keine ausgebrennten Stufen).
      expect(distinctColors(bake.frames[fi], bake.w, bake.h)).toBeGreaterThanOrEqual(
        distinctColors(l1.frames[fi], l1.w, l1.h),
      );
    }
  });

  it("fx_halo Stufe 5 (Boss-Tod, Scale 4,6): Rampe mit 1-px-Stufen am Draw", () => {
    const bake = mixelBakes().find((b) => b.base === "fx_halo" && b.level === 5)!;
    const run1 = rampRun(LEVEL1.fx_halo.frames[0], 24, 24);
    const run5 = rampRun(bake.frames[0], bake.w, bake.h);
    // Gezeichnet mit Scale 4,6/5 = 0,92: ein Textur-Pixel <= 1 Spielpixel, der
    // groesste Farb-Schritt am Schirm schrumpft von ~4,6 px auf ~1 px.
    expect(run5 / 5).toBeLessThanOrEqual(run1 + 1);
    expect(run5).toBeGreaterThanOrEqual(run1 * 4);
  });
});
