import { describe, expect, it, vi } from "vitest";

// m10-gc-sawtooth-trim (K3): Guard-Test für den gepoolten Projectile-Pfad.
//
// 1. Reuse im Burst: nach Warmup erzeugt der Pool im Sim-Step-Wechselbad
//    (spawn/compact/release) 0 neue Runtime-Objekte — „Snapshot-Zähler“:
//    stats.created und die Identitätsmenge der Runtimes bleiben konstant.
// 2. „Nur bei Änderung setzen“: gleiche Textur/Tiefe/Blend beim Reuse wird
//    NICHT erneut gesetzt (setDepth würde je Aufruf einen Scene-weiten
//    StableSort queuen, setTexture/setBlendMode churnen den Draw-Pfad);
//    echte Änderungen werden weiterhin gesetzt.
// 3. Bestehende Pool-Verträge: hit-Set-Identität bleibt über Reuse erhalten
//    (wird geleert, nie neu angelegt).
//
// Phaser und Atlas-Helfer wie in heap-pool-fix.test.ts durch schlanke Stubs
// ersetzt; der Sprite-Stub spiegelt texture/frame/blendMode/depth als
// einfache Felder, damit die „nur bei Änderung“-Vergleiche greifen.

vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 },
}));
vi.mock("../src/systems/FxSystem", () => ({ FX_GLOW_DEPTH: 9 }));

interface StubImage {
  texture: { key: string };
  frame: { name: string };
  blendMode: number;
  depth: number;
  visible: boolean;
  active: boolean;
  calls: Record<string, number>;
}

vi.mock("../src/gfx/atlas", () => {
  const ATLAS_KEY = "runtime_atlas";
  const makeStub = (): StubImage => ({
    texture: { key: ATLAS_KEY },
    frame: { name: "projectile_ember" },
    blendMode: 0,
    depth: 3,
    visible: false,
    active: false,
    calls: {},
  });
  const rec = (o: StubImage, k: string) => { o.calls[k] = (o.calls[k] ?? 0) + 1; };
  const chain = (o: StubImage) => {
    const setDepth = (d: number) => { rec(o, "setDepth"); o.depth = d; return o; };
    const setBlendMode = (b: number) => { rec(o, "setBlendMode"); o.blendMode = b; return o; };
    const setVisible = (v: boolean) => { rec(o, "setVisible"); o.visible = v; return o; };
    const setActive = (v: boolean) => { rec(o, "setActive"); o.active = v; return o; };
    return { setDepth, setBlendMode, setVisible, setActive, setPosition: () => o, setRotation: () => o, setScale: () => o };
  };
  return {
    ATLAS_KEY,
    makeImage: () => { const o = makeStub(); return Object.assign(o, chain(o)); },
    // simuliert atlasierte Keys: Frame-Name = Key, Textur bleibt der Atlas.
    applyTexture: (o: StubImage, key: string) => {
      o.texture = { key: ATLAS_KEY };
      o.frame = { name: key };
      rec(o, "setTexture");
    },
    currentFrame: (o: StubImage) => o.frame.name,
  };
});

const { ProjectilePool } = await import("../src/systems/ProjectilePool");

type SceneLike = {
  cameras: { main: unknown };
  registry: { get: (key: string) => unknown };
};

function scene(view = { x: 0, y: 0, width: 640, height: 360 }): SceneLike {
  return {
    cameras: { main: { ...view } },
    registry: { get: () => 1 },
  };
}

function spawnOpts(i: number, texture = "projectile_ember") {
  return {
    x: i % 200, y: (i * 7) % 120, vx: 100, vy: -50, damage: 1, pierce: 0,
    knockback: 5, life: 0.5, weaponId: "ember", texture, radius: 4,
  };
}

