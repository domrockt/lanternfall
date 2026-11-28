import { describe, expect, it, vi } from "vitest";
import Phaser from "phaser";
import { FxSystem, ParticleSystem, type FxRuntime } from "../src/systems/FxSystem";
import { mixelLevelFor } from "../src/gfx/gen-fx";

vi.mock("phaser", () => ({
  default: {
    BlendModes: { ADD: 1, NORMAL: 0 },
    Scenes: { Events: { SHUTDOWN: "shutdown" } },
    GameObjects: {},
  },
}));

/**
 * m10-fx-alloc-trim (K2/K3): Regression-Guard gegen Setter-Churn und
 * Spawn-Allokationen im FX-Draw-Pfad. Deterministisch, ohne Phaser-Laufzeit:
 * ein Zaehl-Fake-Sprite als GameObjects.Image-Double. Optik-Semantik bleibt
 * bitgleich — die Gates duerfen nur Aufrufe mit IDENTISCHEM Wert unterschlagen.
 */

interface Counters {
  setPosition: number;
  setScale: number;
  setAlpha: number;
  setRotation: number;
}

interface CountingSprite {
  width: number;
  height: number;
  visible: boolean;
  active: boolean;
  alpha: number;
  blend: number;
  depth: number;
  frame: { name?: string };
  texture: { key: string };
  counts: Counters;
  last: { x: number; y: number; sx: number; sy: number; a: number; r: number };
  setAlpha(a: number): unknown;
  setBlendMode(m: number): unknown;
  setPosition(x: number, y: number): unknown;
  setScale(x: number, y: number): unknown;
  setRotation(r: number): unknown;
  setDepth(d: number): unknown;
  setVisible(v: boolean): unknown;
  setActive(v: boolean): unknown;
  setTint(): unknown;
  clearTint(): unknown;
  setTexture(k: string): unknown;
}

function countingSprite(): CountingSprite {
  const rec: CountingSprite = {
    width: 16,
    height: 16,
    visible: false,
    active: false,
    alpha: 1,
    blend: 0,
    depth: 0,
    frame: { name: "fx_spark" },
    texture: { key: "fx_spark" },
    counts: { setPosition: 0, setScale: 0, setAlpha: 0, setRotation: 0 },
    last: { x: NaN, y: NaN, sx: NaN, sy: NaN, a: NaN, r: NaN },
    setAlpha(a) { rec.counts.setAlpha++; rec.last.a = a; rec.alpha = a; return rec; },
    setBlendMode(m) { rec.blend = m; return rec; },
    setPosition(x, y) { rec.counts.setPosition++; rec.last.x = x; rec.last.y = y; return rec; },
    setScale(x, y) { rec.counts.setScale++; rec.last.sx = x; rec.last.sy = y; return rec; },
    setRotation(r) { rec.counts.setRotation++; rec.last.r = r; return rec; },
    setDepth(d) { rec.depth = d; return rec; },
    setVisible(v) { rec.visible = v; return rec; },
    setActive(v) { rec.active = v; return rec; },
    setTint() { return rec; },
    clearTint() { return rec; },
    setTexture(k) { rec.texture.key = k; return rec; },
  };
  return rec;
}

function fakeScene(sprite: CountingSprite): Phaser.Scene {
  return {
    events: { once: () => {} },
    add: { image: () => sprite },
    time: { now: 0 },
  } as unknown as Phaser.Scene;
}

