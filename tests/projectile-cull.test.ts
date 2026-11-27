import { describe, expect, it, vi } from "vitest";

// ProjectilePool nutzt Phaser nur für BlendModes/GameObjects; im Node-Test
// werden Scene, Atlas-Helfer und DEPTH durch schlanke Stubs ersetzt.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/depth", () => ({ DEPTH: { death: 3, enemyShot: 5 } }));
vi.mock("../src/gfx/atlas", () => {
  const makeSprite = () => {
    const o: Record<string, unknown> = {
      visible: true, active: true, x: 0, y: 0, scaleX: 1,
    };
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint", "setRotation",
    ]) {
      o[k] = () => o;
    }
    o.setVisible = (v: boolean) => { o.visible = v; return o; };
    o.setActive = (v: boolean) => { o.active = v; return o; };
    o.setPosition = (x: number, y: number) => { o.x = x; o.y = y; return o; };
    return o;
  };
  return { makeImage: makeSprite, applyTexture: () => {}, currentFrame: () => "frame0" };
});

const { ProjectilePool } = await import("../src/systems/ProjectilePool");
import type { EnemyRuntime } from "../src/systems/EnemyPool";

const VIEW = { x: 960, y: 540, width: 640, height: 360 }; // Zentrum 1280,720

function fakeScene(opts: { cull?: number } = {}) {
  const registry = new Map<string, unknown>();
  if (opts.cull !== undefined) registry.set("lf-proj-cull", opts.cull);
  return {
    registryMap: registry, // für Laufzeit-Toggle in Tests
    add: { image: () => ({}) },
    cameras: { main: { worldView: { ...VIEW } } },
    registry: { get: (key: string) => registry.get(key) },
  };
}

function spawnOpts(over: Record<string, unknown> = {}) {
  return {
    x: 1280, y: 720, vx: 200, vy: 0, damage: 5, pierce: 0, knockback: 10,
    radius: 4, ...over,
  } as Parameters<InstanceType<typeof ProjectilePool>["spawn"]>[0];
}

const fakeEnemy = (uid: number, alive = true): EnemyRuntime => ({
  uid, alive, x: 1000, y: 600, hp: 10, maxHp: 10, radius: 6,
} as unknown as EnemyRuntime);

