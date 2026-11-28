import { describe, expect, it, vi } from "vitest";

// m10-heap-pool-fix: deterministische Wiederverwendungs-/Allokationsprüfung
// für ProjectilePool (K3). Phaser und Atlas-Helfer werden wie in
// enemy-pool-reuse.test.ts durch schlanke Stubs ersetzt; „keine Allokation“
// wird über die Zähler stats.created und Instanz-Identität geprüft.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 },
}));
vi.mock("../src/gfx/atlas", () => {
  const makeGameObject = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
      "setRotation",
    ]) o[k] = () => o;
    o.visible = true;
    o.active = true;
    // setVisible/setActive spiegeln den Zustand (wie echte Phaser-Objekte),
    // damit Assertions den Sprite-Zustand pruefen koennen.
    o.setVisible = (v: boolean) => { o.visible = v; return o; };
    o.setActive = (v: boolean) => { o.active = v; return o; };
    return o;
  };
  return {
    makeImage: makeGameObject,
    applyTexture: () => {},
    currentFrame: () => "frame0",
  };
});

const { ProjectilePool } = await import("../src/systems/ProjectilePool");

type ViewBox = { x: number; y: number; width: number; height: number };

/** Szene mit Zähl-Kamera: misst, wie oft compact() worldView tatsächlich liest. */
function countingScene() {
  let reads = 0;
  const view: ViewBox = { x: 0, y: 0, width: 640, height: 360 };
  const camera = {
    get worldView(): ViewBox {
      reads += 1;
      return view;
    },
  };
  const scene = {
    cameras: { main: camera },
    game: { loop: { frame: 1 } },
    registry: { get: () => 1 },
  };
  return { scene, readCount: () => reads, view, setFrame: (f: number) => { (scene.game.loop as { frame: number }).frame = f; } };
}

const spawnOpts = {
  x: 10, y: 10, vx: 40, vy: 0, damage: 2, pierce: 0, knockback: 0,
  texture: "projectile_ember",
};

describe("ProjectilePool: m10-heap-pool-fix (K3)", () => {
  it("kein einziges neues Runtime-Objekt über 500 Spawn/Compact-Zyklen (stats.created konstant, Identität erhalten)", () => {
    const { scene } = countingScene();
    const pool = new ProjectilePool(scene as never);
    const first = pool.spawn(spawnOpts);
    const createdAfterFirst = pool.stats.created;
    expect(createdAfterFirst).toBe(1);

    let last = first;
    for (let i = 0; i < 500; i++) {
      const freed = last;
      freed.active = false;
      pool.compact();
      last = pool.spawn({ ...spawnOpts, x: i, y: i });
      expect(pool.stats.created).toBe(createdAfterFirst);
      // Der freigegebene Runtime-Slot wird sofort wiederverwendet — kein
      // neues Objekt pro Spawn im Steady State.
      expect(last).toBe(freed);
    }
    expect(pool.stats.reused).toBe(500);
    expect(pool.active.length).toBe(1);
  });

  it("hit-Set-Identität bleibt über Recycling erhalten (kein new Set pro Spawn), Inhalt wird geleert", () => {
    const { scene } = countingScene();
    const pool = new ProjectilePool(scene as never);
    const p = pool.spawn(spawnOpts);
    const hitSet = p.hit;
    p.hit.add(11);
    p.hit.add(12);

    p.active = false;
    pool.compact();
    const again = pool.spawn(spawnOpts);
    expect(again).toBe(p);
    expect(again.hit).toBe(hitSet); // dieselbe Set-Instanz, kein Austausch
    expect(again.hit.size).toBe(0); // und geleert (keine alten Treffer)
  });

  it("view()-Cache: ein worldView-Lesezugriff pro Frame, in-place aktualisiert (kein Objekt pro Frame)", () => {
    const ctx = countingScene();
    const pool = new ProjectilePool(ctx.scene as never);

    // Zwei compact()-Läufe im selben Frame: genau ein worldView-Read.
    pool.compact();
    pool.compact();
    expect(ctx.readCount()).toBe(1);

    // Nächster Frame: genau ein weiterer Read.
    ctx.setFrame(2);
    pool.compact();
    expect(ctx.readCount()).toBe(2);
  });

  it("view()-Cache liefert aktuelle Werte (in-place-Update verfälscht nichts)", () => {
    const ctx = countingScene();
    const pool = new ProjectilePool(ctx.scene as never);
    pool.spawn({ ...spawnOpts, x: 1000, y: 10 }); // weit offscreen (cull-Marge)
    pool.spawn({ ...spawnOpts, x: 10, y: 10 }); // im View

    pool.compact();
    // Frame 1: das weit offscreen Projektil (360 px jenseits, wegfliegend,
    // ohne Ziel) wird sofort gecullt — das sichtbare bleibt.
    expect(pool.active.length).toBe(1);
    expect(pool.active[0].x).toBe(10);
    expect(pool.stats.culled).toBe(1);

    // Kamera wandert weg: Frame 2 mit neuen Koordinaten — Cache muss die
    // frischen Werte verwenden (kein eingefrorenes Frame-1-Objekt).
    ctx.setFrame(2);
    ctx.view.x = 5000;
    pool.compact();
    // Das sichtbare Projektil fliegt jetzt AUF die Kamera zu (movingAway
    // false) → nicht gecullt, aber außerhalb hideMargin → Sprite aus.
    expect(pool.active.length).toBe(1);
    expect(pool.stats.culled).toBe(1); // kein weiteres Cull
    expect(pool.active[0].sprite.visible).toBe(false);
  });
});
