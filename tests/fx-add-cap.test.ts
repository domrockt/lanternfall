import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ADD_GLOW_ALPHA_FLOOR,
  ADD_GLOW_MAX_SCREEN_AREA,
  glowAreaCapForRenderScale,
  clampGlowScreenArea,
} from "../src/systems/FxSystem";
import { setRenderScale } from "../src/config";

/**
 * M10-A4 (Bedarfsmeldung m10-android-perf, 2026-11-27): ADD-Glows klein halten
 * und ueber die bestehenden LOD-Caps zaehlen. Messbasis
 * shots/m10-fx-add-cap-baseline.json: fx-Pool ~217k Device-Pixel ADD-Overdraw
 * bei nur ~17 Sprites (fx_halo 492x492 dev-px bei alpha 0,014). Die Deckel hier
 * sind rein visuell — kein Gameplay-/Balance-Eingriff.
 */

describe("glowAreaCapForRenderScale (Deckel nur wenn der DPR-Budget-Regler gesenkt hat)", () => {
  it("RENDER_SCALE 1 (iGPU/GPU, volllaufend): kein Deckel", () => {
    expect(glowAreaCapForRenderScale(1)).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForRenderScale(0.5)).toBe(Number.POSITIVE_INFINITY);
  });

  it("RENDER_SCALE > 1 (Regler aktiv, Android-Sicherheitsnetz): Deckel ADD_GLOW_MAX_SCREEN_AREA", () => {
    expect(glowAreaCapForRenderScale(2)).toBe(ADD_GLOW_MAX_SCREEN_AREA);
    expect(glowAreaCapForRenderScale(3)).toBe(ADD_GLOW_MAX_SCREEN_AREA);
    expect(glowAreaCapForRenderScale(1.0001)).toBe(ADD_GLOW_MAX_SCREEN_AREA);
  });

  it("ungueltige Werte deckeln nie (nie kleiner als volllaufend)", () => {
    expect(glowAreaCapForRenderScale(0)).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForRenderScale(-1)).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForRenderScale(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForRenderScale(Number.NEGATIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForRenderScale(Number.POSITIVE_INFINITY)).toBe(ADD_GLOW_MAX_SCREEN_AREA);
  });
});

describe("clampGlowScreenArea (Flaeche, nicht Kante)", () => {
  const INF = Number.POSITIVE_INFINITY;

  it("unter dem Deckel: unveraendert, capped=false", () => {
    const r = clampGlowScreenArea(32, 32, 2, 2, 1, INF);
    expect(r).toEqual({ scaleFrom: 2, scaleTo: 2, capped: false });
  });

  it("ueber dem Deckel: Faktor sqrt(cap/Flaeche), Flaeche danach <= cap", () => {
    // 32x32 Textur, Scale 6 -> 192x192 Device-Pixel = 36864 px^2 > 9216
    const r = clampGlowScreenArea(32, 32, 6, 6, 1, 9216);
    expect(r.capped).toBe(true);
    expect(r.scaleFrom).toBeCloseTo(3, 10);
    expect(r.scaleTo).toBeCloseTo(3, 10);
    const area = 32 * 32 * r.scaleFrom * r.scaleFrom;
    expect(area).toBeLessThanOrEqual(9216 + 1e-6);
  });

  it("Seitenverhaeltnis bleibt erhalten (Ring bleibt rund)", () => {
    const r = clampGlowScreenArea(64, 48, 4, 4, 1, 4096);
    const wBefore = 64 * 4;
    const hBefore = 48 * 4;
    const wAfter = 64 * r.scaleFrom;
    const hAfter = 48 * r.scaleFrom;
    expect(wAfter / hAfter).toBeCloseTo(wBefore / hBefore, 10);
    expect(64 * 48 * r.scaleFrom * r.scaleFrom).toBeLessThanOrEqual(4096 + 1e-6);
  });

  it("duenne Beams bleiben lang: Flaeche, nicht die lange Kante, wird begrenzt", () => {
    // Blitz-Segment 12x16, in Y auf 120 gestreckt, X nur 1,5 breit:
    // Flaeche 18*120 = 2160 < 9216 -> NICHT cappen.
    const r = clampGlowScreenArea(12, 16, 7.5, 7.5, 0.2, 9216);
    expect(r.capped).toBe(false);
  });

  it("nimmt das Maximum aus scaleFrom/scaleTo (Tween bleibt unter dem Deckel)", () => {
    const r = clampGlowScreenArea(32, 32, 1, 8, 1, 9216);
    expect(r.capped).toBe(true);
    expect(r.scaleTo).toBeCloseTo(3, 10);
    expect(r.scaleFrom).toBeLessThan(1);
  });

  it("Guards: capArea 0/NaN/Inf/ohne und Texturgroesse 0 -> unveraendert", () => {
    expect(clampGlowScreenArea(32, 32, 6, 6, 1, 0)).toEqual({ scaleFrom: 6, scaleTo: 6, capped: false });
    expect(clampGlowScreenArea(32, 32, 6, 6, 1, Number.NaN)).toEqual({ scaleFrom: 6, scaleTo: 6, capped: false });
    expect(clampGlowScreenArea(32, 32, 6, 6, 1, INF)).toEqual({ scaleFrom: 6, scaleTo: 6, capped: false });
    expect(clampGlowScreenArea(0, 0, 6, 6, 1, 9216)).toEqual({ scaleFrom: 6, scaleTo: 6, capped: false });
    expect(clampGlowScreenArea(32, 32, -6, -6, 1, 9216).capped).toBe(true);
  });

  it("deterministisch: gleiche Eingaben, gleiche Ausgaben", () => {
    const a = clampGlowScreenArea(64, 64, 5, 2, 0.5, 9216);
    const b = clampGlowScreenArea(64, 64, 5, 2, 0.5, 9216);
    expect(a).toEqual(b);
  });
});

