import { describe, expect, it } from "vitest";
import { Pool } from "../src/systems/Pool";

describe("Pool: Reuse ohne Neuanlage im Steady State", () => {
  it("liefert nach release dasselbe Objekt (Identität bleibt)", () => {
    let made = 0;
    const pool = new Pool<{ n: number }>(() => ({ n: ++made }), (o) => { o.n = 0; }, 2);
    expect(pool.freeCount).toBe(2);
    const a = pool.obtain();
    const b = pool.obtain();
    expect(pool.createdTotal).toBe(2);
    pool.release(a);
    pool.release(b);
    expect(pool.freeCount).toBe(2);
    const a2 = pool.obtain();
    expect([a2, pool.obtain()].sort((x, y) => (x === a ? -1 : 1))).toHaveLength(2);
    expect(a2 === a || a2 === b).toBe(true);
    expect(pool.createdTotal).toBe(2);
  });

  it("legt im wiederholten obtain/release-Zyklus nichts neu an", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 0 }), (o) => { o.x = 0; }, 4);
    const seen: object[] = [];
    for (let i = 0; i < 2000; i++) {
      const o = pool.obtain();
      if (!seen.includes(o)) seen.push(o);
      expect(o.x).toBe(0);
      pool.release(o);
    }
    expect(pool.createdTotal).toBe(4);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(pool.freeCount).toBe(4);
    expect(pool.activeCount).toBe(0);
  });

  it("ignoriert release eines fremden/doppelt freigegebenen Objekts", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 1 }));
    const foreign = { x: 9 };
    pool.release(foreign as { x: number });
    expect(pool.freeCount).toBe(0);
    expect(pool.activeCount).toBe(0);
    const a = pool.obtain();
    pool.release(a);
    pool.release(a);
    expect(pool.freeCount).toBe(1);
    expect(pool.activeCount).toBe(0);
  });

  it("releaseAll gibt den aktiven Bestand frei", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 1 }));
    pool.obtain();
    pool.obtain();
    pool.obtain();
    expect(pool.activeCount).toBe(3);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);
  });

  it("trim kappt Retention nach einer Peak-Welle", () => {
    let made = 0;
    const pool = new Pool<{ x: number }>(() => ({ x: ++made }), undefined, 100);
    expect(pool.freeCount).toBe(100);
    expect(pool.trim(10)).toBe(90);
    expect(pool.freeCount).toBe(10);
    expect(pool.trim(10)).toBe(0);
    expect(pool.trim(-5)).toBe(10);
    expect(pool.freeCount).toBe(0);
  });
});