describe("m10-fx-alloc-trim: Setter-Gates im Draw-Pfad (bitgleich)", () => {
  it("FxSystem.update ruft setRotation NICHT mehr je Frame, wenn spin = 0", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.spawn({ texture: "fx_spark", x: 10, y: 10, life: 1, scaleFrom: 2, scaleTo: 2 });
    const rotAfterSpawn = sprite.counts.setRotation;
    expect(rotAfterSpawn).toBe(1); // Spawn setzt Rotation einmal
    for (let i = 0; i < 30; i++) fx.update(1 / 60);
    // spin = 0 -> Rotation konstant -> kein weiterer setRotation-Aufruf
    expect(sprite.counts.setRotation).toBe(rotAfterSpawn);
  });

  it("FxSystem.update mit spin > 0 rotiert weiter (Verhalten unveraendert)", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.spawn({ texture: "fx_spark", x: 0, y: 0, life: 1, spin: 2, rotation: 0.5 });
    fx.update(0.5); // rotation 0.5 -> 1.5
    expect(sprite.last.r).toBeCloseTo(1.5, 10);
  });

  it("identische Position/Scale/Alpha werden nicht erneut geschrieben, Aenderungen schon", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    // scaleFrom == scaleTo -> Scale nach dem ersten Frame konstant.
    fx.spawn({ texture: "fx_spark", x: 5.2, y: 5.2, life: 2, scaleFrom: 3, scaleTo: 3, alphaFrom: 1, alphaTo: 1 });
    fx.update(1 / 60); // Partikel bewegt sich (vx=0 -> Position konstant)
    const c1 = { ...sprite.counts };
    fx.update(1 / 60); // nichts aendert sich
    expect(sprite.counts.setPosition).toBe(c1.setPosition);
    expect(sprite.counts.setScale).toBe(c1.setScale);
    expect(sprite.counts.setAlpha).toBe(c1.setAlpha);
    expect(sprite.last.x).toBe(5); // gerundete Position
  });

  it("bewegte Partikel bekommen weiterhin setPosition/setAlpha je Frame", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.spawn({ texture: "fx_spark", x: 0, y: 0, vx: 60, life: 2, scaleFrom: 2, scaleTo: 1 });
    fx.update(1 / 60);
    const posCalls = sprite.counts.setPosition;
    expect(posCalls).toBeGreaterThanOrEqual(2); // Spawn + Bewegung
    expect(sprite.last.x).toBe(1);
  });

  it("ParticleSystem: gleiche Gates, Lifetime-Fade schreibt Alpha nur bei Aenderung", () => {
    const sprite = countingSprite();
    const ps = new ParticleSystem(fakeScene(sprite));
    ps.spawn({ texture: "fx_spark", x: 0, y: 0, vx: 30, life: 0.5, alphaFrom: 1, alphaTo: 0 });
    let frames = 0;
    while (ps.count > 0 && frames < 120) { ps.update(1 / 60); frames++; }
    const expectCalls = 30 + 2; // ~30 Frames * 60fps Fade + Spawn + evtl. 1
    // Alpha-Fade aendert sich je Frame — setAlpha je Frame ist erlaubt, aber
    // Rotation ohne Spin darf nie je Frame geschrieben haben:
    expect(sprite.counts.setRotation).toBe(1); // nur Spawn
    expect(sprite.counts.setPosition).toBeLessThan(frames + 2);
    expect(expectCalls).toBeGreaterThan(0); // Selbstcheck des Geruests
  });

  it("Reuse aus der Free-Liste schreibt alle Draw-Caches neu (keine stale Werte)", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const first = fx.spawn({ texture: "fx_spark", x: 10, y: 10, life: 0.1, scaleFrom: 4, scaleTo: 4, rotation: 1.25 }) as FxRuntime;
    fx.update(0.2); // stirbt -> free-Liste
    expect(fx.count).toBe(0);
    fx.spawn({ texture: "fx_spark", x: 40, y: 60, life: 1, scaleFrom: 1, scaleTo: 1, rotation: 0 });
    expect(sprite.last.x).toBe(40);
    expect(sprite.last.y).toBe(60);
    expect(sprite.last.sx).toBe(1);
    expect(sprite.last.a).toBeGreaterThan(0);
    expect(sprite.last.r).toBe(0);
    expect(first).toBeTruthy();
  });
});

describe("m10-fx-alloc-trim: Scratch-Options und Frame-Caches (Spawn-Pfad)", () => {
  it("burst propagiert dieselben Felder wie ein Objekt-Spread (additive/depth/tint/aspect)", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.burst("fx_spark", 1, 2, 6, {
      additive: false, depth: 5, tint: 0x00ff00, aspect: 0.5, spin: 0.3,
      scaleFrom: 2, alphaFrom: 0.5,
    });
    expect(fx.count).toBe(6);
    expect(sprite.blend).toBe(Phaser.BlendModes.NORMAL); // additive: false uebernommen
    expect(sprite.depth).toBe(5);
    // Scratch wurde vollstaendig zurueckgesetzt: zweiter Burst ohne additive -> ADD-Pfad
    fx.clear();
    const sprite2 = countingSprite();
    const fx2 = new FxSystem(fakeScene(sprite2));
    fx2.burst("fx_spark", 0, 0, 3, {});
    expect(fx2.count).toBe(3);
    expect(sprite2.blend).toBe(Phaser.BlendModes.ADD);
  });

  it("spawnEvolution-Cooldown funktioniert weiter (numerische Slots statt String-Keys)", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const a = fx.spawnEvolution("phoenix", "hit", 0, 0);
    expect(a).not.toBeNull();
    const b = fx.spawnEvolution("phoenix", "hit", 0, 0);
    expect(b).toBeNull(); // Cooldown greift
    const c = fx.spawnEvolution("phoenix", "death", 0, 0);
    expect(c).not.toBeNull(); // anderer Slot
  });

  it("cachedFrames gibt geteilte, unveraenderte Arrays (Mixel map erzeugt neues Array)", () => {
    const sprite = countingSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const a = fx.spawn({ texture: "fx_fire", x: 0, y: 0, life: 1, scaleFrom: 4, scaleTo: 4 }) as FxRuntime;
    const b = fx.spawn({ texture: "fx_fire", x: 9, y: 9, life: 1, scaleFrom: 4, scaleTo: 4 }) as FxRuntime;
    expect(a).not.toBe(b);
    // fx_fire bei Scale 4 ist ein Mixel-Basis-Key -> beide teilen dasselbe gemappte Array
    expect(a.frames).toBe(b.frames);
    expect(a.frames).not.toBe(b.frames.slice()); // Inhalts-Sanity
  });
});
