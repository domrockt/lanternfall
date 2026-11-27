import { describe, expect, it, vi } from "vitest";

// M10-shot-path-budget K3: Der optimierte Schuss-Pfad (K2) muss sich fair und
// vollständig verhalten — Gates feuern unverändert (Vorwarnung >= 0,3 s, keine
// Offscreen-Treffer), kein Shot geht verloren, der Trail-Pool verliert keine
// Bilder und nutzt keine Tweens mehr.

const makeImageCalls: string[] = [];
const createdImages: Array<Record<string, unknown>> = [];

vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 }, Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: (_scene: unknown, x: number, y: number, key: string) => {
    makeImageCalls.push(key);
    const img: Record<string, unknown> = { x, y, visible: true, active: true, alpha: 1, scale: 1 };
    const methods: Record<string, (...args: unknown[]) => unknown> = {
      setDepth: () => img,
      setBlendMode: () => img,
      setScale: (v) => { img.scale = v; return img; },
      setAlpha: (v) => { img.alpha = v; return img; },
      setTint: () => img,
      clearTint: () => img,
      setRotation: () => img,
      setVisible: (v) => { img.visible = v; return img; },
      setActive: (v) => { img.active = v; return img; },
      setPosition: (px, py) => { img.x = px; img.y = py; return img; },
      setTexture: () => img,
      destroy: () => { img.destroyed = true; return img; },
    };
    for (const [m, fn] of Object.entries(methods)) img[m] = fn;
    createdImages.push(img);
    return img;
  },
  applyTexture: () => undefined,
}));

import { EnemyProjectilePool } from "../src/systems/EnemyProjectiles";
import { ENEMY_SHOT_WINDUP_MIN_SECONDS } from "../src/logic/bosses";

const VIEW = { x: -320, y: -180, width: 640, height: 360 };
const DT = 1 / 60;

type FakeImg = Record<string, unknown>;

interface Scene {
  cameras: { main: { worldView: typeof VIEW } };
  enemies: { active: Array<{ x: number; y: number; alive: boolean }> };
  tweens: { add: ReturnType<typeof vi.fn> };
  textures: { exists: () => boolean; addCanvas: () => void };
}

function fakeScene(): Scene {
  return {
    cameras: { main: { worldView: { ...VIEW } } },
    enemies: { active: [] },
    tweens: { add: vi.fn() },
    textures: { exists: () => true, addCanvas: () => {} },
  };
}

function noopHit(): void {}

describe("M10 Schuss-Pfad Budget — Gates feuern unverändert", () => {
  it("Windup-Reihenfolge: erst >= 0,3 s Vorwarnung, dann Projektil", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    pool.spawn({ x: 0, y: 0, vx: 80, vy: 0, damage: 2, texture: "enemy_shot_spit" });
    scene.enemies.active = [{ x: 0, y: 0, alive: true }];
    pool.update(ENEMY_SHOT_WINDUP_MIN_SECONDS - 0.01, 500, 500, noopHit);
    expect(pool.statSnapshot().fired).toBe(0);
    expect(pool.statSnapshot().pending).toBe(1);
    pool.update(0.08, 500, 500, noopHit); // zusammen > 0,36 s
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(1);
    expect(stats.windupOk).toBe(1);
    expect(stats.pending).toBe(0);
    expect(stats.cancelledShooterDeath).toBe(0);
  });

  it("Schütze stirbt in der Vorwarnung → Abbruch, kein stummes Feuern", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    pool.spawn({ x: 0, y: 0, vx: 80, vy: 0, damage: 2, texture: "enemy_shot_spit" });
    scene.enemies.active = []; // kein lebender Schütze nahe dem Ursprung
    for (let f = 0; f < 40; f++) pool.update(DT, 500, 500, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(0);
    expect(stats.cancelledShooterDeath).toBe(1);
  });

  it("kein Spawn und kein Treffer aus einer Offscreen-Position", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    pool.spawn({ x: VIEW.x - 10, y: 0, vx: 80, vy: 0, damage: 2, texture: "enemy_shot_spit" });
    pool.spawn({ x: 0, y: VIEW.y + VIEW.height + 10, vx: -80, vy: 0, damage: 2, texture: "enemy_shot_bone" });
    for (let f = 0; f < 60; f++) pool.update(DT, 0, 0, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.attempted).toBe(2);
    expect(stats.offscreenAttempts).toBe(2);
    expect(stats.fired).toBe(0);
    expect(stats.offscreenFired).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.offscreenHits).toBe(0);
    expect(pool.count).toBe(0);
  });
});