/**
 * Verdrahtung in FxSystem/ParticleSystem. Phaser wird wie in
 * tests/fx-overdraw.test.ts gemockt; Sprites sind Fakes mit setScale-Log.
 */
import Phaser from "phaser";
import { FxSystem, ParticleSystem, type FxRuntime } from "../src/systems/FxSystem";
import { glowCapFor } from "../src/gfx/gen-fx";

vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

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
    blend: Phaser.BlendModes.NORMAL,
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

function fakeScene(sprite: FakeSprite): { scene: Phaser.Scene; addCalls: number } {
  const ctx = { addCalls: 0 };
  const scene = {
    events: { once: () => {} },
    add: { image: () => { ctx.addCalls++; return sprite; } },
    time: { now: 0 },
  } as unknown as Phaser.Scene;
  return { scene, addCalls: ctx.addCalls };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  setRenderScale(1); // Reglerstufe zuruecksetzen (Live-Binding RENDER_SCALE)
});

describe("ADD-Glow-Screengroessen-Deckel (spawn)", () => {
  it("K2 (m10-android-scale-floor-r2): setRenderScale(2) wird auf 1 geklemmt — kein Teiler-Cap beim Spawn", () => {
    // RENDER_SCALE_MAX ist seit K2 hart 1: der Teiler-Regler kann den Buffer
    // nicht mehr senken, der Flaechen-Deckel ueber RENDER_SCALE greift nie.
    // Die Laststeuerung kommt stattdessen ueber die Qualitaetsstufe (K3).
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    expect(setRenderScale(2)).toBe(1);
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, scaleFrom: 6, scaleTo: 6, life: 1 });
    expect(runtime?.scaleFrom).toBe(6);
    expect(runtime?.scaleTo).toBe(6);
  });

  it("RENDER_SCALE 1 (iGPU): grosser Glow bleibt volllaufend, auch bei dpr 3", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    setRenderScale(1);
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, scaleFrom: 6, scaleTo: 6, life: 1 });
    expect(runtime?.scaleFrom).toBe(6);
    expect(runtime?.scaleTo).toBe(6);
  });

  it("kein window (Node-Tests, RENDER_SCALE 1): unveraendert", () => {
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, scaleFrom: 6, scaleTo: 6, life: 1 });
    expect(runtime?.scaleFrom).toBe(6);
  });

  it("NORMAL-Blend (additive:false) wird nicht gecappt", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    setRenderScale(2);
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_decal", x: 0, y: 0, scaleFrom: 6, scaleTo: 6, additive: false, life: 1 });
    expect(runtime?.scaleFrom).toBe(6);
  });

  it("kleiner Glow bleibt unveraendert (Deckel greift erst ab 96x96 dev-px)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    setRenderScale(2);
    const sprite = fakeSprite(16, 16);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_spark", x: 0, y: 0, scaleFrom: 3, scaleTo: 3, life: 1 });
    // (16*3)^2 = 2304 <= 9216
    expect(runtime?.scaleFrom).toBe(3);
  });

  it("ParticleSystem: K2 klemmt RENDER_SCALE auf 1 — kein Teiler-Cap mehr (Qualitaetsstufe folgt in K3)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    setRenderScale(2);
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const ps = new ParticleSystem(scene);
    const p = ps.spawn({ texture: "fx_spark", x: 0, y: 0, scaleFrom: 6, scaleTo: 6, life: 1 });
    expect(p?.scaleFrom).toBe(6);
  });
});

