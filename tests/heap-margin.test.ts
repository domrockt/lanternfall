import { describe, expect, it, vi } from "vitest";

// Lane m10-heap-margin: Pool-Reuse und ProjectilePool-Freigabe müssen
// allokationsfrei im Steady State sein (kein Heap-Wachstum über Zyklen).
// Phaser wird wie in enemy-pool-reuse.test.ts durch schlanke Stubs ersetzt.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { death: 3, trail: 4, enemyShot: 5, fxLow: 6, decal: 7 },
}));
vi.mock("../src/gfx/atlas", () => {
  const makeImage = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
      "setRotation", "setFlipX", "setData",
    ]) o[k] = () => o;
    o.frame = { name: "frame0" };
    return o;
  };
  return {
    makeImage,
    applyTexture: () => {},
    currentFrame: () => "frame0",
  };
});

const { Pool } = await import("../src/systems/Pool");
const { ProjectilePool } = await import("../src/systems/ProjectilePool");

function fakeScene() {
  const sprites: unknown[] = [];
  const makeImage = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
      "setRotation", "setFlipX", "setData",
    ]) o[k] = () => o;
    sprites.push(o);
    return o;
  };
  return { add: { image: makeImage, sprite: makeImage }, sprites };
}

describe("Pool: Reuse ohne Neuanlage (Leak-frei)", () => {
  it("aktive Objektzahl ist konstant über 1000 Recycle-Zyklen, createdTotal wächst nicht", () => {
    let created = 0;
    const pool = new Pool<number>(() => ++created, () => {}, 8);
    for (let cycle = 0; cycle < 1000; cycle++) {
      const items: number[] = [];
      for (let i = 0; i < 12; i++) items.push(pool.obtain());
      expect(pool.activeCount).toBe(12);
      for (const item of items) pool.release(item);
      expect(pool.activeCount).toBe(0);
    }
    // Nach dem Prewarm (8) wird exakt einmal nachgelegt (12 gleichzeitig aktiv),
    // danach nie wieder: Reuse ist gestört, wenn created weiter wächst.
    expect(created).toBe(12);
    expect(pool.createdTotal).toBe(12);
    expect(pool.freeCount).toBe(12);
  });

  it("release unbekannter Objekte ändert nichts (kein Doppel-Eintrag)", () => {
    const pool = new Pool<number>(() => ({}) as unknown as number);
    const a = pool.obtain();
    pool.release(a);
    pool.release(a); // doppelt: kein zweiter Free-Eintrag
    pool.release({} as unknown as number); // fremd: ignoriert
    expect(pool.freeCount).toBe(1);
    expect(pool.activeCount).toBe(0);
    const b = pool.obtain();
    expect(b).toBe(a);
  });

  it("releaseAll gibt alle aktiven Objekte zurück, trim kapps den Free-Stack", () => {
    const pool = new Pool<number>(() => ({}) as unknown as number);
    for (let i = 0; i < 20; i++) pool.obtain();
    expect(pool.activeCount).toBe(20);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(20);
    const removed = pool.trim(5);
    expect(removed).toBe(15);
    expect(pool.freeCount).toBe(5);
  });
});

describe("ProjectilePool: deterministische Freigabe ohne Wachstum", () => {
  const SPAWN = {
    x: 1, y: 2, vx: 3, vy: 4, damage: 5, pierce: 0, knockback: 0,
  };

  it("gibt Projektile über 1000 Spawn/Free-Zyklen deterministisch frei (createdTotal konstant)", () => {
    const scene = fakeScene();
    const pool = new ProjectilePool(scene as never);
    let createdTotal = -1;
    for (let cycle = 0; cycle < 1000; cycle++) {
      const shots = [];
      for (let i = 0; i < 10; i++) shots.push(pool.spawn(SPAWN));
      expect(pool.active.length).toBe(10);
      // Jeder zweite fliegt weiter, der Rest deaktiviert → compact.
      for (let i = 0; i < 10; i += 2) shots[i].active = false;
      pool.compact();
      expect(pool.active.length).toBe(5);
      for (const s of shots) s.active = false;
      pool.compact();
      expect(pool.active.length).toBe(0);
      // Nach dem ersten Aufbau darf nie wieder ein Runtime-Objekt erzeugt
      // werden: Wir spiegeln das über die Sprite-Factory (scene.sprites.length).
      if (createdTotal < 0) createdTotal = scene.sprites.length;
      expect(scene.sprites.length).toBe(createdTotal);
    }
    expect(scene.sprites.length).toBe(createdTotal);
  });

  it("trailFrames behält Array-Identität über Spawns (kein Array-Churn pro Spawn)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const a = pool.spawn({ ...SPAWN, trail: "fx_trail_ember" });
    const framesA = a.trailFrames;
    expect(framesA).toEqual(["fx_trail_ember"]);
    a.active = false;
    pool.compact(); // zurück in den Free-Stack
    const b = pool.spawn({ ...SPAWN, trail: "fx_trail_ice" });
    expect(b).toBe(a); // identisches Runtime-Objekt (Reuse)
    expect(a.trailFrames).toBe(framesA); // gleiche Instanz, in place befüllt
    expect(framesA).toEqual(["fx_trail_ice"]);
    // Mehrere Frames werden in place kopiert, ohne neue Arrays.
    a.active = false;
    pool.compact();
    pool.spawn({ ...SPAWN, trailFrames: ["f1", "f2", "f3", "f4"] });
    expect(a.trailFrames).toBe(framesA);
    expect(framesA).toEqual(["f1", "f2", "f3", "f4"]);
    // Kein Trail: Array wird geleert, nicht ersetzt.
    a.active = false;
    pool.compact();
    pool.spawn({ ...SPAWN });
    expect(a.trailFrames).toBe(framesA);
    expect(framesA).toEqual([]);
  });

  it("hit-Set wird pro Spawn geleert (kein Wachstum der Trefferliste)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const p = pool.spawn(SPAWN);
    p.hit.add(1);
    p.hit.add(2);
    p.hit.add(3);
    p.active = false;
    pool.compact();
    const p2 = pool.spawn(SPAWN); // gleiches Runtime-Objekt wiederverwendet
    expect(p2).toBe(p);
    expect(p.hit.size).toBe(0);
  });

  it("prewarm baut den Free-Stack ohne aktive Objekte auf", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    pool.prewarm(24);
    expect(pool.active.length).toBe(0);
    const p = pool.spawn(SPAWN);
    expect(pool.active.length).toBe(1);
    p.active = false;
    pool.compact();
    expect(pool.active.length).toBe(0);
  });

  it("releaseAll deaktiviert alles und leert active", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    for (let i = 0; i < 6; i++) pool.spawn(SPAWN);
    pool.releaseAll();
    expect(pool.active.length).toBe(0);
    for (const p of pool.active) expect(p.active).toBe(false);
  });
});