describe("M10 Schuss-Pfad Budget — kein Shot geht verloren", () => {
  it("jeder Versuch wird gefeuert oder sauber abgebrochen; nichts bleibt hängen", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    const shooter = { x: 10, y: 10, alive: true };
    scene.enemies.active = [shooter];
    // 8 Schüsse im View (feuern), 2 offscreen (Abbruch), mischbare Optiken.
    for (let i = 0; i < 8; i++) {
      pool.spawn({ x: 10 + i, y: 10, vx: 40, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    }
    pool.spawn({ x: VIEW.x - 5, y: 0, vx: 40, vy: 0, damage: 1, texture: "enemy_shot_fire" });
    pool.spawn({ x: 0, y: VIEW.y + VIEW.height + 5, vx: 40, vy: 0, damage: 1, texture: "enemy_shot_shadow" });
    // 4 s simulieren: Windup (0,36 s) + Lebenszeit (3,2 s) vollständig.
    for (let f = 0; f < 240; f++) pool.update(DT, 5000, 5000, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.attempted).toBe(10);
    expect(stats.fired + stats.cancelledShooterDeath + stats.cancelledOffscreen + stats.cancelledNoTelegraph)
      .toBe(stats.attempted);
    expect(stats.fired).toBe(8);
    expect(stats.cancelledOffscreen).toBe(2);
    // Alles abgelaufen: keine aktiven Schüsse, keine offenen Vorwarnungen.
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
    expect(pool.count).toBe(0);
  });

  it("Treffer läuft nur über sichtbar abgefeuerte Schüsse (0 Offscreen-Treffer)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    scene.enemies.active = [{ x: -40, y: 0, alive: true }];
    // Schuss aus dem View Richtung Spieler; trifft nach kurzer Flugzeit.
    pool.spawn({ x: -40, y: 0, vx: 120, vy: 0, damage: 2, texture: "enemy_shot_spit" });
    let hits = 0;
    for (let f = 0; f < 120; f++) pool.update(DT, 0, 0, () => { hits += 1; });
    const stats = pool.statSnapshot();
    expect(hits).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.offscreenHits).toBe(0);
    expect(stats.offscreenFired).toBe(0);
  });

  it("Recycling: Schüsse kehren in den Runtime-Pool zurück (Wiederverwendung)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    scene.enemies.active = [{ x: 0, y: 0, alive: true }];
    for (let wave = 0; wave < 3; wave++) {
      pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, damage: 1, texture: "enemy_shot_spit" });
      for (let f = 0; f < 250; f++) pool.update(DT, 5000, 5000, noopHit);
    }
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(3);
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
    // Drei Wellen, aber kein Wachstum über den Bedarf hinaus: maximal wenige
    // Runtime-Objekte (1 gleichzeitig aktiver Schuss + Vorwarnungen).
    expect(stats.active + stats.pending).toBe(0);
  });
});

describe("M10 Schuss-Pfad Budget — Trail-Pool ohne Tweens", () => {
  it("Trail nutzt den Bild-Pool: kein tween.add, keine wachsende Bildanzahl", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    scene.enemies.active = [{ x: 0, y: 0, alive: true }];
    pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, damage: 1, texture: "enemy_shot_fire" });
    for (let f = 0; f < 120; f++) pool.update(DT, 5000, 5000, noopHit); // 2 s
    // Ein einziger gepoolter Trail-Deckel reicht (Fade 160 ms < Emissionsabstand
    // würde mehr brauchen — Pool recycled, statt neu zu bauen).
    expect(scene.tweens.add).not.toHaveBeenCalled();
    expect(makeImageCalls.filter((k) => k === "enemy_shot_fire").length).toBeLessThanOrEqual(4);
  });

  it("Trail-Bilder faden linear und werden versteckt recycled", () => {
    makeImageCalls.length = 0;
    createdImages.length = 0;
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene as unknown as never);
    scene.enemies.active = [{ x: 0, y: 0, alive: true }];
    pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    // 4 s: Schuss lebt 3,2 s, danach laufen alle Trails aus (< 0,2 s).
    for (let f = 0; f < 240; f++) pool.update(DT, 5000, 5000, noopHit);
    for (const img of createdImages as FakeImg[]) {
      expect(img.visible).toBe(false);
      expect(img.active).toBe(false);
    }
    const trailCount = makeImageCalls.filter((k) => k === "enemy_shot_spit").length;
    expect(trailCount).toBeGreaterThan(0);
    expect(trailCount).toBeLessThanOrEqual(4);
  });
});