describe("ADD-Glow-Alpha-Boden (ausgebrannte Glows freigeben)", () => {
  it("fx-Pool: Glow unter 4 % Alpha wird im Update freigegeben (Slot + Liste)", () => {
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, life: 1, alphaFrom: 0.9, alphaTo: 0 });
    expect(runtime).not.toBeNull();
    expect(fx.glowUsed).toBe(1);
    expect(fx.count).toBe(1);
    // life 1, alphaFrom 0.9: nach dt 0.96 bleibt alpha = 0.9*0.04 = 0.036 <= 0.04
    fx.update(0.96);
    expect(fx.count).toBe(0);
    expect(fx.glowUsed).toBe(0);
    expect(sprite.visible).toBe(false);
  });

  it("NORMAL-Sprites werden nicht ueber den Alpha-Boden entfernt", () => {
    const sprite = fakeSprite(32, 32);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    fx.spawn({ texture: "fx_decal", x: 0, y: 0, life: 1, alphaFrom: 0.9, alphaTo: 0, additive: false });
    expect(fx.count).toBe(1);
    fx.update(0.96);
    expect(fx.count).toBe(1);
  });

  it("ParticleSystem: gleicher Boden", () => {
    const sprite = fakeSprite(16, 16);
    const { scene } = fakeScene(sprite);
    const ps = new ParticleSystem(scene);
    ps.spawn({ texture: "fx_spark", x: 0, y: 0, life: 1, alphaFrom: 0.9, alphaTo: 0 });
    expect(ps.glowUsed).toBe(1);
    ps.update(0.96);
    expect(ps.count).toBe(0);
    expect(ps.glowUsed).toBe(0);
  });
});

describe("Anzahl ueber LOD-Caps zaehlen (geteilter Glow-Deckel)", () => {
  it("Cap bleibt hart: glowUsed <= glowCapFor(full), auch bei 100 Spawns", () => {
    const sprite = fakeSprite(8, 8);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    fx.setMaxActive(180); // full -> Cap 72
    for (let i = 0; i < 100; i++) {
      fx.spawn({ texture: "fx_halo", x: i, y: 0, life: 10 });
      expect(fx.glowUsed).toBeLessThanOrEqual(fx.glowCap);
    }
    expect(fx.glowUsed).toBe(glowCapFor("full"));
  });

  it("FxSystem + ParticleSystem teilen sich einen Deckel", () => {
    const sprite = fakeSprite(8, 8);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const ps = new ParticleSystem(scene);
    fx.setMaxActive(180);
    for (let i = 0; i < 50; i++) fx.spawn({ texture: "fx_halo", x: i, y: 0, life: 10 });
    for (let i = 0; i < 50; i++) ps.spawn({ texture: "fx_spark", x: i, y: 0, life: 10 });
    expect(fx.glowUsed).toBe(glowCapFor("full"));
    expect(ps.glowUsed).toBe(glowCapFor("full"));
  });

  it("setEnemyLoad koppelt den Deckel an lodFor/ambientBudgetFor (nur gelesen)", () => {
    const sprite = fakeSprite(8, 8);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    fx.setMaxActive(180); // Cap 72
    fx.setEnemyLoad(100); // full, Ambient-Glows noch an -> unverändert 72
    expect(fx.glowCap).toBe(glowCapFor("full"));
    fx.setEnemyLoad(300); // reduced, aber Ambient glow 0 -> minimal-Deckel 24
    expect(fx.glowCap).toBe(glowCapFor("minimal"));
    fx.setEnemyLoad(500); // minimal -> bleibt 24
    expect(fx.glowCap).toBe(glowCapFor("minimal"));
    fx.setEnemyLoad(50); // drosselt nur, hebt nie wieder an
    expect(fx.glowCap).toBe(glowCapFor("minimal"));
    expect(fx.glowCap).toBeLessThan(glowCapFor("full"));
  });

  it("setEnemyLoad am ParticleSystem greift auf denselben geteilten Deckel", () => {
    const sprite = fakeSprite(8, 8);
    const { scene } = fakeScene(sprite);
    const fx = new FxSystem(scene);
    const ps = new ParticleSystem(scene);
    fx.setMaxActive(180);
    ps.setEnemyLoad(400);
    expect(fx.glowCap).toBe(glowCapFor("minimal"));
    expect(ps.glowCap).toBe(glowCapFor("minimal"));
  });
});

describe("Determinismus", () => {
  it("gleiche Spawn-Sequenz -> identische Scales (LCG unveraendert, Deckel aktiv)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    setRenderScale(2);
    const run = (): number[] => {
      const sprite = fakeSprite(32, 32);
      const { scene } = fakeScene(sprite);
      const fx = new FxSystem(scene);
      fx.burst("fx_halo", 0, 0, 12, { scaleFrom: 4, scaleTo: 0.2, life: 0.3 });
      return (fx.active as FxRuntime[]).map((f) => Math.round(f.scaleFrom * 1e6));
    };
    expect(run()).toEqual(run());
  });

  it("Alpha-Boden ist dokumentiert auf 4 % (Abnahme-Vorgabe A4)", () => {
    expect(ADD_GLOW_ALPHA_FLOOR).toBe(0.04);
  });
});