/** Projekttil-Weltposition relativ zum View-Zentrum setzen (die Sprite-Stubs sind rein dekorativ). */
describe("M10-projectile-cull: ProjectilePool", () => {
  it("0 Projektile: compact() läuft leer durch (Grenzfall 0)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    expect(() => pool.compact()).not.toThrow();
    expect(pool.active).toHaveLength(0);
    expect(pool.stats.culled).toBe(0);
  });

  it("1 Projektil onscreen: unverletzt — aktiv, sichtbar, Trail intakt", () => {
    const scene = fakeScene();
    const pool = new ProjectilePool(scene as never);
    const p = pool.spawn(spawnOpts({ trail: "fx_fire" }));
    p.x = 1280; p.y = 720; // View-Zentrum
    pool.compact();
    expect(p.active).toBe(true);
    expect(p.sprite.visible).toBe(true);
    expect(p.trail).toBe("fx_fire");
    expect(p.trailSetpoint).toBe("fx_fire");
    expect(pool.stats.culled).toBe(0);
    expect(pool.active).toHaveLength(1);
  });

  it("Offscreen-Recycle erfasst: >256px jenseits, ohne Target, wegfliegend -> frei", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const p = pool.spawn(spawnOpts({ vx: 300, vy: 0 }));
    p.x = VIEW.x + VIEW.width + 300; // 300px rechts jenseits des Views
    p.y = 720;
    pool.compact();
    expect(p.active).toBe(false);
    expect(pool.stats.culled).toBe(1);
    expect(pool.active).toHaveLength(0);
  });

  it("Mit Live-Target nicht recycelt (Homing könnte zurückkurven)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const p = pool.spawn(spawnOpts({ vx: 300, vy: 0, target: fakeEnemy(7) }));
    p.targetUid = 7;
    p.x = VIEW.x + VIEW.width + 300;
    p.y = 720;
    pool.compact();
    expect(p.active).toBe(true);
    expect(pool.stats.culled).toBe(0);
    // Draw-/Trail-Skip greift trotzdem:
    expect(p.sprite.visible).toBe(false);
    expect(p.trail).toBeNull();
    expect(p.trailSetpoint).toBeNull();
  });

  it("Ohne Target aber rückfliegend nicht recycelt", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const p = pool.spawn(spawnOpts({ vx: -300, vy: 0 })); // Richtung View-Zentrum
    p.x = VIEW.x + VIEW.width + 300;
    p.y = 720;
    pool.compact();
    expect(p.active).toBe(true);
    expect(pool.stats.culled).toBe(0);
  });

  it("Target gestorben: uid-Wechsel zählt als ohne Live-Target -> Recycle", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const dead = fakeEnemy(9, false);
    const p = pool.spawn(spawnOpts({ vx: 300, vy: 0, target: dead }));
    p.targetUid = 9;
    p.x = VIEW.x + VIEW.width + 300;
    p.y = 720;
    pool.compact();
    expect(p.active).toBe(false);
    expect(pool.stats.culled).toBe(1);
  });

  it("Trail-Suppression stellt den Original-Trail beim Zurückkehren wieder her", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const p = pool.spawn(spawnOpts({ trail: "fx_fire", target: fakeEnemy(3) }));
    p.targetUid = 3;
    pool.compact();
    expect(p.trail).toBe("fx_fire");
    p.x = VIEW.x + VIEW.width + 100; // innerhalb Cull-Margin, außerhalb Hide-Margin
    pool.compact();
    expect(p.trail).toBeNull();
    expect(p.trailSetpoint).toBe("fx_fire");
    expect(p.sprite.visible).toBe(false);
    p.x = 1280; // zurück im Bild
    pool.compact();
    expect(p.trail).toBe("fx_fire");
    expect(p.sprite.visible).toBe(true);
  });

  it("Grenzfall Cap+1: Pool erschöpft -> cull-erlaubtes Projektil wird gestohlen, kein weiteres Neuanlegen", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    pool.prewarm(2);
    // Zwei onscreen besetzen den Free-Stack:
    pool.spawn(spawnOpts());
    pool.spawn(spawnOpts({ x: 1200, y: 700 }));
    expect(pool.stats.created).toBe(0);
    // Drittes Projektil: Free-Stack leer, noch kein Kandidat -> genau eine Neuanlage.
    const far = pool.spawn(spawnOpts({ vx: 300, vy: 0 }));
    far.x = VIEW.x + VIEW.width + 300;
    far.y = 720;
    expect(pool.stats.created).toBe(1);
    const before = pool.active.length;
    // Cap+1: Free-Stack leer, aber ein steal-Kandidat existiert jetzt.
    pool.spawn(spawnOpts());
    expect(pool.stats.stolen).toBe(1);
    expect(pool.stats.created).toBe(1); // keine weitere Neuanlage
    expect(pool.active.length).toBe(before); // gestohlen statt gewachsen
  });

  it("Grenzfall Cap+1 ohne Kandidaten: genau eine Neuanlage (created 1)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    pool.prewarm(2);
    const a = pool.spawn(spawnOpts());
    const b = pool.spawn(spawnOpts({ x: 1200, y: 700 }));
    expect([a, b].length).toBe(2);
    const c = pool.spawn(spawnOpts({ x: 1210, y: 710 }));
    expect(c).toBeDefined();
    expect(pool.stats.created).toBe(1);
  });

  it("Kein Pool-Exhaust: 500 weit offscreen Projektile recyceln und werden vollständig wiederverwendet", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    pool.prewarm(500); // Warmup: kein Steal, reiner Reuse-Kreislauf
    for (let i = 0; i < 500; i++) {
      const p = pool.spawn(spawnOpts({ vx: 300, vy: 0 }));
      p.x = VIEW.x + VIEW.width + 300 + (i % 40);
      p.y = 720 + (i % 20);
    }
    expect(pool.stats.created).toBe(0);
    pool.compact();
    expect(pool.stats.culled).toBe(500);
    expect(pool.active).toHaveLength(0);
    for (let i = 0; i < 500; i++) pool.spawn(spawnOpts());
    expect(pool.stats.created).toBe(0); // kein einziges neues Objekt
    expect(pool.stats.reused).toBe(1000);
  });

  it("Flag lf-proj-cull=0 (Vorher-Verhalten): kein Recycle, kein Trail-Skip", () => {
    const pool = new ProjectilePool(fakeScene({ cull: 0 }) as never);
    const p = pool.spawn(spawnOpts({ trail: "fx_fire", vx: 300, vy: 0 }));
    p.x = VIEW.x + VIEW.width + 300;
    p.y = 720;
    pool.compact();
    expect(p.active).toBe(true);
    expect(pool.stats.culled).toBe(0);
    expect(p.trail).toBe("fx_fire");
    expect(p.sprite.visible).toBe(true);
  });

  it("Ohne Kamera (Test-Stub ohne cameras): kein Cull, kein Crash", () => {
    const scene = fakeScene();
    // @ts-expect-error Test-Stub absichtlich kaputt
    delete scene.cameras;
    const pool = new ProjectilePool(scene as never);
    const p = pool.spawn(spawnOpts());
    p.x = VIEW.x + VIEW.width + 300;
    pool.compact();
    expect(p.active).toBe(true);
    expect(pool.stats.culled).toBe(0);
  });

  it("Flag zur Laufzeit 1->0: versteckte Sprites/Trails werden restauriert (Review-Fix)", () => {
    const scene = fakeScene({ cull: 1 });
    const pool = new ProjectilePool(scene as never);
    const p = pool.spawn(spawnOpts({ trail: "fx_fire", target: fakeEnemy(5), vx: 300 }));
    p.targetUid = 5;
    p.x = VIEW.x + VIEW.width + 100;
    p.y = 720;
    pool.compact(); // Hide-/Trail-Skip aktiv
    expect(p.sprite.visible).toBe(false);
    expect(p.trail).toBeNull();
    scene.registryMap.set("lf-proj-cull", 0);
    pool.compact(); // Restore-Zweck: kein eingefrorener Unsichtbar-Zustand
    expect(p.sprite.visible).toBe(true);
    expect(p.trail).toBe("fx_fire");
  });

  it("Bereits inaktive Projektile werden weiterhin freigegeben (Kompaktion unverletzt)", () => {
    const pool = new ProjectilePool(fakeScene() as never);
    const a = pool.spawn(spawnOpts());
    const b = pool.spawn(spawnOpts({ x: 1200, y: 700 }));
    b.active = false; // Treffer-Pfad (CombatSystem) deaktiviert selbst
    pool.compact();
    expect(a.active).toBe(true);
    expect(pool.active).toHaveLength(1);
    expect(pool.active[0]).toBe(a);
  });
});