describe("gc-sawtooth-trim: gepoolte Pfade erzeugen 0 Objekte im Sim-Step", () => {
  it("Snapshot-Zähler: Warmup wächst, danach created konstant & Identitätsmenge stabil", () => {
    const pool = new ProjectilePool(scene() as never);
    pool.prewarm(64);
    // Bestehender Vertrag: prewarm zählt stats.created NICHT (nur Spawn-Pfad).
    expect(pool.stats.created).toBe(0);

    // Warmup-Burst: Pool wächst auf den Peak (erlaubte Neuanlage).
    for (let i = 0; i < 300; i++) pool.spawn(spawnOpts(i));
    pool.releaseAll();
    const createdAfterWarmup = pool.stats.created;

    // Sim-Step-Wechselbad: 2000 Zyklen spawn (gemischt ADD/NORMAL, 2 Texturen)
    // + compact()/releaseAll() — nach dem Warmup darf NICHTS neu angelegt werden.
    let sawAdd = false;
    let sawNormal = false;
    for (let i = 0; i < 2000; i++) {
      const blendAdd = i % 3 === 0;
      const texture = i % 2 === 0 ? "projectile_ember" : "projectile_phoenix";
      if (blendAdd) sawAdd = true; else sawNormal = true;
      pool.spawn({ ...spawnOpts(i, texture), blendAdd });
      if (i % 8 === 7) pool.compact();
      if (i % 16 === 15) pool.releaseAll();
    }
    expect(sawAdd).toBe(true);
    expect(sawNormal).toBe(true);
    expect(pool.stats.created).toBe(createdAfterWarmup);
    expect(pool.stats.reused).toBeGreaterThanOrEqual(2000 - createdAfterWarmup);
  });

  it("hit-Set-Identität bleibt über Reuse erhalten (leeren statt neu anlegen)", () => {
    const pool = new ProjectilePool(scene() as never);
    const a = pool.spawn(spawnOpts(1));
    a.hit.add(11);
    a.hit.add(12);
    pool.releaseAll();
    const b = pool.spawn(spawnOpts(2));
    expect(b).toBe(a);
    expect(b.hit).toBe(a.hit);
    expect(b.hit.size).toBe(0);
  });
});

describe("gc-sawtooth-trim: nur bei Änderung setzen", () => {
  it("gleiche Textur/Tiefe/Blend beim Reuse: 0 erneute Setter-Aufrufe", () => {
    const pool = new ProjectilePool(scene() as never);
    const p = pool.spawn(spawnOpts(1));
    const sprite = p.sprite as unknown as StubImage;
    const afterFirst = { ...sprite.calls };
    // 50 Reuse-Spawns mit identischem Profil (gleiche Textur, NORMAL, death).
    for (let i = 0; i < 50; i++) {
      pool.releaseAll();
      pool.spawn(spawnOpts(i));
    }
    expect(sprite.calls.setTexture ?? 0).toBe(afterFirst.setTexture ?? 0);
    expect(sprite.calls.setBlendMode ?? 0).toBe(afterFirst.setBlendMode ?? 0);
    expect(sprite.calls.setDepth ?? 0).toBe(afterFirst.setDepth ?? 0);
    // Werte stimmen weiterhin:
    expect(sprite.frame.name).toBe("projectile_ember");
    expect(sprite.depth).toBe(3); // DEPTH.death
    expect(sprite.blendMode).toBe(0); // NORMAL
    expect(sprite.visible).toBe(true);
  });

  it("echte Änderungen (ADD-Band, andere Textur) werden weiterhin gesetzt", () => {
    const pool = new ProjectilePool(scene() as never);
    const p = pool.spawn(spawnOpts(1));
    const sprite = p.sprite as unknown as StubImage;
    const first = sprite.calls.setTexture ?? 0;
    pool.releaseAll();
    pool.spawn({ ...spawnOpts(2), texture: "projectile_phoenix", blendAdd: true });
    expect(sprite.frame.name).toBe("projectile_phoenix");
    expect(sprite.blendMode).toBe(1); // ADD
    expect(sprite.depth).toBe(9); // FX_GLOW_DEPTH
    expect(sprite.calls.setTexture ?? 0).toBe(first + 1);
    // und zurück:
    pool.releaseAll();
    pool.spawn(spawnOpts(3));
    expect(sprite.frame.name).toBe("projectile_ember");
    expect(sprite.blendMode).toBe(0);
    expect(sprite.depth).toBe(3);
    expect(sprite.calls.setTexture ?? 0).toBe(first + 2);
  });

  it("Nicht-Atlas-Zweig: Texture-Key-Gleichstand überspringt, Fremd-Textur setzt", () => {
    const pool = new ProjectilePool(scene() as never);
    const p = pool.spawn(spawnOpts(1));
    const sprite = p.sprite as unknown as StubImage;
    // Simulation einer Standalone-Textur (wie echtes Phaser: Frame __BASE).
    sprite.texture = { key: "projectile_ember" };
    sprite.frame = { name: "__BASE" };
    const before = sprite.calls.setTexture ?? 0;
    pool.releaseAll();
    pool.spawn(spawnOpts(5)); // gleicher Nicht-Atlas-Key -> Skip
    expect(sprite.calls.setTexture ?? 0).toBe(before);
    // fremder Key -> wird gesetzt
    sprite.texture = { key: "ganz_anders" };
    sprite.frame = { name: "__BASE" };
    pool.releaseAll();
    pool.spawn(spawnOpts(6));
    expect(sprite.calls.setTexture ?? 0).toBe(before + 1);
    expect(sprite.frame.name).toBe("projectile_ember"); // Mock: atlasiert
  });
});
